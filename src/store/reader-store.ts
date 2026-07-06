'use client';

/**
 * Reader store — state shape per SAD §5.2/§5.3.
 *
 * Phase 9 (ISD §9.C Decision C): Additively extended with the full durable typography/theme shape
 * (fontFamily, lineHeight, textAlign). These fields are consumed by useReaderEngine to inject
 * styles into the engine via setStyles(). Phase 12 will add persistence (zustand persist).
 *
 * Phase 10 (ISD §10.O): Added transient `lastSavedAt` and `syncState` for the progress indicator.
 *
 * Phase 11 (ISD §11.H): Additively added navigation/search state:
 *   - searchResults: SearchResult[] (in-book search results, populated by search panel)
 *   - searchState: 'idle' | 'searching' | 'error' (search panel state)
 *   - activeChapterHref: string | null (current chapter, derived from relocate events)
 *   - Setters for the above.
 *
 * Phase 12 (ISD §12.J): Wraps the durable preference slice with zustand `persist` middleware
 * (partialize ensures only theme/fontSize/etc. are persisted, NOT transient state like
 * currentCfi/isReady/toc/fraction/searchResults/searchState/activeChapterHref/lastSavedAt/syncState).
 *
 * The PUBLIC SHAPE of this store is FROZEN — later phases add behavior without renaming.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { TocItem, SearchResult } from '@/features/reader/engine/types';
import type { ReaderPreferences } from '@/features/preferences/schema';
import { migratePreferences, PREFERENCES_VERSION } from '@/features/preferences/migrate';
import { DEFAULT_READER_PREFERENCES } from '@/features/preferences/schema';

type Theme = 'light' | 'sepia' | 'dark';
type TextAlign = 'start' | 'justify';

/**
 * Search panel state.
 * 'idle' — no search in progress
 * 'searching' — actively searching
 * 'error' — last search failed
 */
export type SearchState = 'idle' | 'searching' | 'error';

/**
 * Sync indicator state (Phase 10).
 * 'idle' — nothing pending
 * 'saving' — save in progress
 * 'offline' — pending in offline queue
 * 'error' — last save failed
 */
export type SyncState = 'idle' | 'saving' | 'offline' | 'error';

interface ReaderState {
  /** Current reader theme. */
  theme: Theme;
  /** Font size in pixels. */
  fontSize: number;
  /** Horizontal margin as a percentage (0–100). */
  margin: number;
  /** Current EPUB CFI position string, or null before first navigation. */
  currentCfi: string | null;
  /** True once the Foliate iframe has loaded and is ready for commands. */
  isReady: boolean;

  // Phase 9 additions (ISD §9.C Decision C): Durable typography fields.

  /** Font family (CSS value, e.g., 'Georgia, serif'). */
  fontFamily: string;
  /** Line height (unitless multiplier, e.g., 1.5). */
  lineHeight: number;
  /** Text alignment ('start' for left-aligned, 'justify' for justified). */
  textAlign: TextAlign;
  /** Column layout preference ('auto', '1', or '2'). */
  columns: 'auto' | '1' | '2';

  // Phase 9 additions: Transient navigation state (populated by engine).

  /** Table of contents (populated on 'ready' event). */
  toc: TocItem[];
  /** Current reading fraction (0..1, populated on 'relocate' event). */
  fraction: number;

  // Phase 10 additions (ISD §10.O): Transient sync indicator state.

  /** ISO timestamp of the last successful save (server or beacon). */
  lastSavedAt: string | null;
  /** Current sync state (for the Phase-11 progress-bar indicator). */
  syncState: SyncState;

  // Phase 11 additions (ISD §11.H): In-book search and chapter nav state.

  /** Current search query (empty string if no active search). */
  searchQuery: string;
  /** Search results from the engine (cleared on query change). */
  searchResults: SearchResult[];
  /** Current search state. */
  searchState: SearchState;
  /** Current chapter href (set from relocate event chapterHref). */
  activeChapterHref: string | null;
}

interface ReaderActions {
  setTheme: (theme: Theme) => void;
  setFontSize: (size: number) => void;
  setMargin: (margin: number) => void;
  setCurrentCfi: (cfi: string | null) => void;
  setIsReady: (ready: boolean) => void;
  /** Resets all reader state to defaults (called when leaving the reader). */
  reset: () => void;

  // Phase 9 additions: Typography setters.
  setFontFamily: (fontFamily: string) => void;
  setLineHeight: (lineHeight: number) => void;
  setTextAlign: (textAlign: TextAlign) => void;
  setColumns: (columns: 'auto' | '1' | '2') => void;

  // Phase 9 additions: Transient navigation setters (populated by engine).
  setToc: (toc: TocItem[]) => void;
  setFraction: (fraction: number) => void;

  // Phase 10 additions: Sync indicator setters.
  setLastSavedAt: (timestamp: string | null) => void;
  setSyncState: (state: SyncState) => void;

  // Phase 11 additions: Search and chapter setters.
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: SearchResult[]) => void;
  appendSearchResults: (results: SearchResult[]) => void;
  clearSearchResults: () => void;
  setSearchState: (state: SearchState) => void;
  setActiveChapterHref: (href: string | null) => void;
}

const DEFAULT_STATE: ReaderState = {
  theme: 'light',
  fontSize: 20,
  margin: 0,
  currentCfi: null,
  isReady: false,
  // Phase 9 defaults for typography
  fontFamily: 'Bookerly, "Amazon Ember", Georgia, serif',
  lineHeight: 1.5,
  textAlign: 'justify',
  columns: 'auto',
  // Phase 9 transient state defaults
  toc: [],
  fraction: 0,
  // Phase 10 sync state defaults
  lastSavedAt: null,
  syncState: 'idle',
  // Phase 11 search/nav defaults
  searchQuery: '',
  searchResults: [],
  searchState: 'idle',
  activeChapterHref: null,
};

/**
 * The keys of the durable preference slice (Phase 12 persistence).
 * Only these fields are persisted to localStorage; transient state
 * (currentCfi, isReady, toc, fraction, sync/lastSavedAt, search,
 * activeChapterHref) is excluded.
 */
const PREFERENCE_KEYS = [
  'theme',
  'fontFamily',
  'fontSize',
  'lineHeight',
  'margin',
  'textAlign',
  'columns',
] as const satisfies ReadonlyArray<keyof ReaderState>;

/**
 * Phase 12 (ISD §12.J): zustand `persist` middleware.
 *
 * - `name`: localStorage key.
 * - `partialize`: ONLY the durable preference slice is persisted.
 *   Transient state (currentCfi, isReady, toc, fraction, lastSavedAt,
 *   syncState, search*, activeChapterHref) is explicitly excluded.
 * - `version`: PREFERENCES_VERSION (incremented on schema changes).
 * - `migrate`: upgrades older shapes; falls back to defaults on corruption.
 * - `storage`: localStorage (default behaviour is fine; pinned explicitly
 *   for SSR safety — zustand's persist is safe in SSR because it
 *   no-ops on the server).
 */
export const useReaderStore = create<ReaderState & ReaderActions>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,

      setTheme: (theme) => set({ theme }),
      setFontSize: (fontSize) => set({ fontSize }),
      setMargin: (margin) => set({ margin }),
      setCurrentCfi: (currentCfi) => set({ currentCfi }),
      setIsReady: (isReady) => set({ isReady }),
      // Phase 9 typography setters
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setLineHeight: (lineHeight) => set({ lineHeight }),
      setTextAlign: (textAlign) => set({ textAlign }),
      setColumns: (columns) => set({ columns }),
      // Phase 9 transient setters
      setToc: (toc) => set({ toc }),
      setFraction: (fraction) => set({ fraction }),
      // Phase 10 sync indicator setters
      setLastSavedAt: (lastSavedAt) => set({ lastSavedAt }),
      setSyncState: (syncState) => set({ syncState }),
      // Phase 11 search setters
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setSearchResults: (searchResults) => set({ searchResults }),
      appendSearchResults: (searchResults) =>
        set((s) => ({ searchResults: [...s.searchResults, ...searchResults] })),
      clearSearchResults: () => set({ searchResults: [], searchState: 'idle' }),
      setSearchState: (searchState) => set({ searchState }),
      setActiveChapterHref: (activeChapterHref) => set({ activeChapterHref }),
      reset: () => set(DEFAULT_STATE),
    }),
    {
      name: 'reader-preferences',
      storage: createJSONStorage(() => {
        // Defensive: never run localStorage on the server. Zustand's persist
        // already no-ops there, but we wrap anyway to be safe (and to make
        // this explicit for SSR).
        if (typeof window === 'undefined') {
          // Return a noop storage that satisfies the API.
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
          };
        }
        return window.localStorage;
      }),
      version: PREFERENCES_VERSION,
      // Only the durable preference slice persists.
      // Anything not in this list is treated as transient and excluded.
      partialize: (state): Partial<ReaderPreferences> => {
        const partial: Partial<ReaderPreferences> = {};
        for (const key of PREFERENCE_KEYS) {
          // The cast is safe because PREFERENCE_KEYS is a frozen list of
          // keys that exist on both ReaderState and ReaderPreferences.
          (partial as Record<string, unknown>)[key] = state[key];
        }
        return partial;
      },
      // On load, run migration. If the stored blob is invalid/corrupt, the
      // migrate util falls back to defaults (never throws).
      migrate: (persistedState) => {
        return migratePreferences(persistedState) as ReaderState;
      },
      // On rehydrate, fill in any fields missing from localStorage with
      // the defaults — so a partial blob doesn't crash the app.
      merge: (persistedState, currentState) => {
        // Sanitize the persisted slice through the same validating
        // migration used on version bumps. zustand only invokes `migrate`
        // when the persisted version differs from the current version, so
        // without this a corrupt SAME-version blob (e.g. an out-of-range
        // fontSize or an unknown theme injected into localStorage) would be
        // applied verbatim. Running migratePreferences here guarantees
        // invalid stored data falls back to defaults on every load
        // (ISD §12.CC #4 / §12.AA), field-by-field.
        const sanitized = migratePreferences(persistedState ?? {});
        // Start from defaults, then layer on current transient state, then
        // the sanitized durable slice. This ensures every key is present.
        return {
          ...DEFAULT_STATE,
          ...currentState,
          ...sanitized,
        } as ReaderState & ReaderActions;
      },
    },
  ),
);

// Re-export the default preferences for convenience.
export { DEFAULT_READER_PREFERENCES };
