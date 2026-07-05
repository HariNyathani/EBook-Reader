'use client';

/**
 * Offline progress queue (ISD §10.I, Decision D).
 *
 * Uses idb-keyval to store the latest progress per book in IndexedDB.
 * Last-write-wins semantics: only the most recent position per book matters.
 *
 * On flush, dirty entries are synced via saveProgressAction.
 * On success, dirty flag is cleared. On failure, dirty flag is kept (retry later).
 *
 * ISD §10.D: Only the latest position per book matters. This is simpler and correct
 * vs. an append-only queue.
 */

import { get, set, keys, del } from 'idb-keyval';
import { saveProgressAction } from './actions';

/** IndexedDB key prefix for progress entries. */
const PROGRESS_KEY_PREFIX = 'progress:';

/**
 * Shape of a pending progress entry stored in IndexedDB.
 */
export interface PendingProgressEntry {
  bookId: string;
  cfi: string;
  percentage: number;
  updatedAt: string;
  /** True if this entry needs to be synced to the server. */
  dirty: boolean;
}

/**
 * Build the IndexedDB key for a book's progress entry.
 */
function progressKey(bookId: string): string {
  return `${PROGRESS_KEY_PREFIX}${bookId}`;
}

/**
 * Queue progress for offline persistence.
 *
 * Overwrites any existing entry for the same book (last-write-wins).
 * Marks the entry as dirty so it will be synced on the next flush.
 *
 * @param bookId - Book UUID
 * @param entry - Progress data (cfi, percentage, updatedAt)
 */
export async function queueProgress(
  bookId: string,
  entry: { cfi: string; percentage: number; updatedAt: string },
): Promise<void> {
  const pending: PendingProgressEntry = {
    bookId,
    cfi: entry.cfi,
    percentage: entry.percentage,
    updatedAt: entry.updatedAt,
    dirty: true,
  };

  try {
    await set(progressKey(bookId), pending);
  } catch (err) {
    console.error('[offline-queue] Failed to queue progress:', err);
  }
}

/**
 * Get all pending (dirty) progress entries.
 *
 * @returns Array of dirty entries that need to be synced
 */
export async function getPending(): Promise<PendingProgressEntry[]> {
  try {
    const allKeys = await keys();
    const progressKeys = allKeys.filter(
      (k) => typeof k === 'string' && k.startsWith(PROGRESS_KEY_PREFIX),
    );

    const entries: PendingProgressEntry[] = [];
    for (const key of progressKeys) {
      const entry = await get(key);
      if (entry && entry.dirty) {
        entries.push(entry as PendingProgressEntry);
      }
    }

    return entries;
  } catch (err) {
    console.error('[offline-queue] Failed to get pending entries:', err);
    return [];
  }
}

/**
 * Flush all pending (dirty) progress entries to the server.
 *
 * For each dirty entry:
 * - Calls saveProgressAction
 * - On success: clears the dirty flag
 * - On failure: keeps the dirty flag (will retry on next flush)
 *
 * ISD §10.D/G: Keep-dirty-on-failure ensures no position is lost.
 */
export async function flushPending(): Promise<void> {
  const pending = await getPending();
  if (pending.length === 0) return;

  for (const entry of pending) {
    try {
      const result = await saveProgressAction({
        bookId: entry.bookId,
        cfi: entry.cfi,
        percentage: entry.percentage,
        updatedAt: entry.updatedAt,
      });

      if (result.status === 'success') {
        // Clear dirty flag
        const clean: PendingProgressEntry = { ...entry, dirty: false };
        await set(progressKey(entry.bookId), clean);
      }
      // On failure, keep dirty flag (retry on next flush)
    } catch (err) {
      // Network error or other failure — keep dirty flag
      console.error('[offline-queue] Failed to flush entry:', err);
    }
  }
}

/**
 * Check if there are any pending (dirty) entries.
 */
export async function hasPending(): Promise<boolean> {
  const pending = await getPending();
  return pending.length > 0;
}

/**
 * Remove a progress entry from IndexedDB (e.g., when a book is finished).
 */
export async function removeProgress(bookId: string): Promise<void> {
  try {
    await del(progressKey(bookId));
  } catch (err) {
    console.error('[offline-queue] Failed to remove progress:', err);
  }
}
