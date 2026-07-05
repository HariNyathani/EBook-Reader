'use client';

/**
 * useReaderEngine — the sole React↔engine bridge (SAD §5.1).
 *
 * ISD §9.F: This hook instantiates the ReaderEngine, subscribes to events,
 * pushes them to reader-store, and sends commands from UI to the engine.
 * No other component may talk to the engine directly.
 *
 * Lifecycle:
 * 1. On mount (containerRef ready): createReaderEngine, fetchBookBlob, engine.open(objectURL)
 * 2. Subscribe to engine events → map to reader-store (setIsReady, setCurrentCfi, etc.)
 * 3. Subscribe to reader-store typography/theme slice → engine.setStyles on change
 * 4. On unmount: unsubscribe, engine.destroy(), revokeObjectURL
 *
 * The hook returns imperative controls (next, prev, goTo, search) for UI components.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import { createReaderEngine } from '../engine';
import type { BookFormat, ReaderEngine, ReaderEngineEvent, TocItem } from '../engine/types';
import { fetchBookBlob } from '../lib/fetch-book-blob';
import { mapStateToStyle } from '../lib/styles-mapper';
import { useReaderStore } from '@/store/reader-store';

/**
 * Props for useReaderEngine.
 */
interface UseReaderEngineProps {
  /** Ref to the container HTMLElement where the engine will mount. */
  containerRef: RefObject<HTMLElement | null>;
  /** The book UUID to load. */
  bookId: string;
  /** Current user id (server-derived from session claims). Used by
   *  the offline-book fallback in fetchBookBlob. Optional for safety;
   *  when null, the reader always goes to the network. */
  userId?: string | null;
  /** The book format (only 'epub' in Phase 9). */
  format: BookFormat;
  /** Optional initial CFI for resume reading (Phase 10). */
  initialCfi?: string;
}

/**
 * Return value of useReaderEngine — imperative controls for UI components.
 */
interface ReaderControls {
  /** Navigate to the next page/spread. */
  next: () => void;
  /** Navigate to the previous page/spread. */
  prev: () => void;
  /** Navigate to a target (CFI or href). */
  goTo: (target: string) => Promise<void>;
  /** Search the book (consumed in Phase 11). */
  search: (query: string) => AsyncIterable<import('../engine/types').SearchResult>;
  /** The table of contents (populated after 'ready' event). */
  toc: TocItem[];
  /** Error that occurred during load, if any. */
  error: Error | null;
  /** True while the book is loading. */
  loading: boolean;
}

/**
 * useReaderEngine — instantiates the engine, bridges events ↔ store, returns controls.
 *
 * This is the ONLY hook that may interact with the engine. UI components call this
 * and use the returned controls.
 */
export function useReaderEngine({
  containerRef,
  bookId,
  userId,
  format,
  initialCfi,
}: UseReaderEngineProps): ReaderControls {
  const engineRef = useRef<ReaderEngine | null>(null);
  const revokeRef = useRef<(() => void) | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [toc, setToc] = useState<TocItem[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  // Access reader-store setters and state
  const setIsReady = useReaderStore((s) => s.setIsReady);
  const setCurrentCfi = useReaderStore((s) => s.setCurrentCfi);
  const setFraction = useReaderStore((s) => s.setFraction);
  const setTocStore = useReaderStore((s) => s.setToc);
  // Phase 11: track the current chapter href for TOC highlighting.
  const setActiveChapterHref = useReaderStore((s) => s.setActiveChapterHref);

  // Subscribe to the typography/theme slice for setStyles
  const theme = useReaderStore((s) => s.theme);
  const fontFamily = useReaderStore((s) => s.fontFamily);
  const fontSize = useReaderStore((s) => s.fontSize);
  const lineHeight = useReaderStore((s) => s.lineHeight);
  const margin = useReaderStore((s) => s.margin);
  const textAlign = useReaderStore((s) => s.textAlign);

  /**
   * Effect 1: Initialize the engine, load the book, subscribe to events.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create an AbortController for cancellation on unmount
    const abortController = new AbortController();
    abortRef.current = abortController;

    let unsubscribe: (() => void) | null = null;
    let mounted = true;

    async function init() {
      const container = containerRef.current;
      if (!container) return;

      try {
        // Create the engine
        const engine = createReaderEngine(format, container);
        engineRef.current = engine;

        // Subscribe to engine events
        unsubscribe = engine.on((event: ReaderEngineEvent) => {
          if (!mounted) return;

          switch (event.type) {
            case 'ready':
              setToc(event.toc);
              setTocStore(event.toc);
              setIsReady(true);
              setLoading(false);

              // If we have an initial CFI, navigate to it (Phase 10 resume)
              if (initialCfi) {
                engine.goTo(initialCfi).catch((err) => {
                  console.error('[useReaderEngine] Failed to goTo initialCfi:', err);
                });
              }
              break;

            case 'relocate':
              setCurrentCfi(event.location.cfi);
              setFraction(event.location.fraction);
              // Phase 11: keep the active chapter href in sync for TOC highlighting.
              if (event.location.chapterHref !== undefined) {
                setActiveChapterHref(event.location.chapterHref);
              }
              break;

            case 'error':
              setError(event.error);
              setLoading(false);
              break;
          }
        });

        // Fetch the book blob (Phase 13: prefer the offline copy when present)
        const { objectURL, revoke } = await fetchBookBlob(
          bookId,
          userId ?? null,
          abortController.signal,
        );
        revokeRef.current = revoke;

        // Open the book
        await engine.open(objectURL);
      } catch (err) {
        if (!mounted) return;
        if (err instanceof Error && err.name === 'AbortError') {
          // Fetch was cancelled (unmount) — ignore
          return;
        }
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      }
    }

    init();

    // Cleanup on unmount
    return () => {
      mounted = false;

      // Cancel any in-flight fetch
      abortController.abort();

      // Unsubscribe from events
      if (unsubscribe) unsubscribe();

      // Destroy the engine
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }

      // Revoke the objectURL
      if (revokeRef.current) {
        revokeRef.current();
        revokeRef.current = null;
      }

      // Reset reader-store transient state
      setIsReady(false);
      setCurrentCfi(null);
      setFraction(0);
      setTocStore([]);
      setActiveChapterHref(null);
    };
  }, [
    containerRef,
    bookId,
    userId,
    format,
    initialCfi,
    setIsReady,
    setCurrentCfi,
    setFraction,
    setTocStore,
    setActiveChapterHref,
  ]);

  /**
   * Effect 2: Subscribe to reader-store typography/theme changes → engine.setStyles.
   *
   * This effect runs whenever the typography slice changes and calls engine.setStyles
   * with the mapped CSS variables. It's narrowly scoped to avoid re-running on
   * unrelated store changes (currentCfi, isReady, etc.).
   */
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const style = mapStateToStyle({
      theme,
      fontFamily,
      fontSize,
      lineHeight,
      margin,
      textAlign,
    });

    // Apply styles (coalesce rapid changes via requestAnimationFrame if needed)
    requestAnimationFrame(() => {
      if (engineRef.current) {
        engineRef.current.setStyles(style);
      }
    });
  }, [theme, fontFamily, fontSize, lineHeight, margin, textAlign]);

  /**
   * Imperative controls — delegate to the engine.
   */
  const controls: ReaderControls = {
    next: () => engineRef.current?.next(),
    prev: () => engineRef.current?.prev(),
    goTo: (target: string) => engineRef.current?.goTo(target) ?? Promise.resolve(),
    search: (query: string) => {
      const engine = engineRef.current;
      if (!engine) {
        return (async function* () {})(); // Empty async iterable
      }
      return engine.search(query);
    },
    toc,
    error,
    loading,
  };

  return controls;
}
