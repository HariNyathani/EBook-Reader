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
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="liquid-glass w-full max-w-md rounded-4xl px-8 py-10 text-center">
        <span className="inline-block text-4xl drop-shadow-md" aria-hidden="true">
          ⏳
        </span>

        <h1 className="mt-4 bg-gradient-to-br from-gray-900 to-gray-600 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
          Awaiting approval
        </h1>

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

          <SignOutButton className="glass-panel rounded-full px-5 py-2 text-sm font-semibold text-gray-700 transition-all hover:bg-white/80 hover:text-gray-900 hover:shadow-glass-hover active:scale-[0.98]" />
        </div>
      </div>
    </main>
  );
}
