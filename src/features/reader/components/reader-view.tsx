'use client';

/**
 * ReaderView — client component that mounts the reader engine and
 * composes the full reader UI (chrome, TOC drawer, search panel,
 * typography/theme popovers, tap zones, progress sync, session
 * tracking, keyboard shortcuts, swipe gestures).
 *
 * Phase 9: Initial engine mount + minimal nav.
 * Phase 10: + progress sync + reading session hooks.
 * Phase 11: + chrome, drawers/panels, tap zones, swipe gestures,
 *            keyboard shortcuts, focus traps, reduced-motion.
 * Phase 12: + persistence (handled in reader-store via persist middleware).
 *
 * Architecture (SAD §5.1):
 *   React (reader-store / ui-store) ↔ useReaderEngine ↔ ReaderEngine ↔ FoliateEngine ↔ <foliate-view>
 *   React NEVER touches the engine iframe. All interaction flows through
 *   the useReaderEngine hook's imperative controls or the store setters.
 */

import { useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useReaderEngine } from '../hooks/use-reader-engine';
import { useProgressSync } from '../progress/use-progress-sync';
import { useReadingSession } from '../progress/use-reading-session';
import { useReaderControls } from '../hooks/use-reader-controls';
import { useChromeVisibility } from '../hooks/use-chrome-visibility';
import { useFullscreen } from '../hooks/use-fullscreen';
import { TapZones } from './tap-zones';
import { ReaderChrome } from './reader-chrome';
import { ReaderLoading } from './reader-loading';
import { ReaderError } from './reader-error';
import type { BookFormat } from '../engine/types';
import { useReaderStore } from '@/store/reader-store';
import { themePalette } from '../lib/styles-mapper';
import { useReaderAnnouncer } from '@/features/a11y/use-reader-announcer';

// Phase 14 (ISD §14.H, §14.DD #2): heavy reader panels (TOC, search,
// typography) are dynamically imported so they don't bloat the
// initial reader route bundle. foliate-js remains client-only and
// is loaded by the engine layer — these dynamic imports are a
// secondary code-split: they pull the panel components out of the
// main reader chunk and only load the relevant panel when it is
// first opened. `ssr: false` matches the pattern of the reader
// itself (the engine is window-only).

const TocDrawer = dynamic(() => import('./toc-drawer').then((m) => ({ default: m.TocDrawer })), {
  ssr: false,
});

const SearchPanel = dynamic(
  () => import('./search-panel').then((m) => ({ default: m.SearchPanel })),
  { ssr: false },
);

const SettingsPopover = dynamic(
  () => import('./settings-popover').then((m) => ({ default: m.SettingsPopover })),
  { ssr: false },
);

interface ReaderViewProps {
  /** The book UUID to render. */
  bookId: string;
  /** Current user id (server-derived). Used by the offline fallback. */
  userId?: string | null;
  /** The book format (only 'epub' in Phase 9). */
  format: BookFormat;
  /** Optional initial CFI for resume reading (Phase 10). */
  initialCfi?: string;
  /** Optional book title (shown in the toolbar). */
  bookTitle?: string | null;
}

/**
 * ReaderView — renders the book with the full reader UX.
 *
 * This component:
 * 1. Creates a containerRef for the engine mount point
 * 2. Calls useReaderEngine to initialize the engine and bridge events ↔ store
 * 3. Mounts the auto-hiding chrome, drawers, panels, and tap zones
 * 4. Wires keyboard shortcuts, swipe gestures, and tap zones
 * 5. Shows loading and error states with retry
 * 6. Renders a progress sync and reading session tracker
 */
export default function ReaderView({
  bookId,
  userId,
  format,
  initialCfi,
  bookTitle,
}: ReaderViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const theme = useReaderStore((s) => s.theme);

  // The sole bridge between React and the engine.
  const { next, prev, goTo, search, error } = useReaderEngine({
    containerRef,
    bookId,
    userId,
    format,
    initialCfi,
  });

  // Phase 10: progress sync and reading session tracking.
  useProgressSync(bookId);
  useReadingSession(bookId);

  // Phase 15 (ISD §15.AA): SR announcements for chapter/page changes.
  useReaderAnnouncer();

  // Phase 11: chrome auto-hide (state lives in ui-store; the hook owns
  // the idle timer and reveal-on-activity listeners).
  const { toggle: toggleChrome } = useChromeVisibility();

  // V1.1: native fullscreen — fullscreens the whole reader root (engine +
  // chrome + panels) so the chrome overlay keeps working while fullscreen.
  const { isFullscreen, toggleFullscreen } = useFullscreen(rootRef);

  // Phase 11: keyboard shortcuts (←/→/Esc/`/`/t/+/-/c/f).
  useReaderControls({ next, prev, toggleChrome, toggleFullscreen });

  // Stable callbacks for the tap-zones and chrome.
  const onPrev = useCallback(() => prev(), [prev]);
  const onNext = useCallback(() => next(), [next]);
  const onToggleChrome = useCallback(() => toggleChrome(), [toggleChrome]);

  // Map theme to a background for the container (the engine paints over it).
  const palette = themePalette[theme];
  const bgColor = palette.bg;

  // Retry handler: reload the page to recreate the engine instance.
  const onRetry = useCallback(() => {
    if (typeof window !== 'undefined') window.location.reload();
  }, []);

  // A separate boolean for the "loading" overlay: we use the engine's
  // `isReady` state (via the store) as the canonical "loading" signal.
  // The engine layer surfaces errors via the `error` return value.
  const isReady = useReaderStore((s) => s.isReady);
  const showLoading = !isReady && !error;

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full overflow-hidden"
      style={{ backgroundColor: bgColor }}
    >
      {/* Engine mount point — the engine renders into this div. */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Tap zones (transparent) — wires pointer/touch gestures to engine. */}
      <TapZones
        containerRef={containerRef}
        next={onNext}
        prev={onPrev}
        toggleChrome={onToggleChrome}
      />

      {/* Auto-hiding reader chrome (top toolbar + bottom progress bar). */}
      <ReaderChrome
        goTo={goTo}
        bookTitle={bookTitle}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />

      {/* Drawers / panels. */}
      <TocDrawer onNavigate={(href) => void goTo(href)} />
      <SearchPanel search={search} goTo={goTo} />
      <SettingsPopover mode="typography" />
      <SettingsPopover mode="theme" />

      {/* Loading + error overlays. */}
      {showLoading ? <ReaderLoading /> : null}
      {error ? <ReaderError error={error} onRetry={onRetry} /> : null}
    </div>
  );
}

/**
 * ReaderSkeleton — loading placeholder for the reader.
 * Shown by the dynamic wrapper while the component loads.
 */
export function ReaderSkeleton() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-100">
      <div className="text-gray-500">Loading reader…</div>
    </div>
  );
}
