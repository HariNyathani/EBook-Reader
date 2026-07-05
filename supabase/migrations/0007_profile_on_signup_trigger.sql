-- 0007_profile_on_signup_trigger.sql
-- Phase 3: Automatically create a public.profiles row when a new auth.users row is inserted.
-- Uses SECURITY DEFINER with a locked search_path to prevent privilege escalation.
-- The profile defaults to is_approved=false, is_admin=false (per §3.Z first-user note).
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS.

create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  insert into public.profiles (id, email, is_approved, is_admin)
  values (
    new.id,
    coalesce(new.email, ''),
    false,
    false
  )
  on conflict (id) do nothing;  -- guard against duplicate trigger firing
  return new;
end;
$$;

-- Attach to auth.users (Supabase internal schema — this is the supported extension point).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
