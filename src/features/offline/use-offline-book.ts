'use client';

/**
 * useOfflineBook — per-book offline download/read/remove with progress.
 *
 * Phase 13 (ISD §13.G, §13.N). Wraps the IndexedDB book store with:
 *   - download(book): streams GET /api/books/[id]/file, accumulates the
 *     blob, and persists it. Emits progress (0..1) via the offline store
 *     so the UI can render a spinner + percentage.
 *   - read(): returns a freshly-issued objectURL for the cached blob
 *     (caller must revoke), or null if the book isn't downloaded.
 *   - remove(): deletes the entry and clears the in-memory metadata.
 *   - isDownloaded: a stable boolean selector.
 *
 * Quota / LRU eviction: before writing, we estimate storage usage; if
 * the projected size would push us past 80% of the device's quota,
 * we evict least-recently-read books (never the current one). If the
 * browser still refuses the write, we surface a clean
 * StorageQuotaExceededError so the caller can prompt the user.
 *
 * The reader (Phase 9 fetch-book-blob) prefers the offline copy when
 * present; this hook is the source of truth for "is this downloaded".
 */

import { useCallback } from 'react';
import { ROUTES } from '@/lib/routes';
import {
  getOfflineBook,
  listOfflineMeta,
  removeOfflineBook,
  storeOfflineBook,
  touchOfflineBook,
  getUserStorageUsage,
  offlineBookKey,
  type OfflineBookMeta,
} from './book-store';
import {
  evictLru,
  getStorageInfo,
  StorageQuotaExceededError,
  sortByLeastRecentlyRead,
} from './storage';
import { useOfflineStore } from '@/store/offline-store';

/** Threshold (fraction of quota) above which we attempt eviction before download. */
const EVICTION_FRACTION = 0.8;

/** Identity check for a UUID-shaped bookId — used in the caller. */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export interface DownloadOptions {
  /** Book title for the metadata (required). */
  title: string;
  /** Book author (optional). */
  author: string | null;
  /** The book ID this download is for. Used to keep the currently-open book out of eviction. */
  bookId: string;
  /** User ID (from session claims, never client-trusted). */
  userId: string;
}

export interface UseOfflineBook {
  /** True if the book is currently downloaded. */
  isDownloaded: boolean;
  /** Cached metadata for this book, or null. */
  meta: OfflineBookMeta | null;
  /** Live download progress (0..1) for this book, or undefined. */
  progress: number | undefined;
  /** Download the book for offline reading. */
  download: (opts: DownloadOptions) => Promise<void>;
  /** Get a fresh objectURL for the cached blob. Caller must revoke. */
  read: (userId: string) => Promise<string | null>;
  /** Remove the downloaded copy. */
  remove: (userId: string) => Promise<void>;
  /** Mark the book as just-read (bumps lastReadAt for LRU). */
  touch: (userId: string) => Promise<void>;
}

/**
 * Per-book offline book controller. The hook reads from the offline
 * store with fine-grained selectors so the host component only
 * re-renders when *this book's* slice changes.
 */
export function useOfflineBook(bookId: string): UseOfflineBook {
  const meta = useOfflineStore((s) => s.offlineBooks[bookId] ?? null);
  const progress = useOfflineStore((s) => s.downloading[bookId]);
  const upsert = useOfflineStore((s) => s.upsertOfflineBook);
  const removeMeta = useOfflineStore((s) => s.removeOfflineBook);
  const setDownloadProgress = useOfflineStore((s) => s.setDownloadProgress);

  const isDownloaded = meta !== null;

  const download = useCallback(
    async ({ title, author, userId }: DownloadOptions) => {
      if (!isUuid(bookId)) {
        throw new Error(`[useOfflineBook] invalid bookId: ${bookId}`);
      }
      if (!userId) {
        throw new Error('[useOfflineBook] userId is required');
      }

      const url = ROUTES.READER(bookId).replace('/reader/', '/api/books/') + '/file';

      // 1. Pre-flight: estimate storage. If we're at >80% of quota, run LRU
      //    eviction on the user's existing offline books (skipping the one
      //    being downloaded so it never evicts itself).
      const info = await getStorageInfo();
      if (info && info.quota > 0 && info.fraction >= EVICTION_FRACTION) {
        const all = await listOfflineMeta(userId);
        const evictees = all.filter((b) => b.bookId !== bookId);
        const ordered = sortByLeastRecentlyRead(evictees);
        // Try to free up to 20% of the quota so the new download has headroom.
        const targetFree = info.quota * 0.2;
        await evictLru(userId, targetFree, ordered);
      }

      // 2. Stream the EPUB bytes. We use a fetch + reader pattern to get
      //    real-time progress; falls back to a full blob if streaming is
      //    not supported (very old browsers).
      setDownloadProgress(bookId, 0);
      let blob: Blob;
      try {
        const response = await fetch(url, { method: 'GET', credentials: 'include' });
        if (!response.ok) {
          // Map status codes to user-friendly errors.
          switch (response.status) {
            case 401:
              throw new Error('Please sign in to download this book.');
            case 403:
              throw new Error('You do not have access to this book.');
            case 404:
              throw new Error('Book not found.');
            default:
              throw new Error(`Download failed (${response.status})`);
          }
        }
        if (!response.body) {
          // No streaming — fall back to a single blob.
          blob = await response.blob();
          setDownloadProgress(bookId, 1);
        } else {
          const contentLength = Number(response.headers.get('Content-Length') ?? 0);
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let received = 0;
          // The reader's `done` flag terminates this loop.
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              received += value.byteLength;
              if (contentLength > 0) {
                setDownloadProgress(bookId, Math.min(0.99, received / contentLength));
              } else {
                // Unknown total — tick progress as bytes accumulate (capped).
                setDownloadProgress(bookId, Math.min(0.99, received / (10 * 1024 * 1024)));
              }
            }
          }
          blob = new Blob(chunks as BlobPart[], { type: 'application/epub+zip' });
          setDownloadProgress(bookId, 1);
        }
      } catch (err) {
        setDownloadProgress(bookId, null);
        throw err;
      }

      if (blob.size === 0) {
        setDownloadProgress(bookId, null);
        throw new Error('Downloaded file is empty or corrupt.');
      }

      // 3. Quota guard. The browser will throw QuotaExceededError if
      //    we're at the hard limit; we surface a typed error so the UI
      //    can show a clean message.
      try {
        const record = await storeOfflineBook(userId, bookId, blob, {
          title,
          author,
          sizeBytes: blob.size,
        });
        // Reflect the new metadata in the in-memory store so the UI
        // updates instantly (the offline-book-store entry is rebuilt on
        // next hydrate otherwise).
        upsert({
          bookId: record.bookId,
          title: record.title,
          author: record.author,
          sizeBytes: record.sizeBytes,
          downloadedAt: record.downloadedAt,
          lastReadAt: record.lastReadAt,
        });
        // Also refresh storage info so the UI shows the new usage.
        const post = await getStorageInfo();
        if (post) useOfflineStore.getState().setStorageInfo(post);
      } catch (err) {
        setDownloadProgress(bookId, null);
        const isQuota =
          err instanceof DOMException &&
          (err.name === 'QuotaExceededError' ||
            err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (err as any)?.code === 22);
        if (isQuota) {
          // Try one more aggressive LRU pass before giving up.
          const all = await listOfflineMeta(userId);
          const evictees = all.filter((b) => b.bookId !== bookId);
          const ordered = sortByLeastRecentlyRead(evictees);
          await evictLru(userId, Number.MAX_SAFE_INTEGER, ordered);
          try {
            const record = await storeOfflineBook(userId, bookId, blob, {
              title,
              author,
              sizeBytes: blob.size,
            });
            upsert({
              bookId: record.bookId,
              title: record.title,
              author: record.author,
              sizeBytes: record.sizeBytes,
              downloadedAt: record.downloadedAt,
              lastReadAt: record.lastReadAt,
            });
          } catch {
            throw new StorageQuotaExceededError(
              'Not enough storage to download this book. Free up space and try again.',
            );
          }
        } else {
          throw err;
        }
      } finally {
        setDownloadProgress(bookId, null);
      }
    },
    [bookId, setDownloadProgress, upsert],
  );

  const read = useCallback(
    async (userId: string): Promise<string | null> => {
      const record = await getOfflineBook(userId, bookId);
      if (!record) return null;
      // Issue a fresh objectURL — the caller (reader) is responsible for revoking.
      return URL.createObjectURL(record.blob);
    },
    [bookId],
  );

  const remove = useCallback(
    async (userId: string) => {
      await removeOfflineBook(userId, bookId);
      removeMeta(bookId);
    },
    [bookId, removeMeta],
  );

  const touch = useCallback(
    async (userId: string) => {
      await touchOfflineBook(userId, bookId);
      // Reflect the bumped lastReadAt in the in-memory mirror.
      const after = await getOfflineBook(userId, bookId);
      if (after) {
        upsert({
          bookId: after.bookId,
          title: after.title,
          author: after.author,
          sizeBytes: after.sizeBytes,
          downloadedAt: after.downloadedAt,
          lastReadAt: after.lastReadAt,
        });
      }
    },
    [bookId, upsert],
  );

  return { isDownloaded, meta, progress, download, read, remove, touch };
}

/**
 * Hydrate the in-memory offline-store from IndexedDB. Call once at
 * the (app) layout level so the library can show "Available offline"
 * badges and the reader knows whether to prefer the local copy.
 *
 * Pass the current userId so the hydration is per-user.
 */
export async function hydrateOfflineBooks(userId: string): Promise<void> {
  const list = await listOfflineMeta(userId);
  const map: Record<string, OfflineBookMeta> = {};
  for (const m of list) map[m.bookId] = m;
  useOfflineStore.getState().setOfflineBooks(map);
  const info = await getStorageInfo();
  if (info) useOfflineStore.getState().setStorageInfo(info);
  useOfflineStore.getState().markHydrated();
}

/**
 * Refresh the cached storage-info. Call after downloads/removals to
 * keep the in-memory snapshot in sync with the browser.
 */
export async function refreshStorageInfo(): Promise<void> {
  const info = await getStorageInfo();
  if (info) useOfflineStore.getState().setStorageInfo(info);
}

/**
 * Get the current total usage for the user. Re-exported helper for
 * tests + UI.
 */
export function getUserBytesUsed(userId: string): Promise<number> {
  return getUserStorageUsage(userId);
}

/** Exposed key helper for tests + the eviction policy. */
export { offlineBookKey };
