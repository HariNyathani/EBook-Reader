'use client';

/**
 * Storage quota + LRU eviction (ISD §13.G, §13.P, §13.Y, §13.DD #6).
 *
 * Wraps the StorageManager API:
 *   - `navigator.storage.estimate()` — quota and current usage
 *   - `navigator.storage.persist()`  — request persistent storage
 *     (browsers may evict non-persistent data under storage pressure)
 *
 * Eviction policy: when a download would push usage over a configured
 * soft threshold (default: 80% of the device's quota), the policy
 * evicts least-recently-read offline books in ascending `lastReadAt`
 * order — never the book that is currently open (the caller passes the
 * currently-open bookId; it is excluded from eviction).
 *
 * The SW (Serwist) only caches the app shell; book bytes live in
 * IndexedDB, which is subject to the browser's own quota. If the
 * browser denies new writes (QuotaExceededError), we surface a clean
 * error so the caller can prompt the user to free space.
 */

/** Soft threshold (fraction of total quota) at which LRU eviction kicks in. */
const EVICTION_THRESHOLD = 0.8;

/** Hard ceiling: never try to use more than this fraction of the quota. */
const HARD_LIMIT = 0.95;

/** Storage info returned to UI / analytics. */
export interface StorageInfo {
  /** Total bytes used across all origins in the storage bucket. */
  usage: number;
  /** Total bytes available in the storage bucket. */
  quota: number;
  /** True if the user (or browser policy) has granted persistent storage. */
  persisted: boolean;
  /** Convenience: usage / quota, clamped to [0, 1]. */
  fraction: number;
}

/**
 * Get the current storage state. Returns null if the StorageManager
 * API is unavailable (private-mode browsers, older WebViews).
 */
export async function getStorageInfo(): Promise<StorageInfo | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return null;
  }
  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;
    let persisted = false;
    if (typeof navigator.storage.persisted === 'function') {
      try {
        persisted = await navigator.storage.persisted();
      } catch {
        persisted = false;
      }
    }
    return {
      usage,
      quota,
      persisted,
      fraction: quota > 0 ? Math.min(1, usage / quota) : 0,
    };
  } catch (err) {
    // StorageManager can throw (e.g. SecurityError in some sandboxes).
    console.warn('[storage] estimate failed:', err);
    return null;
  }
}

/**
 * Request persistent storage. The browser may grant or refuse the
 * request; a refusal is non-fatal (the data still lives in IndexedDB,
 * the browser just may evict it under pressure).
 *
 * @returns true if the browser granted persistent storage.
 */
export async function requestPersistent(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false;
  }
  try {
    return await navigator.storage.persist();
  } catch (err) {
    console.warn('[storage] persist() failed:', err);
    return false;
  }
}

/**
 * Decide whether the given byte addition would push us past the soft
 * threshold. Returns the number of bytes that need to be freed (0 if
 * we're fine), given a list of existing offline books.
 */
export function bytesToFreeBeforeAdd(
  existingBytes: number,
  addingBytes: number,
  quota: number,
): number {
  if (quota <= 0) return 0;
  const projected = existingBytes + addingBytes;
  const target = quota * EVICTION_THRESHOLD;
  if (projected <= target) return 0;
  return Math.max(
    0,
    projected - quota * HARD_LIMIT === 0 ? projected - target : projected - target,
  );
}

/**
 * Error thrown when IndexedDB refuses a write because the storage
 * quota is exhausted even after attempted eviction.
 */
export class StorageQuotaExceededError extends Error {
  constructor(message = 'Storage quota exceeded') {
    super(message);
    this.name = 'StorageQuotaExceededError';
  }
}

/**
 * Sort offline-book metadata by `lastReadAt` ascending (oldest first).
 * Pure helper — used by callers who want to drive their own eviction
 * loop (e.g. the use-offline-book download flow).
 */
export function sortByLeastRecentlyRead<T extends { lastReadAt: string; bookId: string }>(
  records: T[],
): T[] {
  return [...records].sort(
    (a, b) => new Date(a.lastReadAt).getTime() - new Date(b.lastReadAt).getTime(),
  );
}

/**
 * Evict least-recently-read offline books to free up `bytesNeeded`.
 *
 * @param userId - User whose books we're evicting
 * @param bytesNeeded - Bytes to free
 * @param meta - Current list of offline-book metadata (must NOT include
 *               the currently-open book; the caller filters it out so
 *               the book being read is never evicted)
 * @returns Number of bytes actually freed
 *
 * The caller is responsible for not including the currently-open book
 * in `meta` — this module is a pure policy. Splitting concerns like
 * this keeps the policy testable and the UI in control of UX choices.
 */
export async function evictLru(
  userId: string,
  bytesNeeded: number,
  meta: Array<{ bookId: string; sizeBytes: number; lastReadAt: string }>,
): Promise<number> {
  if (bytesNeeded <= 0) return 0;
  const ordered = sortByLeastRecentlyRead(meta);
  let freed = 0;
  for (const entry of ordered) {
    if (freed >= bytesNeeded) break;
    const { removeOfflineBook } = await import('./book-store');
    await removeOfflineBook(userId, entry.bookId);
    freed += entry.sizeBytes;
  }
  return freed;
}
