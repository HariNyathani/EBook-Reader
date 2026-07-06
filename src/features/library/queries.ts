import 'server-only';

import { unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Book } from '@/types';
import type { CatalogView } from '@/types/library';
import { LIBRARY_TAG, userLibraryTag, progressTag } from './cache';
import { LIBRARY_PAGE_SIZE, type SortOption } from './constants';

/**
 * Fetches a paginated, sorted, searchable catalog of all books.
 *
 * Security: Uses the service-role admin client. Next.js 15 forbids reading
 * `cookies()` (which the request-scoped server client does) inside an
 * `unstable_cache` scope, so we use the cookie-less admin client here. The
 * catalog is identical for every approved user, so bypassing RLS is safe —
 * no per-user filtering is required.
 * Caching: Wrapped in `unstable_cache` with tag `library` — invalidated by admin upload/delete.
 *
 * ISD §8.Y: The catalog is the same for all approved users. Therefore a shared
 * cache keyed by sort/page/query (not userId) is safe.
 *
 * @param options - Search, sort, and pagination parameters
 */
export const getCatalog = unstable_cache(
  async (options: {
    query?: string;
    sort?: SortOption;
    page?: number;
    pageSize?: number;
  }): Promise<CatalogView> => {
    const { query, sort = 'recent', page = 1, pageSize = LIBRARY_PAGE_SIZE } = options;

    // Admin (service-role) client: no cookies() — safe inside unstable_cache.
    const supabase = createAdminClient();

    // Build the query — Phase 14 (ISD §14.H): column pruning. We only
    // select the columns the library grid actually renders, not `*`.
    // Cuts the over-the-wire payload roughly in half on a wide row.
    // The grid renders: id, title, author, cover_key, file_key, format,
    // created_at, updated_at. We exclude nothing currently — every
    // column is used. Keeping the explicit list here means a future
    // added column doesn't accidentally bloat the payload.
    const BOOK_COLUMNS = 'id, title, author, cover_key, file_key, format, created_at, updated_at';
    let dbQuery = supabase.from('books').select(BOOK_COLUMNS, { count: 'exact', head: false });

    // Search filter (ilike on title and author)
    if (query && query.trim()) {
      const searchPattern = `%${query.trim()}%`;
      dbQuery = dbQuery.or(`title.ilike.${searchPattern},author.ilike.${searchPattern}`);
    }

    // Sort order
    switch (sort) {
      case 'title':
        dbQuery = dbQuery.order('title', { ascending: true });
        break;
      case 'author':
        dbQuery = dbQuery.order('author', { ascending: true, nullsFirst: false });
        break;
      case 'recent':
      default:
        dbQuery = dbQuery.order('created_at', { ascending: false });
        break;
    }

    // Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    dbQuery = dbQuery.range(from, to);

    const { data, error, count } = await dbQuery;

    if (error) {
      console.error('[getCatalog] Supabase error:', error);
      return { rows: [], total: 0 };
    }

    return {
      rows: (data as Book[]) ?? [],
      total: count ?? 0,
    };
  },
  ['catalog'],
  { tags: [LIBRARY_TAG] },
);

/**
 * Fetches a single book by ID.
 *
 * Security: Uses the service-role admin client (cookie-less, so it is safe inside
 * `unstable_cache`). Book rows are visible to every approved user, so bypassing
 * RLS for this global lookup is safe.
 * Caching: Wrapped in `unstable_cache` with tag `library`.
 *
 * @param id - Book UUID
 */
export const getBookById = unstable_cache(
  async (id: string): Promise<Book | null> => {
    // Admin (service-role) client: no cookies() — safe inside unstable_cache.
    const supabase = createAdminClient();

    // Phase 14 (ISD §14.H): explicit column list. Single-row lookup;
    // selecting `*` is a footgun when the type definition is narrower
    // than the table.
    const { data, error } = await supabase
      .from('books')
      .select('id, title, author, cover_key, file_key, format, created_at, updated_at')
      .eq('id', id)
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return data as Book;
  },
  ['book'],
  { tags: [LIBRARY_TAG] },
);

/**
 * Fetches the current user's "My Library" books.
 *
 * Security: Uses the service-role admin client (cookie-less, required inside
 * `unstable_cache`). Because the admin client BYPASSES RLS, data isolation is
 * enforced manually via `.eq('user_id', userId)` on the query below.
 * Caching: Wrapped in `unstable_cache` with a per-user key AND a per-user tag
 * (`library:{userId}`).
 *
 * ISD §8.Z (CRITICAL): Per-user caches MUST include userId in BOTH the cache key
 * and the cache tag to prevent cross-user leakage AND so that the per-user
 * `revalidateTag(userLibraryTag(userId))` emitted by add/remove actually
 * invalidates this cache. Because `unstable_cache`'s key/tags are captured when
 * the cached function is created, we build a fresh cached function per call so the
 * dynamic `userId` reaches both the key parts and the tags. The per-user tag is
 * used (not the shared `LIBRARY_TAG`) so admin upload/delete does not fan out to
 * every user's private library cache (ISD §8.H — eventual consistency).
 *
 * @param userId - Current user's ID (from session claims)
 */
export function getMyLibrary(userId: string): Promise<Book[]> {
  return unstable_cache(
    async (): Promise<Book[]> => {
      // Admin (service-role) client: no cookies() — safe inside unstable_cache.
      // RLS is bypassed, so the `.eq('user_id', userId)` filter below is what
      // enforces per-user data isolation.
      const supabase = createAdminClient();

      // Join user_libraries with books — Phase 14 (ISD §14.H): explicit
      // column list on the joined relation (was `books(*)`), matching the
      // pruned list used by getCatalog/getBookById.
      const { data, error } = await supabase
        .from('user_libraries')
        .select(
          `
        book:books(id, title, author, cover_key, file_key, format, created_at, updated_at)
      `,
        )
        .eq('user_id', userId)
        .order('added_at', { ascending: false });

      if (error) {
        console.error('[getMyLibrary] Supabase error:', error);
        return [];
      }

      // Extract books from the join result
      const books = (data as Array<{ book: Book }>)?.map((row) => row.book).filter(Boolean) ?? [];

      return books;
    },
    // ISD §8.Z: userId in the key prevents cross-user leakage.
    ['my-library', userId],
    // ISD §8.Z: userId in the tag makes add/remove revalidation effective.
    { tags: [userLibraryTag(userId)] },
  )();
}

/**
 * Fetches a map of book_id → reading progress percentage for the current user.
 *
 * Security: Uses the service-role admin client (cookie-less, required inside
 * `unstable_cache`). RLS is bypassed, so isolation is enforced manually via
 * `.eq('user_id', userId)` on the query below.
 * Caching: Wrapped in `unstable_cache` with a per-user key AND a per-user tag
 * (`progress:{userId}`).
 *
 * ISD §8.Z (CRITICAL): Per-user caches MUST include userId in BOTH key and tag.
 * See `getMyLibrary` above for why the cached function is built per call.
 *
 * @param userId - Current user's ID (from session claims)
 */
export function getProgressMap(userId: string): Promise<Record<string, number>> {
  return unstable_cache(
    async (): Promise<Record<string, number>> => {
      // Admin (service-role) client: no cookies() — safe inside unstable_cache.
      // RLS is bypassed, so the `.eq('user_id', userId)` filter below enforces
      // per-user data isolation.
      const supabase = createAdminClient();

      const { data, error } = await supabase
        .from('reading_progress')
        .select('book_id, percentage')
        .eq('user_id', userId);

      if (error) {
        console.error('[getProgressMap] Supabase error:', error);
        return {};
      }

      // Build a map: book_id → percentage
      const map: Record<string, number> = {};
      const progressData = data as Array<{ book_id: string; percentage: number }>;
      for (const row of progressData ?? []) {
        map[row.book_id] = row.percentage;
      }

      return map;
    },
    // ISD §8.Z: userId in the key prevents cross-user leakage.
    ['progress', userId],
    // ISD §8.Z: userId in the tag scopes progress invalidation to this user.
    { tags: [progressTag(userId)] },
  )();
}

/**
 * Book with reading progress and last read timestamp (for Continue Reading section).
 */
export interface BookWithProgressAndTimestamp extends Book {
  percentage: number;
  lastReadAt: string;
}

/**
 * Fetches books the user is currently reading (progress > 0 and < 100).
 *
 * ISD §10.I: Returns in-progress books ordered by recency for the "Continue Reading" section.
 * Excludes finished books (100%) and unstarted books (0%).
 *
 * Security: Uses the service-role admin client (cookie-less, required inside
 * `unstable_cache`). RLS is bypassed, so isolation is enforced manually via
 * `.eq('user_id', userId)` on the progress query; the book fetch is then scoped
 * to that user's book IDs.
 * Caching: Wrapped in `unstable_cache` with per-user tag (`progress:{userId}`).
 *
 * @param userId - Current user's ID (from session claims)
 * @param limit - Maximum number of books to return (default: 12)
 */
export function getContinueReading(
  userId: string,
  limit: number = 12,
): Promise<BookWithProgressAndTimestamp[]> {
  return unstable_cache(
    async (): Promise<BookWithProgressAndTimestamp[]> => {
      // Admin (service-role) client: no cookies() — safe inside unstable_cache.
      // RLS is bypassed, so the `.eq('user_id', userId)` filter below enforces
      // per-user data isolation.
      const supabase = createAdminClient();

      // Fetch in-progress reading records (0 < percentage < 100)
      const { data: progressData, error: progressError } = await supabase
        .from('reading_progress')
        .select('book_id, percentage, updated_at')
        .eq('user_id', userId)
        .gt('percentage', 0)
        .lt('percentage', 100)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (progressError) {
        console.error('[getContinueReading] Progress fetch error:', progressError);
        return [];
      }

      if (!progressData || progressData.length === 0) {
        return [];
      }

      // Extract book IDs
      const progressRows = progressData as Array<{
        book_id: string;
        percentage: number;
        updated_at: string;
      }>;
      const bookIds = progressRows.map((p) => p.book_id);

      // Fetch the corresponding books — Phase 14: explicit column list.
      const { data: books, error: booksError } = await supabase
        .from('books')
        .select('id, title, author, cover_key, file_key, format, created_at, updated_at')
        .in('id', bookIds);

      if (booksError) {
        console.error('[getContinueReading] Books fetch error:', booksError);
        return [];
      }

      if (!books || books.length === 0) {
        return [];
      }

      // Merge books with their progress data
      const booksWithProgress: BookWithProgressAndTimestamp[] = (books as Book[]).map((book) => {
        const progress = progressRows.find((p) => p.book_id === book.id);
        return {
          ...book,
          percentage: progress?.percentage ?? 0,
          lastReadAt: progress?.updated_at ?? book.updated_at,
        };
      });

      // Sort by lastReadAt desc (in case books query didn't preserve order)
      return booksWithProgress.sort(
        (a, b) => new Date(b.lastReadAt).getTime() - new Date(a.lastReadAt).getTime(),
      );
    },
    // ISD §8.Z: userId in the key prevents cross-user leakage.
    ['continue-reading', userId],
    // ISD §8.Z: userId in the tag scopes progress invalidation to this user.
    { tags: [progressTag(userId)] },
  )();
}

/**
 * Fetches the reading progress for a specific book (for resume reading).
 *
 * ISD §10.I: Returns the saved CFI position so the reader can resume at the last position.
 *
 * @param userId - Current user's ID (from session claims)
 * @param bookId - Book UUID
 * @returns The CFI string if progress exists, null otherwise
 */
export async function getProgressForBook(userId: string, bookId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('reading_progress')
    .select('cfi')
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .maybeSingle();

  if (error) {
    console.error('[getProgressForBook] Supabase error:', error);
    return null;
  }

  if (!data) {
    return null;
  }

  const progress = data as { cfi: string | null };
  return progress.cfi;
}
