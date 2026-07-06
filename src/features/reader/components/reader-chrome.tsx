'use client';

/**
 * ReaderChrome — top toolbar + bottom progress bar (ISD §11.G).
 *
 * Combines `ReaderToolbar` and `ReaderProgressBar` into a single overlay
 * that auto-hides after a period of inactivity. Visibility is driven by
 * `ui-store.chromeVisible` (controlled by `useChromeVisibility`).
 *
 * The chrome is a thin overlay that does NOT block pointer events on
 * the engine container except over its own bounding rect (so the
 * tap-zones beneath it still work where the chrome is transparent).
 *
 * Animations respect `prefers-reduced-motion` (the chrome appears and
 * disappears instantly in that case).
 */

import { useReaderStore } from '@/store/reader-store';
import { useUiStore } from '@/store/ui-store';
import { ReaderToolbar } from './reader-toolbar';
import { ReaderProgressBar } from './reader-progress-bar';
import { useChromeVisibility } from '../hooks/use-chrome-visibility';
import { usePrefersReducedMotion } from '../hooks/use-prefers-reduced-motion';
import { themePalette } from '../lib/styles-mapper';
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
  const chromeVisible = useUiStore((s) => s.chromeVisible);
  const reducedMotion = usePrefersReducedMotion();

  // The hook is mounted here to keep all chrome-visibility logic
  // (auto-hide, reveal-on-activity) co-located with the chrome UI. The
  // hook returns `visible/toggle/reveal/hide`; we only consume `visible`
  // for rendering.
  useChromeVisibility();

  // Pick a chrome color that contrasts with the reader theme.
  const palette = themePalette[theme];
  const chromeFg = theme === 'dark' ? 'text-white' : 'text-gray-900';
  const chromeBg =
    theme === 'dark' ? 'bg-black/70' : theme === 'sepia' ? 'bg-[#f4ecd8]/85' : 'bg-white/85';

  return (
    <>
      {/* Top toolbar */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-20 transition-opacity duration-200',
          chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
          reducedMotion && 'transition-none',
        )}
        aria-hidden={!chromeVisible}
      >
        <div
          className={cn(
            'pointer-events-auto mx-auto mt-0 flex max-w-screen-2xl items-center backdrop-blur',
            chromeBg,
            chromeFg,
          )}
          style={{
            // We need a slightly darker top edge for contrast over the book.
            boxShadow:
              theme === 'dark' ? '0 1px 0 rgba(255,255,255,0.06)' : '0 1px 0 rgba(0,0,0,0.06)',
            // Subtle bottom border using the foreground color.
            borderBottom: `1px solid ${palette.fg}1a`,
          }}
        >
          <ReaderToolbar
            title={bookTitle}
            isFullscreen={isFullscreen}
            onToggleFullscreen={onToggleFullscreen}
          />
        </div>
      </div>

      {/* Bottom progress bar */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 z-20 transition-opacity duration-200',
          chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
          reducedMotion && 'transition-none',
        )}
        aria-hidden={!chromeVisible}
      >
        <div
          className={cn(
            'pointer-events-auto mx-auto flex max-w-screen-2xl items-center backdrop-blur',
            chromeBg,
            chromeFg,
          )}
          style={{
            boxShadow:
              theme === 'dark' ? '0 -1px 0 rgba(255,255,255,0.06)' : '0 -1px 0 rgba(0,0,0,0.06)',
            borderTop: `1px solid ${palette.fg}1a`,
          }}
        >
          <ReaderProgressBar goTo={goTo} bookTitle={bookTitle} />
        </div>
      </div>
    </>
  );
}
