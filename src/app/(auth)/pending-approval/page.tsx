import { SignOutButton } from '@/features/auth/components/sign-out-button';

export const metadata = {
  title: 'Pending Approval — EPUB Reader',
  description: 'Your account is awaiting admin approval.',
};

/**
 * Pending approval page — shown to authenticated users who haven't been approved yet.
 * Middleware redirects approved users away from this page to /dashboard.
 * Middleware redirects unauthenticated users to /login.
 */
export default function PendingApprovalPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white px-8 py-10 text-center shadow-md ring-1 ring-gray-200">
        <span className="text-4xl" aria-hidden="true">
          ⏳
        </span>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-gray-900">Awaiting approval</h1>

        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          Your account has been created. An administrator will review and approve it shortly.
        </p>

        <p className="mt-2 text-sm text-gray-500">
          Once approved, you will be able to access the reading library.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-xs text-gray-400">
            Expecting access? Contact your library administrator.
          </p>

          <SignOutButton className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50" />
        </div>
      </div>
    </main>
  );
}
