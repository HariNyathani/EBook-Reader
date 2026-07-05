'use server';

/**
 * Preferences Server Actions (ISD §12.S).
 *
 * `savePreferencesAction` — debounced cloud push from the client.
 *   - Validates the incoming envelope with the versioned Zod schema.
 *   - Derives `user_id` from session claims (never client input).
 *   - Performs an LWW conditional upsert: only writes if the incoming
 *     `updatedAt` >= the row's existing `updated_at`. Returns the
 *     effective `storedAt` so the client can adopt the server's value
 *     if a concurrent write from another device wins.
 *   - Uses `requireApproved()` to gate access; unapproved users get an
 *     `error` result (never thrown) so the client can degrade
 *     gracefully.
 */

import { requireApproved } from '@/features/auth/session';
import { ok, fail, type ActionResult } from '@/lib/result';
import { preferencesSchema } from './schema';
import { buildEnvelope } from './queries';
import { createClient } from '@/lib/supabase/server';
import type { InsertTables, UpdateTables } from '@/types/database';

export interface SavePreferencesInput {
  /** The full versioned envelope (reader slice + reserved namespaces). */
  preferences: unknown;
  /** ISO timestamp the client computed when the change was made. */
  updatedAt: string;
}

export interface SavePreferencesResult {
  /** The effective stored timestamp (server `now()` or the incoming value). */
  storedAt: string;
}

/**
 * Save the current user's reader preferences to the cloud.
 *
 * LWW semantics (mirrored from Phase 10 progress writes):
 *   - If no row exists: insert with the incoming `updatedAt`.
 *   - If a row exists and `incoming.updatedAt >= existing.updated_at`:
 *     update with the incoming `updatedAt`.
 *   - If a row exists and `incoming.updatedAt < existing.updated_at`:
 *     no-op. Return the existing `updated_at` so the client can
 *     reconcile to the server's newer value.
 */
export async function savePreferencesAction(
  input: SavePreferencesInput,
): Promise<ActionResult<SavePreferencesResult>> {
  try {
    // 1. Require approval.
    const claims = await requireApproved();

    // 2. Validate the envelope with the versioned schema.
    const parsed = preferencesSchema.safeParse(input.preferences);
    if (!parsed.success) {
      return fail(parsed.error.errors.map((e) => e.message).join('; '), 'INVALID_INPUT');
    }

    // 3. Validate the updatedAt ISO timestamp.
    const updatedAt = input.updatedAt;
    if (typeof updatedAt !== 'string' || Number.isNaN(new Date(updatedAt).getTime())) {
      return fail('updatedAt must be a valid ISO timestamp', 'INVALID_INPUT');
    }

    const supabase = await createClient();
    const envelope = buildEnvelope(parsed.data.reader);

    // 4. Read the existing row to apply LWW.
    const { data: existing, error: selectError } = await supabase
      .from('user_preferences')
      .select('updated_at')
      .eq('user_id', claims.userId)
      .maybeSingle();

    if (selectError && selectError.code !== 'PGRST116') {
      throw new Error(`Failed to read existing preferences: ${selectError.message}`);
    }

    if (!existing) {
      // 5a. No row — insert.
      const insertPayload: InsertTables<'user_preferences'> = {
        user_id: claims.userId,
        preferences: envelope as unknown as InsertTables<'user_preferences'>['preferences'],
        version: envelope.version,
        updated_at: updatedAt,
      };
      const { data: inserted, error: insertError } = await supabase
        .from('user_preferences')
        .insert(insertPayload as never)
        .select('updated_at')
        .single();

      if (insertError) {
        throw new Error(`Failed to insert preferences: ${insertError.message}`);
      }

      return ok({ storedAt: (inserted as { updated_at: string }).updated_at });
    }

    const existingRow = existing as { updated_at: string };
    const incomingTime = new Date(updatedAt).getTime();
    const existingTime = new Date(existingRow.updated_at).getTime();

    if (incomingTime >= existingTime) {
      // 5b. Incoming is newer or equal — update.
      const updatePayload: UpdateTables<'user_preferences'> = {
        preferences: envelope as unknown as UpdateTables<'user_preferences'>['preferences'],
        version: envelope.version,
        updated_at: updatedAt,
      };
      const { data: updated, error: updateError } = await supabase
        .from('user_preferences')
        .update(updatePayload as never)
        .eq('user_id', claims.userId)
        .select('updated_at')
        .single();

      if (updateError) {
        throw new Error(`Failed to update preferences: ${updateError.message}`);
      }

      return ok({ storedAt: (updated as { updated_at: string }).updated_at });
    }

    // 5c. Incoming is older — no-op, return existing timestamp.
    return ok({ storedAt: existingRow.updated_at });
  } catch (err) {
    console.error('[savePreferencesAction] Error:', err);
    return fail(
      err instanceof Error ? err.message : 'Failed to save preferences',
      'SAVE_PREFERENCES_ERROR',
    );
  }
}
