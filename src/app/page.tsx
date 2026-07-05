import { redirect } from 'next/navigation';
import { getClaims } from '@/features/auth/session';
import { ROUTES } from '@/lib/routes';

/**
 * Root page — server-side redirect based on auth state.
 *
 * Approved user → /dashboard
 * Authenticated but unapproved → /pending-approval
 * Unauthenticated → /login
 *
 * Per ISD §4.G: this is a plain server component; middleware guards protect the
 * downstream routes independently.
 */
export default async function RootPage() {
  const claims = await getClaims();

  if (!claims) {
    redirect(ROUTES.LOGIN);
  }

  if (!claims.isApproved) {
    redirect(ROUTES.PENDING_APPROVAL);
  }

  redirect(ROUTES.DASHBOARD);
}
