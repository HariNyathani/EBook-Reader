-- 0003_books.sql
-- Phase 3: Create the public.books table.
-- cover_key and file_key store R2 object keys, NEVER full URLs (SAD §1.2).
-- Idempotent: CREATE TABLE IF NOT EXISTS.

create table if not exists public.books (
  id         uuid           primary key default gen_random_uuid(),
  title      text           not null,
  author     text,
  -- R2 object key for the cover image (e.g. "covers/uuid.jpg"). NULL if no cover uploaded.
  cover_key  text,
  -- R2 object key for the EPUB file (e.g. "epubs/uuid.epub"). Never a URL.
  file_key   text           not null,
  format     public.book_format not null default 'epub',
  created_at timestamptz    not null default now(),
  updated_at timestamptz    not null default now()
);

comment on table public.books is
  'Catalogue of available books. cover_key and file_key are Cloudflare R2 object keys, never URLs.';

-- Index for default library ordering (newest first).
create index if not exists books_created_at_desc_idx
  on public.books(created_at desc);
