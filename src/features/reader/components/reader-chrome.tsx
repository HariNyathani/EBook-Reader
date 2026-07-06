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

  const fraction = useReaderStore((s) => s.fraction);
  const percentage = Math.round(fraction * 100);

  return (
    <>
      {/* Top toolbar (Centered Pill) */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-6 z-20 flex justify-center transition-opacity duration-200',
          chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
          reducedMotion && 'transition-none',
        )}
        aria-hidden={!chromeVisible}
      >
        <div
          className={cn(
            'pointer-events-auto flex items-center rounded-full shadow-glass backdrop-blur-xl',
            chromeBg,
            chromeFg,
          )}
        >
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
