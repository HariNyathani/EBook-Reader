import 'server-only';

/**
 * Progress persistence utility (ISD §10.I).
 *
 * Shared by both the Server Action (saveProgressAction) and the beacon endpoint (POST /api/progress).
 * Implements conditional upsert with last-write-wins conflict resolution (ISD §10.F).
 *
 * Multi-device safety: Only overwrites if incoming updatedAt >= existing updated_at.
 * This prevents a stale offline flush from clobbering a newer position saved from another device.
 */

import { createClient } from '@/lib/supabase/server';
import type { ReadingProgress } from '@/types';
import type { InsertTables, UpdateTables } from '@/types/database';

// The @supabase/ssr server client infers `never` for mutation payloads under the
// installed @supabase/supabase-js v2 / postgrest-js combination (the raw admin
// client does not). We keep the payloads strongly typed via InsertTables/
// UpdateTables — which validates the shape at authoring time — and bridge the
// method's `never` parameter with a single localized `as never` cast. This
// replaces the previous unchecked `as any` casts (which failed the lint gate).

/**
 * Persist reading progress with conditional upsert.
 *
 * @param userId - User ID (from session claims, never client input)
 * @param bookId - Book UUID
 * @param cfi - Current CFI position
 * @param percentage - Reading progress (0-100)
 * @param updatedAt - ISO timestamp (for conflict resolution)
 *
 * @returns The stored row (may be the incoming row or the existing newer row)
 *
 * ISD §10.F: Conditional upsert prevents stale overwrites.
 * - If no row exists: insert
 * - If incoming updatedAt >= existing updated_at: update
 * - If incoming updatedAt < existing updated_at: no-op (return existing)
 */
export async function persistProgress(
  userId: string,
  bookId: string,
  cfi: string,
  percentage: number,
  updatedAt: string,
): Promise<ReadingProgress> {
  const supabase = await createClient();

  // Check if a row exists
  const { data: existing, error: selectError } = await supabase
    .from('reading_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .maybeSingle();

  if (selectError && selectError.code !== 'PGRST116') {
    // PGRST116 = no rows returned (maybeSingle returns this when no match)
    throw new Error(`Failed to check existing progress: ${selectError.message}`);
  }

  if (!existing) {
    // No existing row — insert
    const insertPayload: InsertTables<'reading_progress'> = {
      user_id: userId,
      book_id: bookId,
      cfi,
      percentage,
      updated_at: updatedAt,
    };
    const { data: inserted, error: insertError } = await supabase
      .from('reading_progress')
      .insert(insertPayload as never)
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to insert progress: ${insertError.message}`);
    }

    return inserted as ReadingProgress;
  }

  // Existing row found — check timestamp
  const existingRow = existing as ReadingProgress;
  const existingUpdatedAt = new Date(existingRow.updated_at).getTime();
  const incomingUpdatedAt = new Date(updatedAt).getTime();

  if (incomingUpdatedAt >= existingUpdatedAt) {
    // Incoming is newer or equal — update
    const updatePayload: UpdateTables<'reading_progress'> = {
      cfi,
      percentage,
      updated_at: updatedAt,
    };
    const { data: updated, error: updateError } = await supabase
      .from('reading_progress')
      .update(updatePayload as never)
      .eq('user_id', userId)
      .eq('book_id', bookId)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update progress: ${updateError.message}`);
    }

    return updated as ReadingProgress;
  }

  // Incoming is older — no-op, return existing
  return existing as ReadingProgress;
}

/**
 * Record a reading session.
 *
 * @param userId - User ID (from session claims)
 * @param bookId - Book UUID
 * @param startedAt - ISO timestamp when session began
 * @param endedAt - ISO timestamp when session ended
 * @param durationSeconds - Session duration in seconds
 *
 * ISD §10.I: Best-effort insert. Failures are logged but do not throw
 * (statistics are non-critical).
 */
export async function persistSession(
  userId: string,
  bookId: string,
  startedAt: string,
  endedAt: string,
  durationSeconds: number,
): Promise<void> {
  const supabase = await createClient();

  const sessionPayload: InsertTables<'reading_sessions'> = {
    user_id: userId,
    book_id: bookId,
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: durationSeconds,
  };
  const { error } = await supabase.from('reading_sessions').insert(sessionPayload as never);

  if (error) {
    // Log but don't throw (ISD §10.X: session insert failure is non-fatal)
    console.error('[persistSession] Failed to insert session:', error.message);
  }
}
