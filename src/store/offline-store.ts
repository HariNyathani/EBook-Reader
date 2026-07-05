'use client';

/**
 * Offline store (ISD §13.O, §13.W).
 *
 * Transient, in-memory mirror of the offline book store (IndexedDB).
 * Holds:
 *   - isOnline: navigator.onLine + 'online'/'offline' event tracking
 *   - offlineBooks: bookId → OfflineMeta map (rebuilt from IDB on hydrate)
 *   - storageInfo: navigator.storage.estimate() result
 *
 * This store is NOT persisted (rebuilt from IndexedDB on load). It
 * exists to drive UI without forcing every component to await
 * listOffline() — the IDB query is O(n) on the first read and then
 * the result lives in memory.
 *
 * The actual bytes (Blobs) are NOT kept in this store — they live
 * only in IndexedDB and are pulled on demand by the reader.
 */

import { create } from 'zustand';
import type { StorageInfo } from '@/features/offline/storage';
import type { OfflineBookMeta } from '@/features/offline/book-store';

interface OfflineState {
  /** True when the browser reports online + we have a positive online event. */
  isOnline: boolean;
  /** Per-book metadata for the books this user has downloaded for offline. */
  offlineBooks: Record<string, OfflineBookMeta>;
  /** Book IDs currently being downloaded (for UI progress spinners). */
  downloading: Record<string, number>;
  /** Snapshot of the storage state, refreshed on hydrate + on demand. */
  storageInfo: StorageInfo | null;
  /** True after the initial IDB hydration completes. */
  hasHydrated: boolean;
}

interface OfflineActions {
  setOnline: (online: boolean) => void;
  setStorageInfo: (info: StorageInfo | null) => void;
  setOfflineBooks: (books: Record<string, OfflineBookMeta>) => void;
  upsertOfflineBook: (book: OfflineBookMeta) => void;
  removeOfflineBook: (bookId: string) => void;
  setDownloadProgress: (bookId: string, loaded: number | null) => void;
  reset: () => void;
  markHydrated: () => void;
}

const DEFAULT_STATE: OfflineState = {
  isOnline: true,
  offlineBooks: {},
  downloading: {},
  storageInfo: null,
  hasHydrated: false,
};

export const useOfflineStore = create<OfflineState & OfflineActions>()((set) => ({
  ...DEFAULT_STATE,

  setOnline: (isOnline) => set({ isOnline }),
  setStorageInfo: (storageInfo) => set({ storageInfo }),
  setOfflineBooks: (offlineBooks) => set({ offlineBooks }),
  upsertOfflineBook: (book) =>
    set((s) => ({
      offlineBooks: { ...s.offlineBooks, [book.bookId]: book },
    })),
  removeOfflineBook: (bookId) =>
    set((s) => {
      const next = { ...s.offlineBooks };
      delete next[bookId];
      return { offlineBooks: next };
    }),
  setDownloadProgress: (bookId, loaded) =>
    set((s) => {
      const next = { ...s.downloading };
      if (loaded === null) {
        delete next[bookId];
      } else {
        next[bookId] = loaded;
      }
      return { downloading: next };
    }),
  markHydrated: () => set({ hasHydrated: true }),
  reset: () => set(DEFAULT_STATE),
}));

// Selector helpers — prefer these to avoid whole-store subscriptions.
export const selectIsOnline = (s: OfflineState) => s.isOnline;
export const selectOfflineBookIds = (s: OfflineState): string[] => Object.keys(s.offlineBooks);
export const selectIsDownloaded =
  (bookId: string) =>
  (s: OfflineState): boolean =>
    Boolean(s.offlineBooks[bookId]);
export const selectDownloadProgress =
  (bookId: string) =>
  (s: OfflineState): number | undefined =>
    s.downloading[bookId];
export const selectStorageInfo = (s: OfflineState) => s.storageInfo;
