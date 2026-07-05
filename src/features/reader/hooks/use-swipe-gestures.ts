'use client';

/**
 * useSwipeGestures — mobile swipe handling (ISD §11.B, §11.G).
 *
 * Recognises horizontal swipes (left → next, right → prev). The hook:
 *   - Tracks the in-flight pointer on the supplied container ref.
 *   - On `pointerup`, if horizontal motion exceeds SWIPE_THRESHOLD_PX
 *     and vertical motion is < SWIPE_THRESHOLD_PX, fires the appropriate
 *     callback.
 *   - Calls `markAsHandled()` on the supplied `TapZonesApi` so the
 *     tap-zones hook does NOT also register a tap for this gesture.
 *   - Skips swipes while the user is dragging a text selection.
 *
 * Touch-only. Mouse pointer swipes are excluded (desktops use the
 * tap-zones or keyboard).
 */

import { useEffect, type RefObject } from 'react';
import { SWIPE_THRESHOLD_PX } from '../constants';
import type { TapZonesApi } from './use-tap-zones';

export interface UseSwipeGesturesOptions {
  containerRef: RefObject<HTMLElement | null>;
  next: () => void;
  prev: () => void;
  /** Provided by the tap-zones hook so this hook can claim the gesture. */
  tapZones: TapZonesApi;
}

export function useSwipeGestures({
  containerRef,
  next,
  prev,
  tapZones,
}: UseSwipeGesturesOptions): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let startX = 0;
    let startY = 0;
    let activePointerId: number | null = null;

    const onPointerDown = (e: PointerEvent) => {
      // Only consider touch-style pointers; mouse will be ignored.
      if (e.pointerType !== 'touch') return;
      if (e.button !== 0) return;
      activePointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (activePointerId !== e.pointerId) return;
      activePointerId = null;

      // If the user is mid-selection, don't swipe.
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) <= SWIPE_THRESHOLD_PX) return;
      if (Math.abs(dy) > SWIPE_THRESHOLD_PX) return;

      // It's a horizontal swipe — claim the gesture so the tap-zones
      // hook does not also fire a page turn.
      tapZones.markAsHandled();

      if (dx < 0) {
        next();
      } else {
        prev();
      }
    };

    const onPointerCancel = () => {
      activePointerId = null;
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerCancel);
    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [containerRef, next, prev, tapZones]);
}
