-- 0010_grants.sql
-- Phase 3: Schema and table grants.
-- RLS gates individual rows; these grants control table-level access.
-- anon role gets no access to app tables (all app content requires authentication).
-- authenticated role gets DML access — RLS enforces row-level restrictions.

-- Grant schema usage so roles can see public schema objects.
grant usage on schema public to authenticated;
grant usage on schema public to anon;

-- Grant table-level access for the authenticated role.
-- RLS policies above still filter individual rows.
grant select           on public.profiles          to authenticated;
grant select           on public.books             to authenticated;
grant select, insert, delete on public.user_libraries  to authenticated;
grant select, insert, update on public.reading_progress to authenticated;

-- anon role: no access to any app table.
-- (Supabase may grant anon access by default via the template — revoke it.)
revoke all on public.profiles          from anon;
revoke all on public.books             from anon;
revoke all on public.user_libraries    from anon;
revoke all on public.reading_progress  from anon;
