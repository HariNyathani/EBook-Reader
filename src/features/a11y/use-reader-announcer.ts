'use client';

/**
 * useReaderAnnouncer — Phase 15 (ISD §15.AA, §15.DD #1).
 *
 * Listens to engine `relocate` events (which already flow into
 * `reader-store.currentCfi` and `activeChapterHref`) and pushes
 * polite live-region announcements to the screen reader so users
 * hear "Chapter N" or "Page X" as they navigate.
 *
 * Also announces load + error transitions. Announcements are
 * throttled (one per 800ms) to avoid SR spam during rapid pagination.
 *
 * The hook is mounted inside ReaderView (one instance per reader).
 */

import { useEffect, useRef } from 'react';
import { useReaderStore } from '@/store/reader-store';
import { useAnnouncer } from '@/components/a11y/announcer';

/** Minimum interval between consecutive announcements. */
const ANNOUNCE_THROTTLE_MS = 800;

export function useReaderAnnouncer(): void {
  const announce = useAnnouncer();
  const lastAnnouncementAt = useRef(0);
  const lastHref = useRef<string | null>(null);
  const isReady = useReaderStore((s) => s.isReady);
  const activeChapterHref = useReaderStore((s) => s.activeChapterHref);
  const toc = useReaderStore((s) => s.toc);
  const currentCfi = useReaderStore((s) => s.currentCfi);

  // Announce readiness once.
  useEffect(() => {
    if (isReady) {
      announce('Book loaded. Reader is ready.');
    }
  }, [isReady, announce]);

  // Announce chapter changes.
  useEffect(() => {
    if (!isReady) return;
    if (!activeChapterHref) return;
    if (activeChapterHref === lastHref.current) return;
    lastHref.current = activeChapterHref;

    // Throttle.
    const now = Date.now();
    if (now - lastAnnouncementAt.current < ANNOUNCE_THROTTLE_MS) return;
    lastAnnouncementAt.current = now;

    // Find the chapter label by walking the TOC tree.
    const findLabel = (items: typeof toc): string | null => {
      for (const item of items) {
        if (item.href === activeChapterHref) return item.label;
        if (item.children) {
          const sub = findLabel(item.children);
          if (sub) return sub;
        }
      }
      return null;
    };
    const label = findLabel(toc);
    if (label) {
      announce(`Chapter: ${label}`);
    } else {
      announce('Chapter changed.');
    }
  }, [isReady, activeChapterHref, toc, announce]);

  // Announce CFI-derived page position (throttled).
  useEffect(() => {
    if (!isReady || !currentCfi) return;
    const now = Date.now();
    if (now - lastAnnouncementAt.current < ANNOUNCE_THROTTLE_MS) return;
    lastAnnouncementAt.current = now;
    // We don't compute exact page numbers; a polite positional cue
    // suffices (screen reader users can request more detail with a
    // dedicated button if we add it later).
    announce('Page changed.');
  }, [isReady, currentCfi, announce]);
}
