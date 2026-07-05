import { requireApproved } from '@/features/auth/session';
import { SignOutButton } from '@/features/auth/components/sign-out-button';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';

/**
 * App group layout — (app)/layout.tsx
 *
 * Defense-in-depth guard: calls requireApproved() which redirects to /login
 * if unauthenticated or /pending-approval if not approved.
 *
 * Also renders the authenticated shell: a minimal top nav with sign-out.
 * The library/reader content is rendered as children.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // This will redirect if the user is not authenticated and approved.
  const claims = await requireApproved();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Top navigation bar */}
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href={ROUTES.DASHBOARD}
            className="flex items-center gap-2 text-base font-semibold text-gray-900 hover:text-indigo-600"
          >
            <span aria-hidden="true">📚</span>
            <span>EPUB Reader</span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-gray-400 sm:block">
              {claims.isAdmin ? '👑 Admin' : ''}
            </span>
            {claims.isAdmin && (
              <Link
                href={ROUTES.ADMIN_APPROVALS}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                Admin
              </Link>
            )}
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
