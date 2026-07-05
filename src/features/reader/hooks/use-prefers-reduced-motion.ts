'use client';

/**
 * usePrefersReducedMotion — reactive `prefers-reduced-motion` media query.
 *
 * ISD §11.B: All reader animations must respect this preference.
 * Returns `true` if the user prefers reduced motion.
 *
 * The hook is SSR-safe (returns false on the server, hydrates on the client).
 */

import { useEffect, useState } from 'react';

export function usePrefersReducedMotion(): boolean {
  // Default to false on the server; re-evaluate on mount.
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    // addEventListener is the modern API; addListener is the legacy fallback.
    if (mq.addEventListener) {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);

  return reduced;
}
