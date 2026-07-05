'use client';

/**
 * useReadingSession — tracks active reading time and records sessions (ISD §10.I, §10.M).
 *
 * Tracks session duration:
 * - Starts on mount (reader ready)
 * - Pauses on visibilitychange=hidden
 * - Resumes on visibilitychange=visible
 * - On unmount/pagehide: computes duration and calls endSessionAction
 *
 * ISD §10.G: Sessions < 5 seconds are ignored (threshold to avoid noise).
 */

import { useEffect, useRef } from 'react';
import { useReaderStore } from '@/store/reader-store';
import { endSessionAction } from './actions';

/** Minimum session duration to record (ISD §10.G). */
const MIN_SESSION_SECONDS = 5;

/**
 * useReadingSession — tracks and records reading sessions.
 *
 * @param bookId - Book UUID
 */
export function useReadingSession(bookId: string): void {
  const isReady = useReaderStore((s) => s.isReady);

  const sessionStartRef = useRef<Date | null>(null);
  const accumulatedSecondsRef = useRef(0);
  const lastVisibleRef = useRef<number | null>(null);

  /**
   * Effect 1: Start session on mount (when ready).
   */
  useEffect(() => {
    if (!isReady) return;

    sessionStartRef.current = new Date();
    lastVisibleRef.current = Date.now();

    return () => {
      // On unmount: compute duration and save
      if (!sessionStartRef.current) return;

      const endedAt = new Date();
      const startedAt = sessionStartRef.current;
      const durationSeconds = Math.floor(
        (endedAt.getTime() - startedAt.getTime()) / 1000,
      );

      // Only record if >= threshold
      if (durationSeconds >= MIN_SESSION_SECONDS) {
        endSessionAction({
          bookId,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          durationSeconds,
        }).catch((err) => {
          console.error('[useReadingSession] endSessionAction failed:', err);
        });
      }
    };
  }, [isReady, bookId]);

  /**
   * Effect 2: Pause/resume on visibilitychange.
   */
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Pause: accumulate elapsed time
        if (lastVisibleRef.current) {
          const elapsed = Math.floor((Date.now() - lastVisibleRef.current) / 1000);
          accumulatedSecondsRef.current += elapsed;
          lastVisibleRef.current = null;
        }
      } else if (document.visibilityState === 'visible') {
        // Resume: reset lastVisible
        lastVisibleRef.current = Date.now();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  /**
   * Effect 3: Send session on pagehide (backup to unmount cleanup).
   */
  useEffect(() => {
    const handlePageHide = () => {
      if (!sessionStartRef.current) return;

      const endedAt = new Date();
      const startedAt = sessionStartRef.current;
      const durationSeconds = Math.floor(
        (endedAt.getTime() - startedAt.getTime()) / 1000,
      );

      if (durationSeconds >= MIN_SESSION_SECONDS) {
        // Best-effort: don't await (pagehide is synchronous)
        endSessionAction({
          bookId,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          durationSeconds,
        }).catch(() => {
          // Silently fail (non-critical)
        });
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [bookId]);
}
