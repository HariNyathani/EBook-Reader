'use client';

/**
 * useProgressSync — debounced progress sync hook (ISD §10.I, §10.M).
 *
 * Subscribes to reader-store currentCfi/fraction, debounces 3s, then:
 * - If online: saveProgressAction (Server Action)
 * - If offline: queueProgress (IndexedDB)
 * - On pagehide/visibilitychange: navigator.sendBeacon (guaranteed last save)
 * - On mount: flushPending (sync any offline queue)
 *
 * ISD §10.Y: 3-second debounce coalesces frequent relocate events.
 * ISD §10.E: Beacon sends on hide/close for guaranteed last-position save.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useReaderStore } from '@/store/reader-store';
import { saveProgressAction } from './actions';
import { queueProgress, flushPending } from './offline-queue';

/** Debounce interval (ISD §10.L). */
const PROGRESS_DEBOUNCE_MS = 3000;

/**
 * useProgressSync — syncs reading progress with debouncing + offline queue + beacon.
 *
 * @param bookId - Book UUID
 */
export function useProgressSync(bookId: string): void {
  const currentCfi = useReaderStore((s) => s.currentCfi);
  const fraction = useReaderStore((s) => s.fraction);
  const isReady = useReaderStore((s) => s.isReady);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestRef = useRef<{ cfi: string; fraction: number } | null>(null);

  /**
   * Save progress (debounced).
   */
  const saveProgress = useCallback(
    (cfi: string, percentage: number) => {
      const updatedAt = new Date().toISOString();
      const input = { bookId, cfi, percentage, updatedAt };

      if (navigator.onLine) {
        // Online: use Server Action
        saveProgressAction(input).catch((err) => {
          console.error('[useProgressSync] saveProgressAction failed:', err);
          // On failure, queue for offline sync
          queueProgress(bookId, { cfi, percentage, updatedAt });
        });
      } else {
        // Offline: queue for later sync
        queueProgress(bookId, { cfi, percentage, updatedAt });
      }
    },
    [bookId],
  );

  /**
   * Effect 1: Subscribe to currentCfi/fraction changes → debounce → save.
   */
  useEffect(() => {
    if (!isReady || !currentCfi) return;

    // Update latest ref (for beacon)
    latestRef.current = { cfi: currentCfi, fraction };

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer
    debounceTimerRef.current = setTimeout(() => {
      const percentage = Math.round(fraction * 100);
      saveProgress(currentCfi, percentage);
    }, PROGRESS_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [currentCfi, fraction, isReady, saveProgress]);

  /**
   * Effect 2: Flush offline queue on mount + online event.
   */
  useEffect(() => {
    // Flush on mount
    flushPending();

    // Flush on online event
    const handleOnline = () => {
      flushPending();
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  /**
   * Effect 3: Send beacon on pagehide/visibilitychange (guaranteed last save).
   */
  useEffect(() => {
    const sendBeacon = () => {
      if (!latestRef.current) return;

      const { cfi, fraction } = latestRef.current;
      const percentage = Math.round(fraction * 100);
      const updatedAt = new Date().toISOString();

      const payload = { bookId, cfi, percentage, updatedAt };
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });

      // ISD §10.E: sendBeacon for guaranteed last-position save
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/progress', blob);
      }

      // Also queue as backup (in case beacon fails)
      queueProgress(bookId, { cfi, percentage, updatedAt });
    };

    // Send beacon on pagehide (tab close, browser close)
    window.addEventListener('pagehide', sendBeacon);

    // Send beacon on visibilitychange (tab hidden)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        sendBeacon();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('pagehide', sendBeacon);
      document.removeEventListener('visibilitychange', handleVisibility);
      // SPA navigation away unmounts the reader WITHOUT firing pagehide,
      // and Effect 1's cleanup clears any pending debounce — so without
      // this flush the last ≤3s of reading position would be lost when
      // returning to the library. sendBeacon is a no-op until the first
      // relocate (latestRef is null), so StrictMode's throwaway
      // mount/unmount cycle sends nothing.
      sendBeacon();
    };
  }, [bookId]);

  /**
   * Effect 4: Listen for SW FLUSH_PROGRESS_QUEUE message → flush queue.
   */
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'FLUSH_PROGRESS_QUEUE') {
        flushPending();
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, []);
}
