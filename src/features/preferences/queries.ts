import 'server-only';

/**
 * Server-side preferences queries (ISD §12.I, §12.U).
 *
 * `getPreferences` reads the current user's `user_preferences` row
 * (RLS enforces own-row access) and migrates the jsonb to the current
 * schema. Returns `null` if the user has no row yet (first-ever load).
 *
 * The function is intentionally NOT wrapped in `unstable_cache` — the
 * payload is small and user-specific, and we want a fresh read every
 * time the client requests hydration. Cache invalidation for the local
 * zustand store is handled by the PreferencesProvider's reconciliation
 * step.
 */

import { createClient } from '@/lib/supabase/server';
import { getClaims } from '@/features/auth/session';
import { migratePreferences } from './migrate';
import type { Preferences, ReaderPreferences } from './schema';
import { PREFERENCES_VERSION } from './schema';

export interface CloudPreferences {
  /** The (migrated) reader preferences slice. */
  reader: ReaderPreferences;
  /** The server-side updated_at ISO timestamp. */
  updatedAt: string;
  /** Envelope version. */
  version: number;
}

/**
 * Read the current user's cloud preferences.
 *
 * Returns null if the user is not authenticated / not approved, or if
 * no row exists. RLS ensures the user can only read their own row.
 *
 * @returns Cloud preferences (migrated) or null
 */
export async function getPreferences(): Promise<CloudPreferences | null> {
  const claims = await getClaims();
  if (!claims || !claims.isApproved) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_preferences')
    .select('preferences, version, updated_at')
    .eq('user_id', claims.userId)
    .maybeSingle();

  if (error) {
    // RLS or other error — log and return null so the client falls back
    // to local preferences.
    console.error('[getPreferences] Supabase error:', error.message);
    return null;
  }

  if (!data) return null;

  // The raw `preferences` jsonb might be from an older version. Run the
  // migration to upgrade the reader slice.
  const row = data as { preferences: unknown; version: number; updated_at: string };
  const reader = migratePreferences(row.preferences);

  return {
    reader,
    updatedAt: row.updated_at,
    version: row.version ?? PREFERENCES_VERSION,
  };
}

/**
 * Build a versioned envelope from a reader preferences slice.
 * Used by the save action.
 */
export function buildEnvelope(reader: ReaderPreferences): Preferences {
  return {
    version: PREFERENCES_VERSION,
    reader,
  };
}
