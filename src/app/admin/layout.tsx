import { requireAdmin } from '@/features/auth/session';
import Link from 'next/link';
import { SignOutButton } from '@/features/auth/components/sign-out-button';
import { SkipLink } from '@/components/a11y/skip-link';

/**
 * Admin group layout — admin/layout.tsx
 *
 * Defense-in-depth guard: calls requireAdmin() which redirects:
 * - Unauthenticated → /login
 * - Authenticated, unapproved → /pending-approval
 * - Authenticated, approved, not admin → /dashboard
 *
 * Phase 5: Enhanced with persistent navigation (Overview, Users, Uploads, Books).
 *
 * Phase 15 (ISD §15.AA): adds a SkipLink so keyboard users can jump
 * past the admin nav to the page content (WCAG 2.4.1).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // This will redirect if the user is not authenticated, approved, and admin.
  await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <SkipLink />
      <header role="banner" className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <span className="text-base font-semibold text-gray-900">👑 Admin Panel</span>
            <nav aria-label="Admin navigation" className="flex items-center gap-2 text-sm">
              <Link
                href="/admin"
                className="rounded-md px-3 py-1.5 font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                Overview
              </Link>
              <Link
                href="/admin/users"
                className="rounded-md px-3 py-1.5 font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                Users
              </Link>
              <Link
                href="/admin/uploads"
                className="rounded-md px-3 py-1.5 font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                Uploads
              </Link>
              <Link
                href="/admin/books"
                className="rounded-md px-3 py-1.5 font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                Books
              </Link>
              <Link
                href="/dashboard"
                className="rounded-md px-3 py-1.5 font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                ← Library
              </Link>
            </nav>
          </div>
          <SignOutButton />
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        role="main"
        className="flex-1 px-4 py-6 focus:outline-none sm:px-6"
      >
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
