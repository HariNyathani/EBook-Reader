'use client';

/**
 * useNetworkStatus — online/offline detection (ISD §13.G, §13.N).
 *
 * Listens to:
 *   - `window.online` / `window.offline` events
 *   - `navigator.onLine` (initial value)
 *
 * On recovery (offline → online), triggers a flush of the Phase-10
 * offline progress queue so positions captured while offline are
 * pushed to the server as soon as connectivity returns.
 *
 * Returns the current `isOnline` boolean. Components subscribe to
 * the slice via `useOfflineStore(selectIsOnline)` for fine-grained
 * reactivity (no re-renders on unrelated state changes).
 */

import { useEffect } from 'react';
import { useOfflineStore } from '@/store/offline-store';
import { flushPending } from '@/features/reader/progress/offline-queue';

/**
 * Mount this hook once at the app level (e.g. from the (app) layout
 * via <OfflineIndicator/>) so the network listener is active for the
 * whole authenticated session.
 */
export function useNetworkStatus(): { isOnline: boolean } {
  const isOnline = useOfflineStore((s) => s.isOnline);
  const setOnline = useOfflineStore((s) => s.setOnline);

  useEffect(() => {
    // Initial value from the browser.
    if (typeof navigator !== 'undefined') {
      setOnline(navigator.onLine);
    }

    const handleOnline = () => {
      setOnline(true);
      // Phase 10 (ISD §10.I): flush the offline progress queue as soon
      // as we're back online. This is the primary recovery path; the
      // SW Background Sync event (if registered) will also fire on its
      // own — both call into the same flushPending() function and are
      // safe to run together (the queue marks entries clean on success).
      void flushPending();
    };

    const handleOffline = () => {
      setOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline]);

  return { isOnline };
}
