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

import { useState } from 'react';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';
import { useUiStore } from '@/store/ui-store';
import { cn } from '@/lib/utils/cn';

interface ReaderToolbarProps {
  title?: string | null;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
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
        'flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors hover:bg-black/10 dark:hover:bg-white/10',
        active && 'bg-black/15 text-gray-900 dark:bg-white/10 dark:text-white',
      )}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

export function ReaderToolbar({ title, isFullscreen, onToggleFullscreen }: ReaderToolbarProps) {
  const activePanel = useUiStore((s) => s.activePanel);
  const togglePanel = useUiStore((s) => s.togglePanel);
  const [isOpen, setIsOpen] = useState(false);

  const handleAction = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* The main title button — plain, unobtrusive text (Kindle-style). */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium tracking-wide opacity-60 transition-opacity hover:opacity-100"
      >
        <span className="max-w-[60vw] truncate">{title ?? 'Reading'}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('shrink-0 transition-transform duration-200', isOpen && 'rotate-180')}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/*
        Click-outside backdrop. The book text renders inside a foliate-js
        iframe, so clicks there never reach a document-level `mousedown`
        listener. This transparent, fixed backdrop sits behind the dropdown
        and catches those clicks (and any outside click) to close the menu.
      */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          aria-hidden="true"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* The dropdown menu (above the backdrop). */}
      {isOpen && (
        <div className="absolute left-1/2 z-50 mt-4 w-64 -translate-x-1/2 overflow-hidden rounded-2xl bg-white text-gray-900 p-2 shadow-2xl ring-1 ring-black/5 dark:bg-zinc-900 dark:text-gray-100 dark:ring-white/10">
          <Link
            href={ROUTES.DASHBOARD}
            className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Exit to Library</span>
          </Link>

          <div className="my-1 h-px w-full bg-gray-100 dark:bg-zinc-800" />

          <IconButton
            label="Table of contents"
            active={activePanel === 'toc'}
            onClick={() => handleAction(() => togglePanel('toc'))}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
          </IconButton>

          <IconButton
            label="Search in book"
            active={activePanel === 'search'}
            onClick={() => handleAction(() => togglePanel('search'))}
          >
             <svg xmlns="http://www.w3.org/2000/svg" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </IconButton>

          <IconButton
            label="Typography settings"
            active={activePanel === 'typography'}
            onClick={() => handleAction(() => togglePanel('typography'))}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>
          </IconButton>

          <IconButton
            label="Theme"
            active={activePanel === 'theme'}
            onClick={() => handleAction(() => togglePanel('theme'))}
          >
             <svg xmlns="http://www.w3.org/2000/svg" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
          </IconButton>

          <IconButton
            label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            active={isFullscreen}
            onClick={() => handleAction(onToggleFullscreen)}
          >
             {isFullscreen ? (
               <svg xmlns="http://www.w3.org/2000/svg" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
             ) : (
               <svg xmlns="http://www.w3.org/2000/svg" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
             )}
          </IconButton>
        </div>
      )}
    </div>
  );
}
