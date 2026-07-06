'use client';

/**
 * ReaderChrome — persistent top title + bottom progress readout (ISD §11.G).
 *
 * The book-title button (`ReaderToolbar`) is now Kindle-style: it sits
 * permanently at the top-center and is decoupled from `chromeVisible`, so
 * it never auto-hides and is always available to open the reader menu.
 * `useChromeVisibility` is still mounted so the `c` shortcut / tap-toggle
 * and reveal-on-activity timers keep running for other chrome affordances.
 *
 * The chrome is a thin overlay that does NOT block pointer events on the
 * engine container except over its own bounding rect (so the tap-zones
 * beneath it still work where the chrome is transparent).
 */

import { useReaderStore } from '@/store/reader-store';
import { ReaderToolbar } from './reader-toolbar';
import { useChromeVisibility } from '../hooks/use-chrome-visibility';
import { cn } from '@/lib/utils/cn';

interface ReaderChromeProps {
  /** Engine navigation function (from useReaderEngine). */
  goTo: (target: string) => Promise<void>;
  /** Optional book title for the toolbar. */
  bookTitle?: string | null;
  /** Whether the reader root is currently in native fullscreen. */
  isFullscreen: boolean;
  /** Toggles native fullscreen (V1.1). */
  onToggleFullscreen: () => void;
}

export function ReaderChrome({
  goTo,
  bookTitle,
  isFullscreen,
  onToggleFullscreen,
}: ReaderChromeProps) {
  const theme = useReaderStore((s) => s.theme);

  // The hook is mounted here to keep all chrome-visibility logic
  // (auto-hide, reveal-on-activity, the `c` shortcut) co-located with the
  // chrome UI. The persistent title below no longer consumes its
  // visibility, but keyboard/tap toggling still relies on the hook running.
  useChromeVisibility();

  // Pick a chrome color that contrasts with the reader theme.
  const chromeFg = theme === 'dark' ? 'text-white' : 'text-gray-900';

  const fraction = useReaderStore((s) => s.fraction);
  const percentage = Math.round(fraction * 100);

  return (
    <>
      {/*
        Persistent top title (Kindle-style). Decoupled from `chromeVisible`:
        the book title button sits permanently at the top-center and never
        auto-hides, so it is always available to open the reader menu — even
        on mobile/tablet where re-summoning the chrome is fiddly.
      */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center',
          chromeFg,
        )}
      >
        <div className="pointer-events-auto">
          <ReaderToolbar
            title={bookTitle}
            isFullscreen={isFullscreen}
            onToggleFullscreen={onToggleFullscreen}
          />
        </div>
      </div>

      {/* Persistent Bottom-Right Percentage */}
      <div
        className={cn(
          'pointer-events-none absolute bottom-4 right-6 z-10 text-xs font-semibold tracking-wider opacity-60',
          theme === 'dark' ? 'text-white/60' : 'text-black/60',
        )}
      >
        {percentage}%
      </div>
    </>
  );
}
