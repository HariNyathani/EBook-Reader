'use client';

/**
 * ReaderToolbar — top toolbar buttons (ISD §11.G, §11.M).
 *
 * Renders the row of buttons (back, TOC, search, typography, theme)
 * used by the auto-hiding reader chrome. Each button toggles a panel
 * via `ui-store` or navigates back to the dashboard. The toolbar is
 * presentational; the chrome component owns visibility and styling.
 *
 * Buttons have accessible labels; the toolbar uses semantic markup so
 * screen readers announce the controls.
 */

import Link from 'next/link';
import { ROUTES } from '@/lib/routes';
import { useUiStore } from '@/store/ui-store';
import { cn } from '@/lib/utils/cn';

interface ReaderToolbarProps {
  /** Optional book title (shown as the centered title on wide screens). */
  title?: string | null;
}

interface IconButtonProps {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function IconButton({ label, active, onClick, children }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active ? 'true' : undefined}
      onClick={onClick}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-md text-gray-700 transition-colors hover:bg-black/10',
        active && 'bg-black/15 text-gray-900',
      )}
    >
      {children}
    </button>
  );
}

export function ReaderToolbar({ title }: ReaderToolbarProps) {
  const activePanel = useUiStore((s) => s.activePanel);
  const togglePanel = useUiStore((s) => s.togglePanel);

  return (
    <div className="flex w-full items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
      {/* Back */}
      <Link
        href={ROUTES.DASHBOARD}
        aria-label="Back to library"
        className="flex h-9 w-9 items-center justify-center rounded-md text-gray-700 transition-colors hover:bg-black/10"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
      </Link>

      {/* Title (hidden on small screens) */}
      <h1 className="hidden flex-1 truncate text-sm font-semibold text-gray-900 sm:block">
        {title ?? 'Reading'}
      </h1>
      <div className="flex-1 sm:hidden" />

      {/* TOC */}
      <IconButton
        label="Table of contents"
        active={activePanel === 'toc'}
        onClick={() => togglePanel('toc')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      </IconButton>

      {/* Search */}
      <IconButton
        label="Search in book"
        active={activePanel === 'search'}
        onClick={() => togglePanel('search')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </IconButton>

      {/* Typography */}
      <IconButton
        label="Typography settings"
        active={activePanel === 'typography'}
        onClick={() => togglePanel('typography')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="4 7 4 4 20 4 20 7" />
          <line x1="9" y1="20" x2="15" y2="20" />
          <line x1="12" y1="4" x2="12" y2="20" />
        </svg>
      </IconButton>

      {/* Theme */}
      <IconButton
        label="Theme"
        active={activePanel === 'theme'}
        onClick={() => togglePanel('theme')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      </IconButton>
    </div>
  );
}
