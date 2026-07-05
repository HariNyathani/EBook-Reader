import { requireAdmin } from '@/features/auth/session';
import { getAdminStats } from '@/features/admin/queries';
import { StatCard } from '@/features/admin/components/stat-card';

/**
 * Admin overview page — displays key statistics.
 * Server Component; calls requireAdmin() for authorization.
 */
export default async function AdminPage() {
  await requireAdmin();

  const stats = await getAdminStats();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Overview</h1>
        <p className="mt-1 text-sm text-gray-500">System-wide statistics and management summary.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Users" value={stats.totalUsers} />
        <StatCard label="Pending Approvals" value={stats.pendingApprovals} />
        <StatCard label="Approved Users" value={stats.approvedUsers} />
        <StatCard label="Admins" value={stats.admins} />
      </div>

      <div className="mt-6">
        <StatCard label="Total Books" value={stats.totalBooks} />
      </div>

      <div className="mt-6 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        <strong>Tip:</strong> Use the navigation above to manage users, upload books, and view the
        book catalog.
      </div>
    </div>
  );
}
