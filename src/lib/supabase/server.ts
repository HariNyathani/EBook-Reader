import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Creates a request-scoped, cookie-based Supabase client for Server Components,
 * Server Actions, and Route Handlers.
 *
 * Uses @supabase/ssr's createServerClient with Next.js 15 async cookies().
 * Each call creates a fresh client bound to the current request's cookie store —
 * do NOT cache or share across requests.
 *
 * Use this client for:
 * - Fetching data in Server Components (respects RLS via the user's session)
 * - Executing auth Server Actions (sign-in, sign-up, sign-out)
 * - Reading user progress, library, etc. in Route Handlers
 *
 * NEVER use this for:
 * - Admin mutations (use createAdminClient from ./admin)
 * - Client Components (use createBrowserClient from ./browser)
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>,
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]),
            );
          } catch {
            // setAll throws in read-only contexts (Server Components reading cookies).
            // The middleware handles cookie refresh, so this is safe to ignore here.
          }
        },
      },
      auth: {
        // ISD-NOTE: persistSession: false is NOT set — the server client must read the
        // session from cookies. The @supabase/ssr default (true) is correct here.
        // autoRefreshToken: false because refresh is handled by the middleware's updateSession.
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
