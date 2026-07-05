-- 0008_access_token_hook.sql
-- Phase 3: Custom Access Token Hook — resolves §0.4 JWT claim-path ambiguity.
--
-- This function is called by Supabase Auth before issuing each JWT.
-- It injects top-level claims `is_approved` and `is_admin` (booleans) into every token.
-- These claims are then read by:
--   - Middleware (Phase 4): decode JWT, read top-level is_approved/is_admin
--   - RLS policies (0009): (auth.jwt() ->> 'is_approved')::boolean = true
--
-- ACTIVATION (MANDATORY — without this, ALL RLS policies fail-closed):
-- Option A (Supabase Dashboard):
--   Authentication → Hooks → Custom Access Token Hook
--   → Enable, select function: public.custom_access_token_hook
-- Option B (supabase/config.toml for local dev — see supabase/config.toml):
--   [auth.hook.custom_access_token]
--   enabled = true
--   uri = "pg-functions://postgres/public/custom_access_token_hook"
--
-- Security:
-- - SECURITY DEFINER: runs as the function owner (postgres/supabase superuser).
-- - search_path = '': prevents search_path hijacking.
-- - Execute granted ONLY to supabase_auth_admin; revoked from public/authenticated/anon.

create or replace function public.custom_access_token_hook(event jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_is_approved boolean;
  v_is_admin    boolean;
  claims        jsonb;
begin
  -- Look up authorization flags from the profiles table.
  -- Falls back to false/false if no profile row exists (e.g., signup race condition).
  select
    coalesce(p.is_approved, false),
    coalesce(p.is_admin,    false)
  into v_is_approved, v_is_admin
  from public.profiles p
  where p.id = (event ->> 'user_id')::uuid;

  -- Merge top-level claims into the JWT claims object.
  -- Reading path: auth.jwt() ->> 'is_approved' (top-level, not app_metadata).
  claims = coalesce(event -> 'claims', '{}'::jsonb);
  claims = jsonb_set(claims, '{is_approved}', to_jsonb(coalesce(v_is_approved, false)));
  claims = jsonb_set(claims, '{is_admin}',    to_jsonb(coalesce(v_is_admin,    false)));

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Grant execute to Supabase Auth internal role only.
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- Explicitly revoke from roles that should never call this hook directly.
revoke execute on function public.custom_access_token_hook(jsonb) from public, authenticated, anon;
