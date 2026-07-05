'use client';

/**
 * Live-region announcer — Phase 15 (ISD §15.AA, §15.M, §15.DD #1).
 *
 * A polite ARIA live region that allows components to push short
 * status messages to screen-reader users without shifting the
 * visual layout. Used by the reader to announce page/chapter
 * changes, search results, and load/error states.
 *
 * The component is mounted once (in the root layout) and is exposed
 * via a global `window.__announce__` function as well as the
 * `useAnnouncer` hook. The announcer uses a SINGLE shared region
 * (multiple stacked regions can cause SRs to read in the wrong
 * order).
 *
 * The component also subscribes to a custom event (`a11y:announce`)
 * so non-React code (engine event handlers, etc.) can fire
 * announcements without holding a reference to the hook.
 *
 * Politeness level: 'polite' by default. Pass 'assertive' to
 * interrupt the current SR speech for urgent messages (errors).
 */

import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';

export type AnnouncerPoliteness = 'polite' | 'assertive';

interface AnnouncerState {
  message: string;
  politeness: AnnouncerPoliteness;
  /** Monotonic counter so identical messages still re-announce. */
  nonce: number;
  setMessage: (message: string, politeness?: AnnouncerPoliteness) => void;
  clear: (politeness?: AnnouncerPoliteness) => void;
}

/**
 * Internal zustand store. The same store is read by the live-region
 * component (which renders) and the `useAnnouncer` hook (which writes).
 */
export const useAnnouncerStore = create<AnnouncerState>((set) => ({
  message: '',
  politeness: 'polite',
  nonce: 0,
  setMessage: (message, politeness = 'polite') =>
    set((s) => ({ message, politeness, nonce: s.nonce + 1 })),
  clear: (politeness = 'polite') => set({ message: '', politeness }),
}));

/**
 * Hook for components to push announcements.
 *
 * @returns A function that, when called with a message, triggers the
 *          shared live region. Returns a stable function across renders.
 */
export function useAnnouncer(): (message: string, politeness?: AnnouncerPoliteness) => void {
  const setMessage = useAnnouncerStore((s) => s.setMessage);
  // We build the callback on first call and return the SAME function
  // thereafter. This avoids useRef's "no overload" issue with React 19
  // and gives a stable identity for downstream effects.
  const memoised = useMemo(
    () => (message: string, politeness?: AnnouncerPoliteness) => setMessage(message, politeness),
    [setMessage],
  );
  return memoised;
}

/**
 * The live-region component. Mount once at the top of the app
 * (e.g. the root layout). The element is visually hidden but
 * present in the accessibility tree.
 */
export function LiveAnnouncer() {
  const message = useAnnouncerStore((s) => s.message);
  const politeness = useAnnouncerStore((s) => s.politeness);
  // Hold the LAST announced message in a separate state so the
  // aria-live re-announces the same text after a tick (some screen
  // readers do not re-announce identical text otherwise).
  const [rendered, setRendered] = useState('');
  const nonce = useAnnouncerStore((s) => s.nonce);

  useEffect(() => {
    // Clear-then-set with a microtask gap so SRs that detect changes
    // by DOM mutations fire the new announcement.
    setRendered('');
    const t = setTimeout(() => setRendered(message), 50);
    return () => clearTimeout(t);
  }, [nonce, message]);

  // Install a global window hook for non-React code.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__announce__ = (msg: string, politeness?: AnnouncerPoliteness) => {
      useAnnouncerStore.getState().setMessage(msg, politeness);
    };
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail ?? {};
      useAnnouncerStore
        .getState()
        .setMessage(
          typeof detail === 'string' ? detail : String(detail.message ?? ''),
          detail.politeness,
        );
    };
    window.addEventListener('a11y:announce', handler as EventListener);
    return () => {
      window.removeEventListener('a11y:announce', handler as EventListener);
    };
  }, []);

  return (
    <div role="status" aria-live={politeness} aria-atomic="true" data-announcer className="sr-only">
      {rendered}
    </div>
  );
}

/** Fire-and-forget global announce for non-React code. */
export function announce(message: string, politeness: AnnouncerPoliteness = 'polite'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('a11y:announce', { detail: { message, politeness } }));
}
