import { requireApproved } from '@/features/auth/session';

export const metadata = {
  title: 'Dashboard — EPUB Reader',
  description: 'Your personal reading dashboard.',
};

/**
 * Dashboard page — first page approved users see after login.
 * Greets the user by their userId (email is in claims in a future phase when we load the profile).
 * Library grid content is a later phase — this is a placeholder per ISD §4.G.
 */
export default async function DashboardPage() {
  const claims = await requireApproved();

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Your Library</h1>
        <p className="mt-1 text-sm text-gray-500">
          Welcome back! Your approved reading library will appear here.
        </p>
      </div>

      {/* Placeholder until Phase 5 (library feature) */}
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-white py-24 text-center">
        <span className="text-5xl" aria-hidden="true">
          📚
        </span>
        <h2 className="mt-4 text-lg font-semibold text-gray-700">No books yet</h2>
        <p className="mt-2 max-w-xs text-sm text-gray-500">
          An administrator will add books to the library. Once available, they will appear here.
        </p>
        {claims.isAdmin && (
          <p className="mt-4 text-xs font-medium text-indigo-600">
            You are an admin — upload books from the Admin panel.
          </p>
        )}
      </div>
    </div>
  );
}
