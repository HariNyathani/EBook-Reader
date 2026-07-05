/**
 * Supabase client factory barrel.
 *
 * Usage guide:
 * | Context | Import | Client |
 * |---------|--------|--------|
 * | Server Component, Server Action, Route Handler | `@/lib/supabase/server` | `createClient()` |
 * | Client Component | `@/lib/supabase/browser` | `createBrowserClient()` |
 * | Admin Server Action (RLS-bypassing) | `@/lib/supabase/admin` | `createAdminClient()` |
 * | Next.js middleware | `@/lib/supabase/middleware` | `updateSession(request)` |
 *
 * NOTE: `createAdminClient` is intentionally NOT re-exported from this barrel.
 * It must be imported directly from `@/lib/supabase/admin` so that
 * tree-shaking and audit tooling can trace service-role usage explicitly.
 */

// Server-side client (cookie-based, request-scoped)
export { createClient } from './server';

// Browser singleton client (anon key, client-side only)
export { createBrowserClient } from './browser';

// Middleware session refresh helper
export { updateSession } from './middleware';

// createAdminClient is NOT exported here — import from @/lib/supabase/admin directly.
