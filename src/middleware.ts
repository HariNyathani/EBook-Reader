import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { ROUTES } from '@/lib/routes';
import { CSP_NONCE_HEADER, generateNonce, buildFullSecurityHeaders } from '@/lib/security/headers';
import { CSP_HEADER } from '@/lib/security/csp';
import {
  authLimiter,
  uploadLimiter,
  progressLimiter,
  defaultLimiter,
  identifierForIp,
  identifierForAuth,
} from '@/lib/security/rate-limit';
import { logger } from '@/lib/logging/logger';

/**
 * Next.js Edge Middleware — Phase 4 (SAD §3.1) + Phase 15 (ISD §15.H).
 *
 * Responsibilities (in order):
 * 1. Generate a per-request CSP nonce (Phase 15).
 * 2. Refresh session + obtain decoded top-level claims (Phase 4).
 * 3. Apply rate limiting for sensitive endpoints (Phase 15).
 * 4. Apply route guards based on the claims (Phase 4).
 * 5. Apply the full security header set (CSP + HSTS + COOP + Permissions-Policy).
 *
 * Rate-limited endpoints:
 *   - /api/progress  → progressLimiter  (generous, per-user)
 *   - /api/books/.../file → defaultLimiter (per-IP, conservative)
 *   - /login, /register (page navigations) → defaultLimiter
 *
 * Auth/upload Server Actions are rate-limited INSIDE the action
 * itself (middleware cannot see the action body).
 */
export async function middleware(request: NextRequest) {
  // Step 1: Generate a fresh CSP nonce for this request and build the
  // security header set ONCE (so the CSP threaded onto the forwarded
  // request is byte-identical to the CSP set on the response).
  const nonce = generateNonce();
  const securityHeaders = buildSecurityHeaderSet(nonce);
  const cspValue = securityHeaders.find((h) => h.key === CSP_HEADER)!.value;

  // Step 2: Session refresh + claims. CRITICAL: thread the CSP nonce
  // onto the forwarded REQUEST headers so Next.js stamps the nonce onto
  // its own inline bootstrap/hydration scripts (it reads the nonce from
  // the incoming Content-Security-Policy request header). Without this,
  // strict-dynamic CSP blocks Next's inline scripts and the app breaks.
  const { response, claims } = await updateSession(request, {
    [CSP_HEADER]: cspValue,
    [CSP_NONCE_HEADER]: nonce,
  });

  const { pathname } = request.nextUrl;
  const ip = identifierForIp(request);

  const isAuthenticated = claims !== null;
  const isApproved = claims?.isApproved ?? false;
  const isAdmin = claims?.isAdmin ?? false;

  // Step 2b: Route classification.
  const isProtectedApp = pathname.startsWith('/dashboard') || pathname.startsWith('/reader');
  const isAdminRoute = pathname.startsWith('/admin');
  const isAuthRoute = pathname === ROUTES.LOGIN || pathname === ROUTES.REGISTER;
  const isPendingApprovalRoute = pathname === ROUTES.PENDING_APPROVAL;
  const isOfflineRoute = pathname === '/offline';
  const isProgressApi = pathname === '/api/progress' && request.method === 'POST';
  const isBookFileApi = /^\/api\/books\/[^/]+\/file$/.test(pathname);

  // Step 3: Rate limiting for sensitive endpoints. When a limit is
  // exceeded we return 429 with a friendly Retry-After header.
  async function tryRateLimit(): Promise<NextResponse | null> {
    try {
      if (isProgressApi) {
        // Identify by user id when authenticated, otherwise by IP.
        const id = claims?.userId ?? ip;
        const r = await progressLimiter(id);
        if (!r.success) {
          logger.warn('rate_limit.exceeded', { policy: r.policy, pathname });
          return tooManyRequests(r.retryAfter);
        }
      } else if (isBookFileApi) {
        const r = await defaultLimiter(ip);
        if (!r.success) {
          logger.warn('rate_limit.exceeded', { policy: r.policy, pathname });
          return tooManyRequests(r.retryAfter);
        }
      } else if (isAuthRoute && request.method === 'POST') {
        // Login/register form posts — limit by IP+email if we can read
        // a form-encoded body. Without parsing we use IP (form action
        // also rate-limits via the action-level authLimiter).
        const r = await defaultLimiter(ip);
        if (!r.success) {
          logger.warn('rate_limit.exceeded', { policy: r.policy, pathname });
          return tooManyRequests(r.retryAfter);
        }
      }
    } catch (err) {
      // Never let a rate-limit failure block legitimate traffic; log
      // and continue.
      logger.warn('rate_limit.error', {
        pathname,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return null;
  }

  const rateLimited = await tryRateLimit();
  if (rateLimited) {
    // Still attach the security headers on a 429 so CSP is enforced.
    attachSecurityHeaders(rateLimited, nonce, securityHeaders);
    return rateLimited;
  }

  // Step 4: Route guard logic.
  // Helper: redirect while preserving the refreshed auth cookies.
  function redirectWithCookies(url: URL): NextResponse {
    const redirectResponse = NextResponse.redirect(url);
    response.headers.getSetCookie().forEach((cookie) => {
      redirectResponse.headers.append('Set-Cookie', cookie);
    });
    return redirectResponse;
  }

  // Rule: authenticated users on auth pages → redirect away.
  if (isAuthRoute && isAuthenticated) {
    const dest = isApproved ? ROUTES.DASHBOARD : ROUTES.PENDING_APPROVAL;
    const r = redirectWithCookies(new URL(dest, request.url));
    attachSecurityHeaders(r, nonce, securityHeaders);
    return r;
  }

  // Rule: /pending-approval — approved users → dashboard.
  if (isPendingApprovalRoute && isAuthenticated && isApproved) {
    const r = redirectWithCookies(new URL(ROUTES.DASHBOARD, request.url));
    attachSecurityHeaders(r, nonce, securityHeaders);
    return r;
  }

  // Rule: unauthenticated → protected route.
  if (!isAuthenticated && !isOfflineRoute && (isProtectedApp || isAdminRoute)) {
    const loginUrl = new URL(ROUTES.LOGIN, request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    const r = redirectWithCookies(loginUrl);
    attachSecurityHeaders(r, nonce, securityHeaders);
    return r;
  }

  // Rule: authenticated but unapproved → protected routes.
  if (isAuthenticated && !isApproved && (isProtectedApp || isAdminRoute)) {
    const r = redirectWithCookies(new URL(ROUTES.PENDING_APPROVAL, request.url));
    attachSecurityHeaders(r, nonce, securityHeaders);
    return r;
  }

  // Rule: approved but not admin → /admin/*.
  if (isAuthenticated && isApproved && !isAdmin && isAdminRoute) {
    const r = redirectWithCookies(new URL(ROUTES.DASHBOARD, request.url));
    attachSecurityHeaders(r, nonce, securityHeaders);
    return r;
  }

  // Step 5: Pass-through — attach the security headers to the
  // session response, plus forward the nonce to downstream RSC.
  attachSecurityHeaders(response, nonce, securityHeaders);
  return response;
}

/**
 * Build the full security header set for this request. Extracted so
 * the CSP value can be threaded onto the forwarded REQUEST headers
 * (for Next.js nonce pickup) and reused verbatim on the response —
 * guaranteeing the two are byte-identical for the same nonce.
 */
function buildSecurityHeaderSet(nonce: string): Array<{ key: string; value: string }> {
  const isDev = process.env['NODE_ENV'] !== 'production';
  const isProd = process.env['NODE_ENV'] === 'production';
  return buildFullSecurityHeaders({
    nonce,
    isDev,
    isProd,
    sentryDsn: process.env['SENTRY_DSN'] ?? process.env['NEXT_PUBLIC_SENTRY_DSN'],
    supabaseUrl: process.env['NEXT_PUBLIC_SUPABASE_URL'],
    appUrl: process.env['NEXT_PUBLIC_APP_URL'],
  });
}

/**
 * Attach the full set of security response headers (CSP + HSTS +
 * COOP + Permissions-Policy) plus the per-request nonce to the
 * downstream document via `x-nonce` (Next.js will read this for
 * inline boot scripts).
 */
function attachSecurityHeaders(
  response: NextResponse,
  nonce: string,
  headers: Array<{ key: string; value: string }>,
): void {
  const isProd = process.env['NODE_ENV'] === 'production';
  const envName = process.env['APP_ENV'] ?? (isProd ? 'production' : 'development');

  // Apply each header. We replace any pre-existing CSP so we always
  // have the strict, nonce-based version.
  response.headers.set(CSP_HEADER, headers.find((h) => h.key === CSP_HEADER)!.value);
  for (const h of headers) {
    if (h.key === CSP_HEADER) continue;
    // Only set HSTS/COOP in production.
    if (h.key === 'Strict-Transport-Security' && !isProd) continue;
    if (h.key === 'Cross-Origin-Opener-Policy' && !isProd) continue;
    if (!response.headers.has(h.key)) {
      response.headers.set(h.key, h.value);
    }
  }

  // Forward the nonce to the document for inline boot scripts.
  response.headers.set(CSP_NONCE_HEADER, nonce);

  // Tag the response for observability.
  response.headers.set('x-app-env', envName);
}

/** Build a 429 response with Retry-After. */
function tooManyRequests(retryAfterSec: number): NextResponse {
  const res = new NextResponse(
    JSON.stringify({
      status: 'error',
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please slow down.',
      retryAfter: retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
      },
    },
  );
  return res;
}

/**
 * Matcher: runs middleware on all routes except:
 * - Next.js internals (_next/static, _next/image)
 * - PWA assets (sw.js, manifest.webmanifest)
 * - Favicon and common static extensions
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|icons/.*|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?|ttf|eot)$).*)',
  ],
};

// Re-export for server-side use (so consumers can import the
// identifierForAuth helper from the middleware if they wish).
export { identifierForAuth, authLimiter, uploadLimiter };
