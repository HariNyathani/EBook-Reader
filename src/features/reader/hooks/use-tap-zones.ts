'use client';

/**
 * useTapZones — pointer/tap handling (ISD §11.B, §11.G).
 *
 * Divides the viewport into three horizontal zones:
 *   - left  third → prev()
 *   - right third → next()
 *   - center     → toggleChrome()
 *
 * Distinguishes a tap from a swipe (handled in use-swipe-gestures) and a
 * selection (so the user can drag-select text without page-turning).
 *
 * Implementation: listens to `pointerdown` / `pointerup` on the supplied
 * container. A tap is registered only if:
 *   - the duration is < TAP_MAX_MS,
 *   - the pointer moved < SWIPE_THRESHOLD_PX between down and up,
 *   - the gesture was not interpreted as a swipe (the swipe hook calls
 *     `markAsHandled()` to claim the gesture before this hook fires).
 *
 * The hook NEVER touches the engine DOM. It only invokes the supplied
 * callbacks and updates ui-store.
 */

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { SWIPE_THRESHOLD_PX, TAP_MAX_MS, TAP_ZONE_RATIO } from '../constants';

export interface TapZonesApi {
  /**
   * Mark the current pointer interaction as "handled by a swipe gesture"
   * so the subsequent pointerup does not register as a tap.
   */
  markAsHandled: () => void;
}

export interface UseTapZonesOptions {
  containerRef: RefObject<HTMLElement | null>;
  next: () => void;
  prev: () => void;
  toggleChrome: () => void;
}

export function useTapZones({
  containerRef,
  next,
  prev,
  toggleChrome,
}: UseTapZonesOptions): TapZonesApi {
  // State for the in-flight gesture.
  const gestureRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    pointerId: number;
    handled: boolean;
  } | null>(null);

  const markAsHandled = useCallback(() => {
    if (gestureRef.current) {
      gestureRef.current.handled = true;
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onPointerDown = (e: PointerEvent) => {
      // Ignore right-clicks and non-primary buttons.
      if (e.button !== 0) return;
      gestureRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startTime: Date.now(),
        pointerId: e.pointerId,
        handled: false,
      };
    };

    const onPointerUp = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g || g.pointerId !== e.pointerId) return;
      const handled = g.handled;
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      const distSq = dx * dx + dy * dy;
      const duration = Date.now() - g.startTime;
      gestureRef.current = null;

      // If a swipe handler claimed this gesture, or the pointer moved too
      // much (selection in progress), don't fire a tap.
      if (handled) return;
      if (distSq > SWIPE_THRESHOLD_PX * SWIPE_THRESHOLD_PX) return;
      if (duration > TAP_MAX_MS) return;

      // If the user's selection covered the tap point, don't fire a tap.
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) return;

      // Determine which zone was tapped.
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      const leftThreshold = width * TAP_ZONE_RATIO;
      const rightThreshold = width * (1 - TAP_ZONE_RATIO);

      if (x < leftThreshold) {
        prev();
      } else if (x > rightThreshold) {
        next();
      } else {
        toggleChrome();
      }
    };

    // Cancel the gesture if the pointer leaves the container.
    const onPointerCancel = () => {
      gestureRef.current = null;
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerCancel);
    container.addEventListener('pointerleave', onPointerCancel);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerCancel);
      container.removeEventListener('pointerleave', onPointerCancel);
    };
  }, [containerRef, next, prev, toggleChrome]);

  return { markAsHandled };
}
