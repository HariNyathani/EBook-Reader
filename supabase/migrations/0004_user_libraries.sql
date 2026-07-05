-- 0004_user_libraries.sql
-- Phase 3: Create the public.user_libraries join table.
-- Represents a user's personal bookshelf (which books they've added).
-- Idempotent: CREATE TABLE IF NOT EXISTS.

create table if not exists public.user_libraries (
  id       uuid        primary key default gen_random_uuid(),
  user_id  uuid        not null references auth.users(id) on delete cascade,
  book_id  uuid        not null references public.books(id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (user_id, book_id)
);

comment on table public.user_libraries is
  'Personal bookshelf: maps approved users to the books they have added to their library.';

-- Fast lookup by user (primary access pattern: list a user's library).
create index if not exists user_libraries_user_id_idx
  on public.user_libraries(user_id);

-- Allow reverse lookup by book (e.g., "who has this book?") for future admin analytics.
create index if not exists user_libraries_book_id_idx
  on public.user_libraries(book_id);
