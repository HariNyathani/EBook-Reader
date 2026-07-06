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

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
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
/**
 * Normalizes an unknown error thrown during book load into a descriptive
 * `Error`. The error can originate from two places:
 *   1. `fetchBookBlob` — already a `ReaderLoadError` with a clear message.
 *   2. `engine.open()` — foliate `fetch()`es the `blob:` objectURL to read
 *      the zip. If that fetch is blocked (e.g. a CSP `connect-src` gap) it
 *      throws a bare `TypeError: Failed to fetch`, which is otherwise
 *      undiagnosable. We rewrite that specific case into an actionable
 *      message while preserving the original as `cause`.
 */
function toReaderError(err: unknown): Error {
  if (err instanceof Error && err.name === 'ReaderLoadError') return err;
  const isFailedToFetch =
    err instanceof TypeError && /failed to fetch|load failed|networkerror/i.test(err.message);
  if (isFailedToFetch) {
    return new Error(
      'Could not read this book’s file. The browser blocked reading the ' +
        'downloaded book data — this usually means a Content-Security-Policy ' +
        '“connect-src” gap (blob: must be allowed) or a lost connection. ' +
        'Check the console for a CSP violation.',
      { cause: err },
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}

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

  // `initialCfi` is a MOUNT-TIME input (the resume position), not a live
  // subscription. Any RSC re-render of the reader page (e.g. a router
  // refresh after a Server Action revalidates) passes the latest saved CFI
  // back down as a NEW `initialCfi` prop value. If the init effect depended
  // on the prop, that churn would tear the engine down and re-open the book
  // — the re-init loop ("Opening book" flash, typography snapping back,
  // progress-save spam). So the prop is mirrored into a ref and read only
  // inside the 'ready' handler; prop churn can never re-run the init effect.
  // The sync effect below is declared BEFORE the init effect so that when a
  // bookId swap legitimately re-runs init, the ref already holds the new
  // book's resume position.
  const initialCfiRef = useRef(initialCfi);
  useEffect(() => {
    initialCfiRef.current = initialCfi;
  }, [initialCfi]);

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

  // NOTE: typography/theme (fontSize, fontFamily, lineHeight, margin,
  // textAlign, theme) is deliberately NOT read via useReaderStore selectors
  // here. Subscribing to it would re-render this hook — and therefore the
  // whole reader subtree — on every typography tweak, and any churn in the
  // init effect below risks re-opening the book. Instead we read the slice
  // imperatively (useReaderStore.getState()) inside `applyStyles`, and we
  // drive it from a store *subscription* (Effect 2) + the engine 'ready'
  // event. Typography changes thus flow to engine.setStyles() ONLY — they
  // never touch React render or the engine lifecycle.

  /**
   * Apply the current typography/theme slice to the engine. Reads the latest
   * store state at call time (so it's stable — no deps — and always current),
   * and is invoked both on the engine 'ready' event (so every open/re-open
   * paints with the user's settings instead of engine defaults) and whenever
   * the durable typography slice changes (Effect 2).
   */
  const applyStyles = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const s = useReaderStore.getState();
    engine.setStyles(
      mapStateToStyle({
        theme: s.theme,
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
        lineHeight: s.lineHeight,
        margin: s.margin,
        textAlign: s.textAlign,
      }),
    );
  }, []);

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

              // Paint the user's saved typography/theme immediately on open.
              // Without this, a freshly opened (or re-opened) engine renders
              // with foliate's defaults until the next typography change —
              // which is what made settings appear to "revert to default".
              applyStyles();

              // If we have an initial CFI, navigate to it (Phase 10 resume).
              // Read via the ref (NOT the prop) — see initialCfiRef above.
              if (initialCfiRef.current) {
                engine.goTo(initialCfiRef.current).catch((err) => {
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
        setError(toReaderError(err));
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
    // DELIBERATELY STATIC DEPS (the re-init-loop guard):
    // - `initialCfi` MUST NOT appear here — it churns on every RSC refresh
    //   of the reader page and is consumed via initialCfiRef instead.
    // - Typography/theme MUST NOT appear here — they flow through Effect 2's
    //   store subscription → engine.setStyles(), never through re-init.
    // Everything listed below is referentially stable for the life of the
    // mounted reader (refs, zustand setters, stable useCallback), except
    // bookId/userId/format, which only change on a real book swap — the one
    // case where a teardown + re-open is correct.
  }, [
    containerRef,
    bookId,
    userId,
    format,
    applyStyles,
    setIsReady,
    setCurrentCfi,
    setFraction,
    setTocStore,
    setActiveChapterHref,
  ]);

  /**
   * Effect 2: Live typography/theme updates → engine.setStyles.
   *
   * This subscribes to the store IMPERATIVELY (useReaderStore.subscribe)
   * rather than via a render-triggering selector. That is the crux of the
   * decoupling: a typography tweak runs setStyles directly on the engine and
   * never re-renders React, so it can never re-run the init effect or
   * re-open the book. The effect mounts once (empty deps) and lives for the
   * hook's lifetime; the engine is read live via engineRef.
   *
   * We compare only the durable typography fields so unrelated store writes
   * (currentCfi, fraction, isReady, search state, …) don't call setStyles.
   * The initial apply-on-open is handled by the 'ready' handler above.
   */
  useEffect(() => {
    let raf = 0;
    const unsubscribe = useReaderStore.subscribe((state, prev) => {
      const changed =
        state.theme !== prev.theme ||
        state.fontFamily !== prev.fontFamily ||
        state.fontSize !== prev.fontSize ||
        state.lineHeight !== prev.lineHeight ||
        state.margin !== prev.margin ||
        state.textAlign !== prev.textAlign;
      if (!changed) return;
      // Coalesce rapid slider changes into a single paint.
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(applyStyles);
    });

    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
    };
  }, [applyStyles]);

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
