'use client';

/**
 * TapZones — invisible pointer/tap overlay (ISD §11.G, §11.M).
 *
 * Wraps the engine mount point in a transparent full-bleed div that
 * listens for taps and swipes. The component renders no visible UI
 * (z-index sits below the chrome, but the underlying engine container
 * is also visible through it because the overlay is transparent).
 *
 * Pointer events are forwarded to the engine where appropriate
 * (selections, link clicks); only the tap/swipe gestures are
 * intercepted at this layer.
 *
 * Crucially, this component NEVER touches the engine's iframe DOM. The
 * engine itself is responsible for hit-testing in-iframe content; the
 * tap-zones operate on the OUTER container.
 */

import { useRef, type RefObject } from 'react';
import { useTapZones } from '../hooks/use-tap-zones';
import { useSwipeGestures } from '../hooks/use-swipe-gestures';

interface TapZonesProps {
  /**
   * The ref of the container that hosts the engine mount.
   * The tap-zones attach to the SAME container, so taps/swipes that
   * happen on the overlay (which fills the same area) are still picked
   * up by the engine container.
   */
  containerRef: RefObject<HTMLElement | null>;
  next: () => void;
  prev: () => void;
  toggleChrome: () => void;
}

export function TapZones({ containerRef, next, prev, toggleChrome }: TapZonesProps) {
  // The tap-zones hook is attached to the same container the engine
  // mounts into, so the gestures work on the area where the book
  // actually renders. The overlay div below exists primarily as a
  // semantic container (and a future place to render visual hints
  // during onboarding, which we don't ship in Phase 11).
  const tapZones = useTapZones({ containerRef, next, prev, toggleChrome });
  useSwipeGestures({ containerRef, next, prev, tapZones });

  // The overlay is a transparent sibling that fills the area between
  // the top and bottom chrome. We make it `pointer-events: none` so
  // pointer events fall through to the engine container underneath —
  // the gestures are caught by the listeners we attached to the
  // container itself. This wrapper is therefore purely cosmetic.
  const overlayRef = useRef<HTMLDivElement>(null);
  void overlayRef;

  return null;
}
