import { requireApproved } from '@/features/auth/session';
import { SignOutButton } from '@/features/auth/components/sign-out-button';
import { PreferencesProvider } from '@/features/preferences/components/preferences-provider';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';
import { AppShellProviders, InstallSlot, OfflineSlot, UpdateSlot } from './app-shell-providers';
import { SkipLink } from '@/components/a11y/skip-link';

/**
 * App group layout — (app)/layout.tsx
 *
 * Defense-in-depth guard: calls requireApproved() which redirects to /login
 * if unauthenticated or /pending-approval if not approved.
 *
 * Phase 12 (ISD §12.J): wraps children with `<PreferencesProvider>` so
 * cloud preferences hydrate for every authed page (reader, settings,
 * dashboard).
 *
 * Phase 13 (ISD §13.H): wraps children with `<AppShellProviders>` so
 * the offline-related hooks (network status, sign-out cleanup, IDB
 * hydration) are active for the whole authenticated session, and the
 * visible affordances (offline indicator, install button, update
 * toast) are mounted in the right slots.
 *
 * Phase 15 (ISD §15.AA): adds a SkipLink and gives the main content
 * a stable id so the link can move focus correctly (WCAG 2.4.1).
 *
 * Also renders the authenticated shell: a minimal top nav with a link to
 * the new /settings page and sign-out.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // This will redirect if the user is not authenticated and approved.
  const claims = await requireApproved();

  return (
    <PreferencesProvider>
      <AppShellProviders userId={claims.userId} isApproved={claims.isApproved}>
        <div
          data-user-id={claims.userId}
          data-user-approved={claims.isApproved ? 'true' : 'false'}
          className="flex min-h-screen flex-col bg-gray-50"
        >
          <SkipLink />

          {/* Top navigation bar — landmark role=banner */}
          <header role="banner" className="border-b border-gray-200 bg-white shadow-sm">
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
                <Link
                  href={ROUTES.SETTINGS}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
                >
                  Settings
                </Link>
                <InstallSlot />
                <SignOutButton />
              </div>
            </div>
          </header>

          {/* Offline banner (polite, aria-live) */}
          <OfflineSlot />

          {/* Page content — landmark role=main; id for skip link target. */}
          <main
            id="main-content"
            tabIndex={-1}
            role="main"
            className="flex-1 px-4 py-6 focus:outline-none sm:px-6"
          >
            {children}
          </main>

          {/* Update-available toast (polite, role=status) */}
          <UpdateSlot />
        </div>
      </AppShellProviders>
    </PreferencesProvider>
  );
}
