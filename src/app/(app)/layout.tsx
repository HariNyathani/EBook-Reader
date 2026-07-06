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
          className="flex min-h-screen flex-col"
        >
          <SkipLink />

          {/* Floating liquid-glass navigation pill — landmark role=banner */}
          <header role="banner" className="sticky top-3 z-50 px-3 sm:top-4 sm:px-6">
            <div className="liquid-glass mx-auto flex max-w-7xl items-center justify-between rounded-full py-2 pl-5 pr-2 sm:pl-6 sm:pr-2.5">
              <Link
                href={ROUTES.DASHBOARD}
                className="flex items-center gap-2 text-lg font-bold tracking-tight text-gray-900 transition-transform hover:scale-105"
              >
                <span aria-hidden="true">📖</span>
                <span>Librea</span>
              </Link>

              <div className="flex items-center gap-1 sm:gap-1.5">
                {claims.isAdmin && (
                  <Link
                    href={ROUTES.ADMIN_APPROVALS}
                    className="rounded-full px-3 py-2 text-sm font-semibold text-gray-600 transition-all hover:bg-white/70 hover:text-gray-900 hover:shadow-sm sm:px-4"
                  >
                    Admin
                  </Link>
                )}
                <Link
                  href={ROUTES.SETTINGS}
                  className="rounded-full px-3 py-2 text-sm font-semibold text-gray-600 transition-all hover:bg-white/70 hover:text-gray-900 hover:shadow-sm sm:px-4"
                >
                  Settings
                </Link>
                <InstallSlot />
                <SignOutButton className="rounded-full px-3 py-2 text-sm font-semibold text-gray-600 transition-all hover:bg-white/70 hover:text-gray-900 hover:shadow-sm sm:px-4" />
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
            className="flex-1 px-4 py-8 focus:outline-none sm:px-6"
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
