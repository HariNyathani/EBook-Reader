-- 0009_rls_policies.sql
-- Phase 3: Row Level Security policies for all four app tables.
-- Applies the §0.4 correction: all policies read top-level JWT claims via auth.jwt() ->> 'is_approved'.
-- Idempotent: DROP POLICY IF EXISTS before each CREATE POLICY.
--
-- Design notes:
--   - "approved" predicate: (auth.jwt() ->> 'is_approved')::boolean = true
--   - "admin" predicate:    (auth.jwt() ->> 'is_admin')::boolean = true
--   - Admin mutations (approve user, upload book) use the service-role client
--     in Phase 4/6 and bypass RLS entirely — so no authenticated update policies
--     are needed for sensitive columns.

-- ===== ENABLE RLS =====
alter table public.profiles       enable row level security;
alter table public.books           enable row level security;
alter table public.user_libraries  enable row level security;
alter table public.reading_progress enable row level security;

-- ===== PROFILES =====
-- A user may read only their own profile.
drop policy if exists "profiles: users read own" on public.profiles;
create policy "profiles: users read own"
  on public.profiles
  for select
  using (id = auth.uid());

-- Admins may read all profiles (for the approvals queue).
drop policy if exists "profiles: admins read all" on public.profiles;
create policy "profiles: admins read all"
  on public.profiles
  for select
  using ((auth.jwt() ->> 'is_admin')::boolean = true);

-- No user-facing INSERT policy: the signup trigger (SECURITY DEFINER) handles it.
-- No user-facing UPDATE policy for is_approved/is_admin: service-role client only.
-- Phase 4: service-role client bypasses RLS to flip is_approved — no policy needed.

-- ===== BOOKS =====
-- Only approved users may read the book catalogue (SAD §3.2 example policy).
drop policy if exists "books: approved users select" on public.books;
create policy "books: approved users select"
  on public.books
  for select
  using ((auth.jwt() ->> 'is_approved')::boolean = true);

-- No INSERT/UPDATE/DELETE for authenticated — admin uploads use service-role (Phase 6).

-- ===== USER_LIBRARIES =====
-- A user may read, add, and remove books from their own library.
drop policy if exists "user_libraries: users select own" on public.user_libraries;
create policy "user_libraries: users select own"
  on public.user_libraries
  for select
  using (
    user_id = auth.uid()
    and (auth.jwt() ->> 'is_approved')::boolean = true
  );

drop policy if exists "user_libraries: users insert own" on public.user_libraries;
create policy "user_libraries: users insert own"
  on public.user_libraries
  for insert
  with check (
    user_id = auth.uid()
    and (auth.jwt() ->> 'is_approved')::boolean = true
  );

drop policy if exists "user_libraries: users delete own" on public.user_libraries;
create policy "user_libraries: users delete own"
  on public.user_libraries
  for delete
  using (
    user_id = auth.uid()
    and (auth.jwt() ->> 'is_approved')::boolean = true
  );

-- ===== READING_PROGRESS =====
-- A user may read, create, and update their own reading progress.
-- unique(user_id, book_id) + approved check enforced in both USING and WITH CHECK.
drop policy if exists "reading_progress: users select own" on public.reading_progress;
create policy "reading_progress: users select own"
  on public.reading_progress
  for select
  using (
    user_id = auth.uid()
    and (auth.jwt() ->> 'is_approved')::boolean = true
  );

drop policy if exists "reading_progress: users upsert own" on public.reading_progress;
create policy "reading_progress: users upsert own"
  on public.reading_progress
  for insert
  with check (
    user_id = auth.uid()
    and (auth.jwt() ->> 'is_approved')::boolean = true
  );

drop policy if exists "reading_progress: users update own" on public.reading_progress;
create policy "reading_progress: users update own"
  on public.reading_progress
  for update
  using (
    user_id = auth.uid()
    and (auth.jwt() ->> 'is_approved')::boolean = true
  )
  with check (
    user_id = auth.uid()
    and (auth.jwt() ->> 'is_approved')::boolean = true
  );
