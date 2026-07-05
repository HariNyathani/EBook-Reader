'use client';

import { createBrowserClient as _createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

let _client: ReturnType<typeof _createBrowserClient<Database>> | null = null;

/**
 * Returns a singleton Supabase browser client for use in Client Components.
 *
 * Singleton pattern avoids multiple GoTrue instances sharing conflicting token state.
 * Uses the public anon key — RLS restricts data access.
 *
 * Use this client for:
 * - Subscribing to real-time events (Phase 5+)
 * - Client-side auth state listening (onAuthStateChange)
 *
 * NEVER use this for:
 * - Admin mutations (use createAdminClient — server-only)
 * - Server Components (use createClient from ./server)
 */
export function createBrowserClient(): ReturnType<typeof _createBrowserClient<Database>> {
  if (_client) return _client;

  _client = _createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return _client;
}
