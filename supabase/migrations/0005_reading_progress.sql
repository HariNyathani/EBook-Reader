-- 0005_reading_progress.sql
-- Phase 3: Create the public.reading_progress table.
-- One row per (user_id, book_id) pair — enables UPSERT per SAD §5.3.
-- Idempotent: CREATE TABLE IF NOT EXISTS.

create table if not exists public.reading_progress (
  id         uuid           primary key default gen_random_uuid(),
  user_id    uuid           not null references auth.users(id) on delete cascade,
  book_id    uuid           not null references public.books(id) on delete cascade,
  -- EPUB CFI string identifying the current reading position (e.g. "epubcfi(/6/4!/4/2/2/2:0)").
  -- NULL if only percentage has been stored (initial open).
  cfi        text,
  -- 0.00 – 100.00; database enforces valid range.
  percentage numeric(5,2)   not null default 0
                            check (percentage >= 0 and percentage <= 100),
  updated_at timestamptz    not null default now(),
  unique (user_id, book_id)
);

comment on table public.reading_progress is
  'Tracks reading position per user per book. unique(user_id, book_id) enables upsert semantics (SAD §5.3).';

-- Fast lookup for "resume reading" and future stats pages.
create index if not exists reading_progress_user_updated_idx
  on public.reading_progress(user_id, updated_at desc);
