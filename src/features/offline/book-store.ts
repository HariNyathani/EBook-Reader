'use client';

/**
 * Offline book store (ISD §13.G, §13.Y, §13.Z).
 *
 * IndexedDB-backed storage for user-downloaded EPUB bytes. This is the
 * **only** place where book bytes are ever persisted on the client, and
 * only because the user explicitly opted in by tapping "Download for
 * offline" (ISD §13.0.2 A: scoped, documented exception to the no-persist
 * invariant).
 *
 * Storage shape:
 *   key: `offline-book:{userId}:{bookId}`
 *   val: { blob, title, author, sizeBytes, downloadedAt, lastReadAt }
 *
 * Security/per-user namespacing:
 *   - All keys carry the userId. A second user on the same device can
 *     never read another user's downloads (the userId is part of the
 *     key, not just metadata).
 *   - `clearUser(userId)` purges all of that user's downloads; called
 *     on sign-out (via useSignOutCleanup).
 *   - No tokens, cookies, or session data are ever stored here.
 *
 * This module is pure data-layer. The download/read/remove flow with
 * progress + UI lives in `use-offline-book.ts`; the quota + LRU
 * eviction policy lives in `storage.ts`.
 */

import { get, set, del, keys } from 'idb-keyval';

/** IndexedDB key prefix for offline book entries. */
const OFFLINE_BOOK_PREFIX = 'offline-book:';

/**
 * Build the per-user, per-book IndexedDB key.
 *
 * Format: `offline-book:{userId}:{bookId}` — the userId is part of the
 * key itself, so a second user signed in on the same device cannot
 * accidentally read another user's downloads.
 */
export function offlineBookKey(userId: string, bookId: string): string {
  return `${OFFLINE_BOOK_PREFIX}${userId}:${bookId}`;
}

/**
 * Public metadata for an offline-downloaded book.
 * Returned to UI components and the LRU eviction policy.
 */
export interface OfflineBookMeta {
  bookId: string;
  title: string;
  author: string | null;
  sizeBytes: number;
  downloadedAt: string; // ISO timestamp
  lastReadAt: string; // ISO timestamp
}

/**
 * Full offline-book record stored in IndexedDB.
 * The Blob holds the raw EPUB bytes; the meta fields are present for
 * fast listing, eviction, and UI rendering without re-decoding the blob.
 */
export interface OfflineBookRecord extends OfflineBookMeta {
  blob: Blob;
}

/**
 * Store a downloaded EPUB blob in IndexedDB.
 *
 * @param userId - Current user's ID (from session claims, never client-trusted)
 * @param bookId - Book UUID
 * @param blob - The downloaded EPUB bytes
 * @param meta - Title/author for the catalog UI
 */
export async function storeOfflineBook(
  userId: string,
  bookId: string,
  blob: Blob,
  meta: { title: string; author: string | null; sizeBytes: number },
): Promise<OfflineBookRecord> {
  const now = new Date().toISOString();
  const record: OfflineBookRecord = {
    bookId,
    title: meta.title,
    author: meta.author,
    sizeBytes: meta.sizeBytes,
    downloadedAt: now,
    lastReadAt: now,
    blob,
  };
  await set(offlineBookKey(userId, bookId), record);
  return record;
}

/**
 * Retrieve a downloaded book blob (raw bytes) for offline reading.
 * Returns null if the book is not downloaded.
 */
export async function getOfflineBook(
  userId: string,
  bookId: string,
): Promise<OfflineBookRecord | null> {
  const value = await get(offlineBookKey(userId, bookId));
  if (!value) return null;
  return value as OfflineBookRecord;
}

/**
 * Update the lastReadAt timestamp — used by the LRU eviction policy.
 * Called whenever the user opens a book for reading.
 */
export async function touchOfflineBook(userId: string, bookId: string): Promise<void> {
  const existing = await getOfflineBook(userId, bookId);
  if (!existing) return;
  await set(offlineBookKey(userId, bookId), {
    ...existing,
    lastReadAt: new Date().toISOString(),
  });
}

/**
 * Remove a single offline book.
 * Idempotent: removing a non-existent book is a no-op.
 */
export async function removeOfflineBook(userId: string, bookId: string): Promise<void> {
  await del(offlineBookKey(userId, bookId));
}

/**
 * List all offline books for a user. Returns the metadata (no blob)
 * for fast UI rendering, plus the full record (with blob) for callers
 * that need to actually open a book. The blob-bearing listing is
 * O(n) in total bytes — use `listOfflineMeta` when only metadata is
 * needed (LRU eviction, "available offline" badges, etc.).
 */
export async function listOffline(userId: string): Promise<OfflineBookRecord[]> {
  const allKeys = await keys();
  const userPrefix = `${OFFLINE_BOOK_PREFIX}${userId}:`;
  const userKeys = allKeys.filter((k) => typeof k === 'string' && k.startsWith(userPrefix));

  const records: OfflineBookRecord[] = [];
  for (const key of userKeys) {
    const value = await get(key);
    if (value) records.push(value as OfflineBookRecord);
  }
  return records;
}

/**
 * List offline-book metadata for a user. Skips blob deserialization
 * (each blob is large; this is meant for the LRU/UI listing path).
 */
export async function listOfflineMeta(userId: string): Promise<OfflineBookMeta[]> {
  const records = await listOffline(userId);
  return records.map((r) => ({
    bookId: r.bookId,
    title: r.title,
    author: r.author,
    sizeBytes: r.sizeBytes,
    downloadedAt: r.downloadedAt,
    lastReadAt: r.lastReadAt,
  }));
}

/**
 * Remove ALL offline books for a user.
 *
 * Called by the sign-out cleanup hook (useSignOutCleanup) so that a
 * device shared between users cannot leak previously-downloaded book
 * bytes.
 *
 * NOTE: ISD §13.Z also requires purging offline content when a user
 * loses approval or is deleted ("purged on next authed load"). That
 * approval-loss trigger is NOT yet wired (deferred to Phase 15 security
 * hardening, which introduces the client-side approval signal). Until
 * then, a revoked user can still open books they downloaded while
 * approved. Tracked as a Phase-15 follow-up.
 *
 * @param userId - The user whose downloads should be purged
 * @returns Number of records removed
 */
export async function clearUser(userId: string): Promise<number> {
  const allKeys = await keys();
  const userPrefix = `${OFFLINE_BOOK_PREFIX}${userId}:`;
  const userKeys = allKeys.filter((k) => typeof k === 'string' && k.startsWith(userPrefix));
  for (const key of userKeys) {
    await del(key);
  }
  return userKeys.length;
}

/**
 * Total bytes used by the user's offline books.
 * Used by storage.ts to decide when LRU eviction is needed.
 */
export async function getUserStorageUsage(userId: string): Promise<number> {
  const records = await listOfflineMeta(userId);
  return records.reduce((acc, r) => acc + r.sizeBytes, 0);
}
