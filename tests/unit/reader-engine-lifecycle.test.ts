/**
 * Regression tests for the reader re-initialization loop (Phase 16 hotfix).
 *
 * The failure mode this guards against: every debounced progress save used to
 * revalidate the reader page, which re-rendered the RSC tree and passed the
 * just-saved CFI back down as a NEW `initialCfi` prop. Because `initialCfi`
 * was a dependency of useReaderEngine's init effect, each save tore the
 * engine down and re-opened the book ("Opening book" flash, typography
 * snapping back to defaults, progress-save spam).
 *
 * These tests pin the two invariants that break the loop:
 *  1. Changing the `initialCfi` prop after mount must NOT destroy/re-open
 *     the engine (it is a mount-time input, consumed via a ref).
 *  2. Typography/theme changes must flow through engine.setStyles() ONLY —
 *     never through a teardown + engine.open().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { RefObject } from 'react';

vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// Engine + blob-fetch mocks
// ---------------------------------------------------------------------------

type EngineEvent =
  | { type: 'ready'; toc: unknown[]; totalFraction: number }
  | { type: 'relocate'; location: { cfi: string; fraction: number; chapterHref?: string } }
  | { type: 'error'; error: Error };

const { engineMocks } = vi.hoisted(() => {
  const handlers = new Set<(e: unknown) => void>();
  const open = vi.fn(async () => undefined);
  const destroy = vi.fn();
  const setStyles = vi.fn();
  const goTo = vi.fn(async () => undefined);
  const engine = {
    open,
    destroy,
    setStyles,
    goTo,
    next: vi.fn(),
    prev: vi.fn(),
    search: vi.fn(),
    on: (h: (e: unknown) => void) => {
      handlers.add(h);
      return () => handlers.delete(h);
    },
  };
  const createReaderEngine = vi.fn(() => engine);
  const emit = (e: unknown) => {
    for (const h of handlers) h(e);
  };
  return { engineMocks: { engine, open, destroy, setStyles, goTo, createReaderEngine, emit } };
});

vi.mock('@/features/reader/engine', () => ({
  createReaderEngine: engineMocks.createReaderEngine,
}));

vi.mock('@/features/reader/lib/fetch-book-blob', () => ({
  fetchBookBlob: vi.fn(async () => ({
    objectURL: 'blob:mock-book',
    revoke: vi.fn(),
    source: 'network' as const,
  })),
}));

import { useReaderEngine } from '@/features/reader/hooks/use-reader-engine';
import { useReaderStore } from '@/store/reader-store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BOOK_ID = '11111111-1111-4111-8111-111111111111';

function makeContainerRef(): RefObject<HTMLElement | null> {
  return { current: document.createElement('div') };
}

async function flushInit() {
  // Let the async init() (fetchBookBlob → engine.open) settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function emitReady() {
  act(() => {
    engineMocks.emit({ type: 'ready', toc: [], totalFraction: 1 } satisfies EngineEvent);
  });
}

describe('useReaderEngine lifecycle (re-init loop guard)', () => {
  let rafSpy: { mockRestore: () => void } | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    useReaderStore.setState({ isReady: false, currentCfi: null, fraction: 0 });
    // Effect 2 coalesces typography changes via requestAnimationFrame; run
    // the callback synchronously so assertions are deterministic.
    rafSpy = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });
  });

  afterEach(() => {
    rafSpy?.mockRestore();
  });

  it('changing the initialCfi prop after mount does NOT re-open the book', async () => {
    const containerRef = makeContainerRef();

    const { rerender, unmount } = renderHook(
      ({ initialCfi }: { initialCfi?: string }) =>
        useReaderEngine({
          containerRef,
          bookId: BOOK_ID,
          userId: 'user-1',
          format: 'epub',
          initialCfi,
        }),
      { initialProps: { initialCfi: 'epubcfi(/6/2!/4/2)' } },
    );

    await flushInit();
    emitReady();

    expect(engineMocks.createReaderEngine).toHaveBeenCalledTimes(1);
    expect(engineMocks.open).toHaveBeenCalledTimes(1);
    expect(engineMocks.goTo).toHaveBeenCalledWith('epubcfi(/6/2!/4/2)');

    // Simulate the post-save RSC refresh: the page re-renders and passes the
    // just-saved CFI back down as a NEW initialCfi prop value.
    rerender({ initialCfi: 'epubcfi(/6/4!/4/8)' });
    await flushInit();

    // The engine must NOT have been torn down or re-opened.
    expect(engineMocks.destroy).not.toHaveBeenCalled();
    expect(engineMocks.createReaderEngine).toHaveBeenCalledTimes(1);
    expect(engineMocks.open).toHaveBeenCalledTimes(1);

    unmount();
    expect(engineMocks.destroy).toHaveBeenCalledTimes(1);
  });

  it('typography changes call engine.setStyles and never re-open the book', async () => {
    const containerRef = makeContainerRef();

    const { unmount } = renderHook(() =>
      useReaderEngine({
        containerRef,
        bookId: BOOK_ID,
        userId: 'user-1',
        format: 'epub',
      }),
    );

    await flushInit();
    emitReady();

    // 'ready' paints the saved typography once.
    const stylesCallsAfterReady = engineMocks.setStyles.mock.calls.length;
    expect(stylesCallsAfterReady).toBeGreaterThanOrEqual(1);

    // Change font size + family the way the settings panel does.
    act(() => {
      useReaderStore.getState().setFontSize(22);
    });
    act(() => {
      useReaderStore.getState().setFontFamily('Inter, sans-serif');
    });

    // Styles were re-applied to the LIVE engine…
    expect(engineMocks.setStyles.mock.calls.length).toBeGreaterThan(stylesCallsAfterReady);
    // …and the engine was never destroyed or re-opened.
    expect(engineMocks.destroy).not.toHaveBeenCalled();
    expect(engineMocks.open).toHaveBeenCalledTimes(1);
    expect(engineMocks.createReaderEngine).toHaveBeenCalledTimes(1);

    unmount();
  });
});
