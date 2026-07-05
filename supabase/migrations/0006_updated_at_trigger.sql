-- 0006_updated_at_trigger.sql
-- Phase 3: Reusable trigger function that sets updated_at = now() before any UPDATE.
-- Attach to tables that have an updated_at column.
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS before CREATE TRIGGER.

create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Attach to public.profiles
drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Attach to public.books
drop trigger if exists set_books_updated_at on public.books;
create trigger set_books_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();

-- Attach to public.reading_progress
drop trigger if exists set_reading_progress_updated_at on public.reading_progress;
create trigger set_reading_progress_updated_at
  before update on public.reading_progress
  for each row execute function public.set_updated_at();
