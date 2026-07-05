import { requireAdmin } from '@/features/auth/session';

/**
 * Admin group layout — admin/layout.tsx
 *
 * Defense-in-depth guard: calls requireAdmin() which redirects:
 * - Unauthenticated → /login
 * - Authenticated, unapproved → /pending-approval
 * - Authenticated, approved, not admin → /dashboard
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // This will redirect if the user is not authenticated, approved, and admin.
  await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <span className="text-base font-semibold text-gray-900">👑 Admin Panel</span>
          <nav className="flex items-center gap-2 text-sm">
            <a
              href="/admin/approvals"
              className="rounded-md px-3 py-1.5 font-medium text-gray-600 transition-colors hover:bg-gray-100"
            >
              Approvals
            </a>
            <a
              href="/admin/uploads"
              className="rounded-md px-3 py-1.5 font-medium text-gray-600 transition-colors hover:bg-gray-100"
            >
              Uploads
            </a>
            <a
              href="/dashboard"
              className="rounded-md px-3 py-1.5 font-medium text-gray-600 transition-colors hover:bg-gray-100"
            >
              ← Library
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
