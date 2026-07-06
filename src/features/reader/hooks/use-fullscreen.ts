'use client';

/**
 * useFullscreen — native browser Fullscreen API wrapper (V1.1).
 *
 * Wraps `Element.requestFullscreen()` / `document.exitFullscreen()` for a
 * given target element and mirrors the browser's actual fullscreen state
 * into React via the `fullscreenchange` event. This is the only reliable
 * way to stay in sync when the user exits fullscreen natively (Esc key,
 * browser UI) rather than through our own toggle button.
 */

import { useCallback, useEffect, useState, type RefObject } from 'react';

interface UseFullscreenResult {
  /** True when `targetRef`'s element is the current fullscreen element. */
  isFullscreen: boolean;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
  toggleFullscreen: () => void;
}

export function useFullscreen(targetRef: RefObject<HTMLElement | null>): UseFullscreenResult {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === targetRef.current);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [targetRef]);

  const enterFullscreen = useCallback(() => {
    const el = targetRef.current;
    if (!el || document.fullscreenElement) return;
    el.requestFullscreen().catch(() => {
      // Rejected (e.g. permission denied, feature disabled) — state stays
      // in sync via fullscreenchange, so nothing else to do here.
    });
  }, [targetRef]);

  const exitFullscreen = useCallback(() => {
    if (!document.fullscreenElement) return;
    document.exitFullscreen().catch(() => {});
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }, [enterFullscreen, exitFullscreen]);

  return { isFullscreen, enterFullscreen, exitFullscreen, toggleFullscreen };
}
