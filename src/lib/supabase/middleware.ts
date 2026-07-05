import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Top-level JWT claims injected by the Phase 3 custom_access_token_hook.
 * `null` claims means the request is unauthenticated.
 */
export interface MiddlewareClaims {
  isApproved: boolean;
  isAdmin: boolean;
}

export interface UpdateSessionResult {
  /** Response carrying any refreshed/rotated Supabase auth cookies. */
  response: NextResponse;
  /** Decoded top-level claims, or null when the request is not authenticated. */
  claims: MiddlewareClaims | null;
}

/**
 * Edge-safe base64url JWT payload decoder.
 *
 * AUDIT FIX (CRITICAL): The middleware previously hand-parsed the raw `sb-*-auth-token`
 * cookie with `JSON.parse(decodeURIComponent(value))`. That is incompatible with
 * @supabase/ssr 0.5.2, which stores cookie VALUES base64-encoded (prefixed with
 * `base64-`) and CHUNKS large sessions into `.0`/`.1` suffixes — so the parse threw and
 * every authenticated user was misclassified as anonymous. We now let the Supabase SSR
 * client read/decode/join the cookies (via getSession) and decode the resulting JWT here.
 *
 * We intentionally use `atob` + `TextDecoder` (NOT Node's `Buffer`) because middleware
 * runs on the Edge Runtime where `Buffer` is not guaranteed to be available.
 */
function decodeJwtPayload(accessToken: string): Record<string, unknown> | null {
  const parts = accessToken.split('.');
  const payloadSegment = parts[1];
  if (!payloadSegment) return null;

  try {
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Refreshes the Supabase auth session cookie and extracts top-level JWT claims.
 * Called by src/middleware.ts (Phase 4).
 *
 * Per the @supabase/ssr App Router recipe, a middleware Supabase client is required
 * because Server Component clients are read-only (cannot write cookies). This function:
 *   1. Creates a request-scoped client that mirrors cookie writes onto `response`.
 *   2. Calls getUser() to validate + refresh the session server-side.
 *   3. Reads the (locally decoded) session token and extracts top-level is_approved /
 *      is_admin claims injected by the Phase 3 custom_access_token_hook (§0.4).
 *
 * @param request - The incoming Next.js request
 * @returns The response (with refreshed cookies) and decoded claims (or null).
 */
export async function updateSession(request: NextRequest): Promise<UpdateSessionResult> {
  let response = NextResponse.next({ request });

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

  // getUser() validates the token with the auth server AND triggers cookie rotation.
  // ISD-NOTE: getUser() (not getSession() alone) is used per @supabase/ssr guidance —
  // getSession() reads the cookie without revalidating.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  let claims: MiddlewareClaims | null = null;

  if (!error && user) {
    // Obtain the access token via the SSR client (handles base64-/chunked cookies),
    // then decode the top-level claims. getSession() is a local read (no extra round-trip).
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token;
    const payload = accessToken ? decodeJwtPayload(accessToken) : null;

    claims = {
      // Fail-closed: absent/false claims (e.g. hook not enabled) → unapproved, non-admin.
      isApproved: payload?.['is_approved'] === true,
      isAdmin: payload?.['is_admin'] === true,
    };
  }

  return { response, claims };
}
