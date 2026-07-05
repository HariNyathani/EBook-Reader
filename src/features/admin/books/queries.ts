import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Book } from '@/types';

const DEFAULT_PAGE_SIZE = 25;

/**
 * Parameters for listing books.
 */
export interface ListBooksParams {
  page?: number;
  pageSize?: number;
  query?: string;
}

/**
 * Result of listing books.
 */
export interface ListBooksResult {
  rows: Book[];
  total: number;
}

/**
 * Lists books with optional search and pagination.
 * Uses service-role client (admin context).
 */
export async function listBooks(params: ListBooksParams = {}): Promise<ListBooksResult> {
  const { page = 1, pageSize = DEFAULT_PAGE_SIZE, query } = params;

  const admin = createAdminClient();

  let queryBuilder = admin
    .from('books')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (query?.trim()) {
    queryBuilder = queryBuilder.or(`title.ilike.%${query.trim()}%,author.ilike.%${query.trim()}%`);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  queryBuilder = queryBuilder.range(from, to);

  const { data, error, count } = await queryBuilder;

  if (error) {
    console.error('[listBooks] Supabase error:', error.message);
    throw new Error('Failed to list books');
  }

  return {
    rows: (data as Book[]) ?? [],
    total: count ?? 0,
  };
}
