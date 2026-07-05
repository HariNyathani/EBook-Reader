'use client';

/**
 * SearchPanel — in-book search panel (ISD §11.G, §11.AA).
 *
 * Debounces user input, then iterates the engine's async `search()`
 * results, populating reader-store. Clicking a result calls
 * `engine.goTo(cfi)` and closes the panel.
 *
 * Highlights are managed by the engine (the engine's `clearSearch()`
 * is invoked on close or new query), not by React DOM manipulation.
 * This preserves the React↔engine isolation (SAD §5.1).
 *
 * The panel uses the focus-trap utility and Esc-to-close.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useUiStore } from '@/store/ui-store';
import { useReaderStore } from '@/store/reader-store';
import { useFocusTrap } from '../hooks/use-focus-trap';
import { usePrefersReducedMotion } from '../hooks/use-prefers-reduced-motion';
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_MAX_RESULTS,
  SEARCH_QUERY_MAX,
  SEARCH_QUERY_MIN,
} from '../constants';
import { cn } from '@/lib/utils/cn';
import type { SearchResult } from '../engine/types';

interface SearchPanelProps {
  /** Engine search (from useReaderEngine). */
  search: (query: string) => AsyncIterable<SearchResult>;
  /** Engine goTo (from useReaderEngine). */
  goTo: (target: string) => Promise<void>;
}

export function SearchPanel({ search, goTo }: SearchPanelProps) {
  const activePanel = useUiStore((s) => s.activePanel);
  const closePanel = useUiStore((s) => s.closePanel);

  const searchQuery = useReaderStore((s) => s.searchQuery);
  const searchResults = useReaderStore((s) => s.searchResults);
  const searchState = useReaderStore((s) => s.searchState);
  const setSearchQuery = useReaderStore((s) => s.setSearchQuery);
  const setSearchResults = useReaderStore((s) => s.setSearchResults);
  const appendSearchResults = useReaderStore((s) => s.appendSearchResults);
  const clearSearchResults = useReaderStore((s) => s.clearSearchResults);
  const setSearchState = useReaderStore((s) => s.setSearchState);

  const open = activePanel === 'search';
  const reducedMotion = usePrefersReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  // Focus the input when the panel opens.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  // Focus trap (Esc to close).
  useFocusTrap(dialogRef, { active: open, onEscape: () => closePanel() });

  // Cancel any in-flight search on close.
  useEffect(() => {
    if (!open) {
      cancelRef.current.cancelled = true;
      clearSearchResults();
    }
  }, [open, clearSearchResults]);

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    const q = searchQuery.trim();
    if (q.length < SEARCH_QUERY_MIN) {
      setSearchResults([]);
      setSearchState('idle');
      return;
    }
    const handle = setTimeout(async () => {
      // Mark previous query as cancelled.
      cancelRef.current.cancelled = true;
      const token = { cancelled: false };
      cancelRef.current = token;

      setSearchState('searching');
      setSearchResults([]);

      try {
        let count = 0;
        for await (const result of search(q)) {
          if (token.cancelled) return;
          if (count >= SEARCH_MAX_RESULTS) break;
          appendSearchResults([result]);
          count += 1;
        }
        if (!token.cancelled) {
          setSearchState('idle');
        }
      } catch (err) {
        if (token.cancelled) return;
        console.error('[SearchPanel] search failed:', err);
        setSearchState('error');
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [open, searchQuery, search, setSearchResults, setSearchState, appendSearchResults]);

  const handleResultClick = useCallback(
    async (cfi: string) => {
      try {
        await goTo(cfi);
        closePanel();
      } catch (err) {
        console.error('[SearchPanel] goTo failed:', err);
      }
    },
    [goTo, closePanel],
  );

  if (!open) return null;

  const trimmed = searchQuery.trim();
  const hasQuery = trimmed.length >= SEARCH_QUERY_MIN;
  const showEmpty = hasQuery && searchState === 'idle' && searchResults.length === 0;

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-30 bg-black/30"
        onClick={() => closePanel()}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search in book"
        className={cn(
          'fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col bg-white shadow-xl',
          reducedMotion ? '' : 'animate-[search-panel-slide-in_180ms_ease-out]',
        )}
      >
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
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
            className="text-gray-400"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value.slice(0, SEARCH_QUERY_MAX))}
            placeholder="Search in book…"
            aria-label="Search query"
            className="flex-1 bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-400"
          />
          <button
            type="button"
            onClick={() => closePanel()}
            aria-label="Close search"
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
          {!hasQuery ? (
            <p className="px-3 py-6 text-center text-sm text-gray-500">
              Type to search inside the book.
            </p>
          ) : searchState === 'searching' && searchResults.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-gray-500">Searching…</p>
          ) : searchState === 'error' ? (
            <p className="px-3 py-6 text-center text-sm text-red-600">
              Search failed. Please try again.
            </p>
          ) : showEmpty ? (
            <p className="px-3 py-6 text-center text-sm text-gray-500">
              No matches for &ldquo;{trimmed}&rdquo;.
            </p>
          ) : (
            <ul className="space-y-1">
              {searchResults.map((result, idx) => (
                <li key={`${result.cfi}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => handleResultClick(result.cfi)}
                    className="block w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100"
                  >
                    <span
                      className="line-clamp-2"
                      // Search excerpts come from the engine and may contain
                      // special characters; escape with a text node.
                      dangerouslySetInnerHTML={{
                        __html: highlightExcerpt(result.excerpt, trimmed),
                      }}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
          {searchResults.length > 0
            ? `${searchResults.length} match${searchResults.length === 1 ? '' : 'es'}`
            : ' '}
        </div>
      </div>
    </>
  );
}

/**
 * Highlight occurrences of the query in the excerpt by wrapping them in
 * a <mark>. The excerpt is plain text from the engine (not HTML), so a
 * naive escape + replace is safe.
 */
function highlightExcerpt(text: string, query: string): string {
  const escaped = escapeHtml(text);
  if (!query) return escaped;
  const safeQuery = escapeRegExp(query);
  return escaped.replace(
    new RegExp(safeQuery, 'gi'),
    (match) => `<mark class="bg-yellow-200 text-gray-900">${match}</mark>`,
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
