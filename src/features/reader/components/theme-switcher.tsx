'use client';

/**
 * ThemeSwitcher — three-option theme picker (ISD §11.G).
 *
 * Live-updates the reader via the existing `setTheme` setter
 * (which triggers `engine.setStyles` through the useReaderEngine hook).
 * Persistence is wired in Phase 12.
 *
 * The component is "dumb" — it just binds to reader-store.
 */

import { useReaderStore } from '@/store/reader-store';
import { THEME_OPTIONS } from '../constants';
import { cn } from '@/lib/utils/cn';

interface ThemeSwitcherProps {
  /** Render a compact "segmented" inline bar; otherwise a labelled list. */
  compact?: boolean;
}

export function ThemeSwitcher({ compact = false }: ThemeSwitcherProps) {
  const theme = useReaderStore((s) => s.theme);
  const setTheme = useReaderStore((s) => s.setTheme);

  if (compact) {
    return (
      <div
        role="radiogroup"
        aria-label="Reader theme"
        className="flex items-center gap-1 rounded-full bg-black/5 p-1"
      >
        {THEME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={theme === opt.value}
            onClick={() => setTheme(opt.value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              theme === opt.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900',
            )}
            title={opt.label}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">Theme</legend>
      <div role="radiogroup" aria-label="Reader theme" className="flex gap-2">
        {THEME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={theme === opt.value}
            onClick={() => setTheme(opt.value)}
            className={cn(
              'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
              theme === opt.value
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
