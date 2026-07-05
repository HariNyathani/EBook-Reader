# lib/supabase — Supabase Client Factories

## Phase 3 — Complete

This directory provides three distinct Supabase client factories for different access patterns:

| File            | Client Type                               | When to Use                                                                                                                     |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `server.ts`     | Request-scoped SSR client (async cookies) | **Server Components**, **Server Actions**, **Route Handlers** that need the user's session. Creates a fresh client per request. |
| `browser.ts`    | Browser singleton (anon key)              | **Client Components** needing auth state or real-time. `'use client'` required.                                                 |
| `admin.ts`      | Service-role client (**RLS bypassed**)    | **Admin Server Actions only** (approve user, admin upload). **NEVER import from client code.**                                  |
| `middleware.ts` | `updateSession` helper                    | Called by `src/middleware.ts` (Phase 4) to refresh auth cookies. Token refresh only — no guards.                                |

## Security Model

- **`admin.ts`** uses `SUPABASE_SERVICE_ROLE_KEY` — `import 'server-only'` makes client import a build error.
- Service-role bypasses RLS. All mutations via admin client must be validated at the application layer.
- **`server.ts`** uses the anon key + cookies — respects RLS, safe for user-facing Server Actions.
- **`browser.ts`** uses the anon key — RLS restricts rows; singleton avoids token state conflicts.

## JWT Claims (§0.4 resolution)

The `public.custom_access_token_hook` function (migration `0008`) injects top-level claims:

- `is_approved: boolean` — must be `true` for any app content access
- `is_admin: boolean` — must be `true` for admin operations

RLS policies read: `(auth.jwt() ->> 'is_approved')::boolean = true`
Middleware (Phase 4) reads: `payload.is_approved` and `payload.is_admin`

## Hook Activation (Required)

Without the Custom Access Token Hook, all RLS policies fail-closed.

**Cloud:** Dashboard → Authentication → Hooks → Custom Access Token → Enable → select `public.custom_access_token_hook`

**Local:** Already configured in `supabase/config.toml`:

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

## Barrel

`index.ts` exports `createClient`, `createBrowserClient`, and `updateSession`.
`createAdminClient` is intentionally NOT in the barrel — import from `@/lib/supabase/admin` directly.
