import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { ROUTES } from '@/lib/routes';

/**
 * Next.js Edge Middleware — Phase 4 (SAD §3.1)
 *
 * Two responsibilities (in order):
 * 1. Session refresh: updateSession() rotates Supabase auth cookies each request.
 * 2. Route guards: read top-level JWT claims (is_approved, is_admin) and redirect as needed.
 *
 * AUDIT FIX (CRITICAL): Claims now come from updateSession(), which extracts them via the
 * Supabase SSR client. We no longer hand-parse the `sb-*-auth-token` cookie — that broke
 * under @supabase/ssr 0.5.2 (base64- prefixing + chunked `.0`/`.1` cookies), which caused
 * every authenticated user to be misclassified as anonymous and produced a /dashboard↔/login
 * redirect loop for logged-in users.
 *
 * Guard rules (per ISD §4.G Step 3):
 * - Unauthenticated → protected route: redirect to /login?redirectTo=<path>
 * - Authenticated, is_approved=false → (app)/* or /admin/*: redirect to /pending-approval
 * - Authenticated, is_approved=true, is_admin=false → /admin/*: redirect to /dashboard
 * - Authenticated → /login or /register: redirect to /dashboard (approved) or /pending-approval
 * - /pending-approval: reachable by any authenticated user; approved → /dashboard
 */
export async function middleware(request: NextRequest) {
  // Step 1: Refresh session + obtain decoded top-level claims (null => unauthenticated).
  const { response, claims } = await updateSession(request);

  const { pathname } = request.nextUrl;

  const isAuthenticated = claims !== null;
  const isApproved = claims?.isApproved ?? false;
  const isAdmin = claims?.isAdmin ?? false;

  // Step 2: Route classification.
  const isProtectedApp = pathname.startsWith('/dashboard') || pathname.startsWith('/reader');
  const isAdminRoute = pathname.startsWith('/admin');
  const isAuthRoute = pathname === ROUTES.LOGIN || pathname === ROUTES.REGISTER;
  const isPendingApprovalRoute = pathname === ROUTES.PENDING_APPROVAL;

  // Helper: redirect while preserving the refreshed auth cookies from updateSession.
  // (A common Next.js middleware bug is dropping Set-Cookie on redirect.)
  function redirectWithCookies(url: URL) {
    const redirectResponse = NextResponse.redirect(url);
    response.headers.getSetCookie().forEach((cookie) => {
      redirectResponse.headers.append('Set-Cookie', cookie);
    });
    return redirectResponse;
  }

  // Step 3: Guard logic.

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
