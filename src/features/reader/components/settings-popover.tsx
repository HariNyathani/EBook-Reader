'use client';

/**
 * SettingsPopover — combined typography + theme popover (ISD §11.G).
 *
 * Renders a small floating panel anchored to the top-right of the
 * reader that lets the user adjust typography and theme. This is the
 * "typography panel" and "theme switcher" surfaces from the spec,
 * unified into one place to keep the reader chrome uncluttered.
 *
 * The component is purely store-driven (no engine DOM access). Theme
 * and typography changes are live-applied by the existing
 * `useReaderEngine` pipeline.
 */

import { useRef } from 'react';
import { useUiStore } from '@/store/ui-store';
import { TypographyPanel } from './typography-panel';
import { ThemeSwitcher } from './theme-switcher';
import { useFocusTrap } from '../hooks/use-focus-trap';
import { usePrefersReducedMotion } from '../hooks/use-prefers-reduced-motion';
import { cn } from '@/lib/utils/cn';

interface SettingsPopoverProps {
  /** Which mode to show: typography, theme, or both. */
  mode: 'typography' | 'theme';
}

export function SettingsPopover({ mode }: SettingsPopoverProps) {
  const activePanel = useUiStore((s) => s.activePanel);
  const closePanel = useUiStore((s) => s.closePanel);
  const reducedMotion = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  // Show only when the corresponding panel is active.
  const visible =
    (mode === 'typography' && activePanel === 'typography') ||
    (mode === 'theme' && activePanel === 'theme');

  useFocusTrap(ref, { active: visible, onEscape: () => closePanel() });

  if (!visible) return null;

  const label = mode === 'typography' ? 'Typography' : 'Theme';
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className={cn(
        'absolute right-4 top-16 z-40 w-80 rounded-lg border border-gray-200 bg-white/95 p-4 shadow-2xl backdrop-blur',
        reducedMotion ? '' : 'animate-[popover-fade-in_140ms_ease-out]',
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
        <button
          type="button"
          onClick={() => closePanel()}
          aria-label={`Close ${label.toLowerCase()} panel`}
          className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      {mode === 'typography' ? <TypographyPanel /> : <ThemeSwitcher />}
    </div>
  );
}
