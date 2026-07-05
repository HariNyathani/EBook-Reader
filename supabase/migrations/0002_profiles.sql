-- 0002_profiles.sql
-- Phase 3: Create the public.profiles table.
-- Source of truth for authorization claims; read by the access-token hook.
-- Idempotent: CREATE TABLE IF NOT EXISTS.

create table if not exists public.profiles (
  id         uuid        primary key references auth.users(id) on delete cascade,
  email      text        not null,
  is_approved boolean    not null default false,
  is_admin   boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Source of truth for authorization claims (is_approved, is_admin); read by the custom access-token hook.';

comment on column public.profiles.is_approved is
  'Must be true for a user to access any app content. Set by admin via service-role client only.';

comment on column public.profiles.is_admin is
  'Must be true for a user to perform admin operations. Set by bootstrap-admin script only.';

-- Partial index for admin approvals listing (unapproved users queue).
create index if not exists profiles_unapproved_idx
  on public.profiles(id)
  where is_approved = false;
