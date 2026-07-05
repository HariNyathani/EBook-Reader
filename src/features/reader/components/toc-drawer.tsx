'use client';

/**
 * TocDrawer — Table of Contents side drawer (ISD §11.G, §11.Y).
 *
 * Renders the table of contents in a left-side slide-in panel. Clicking
 * a chapter invokes the engine's `goTo(href)` via the useReaderEngine
 * hook, then closes the drawer.
 *
 * The current chapter is highlighted using `activeChapterHref` from
 * reader-store (Phase 11 addition).
 *
 * The drawer is keyboard-accessible (focus trap, Esc closes) and respects
 * `prefers-reduced-motion` (slide animation is skipped when requested).
 *
 * The component is purely presentational + store-driven. No engine DOM
 * access (SAD §5.1).
 */

import { useEffect, useMemo, useRef } from 'react';
import { useUiStore } from '@/store/ui-store';
import { useReaderStore } from '@/store/reader-store';
import type { TocItem } from '../engine/types';
import { useFocusTrap } from '../hooks/use-focus-trap';
import { usePrefersReducedMotion } from '../hooks/use-prefers-reduced-motion';
import { cn } from '@/lib/utils/cn';

interface TocDrawerProps {
  /** Engine navigation function (from useReaderEngine). */
  onNavigate: (href: string) => void;
}

function flattenToc(items: TocItem[]): TocItem[] {
  const out: TocItem[] = [];
  for (const item of items) {
    out.push(item);
    if (item.children) out.push(...flattenToc(item.children));
  }
  return out;
}

export function TocDrawer({ onNavigate }: TocDrawerProps) {
  const activePanel = useUiStore((s) => s.activePanel);
  const closePanel = useUiStore((s) => s.closePanel);
  const toc = useReaderStore((s) => s.toc);
  const activeChapterHref = useReaderStore((s) => s.activeChapterHref);

  const open = activePanel === 'toc';
  const reducedMotion = usePrefersReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap + Escape-to-close.
  useFocusTrap(dialogRef, {
    active: open,
    onEscape: () => closePanel(),
  });

  // Compute the flat list of chapters for simple rendering. For very large
  // TOCs (>200 entries) the linear list is still fine in practice.
  const flat = useMemo(() => flattenToc(toc), [toc]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-30 bg-black/30"
        onClick={() => closePanel()}
      />
      {/* Drawer */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Table of contents"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-full max-w-sm flex-col bg-white shadow-xl',
          // Slide-in animation, unless reduced motion.
          reducedMotion ? '' : 'animate-[toc-drawer-slide-in_180ms_ease-out]',
        )}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">Contents</h2>
          <button
            type="button"
            onClick={() => closePanel()}
            aria-label="Close contents"
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {flat.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-gray-500">
              No table of contents available for this book.
            </p>
          ) : (
            <ul className="space-y-1">
              {flat.map((item, idx) => {
                const isActive = item.href === activeChapterHref;
                return (
                  <li key={`${item.href}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate(item.href);
                        closePanel();
                      }}
                      className={cn(
                        'block w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                        isActive
                          ? 'bg-blue-50 font-semibold text-blue-700'
                          : 'text-gray-700 hover:bg-gray-100',
                      )}
                      aria-current={isActive ? 'true' : undefined}
                    >
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
