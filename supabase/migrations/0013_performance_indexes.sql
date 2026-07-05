-- Migration: 0013_performance_indexes.sql
-- Phase 14 (ISD §14.I, §14.DD #4): Performance indexes + trigram
-- search support for the admin user search and the library catalog
-- search.
--
-- Audit findings (query-by-query):
--
--   1. `profiles.email` substring search via ilike (admin/queries.ts
--      `listUsers`). The user table has no expression index for
--      `email` so an `ilike '%x%'` scan walks every row. We add a
--      trigram GIN index (pg_trgm) so the planner can use the index
--      for `ILIKE`/`LIKE` patterns.
--
--   2. `books.title` and `books.author` substring search via ilike
--      (library/queries.ts `getCatalog`). Same story — a GIN
--      trigram index lets the catalog search scale beyond a few
--      hundred books.
--
--   3. `books.created_at` ordering: already indexed in 0003
--      (`books_created_at_desc_idx`). No change.
--
--   4. `books.id` PK: implicit btree index. No change.
--
--   5. `reading_progress.user_id, book_id`: already enforced by
--      the `unique (user_id, book_id)` constraint in 0005 (btrees
--      under the hood). No change.
--
--   6. `user_libraries.user_id` and `(user_id, book_id)`: indexed
--      in 0004. No change.
--
-- Privacy / safety:
--   - pg_trgm is a SECURITY INVOKER extension; it does not bypass RLS.
--   - All new indexes live in the public schema and inherit the
--     table's RLS policies (Postgres enforces RLS on index scans
--     as part of the query plan).
--   - This migration is ADDITIVE: it only creates indexes and an
--     extension. It does not modify any existing object.
--
-- Idempotency:
--   - `create extension if not exists pg_trgm`
--   - `create index if not exists ...` for every index.

-- ===========================================================================
-- 1. Enable pg_trgm (idempotent).
-- ===========================================================================
create extension if not exists pg_trgm;

-- ===========================================================================
-- 2. Admin user search — email ILIKE substring scan.
--    Used by `listUsers` in src/features/admin/queries.ts.
--    A btree on email would not help an `ilike '%foo%'` query; the
--    GIN trigram index lets the planner use the index for both
--    anchored and substring patterns.
-- ===========================================================================
create index if not exists profiles_email_trgm_idx
  on public.profiles using gin (email gin_trgm_ops);

-- ===========================================================================
-- 3. Library catalog search — title and author ILIKE substring scans.
--    Used by `getCatalog` in src/features/library/queries.ts.
--    We create separate GIN trigram indexes for title and author so
--    the planner can pick the cheapest one (the query ORs them with
--    `.or('title.ilike.X,author.ilike.X')`).
-- ===========================================================================
create index if not exists books_title_trgm_idx
  on public.books using gin (title gin_trgm_ops);

create index if not exists books_author_trgm_idx
  on public.books using gin (author gin_trgm_ops);

-- ===========================================================================
-- 4. Optional supporting indexes (defense in depth).
--    These are not strictly required by the current query patterns,
--    but they are cheap to add and they future-proof common lookups:
--
--    a) `books.format` — admin may filter by format in a future
--       admin books view. Btree is sufficient (low cardinality).
--    b) `reading_progress.updated_at` — already covered by
--       `reading_progress_user_updated_idx` in 0005 (btrees on the
--       user_id, updated_at composite). No change.
-- ===========================================================================
create index if not exists books_format_idx
  on public.books(format);

-- ===========================================================================
-- 5. Comments documenting the new indexes (for future ops review).
-- ===========================================================================
comment on index public.profiles_email_trgm_idx is
  'Phase 14 (ISD §14.I): GIN trigram index for admin user search (ilike on email).';

comment on index public.books_title_trgm_idx is
  'Phase 14 (ISD §14.I): GIN trigram index for library catalog search (ilike on title).';

comment on index public.books_author_trgm_idx is
  'Phase 14 (ISD §14.I): GIN trigram index for library catalog search (ilike on author).';

comment on index public.books_format_idx is
  'Phase 14 (ISD §14.I): btree on books.format for future format filters.';
