import { requireAdmin } from '@/features/auth/session';
import { listUsers } from '@/features/admin/queries';
import { UsersTable } from '@/features/admin/components/users-table';
import { ADMIN_USERS_PAGE_SIZE, USER_FILTERS } from '@/features/admin/constants';
import type { UserFilter } from '@/features/admin/constants';
import Link from 'next/link';

/**
 * Admin users page — lists all users with search, filter, and pagination.
 * Server Component; calls requireAdmin() for authorization.
 * All state is URL-driven (searchParams).
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; status?: string; page?: string }>;
}) {
  const claims = await requireAdmin();
  const params = await searchParams;

  const query = params.query ?? '';
  const status = (params.status as UserFilter) ?? 'all';
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  const { rows: users, total } = await listUsers({
    query,
    status,
    page,
    pageSize: ADMIN_USERS_PAGE_SIZE,
  });

  const totalPages = Math.ceil(total / ADMIN_USERS_PAGE_SIZE);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          Search, filter, and manage user accounts. Changes apply on the user&apos;s next sign-in.
        </p>
      </div>

      {/* Search and filter controls */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <form action="/admin/users" method="GET" className="flex-1">
          <input
            type="text"
            name="query"
            placeholder="Search by email..."
            defaultValue={query}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {status !== 'all' && <input type="hidden" name="status" value={status} />}
        </form>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {USER_FILTERS.map((filter) => (
            <Link
              key={filter}
              href={{
                pathname: '/admin/users',
                query: { ...(query && { query }), status: filter },
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                status === filter
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </Link>
          ))}
        </div>
      </div>

      {/* Users table */}
      <UsersTable users={users} currentUserId={claims.userId} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * ADMIN_USERS_PAGE_SIZE + 1}–
            {Math.min(page * ADMIN_USERS_PAGE_SIZE, total)} of {total} users
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={{
                  pathname: '/admin/users',
                  query: {
                    ...(query && { query }),
                    ...(status !== 'all' && { status }),
                    page: page - 1,
                  },
                }}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={{
                  pathname: '/admin/users',
                  query: {
                    ...(query && { query }),
                    ...(status !== 'all' && { status }),
                    page: page + 1,
                  },
                }}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
