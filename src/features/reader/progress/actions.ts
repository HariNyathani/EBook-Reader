'use server';

/**
 * Progress Server Actions (ISD §10.I).
 *
 * saveProgressAction: Debounced progress save (called from useProgressSync).
 * endSessionAction: Reading session recording (called from useReadingSession).
 *
 * Both actions derive user_id from session claims (never trust client input).
 * Both require approval (requireApproved).
 */

import { requireApproved } from '@/features/auth/session';
import { ok, fail, type ActionResult } from '@/lib/result';
import { progressSchema, sessionSchema } from './schemas';
import { persistProgress, persistSession } from './persist-progress';
import { progressTag } from '@/features/library/cache';
import { revalidateTag } from 'next/cache';

/**
 * Save reading progress (Server Action).
 *
 * Called by useProgressSync (debounced 3s) when online.
 * Also called by the offline queue flush.
 *
 * @param input - Progress data (validated via progressSchema)
 * @returns ActionResult with storedAt timestamp
 *
 * ISD §10.F: Conditional upsert prevents stale overwrites (multi-device safety).
 */
export async function saveProgressAction(
  input: unknown,
): Promise<ActionResult<{ storedAt: string }>> {
  try {
    // Require approval
    const claims = await requireApproved();

    // Validate input
    const parsed = progressSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.errors.map((e) => e.message).join('; '), 'INVALID_INPUT');
    }

    const { bookId, cfi, percentage, updatedAt } = parsed.data;

    // Persist (conditional upsert)
    const stored = await persistProgress(claims.userId, bookId, cfi, percentage, updatedAt);

    // Revalidate progress cache (ISD §10.Y)
    revalidateTag(progressTag(claims.userId));

    return ok({ storedAt: stored.updated_at });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save progress';
    return fail(message, 'SAVE_PROGRESS_ERROR');
  }
}

/**
 * End a reading session (Server Action).
 *
 * Called by useReadingSession on unmount or pagehide.
 * Best-effort: failures are logged but do not throw (ISD §10.X).
 *
 * @param input - Session data (validated via sessionSchema)
 * @returns ActionResult (no data)
 */
export async function endSessionAction(input: unknown): Promise<ActionResult> {
  try {
    // Require approval
    const claims = await requireApproved();

    // Validate input
    const parsed = sessionSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.errors.map((e) => e.message).join('; '), 'INVALID_INPUT');
    }

    const { bookId, startedAt, endedAt, durationSeconds } = parsed.data;

    // Persist (best-effort)
    await persistSession(claims.userId, bookId, startedAt, endedAt, durationSeconds);

    return ok();
  } catch (err) {
    // Log but don't fail (ISD §10.X: session recording is non-critical)
    console.error('[endSessionAction] Error:', err);
    return ok(); // Return success even on error (non-fatal)
  }
}
