import 'server-only';

// ⚠️ WARNING: This client uses the SUPABASE_SERVICE_ROLE_KEY which BYPASSES all Row Level Security.
// It must NEVER be imported into client code or any file reachable from the client bundle.
// The `import 'server-only'` at the top enforces this as a build error.
// Intended use: admin-only mutations (approve user, delete book) in Phase 4/6 Server Actions.

import { createClient as _createClient } from '@supabase/supabase-js';
import { getServerEnv } from '@/lib/env';
import type { Database } from '@/types/database';

let _adminClient: ReturnType<typeof _createClient<Database>> | null = null;

/**
 * Returns a memoized Supabase client using the service-role key.
 *
 * ⚠️ RLS IS BYPASSED — Every query runs as the database superuser.
 * Only call this from trusted server-side paths (admin Server Actions, scripts).
 * Validate all inputs before passing them to this client.
 *
 * Use this client for:
 * - Approving / revoking users (flip is_approved in profiles)
 * - Admin book uploads / deletions
 * - The bootstrap-admin script
 */
export function createAdminClient(): ReturnType<typeof _createClient<Database>> {
  if (_adminClient) return _adminClient;

  const env = getServerEnv();

  _adminClient = _createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return _adminClient;
}
