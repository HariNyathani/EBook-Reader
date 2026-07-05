# lib/supabase — Supabase Client Factories

## Status: Placeholder — populated in Phase 3

This directory will contain three distinct Supabase client factories:

| File            | Client Type                            | When to Use                                                                        |
| --------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| `server.ts`     | Request-scoped SSR client (cookies)    | Server Components, Server Actions, Route Handlers that need the **user's session** |
| `browser.ts`    | Browser singleton (anon key)           | Client Components that need real-time or direct Supabase calls (rare in this app)  |
| `admin.ts`      | Service-role client (**RLS bypassed**) | Admin mutations (approve user, admin upload). **Never expose to client.**          |
| `middleware.ts` | `updateSession` helper                 | Called by `middleware.ts` (Phase 4) to refresh auth cookies on each request        |

## Security Notes

- `admin.ts` uses `SUPABASE_SERVICE_ROLE_KEY` — **server-only**, never in client bundles.
- The service-role client bypasses RLS. All mutations through it must be validated at the application layer.
- `server.ts` uses cookies and respects RLS — safe for user-facing Server Actions.

## Phase 3 Tasks

- Create migration files under `supabase/migrations/`
- Enable the Custom Access Token Hook (injects `is_approved`/`is_admin` into JWT)
- Generate `src/types/database.ts` via `pnpm db:types`
