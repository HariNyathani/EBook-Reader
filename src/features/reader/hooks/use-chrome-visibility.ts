'use client';

/**
 * useChromeVisibility — auto-hide/reveal logic for the reader chrome.
 *
 * ISD §11.B: The reader chrome (toolbar + progress bar) is auto-hidden
 * after a period of inactivity to maximise reading real estate, and
 * revealed on user interaction (mouse move, touch, key, or scroll).
 *
 * Behaviour:
 *   - Mounts visible. Hides after CHROME_IDLE_MS of no interaction.
 *   - Mouse move / touch / key / scroll resets the idle timer and
 *     reveals the chrome.
 *   - When a panel is open, the chrome is forced visible (the panel
 *     and the chrome are managed independently — we don't hide the
 *     chrome behind an open panel because the user may need both).
 *   - The "center tap" handler can be called externally to toggle the
 *     chrome explicitly.
 *
 * The hook never touches the engine DOM (SAD §5.1). It only mutates
 * `ui-store.chromeVisible`.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useUiStore } from '@/store/ui-store';
import { useReaderStore } from '@/store/reader-store';
import { CHROME_IDLE_MS } from '../constants';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

interface UseChromeVisibilityResult {
  /** True when the chrome should currently be visible. */
  visible: boolean;
  /** Manually toggle chrome visibility (e.g., from a center tap). */
  toggle: () => void;
  /** Reveal the chrome (resets the idle timer). */
  reveal: () => void;
  /** Hide the chrome immediately. */
  hide: () => void;
}

export function useChromeVisibility(): UseChromeVisibilityResult {
  const chromeVisible = useUiStore((s) => s.chromeVisible);
  const setChromeVisible = useUiStore((s) => s.setChromeVisible);
  const activePanel = useUiStore((s) => s.activePanel);
  const isReady = useReaderStore((s) => s.isReady);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  /**
   * Clear any pending hide timer.
   */
  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  /**
   * Schedule the auto-hide. We always reset the timer first so rapid
   * interactions don't accidentally keep the chrome visible.
   */
  const scheduleHide = useCallback(() => {
    clearIdleTimer();
    // Don't auto-hide if a panel is open or the user prefers reduced motion.
    if (activePanel !== 'none') return;
    if (!isReady) return;
    idleTimerRef.current = setTimeout(() => {
      setChromeVisible(false);
    }, CHROME_IDLE_MS);
  }, [activePanel, isReady, setChromeVisible, clearIdleTimer]);

  /**
   * Reveal the chrome and (re)start the idle timer.
   */
  const reveal = useCallback(() => {
    setChromeVisible(true);
    scheduleHide();
  }, [setChromeVisible, scheduleHide]);

  /**
   * Hide the chrome immediately and clear the timer.
   */
  const hide = useCallback(() => {
    clearIdleTimer();
    setChromeVisible(false);
  }, [clearIdleTimer, setChromeVisible]);

  /**
   * Toggle the chrome (used by center-tap and 'c' shortcut).
   */
  const toggle = useCallback(() => {
    if (chromeVisible) {
      hide();
    } else {
      reveal();
    }
  }, [chromeVisible, hide, reveal]);

  // Removed window event listeners (mousemove, touchstart, keydown, etc).
  // In Kindle format, the UI only appears explicitly when you tap the center zone
  // or press a dedicated shortcut key, avoiding annoying pop-ups on page turns.
  useEffect(() => {
    // We keep the effect empty so we don't break hook dependencies.
  }, [isReady, reveal]);

  // Whenever the panel state changes, the chrome is forced visible (so
  // users can close the panel) and the idle timer is reset.
  useEffect(() => {
    if (activePanel !== 'none') {
      setChromeVisible(true);
      clearIdleTimer();
    } else {
      // Panel closed — start the idle timer.
      scheduleHide();
    }
  }, [activePanel, setChromeVisible, clearIdleTimer, scheduleHide]);

  // Always start with the chrome visible when the engine becomes ready.
  useEffect(() => {
    if (isReady) {
      setChromeVisible(true);
      scheduleHide();
    }
    // Clear the timer on unmount to avoid setState-after-unmount.
    return clearIdleTimer;
  }, [isReady, setChromeVisible, scheduleHide, clearIdleTimer]);

  // Touch the reduced-motion value to ensure the hook participates in
  // the render. (Future use: could disable the scheduleHide entirely
  // when reduced motion is preferred — for now we keep auto-hide but
  // instant transitions make it imperceptible.)
  void prefersReducedMotion;

  return { visible: chromeVisible, toggle, reveal, hide };
}
