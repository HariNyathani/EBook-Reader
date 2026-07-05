import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Refreshes the Supabase auth session cookie on each request.
 * Called by src/middleware.ts (Phase 4).
 *
 * SCOPE (Phase 3): Token refresh ONLY — no route-guard logic here.
 * Route guards are implemented in Phase 4's middleware.ts.
 *
 * Per @supabase/ssr App Router recipe: a middleware Supabase client is needed
 * because Server Component clients are read-only (cannot write cookies).
 * This function creates a temporary client, calls getUser() to refresh the
 * session, and returns the modified response with updated auth cookies.
 *
 * @param request - The incoming Next.js request
 * @returns NextResponse with refreshed auth cookies set
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>,
        ) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(
              name,
              value,
              options as Parameters<typeof response.cookies.set>[2],
            ),
          );
        },
      },
    },
  );

  // Calling getUser() is required to refresh the session cookie.
  // The return value is not used here — Phase 4 middleware will call getUser/getClaims
  // on its own client for route guards.
  // ISD-NOTE: We call getUser() rather than getSession() per @supabase/ssr guidance:
  // getSession() reads from the cookie without revalidating; getUser() validates with the server.
  await supabase.auth.getUser();

  return response;
}
