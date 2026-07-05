import { redirect } from 'next/navigation';
import { getClaims } from '@/features/auth/session';
import { ROUTES } from '@/lib/routes';

/**
 * Auth group layout — (auth)/layout.tsx
 *
 * Applies to /login, /register, /pending-approval.
 * Redirects authenticated users away from auth pages to the appropriate destination.
 *
 * This mirrors the middleware guard for auth routes as defense-in-depth
 * (middleware can be bypassed in direct server-render scenarios).
 *
 * Note: /pending-approval is intentionally in the (auth) group because it is
 * accessible to unapproved users. The layout handles the approved→dashboard redirect.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const claims = await getClaims();

  if (claims) {
    // Authenticated user on an auth page — redirect away.
    if (claims.isApproved) {
      redirect(ROUTES.DASHBOARD);
    } else {
      // Unapproved users are allowed on /pending-approval specifically,
      // but not on /login or /register. Middleware handles per-path logic;
      // this layout allows the /pending-approval child to render for unapproved users.
      // ISD-NOTE: We don't redirect unapproved users to /pending-approval here because
      // this layout wraps /pending-approval itself — that would cause an infinite redirect.
      // The middleware handles the /login and /register → /pending-approval redirect for
      // unapproved users. Here we just render children.
    }
  }

  return <>{children}</>;
}
