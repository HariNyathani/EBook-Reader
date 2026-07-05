import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { ROUTES } from '@/lib/routes';

/**
 * Next.js Edge Middleware — Phase 4 (SAD §3.1)
 *
 * Two responsibilities (in order):
 * 1. Session refresh: call updateSession() so Supabase auth cookies are rotated each request.
 * 2. Route guards: read top-level JWT claims (is_approved, is_admin) and redirect as needed.
 *
 * IMPORTANT: No DB queries here — authorization is claim-only (sub-5ms edge decisions).
 * The access-token hook (Phase 3) bakes claims into the JWT so middleware needs no DB round-trip.
 *
 * Guard rules (per ISD §4.G Step 3):
 * - Unauthenticated → protected route: redirect to /login?redirectTo=<path>
 * - Authenticated, is_approved=false → (app)/* or /admin/*: redirect to /pending-approval
 * - Authenticated, is_approved=true, is_admin=false → /admin/*: redirect to /dashboard
 * - Authenticated → /login or /register: redirect to /dashboard (approved) or /pending-approval
 * - /pending-approval: reachable by any authenticated user; approved → /dashboard
 */
export async function middleware(request: NextRequest) {
  // Step 1: Refresh session cookie and get the response with updated cookies.
  const response = await updateSession(request);

  // Step 2: Read claims from the (now-refreshed) session.
  // We decode the access token from the Set-Cookie header / request cookie directly,
  // avoiding a second client instantiation in the hot path.
  // ISD-NOTE: We read from the cookie in the request because the updateSession response
  // may have rotated cookies — but the access_token itself is still decodable from either.
  const { pathname } = request.nextUrl;

  // Extract the access token from the Supabase session cookie.
  // Cookie name follows @supabase/ssr convention: sb-<ref>-auth-token or sb-access-token.
  let isAuthenticated = false;
  let isApproved = false;
  let isAdmin = false;

  // Find the auth cookie (supabase stores it as JSON in sb-*-auth-token).
  const authCookie = request.cookies
    .getAll()
    .find((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'));

  if (authCookie) {
    try {
      // The cookie value is JSON: { access_token, refresh_token, ... }
      // ISD-NOTE: We parse base64url segments without signature verification here
      // because the updateSession() call above already validated the session server-side.
      const cookieValue = decodeURIComponent(authCookie.value);
      const sessionData = JSON.parse(cookieValue) as { access_token?: string };
      const accessToken = sessionData.access_token;

      if (accessToken) {
        const [, payloadB64] = accessToken.split('.');
        if (payloadB64) {
          const payload = JSON.parse(
            Buffer.from(payloadB64, 'base64url').toString('utf-8'),
          ) as Record<string, unknown>;

          isAuthenticated = true;
          isApproved = payload['is_approved'] === true;
          isAdmin = payload['is_admin'] === true;
        }
      }
    } catch {
      // Malformed cookie — treat as unauthenticated (fail-closed).
      isAuthenticated = false;
    }
  }

  // Step 3: Guard logic.
  const isProtectedApp = pathname.startsWith('/dashboard') || pathname.startsWith('/reader');
  const isAdminRoute = pathname.startsWith('/admin');
  const isAuthRoute = pathname === ROUTES.LOGIN || pathname === ROUTES.REGISTER;
  const isPendingApprovalRoute = pathname === ROUTES.PENDING_APPROVAL;

  // Helper: redirect preserving the refreshed cookies.
  function redirectWithCookies(url: URL) {
    const redirectResponse = NextResponse.redirect(url);
    // Copy Set-Cookie headers from the updateSession response.
    response.headers.getSetCookie().forEach((cookie) => {
      redirectResponse.headers.append('Set-Cookie', cookie);
    });
    return redirectResponse;
  }

  // Rule: authenticated users on auth pages → redirect away.
  if (isAuthRoute && isAuthenticated) {
    const dest = isApproved ? ROUTES.DASHBOARD : ROUTES.PENDING_APPROVAL;
    return redirectWithCookies(new URL(dest, request.url));
  }

  // Rule: /pending-approval — approved users → dashboard.
  if (isPendingApprovalRoute && isAuthenticated && isApproved) {
    return redirectWithCookies(new URL(ROUTES.DASHBOARD, request.url));
  }

  // Rule: unauthenticated → protected route.
  if (!isAuthenticated && (isProtectedApp || isAdminRoute)) {
    const loginUrl = new URL(ROUTES.LOGIN, request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return redirectWithCookies(loginUrl);
  }

  // Rule: authenticated but unapproved → protected routes.
  if (isAuthenticated && !isApproved && (isProtectedApp || isAdminRoute)) {
    return redirectWithCookies(new URL(ROUTES.PENDING_APPROVAL, request.url));
  }

  // Rule: approved but not admin → /admin/*.
  if (isAuthenticated && isApproved && !isAdmin && isAdminRoute) {
    return redirectWithCookies(new URL(ROUTES.DASHBOARD, request.url));
  }

  // Pass-through: return the updateSession response (with refreshed cookies).
  return response;
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
