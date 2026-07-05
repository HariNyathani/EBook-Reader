'use client';

/**
 * Reader store — state shape per SAD §5.2/§5.3.
 *
 * WIRING NOTES (future phases):
 * - Phase 5: wire `currentCfi` persistence to IndexedDB via idb-keyval on change.
 * - Phase 5: wire `theme`/`fontSize`/`margin` persistence to localStorage.
 * - Phase 5: implement Foliate integration — `isReady` toggled by the iframe load event.
 * - Phase 5+: offline queue (SYNC_READING_PROGRESS) triggered on `currentCfi` change.
 *
 * The PUBLIC SHAPE of this store is FROZEN — later phases add behavior without renaming.
 */

import { create } from 'zustand';

type Theme = 'light' | 'sepia' | 'dark';

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
}

interface ReaderActions {
  setTheme: (theme: Theme) => void;
  setFontSize: (size: number) => void;
  setMargin: (margin: number) => void;
  setCurrentCfi: (cfi: string | null) => void;
  setIsReady: (ready: boolean) => void;
  /** Resets all reader state to defaults (called when leaving the reader). */
  reset: () => void;
}

const DEFAULT_STATE: ReaderState = {
  theme: 'light',
  fontSize: 18,
  margin: 20,
  currentCfi: null,
  isReady: false,
};

export const useReaderStore = create<ReaderState & ReaderActions>()((set) => ({
  ...DEFAULT_STATE,

  setTheme: (theme) => set({ theme }),
  setFontSize: (fontSize) => set({ fontSize }),
  setMargin: (margin) => set({ margin }),
  setCurrentCfi: (currentCfi) => set({ currentCfi }),
  setIsReady: (isReady) => set({ isReady }),
  reset: () => set(DEFAULT_STATE),
}));
