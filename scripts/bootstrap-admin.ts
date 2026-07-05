#!/usr/bin/env tsx
/**
 * scripts/bootstrap-admin.ts
 *
 * OPERATOR TOOL: Promotes a user to is_admin=true, is_approved=true by email.
 *
 * Use this to create the FIRST admin account, since all new users default to
 * unapproved (is_approved=false, is_admin=false). Normal approval flows require
 * an existing admin — this script is the escape hatch for the initial setup.
 *
 * REQUIREMENTS:
 * - .env.local must contain SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * - The target user must have registered (a profiles row must exist).
 *
 * USAGE:
 *   pnpm bootstrap:admin <email>
 *
 * EXAMPLE:
 *   pnpm bootstrap:admin admin@example.com
 *
 * SECURITY:
 * - Uses the service-role key (bypasses RLS). NEVER expose or commit this key.
 * - Run only in a trusted terminal session, never in CI without secrets management.
 * - This script does NOT create the user — the user must sign up first via the app.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import type { Database } from '../src/types/database';

// Load .env.local relative to project root
config({ path: resolve(process.cwd(), '.env.local') });

// ---------------------------------------------------------------------------
// Validate environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env['SUPABASE_URL'];
const SUPABASE_SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    '[bootstrap-admin] ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Validate argument
// ---------------------------------------------------------------------------
const email = process.argv[2]?.trim();

if (!email || !email.includes('@')) {
  console.error('[bootstrap-admin] USAGE: pnpm bootstrap:admin <email>');
  console.error('[bootstrap-admin] ERROR: A valid email address is required.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------
async function main() {
  const admin = createClient<Database>(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Look up the user ID by email via auth admin API
  const { data: listData, error: listError } = await admin.auth.admin.listUsers();

  if (listError) {
    console.error('[bootstrap-admin] ERROR: Could not list users:', listError.message);
    process.exit(1);
  }

  const user = listData.users.find((u) => u.email === email);

  if (!user) {
    console.error(
      `[bootstrap-admin] ERROR: No auth user found with email "${email}".`,
      'Make sure the user has registered via the app first.',
    );
    process.exit(1);
  }

  // 2. Upsert the profile to admin + approved
  const { error: updateError } = await admin
    .from('profiles')
    .update({ is_approved: true, is_admin: true })
    .eq('id', user.id);

  if (updateError) {
    console.error('[bootstrap-admin] ERROR: Failed to update profile:', updateError.message);
    process.exit(1);
  }

  // 3. Confirm
  const { data: profile, error: readError } = await admin
    .from('profiles')
    .select('id, email, is_approved, is_admin')
    .eq('id', user.id)
    .single();

  if (readError || !profile) {
    console.error('[bootstrap-admin] ERROR: Failed to read back profile:', readError?.message);
    process.exit(1);
  }

  console.log('[bootstrap-admin] ✅ Success!');
  console.log(`  User ID:     ${profile.id}`);
  console.log(`  Email:       ${profile.email}`);
  console.log(`  is_approved: ${profile.is_approved}`);
  console.log(`  is_admin:    ${profile.is_admin}`);
  console.log('');
  console.log(
    '  NOTE: The user must sign out and sign back in (or wait for token refresh) for the new claims to appear in their JWT.',
  );
}

main().catch((err: unknown) => {
  console.error('[bootstrap-admin] FATAL:', err);
  process.exit(1);
});
