import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Profile } from '@/types';
import { ADMIN_USERS_PAGE_SIZE } from './constants';
import type { UserFilter } from './constants';

/**
 * Admin statistics for the overview dashboard.
 */
export interface AdminStats {
  totalUsers: number;
  pendingApprovals: number;
  approvedUsers: number;
  admins: number;
  totalBooks: number;
}

/**
 * Parameters for listing users with search/filter/pagination.
 */
export interface ListUsersParams {
  query?: string;
  status?: UserFilter;
  page?: number;
  pageSize?: number;
}

/**
 * Result of listing users.
 */
export interface ListUsersResult {
  rows: Profile[];
  total: number;
}

/**
 * Fetches admin dashboard statistics using efficient count queries.
 * Uses service-role client (admins legitimately see all users).
 */
export async function getAdminStats(): Promise<AdminStats> {
  const admin = createAdminClient();

  // Use head: true, count: 'exact' for efficient counts without fetching rows
  const [
    { count: totalUsers },
    { count: pendingApprovals },
    { count: approvedUsers },
    { count: admins },
    { count: totalBooks },
  ] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('is_approved', false),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('is_approved', true),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('is_admin', true),
    admin.from('books').select('*', { count: 'exact', head: true }),
  ]);

  return {
    totalUsers: totalUsers ?? 0,
    pendingApprovals: pendingApprovals ?? 0,
    approvedUsers: approvedUsers ?? 0,
    admins: admins ?? 0,
    totalBooks: totalBooks ?? 0,
  };
}

/**
 * Lists users with optional search/filter/pagination.
 * Uses service-role client (admins see all users).
 */
export async function listUsers(params: ListUsersParams = {}): Promise<ListUsersResult> {
  const { query, status, page = 1, pageSize = ADMIN_USERS_PAGE_SIZE } = params;

  const admin = createAdminClient();

  let queryBuilder = admin
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  // Apply search filter (email substring match)
  if (query && query.trim()) {
    queryBuilder = queryBuilder.ilike('email', `%${query.trim()}%`);
  }

  // Apply status filter
  if (status && status !== 'all') {
    if (status === 'pending') {
      queryBuilder = queryBuilder.eq('is_approved', false);
    } else if (status === 'approved') {
      queryBuilder = queryBuilder.eq('is_approved', true);
    } else if (status === 'admin') {
      queryBuilder = queryBuilder.eq('is_admin', true);
    }
  }

  // Apply pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  queryBuilder = queryBuilder.range(from, to);

  const { data, error, count } = await queryBuilder;

  if (error) {
    console.error('[listUsers] Supabase error:', error.message);
    throw new Error('Failed to list users');
  }

  return {
    rows: (data as Profile[]) ?? [],
    total: count ?? 0,
  };
}
