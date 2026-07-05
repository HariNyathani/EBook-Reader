'use client';

/**
 * Reader store — state shape per SAD §5.2/§5.3.
 *
 * Phase 9 (ISD §9.C Decision C): Additively extended with the full durable typography/theme shape
 * (fontFamily, lineHeight, textAlign). These fields are consumed by useReaderEngine to inject
 * styles into the engine via setStyles(). Phase 12 will add persistence (zustand persist).
 *
 * ISD §9.B: Transient fields (toc, fraction, currentCfi, isReady) are populated by the engine
 * via useReaderEngine and reset on unmount. Durable fields (theme, fontFamily, fontSize,
 * lineHeight, margin, textAlign) will be persisted in Phase 12.
 *
 * The PUBLIC SHAPE of this store is FROZEN — later phases add behavior without renaming.
 */

import { create } from 'zustand';
import type { TocItem } from '@/features/reader/engine/types';

type Theme = 'light' | 'sepia' | 'dark';
type TextAlign = 'start' | 'justify';

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
  // These are consumed by useReaderEngine to inject styles into the engine.
  // Phase 12 will add persistence.

  /** Font family (CSS value, e.g., 'Georgia, serif'). */
  fontFamily: string;
  /** Line height (unitless multiplier, e.g., 1.5). */
  lineHeight: number;
  /** Text alignment ('start' for left-aligned, 'justify' for justified). */
  textAlign: TextAlign;

  // Phase 9 additions: Transient navigation state (populated by engine).

  /** Table of contents (populated on 'ready' event). */
  toc: TocItem[];
  /** Current reading fraction (0..1, populated on 'relocate' event). */
  fraction: number;
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
  /** Set the font family (CSS value). */
  setFontFamily: (fontFamily: string) => void;
  /** Set the line height (unitless multiplier). */
  setLineHeight: (lineHeight: number) => void;
  /** Set the text alignment ('start' or 'justify'). */
  setTextAlign: (textAlign: TextAlign) => void;

  // Phase 9 additions: Transient navigation setters (populated by engine).
  /** Set the table of contents (populated on 'ready' event). */
  setToc: (toc: TocItem[]) => void;
  /** Set the current reading fraction (0..1, populated on 'relocate' event). */
  setFraction: (fraction: number) => void;
}

const DEFAULT_STATE: ReaderState = {
  theme: 'light',
  fontSize: 18,
  margin: 20,
  currentCfi: null,
  isReady: false,
  // Phase 9 defaults for typography
  fontFamily: 'Georgia, serif',
  lineHeight: 1.5,
  textAlign: 'start',
  // Phase 9 transient state defaults
  toc: [],
  fraction: 0,
};

export const useReaderStore = create<ReaderState & ReaderActions>()((set) => ({
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
  // Phase 9 transient setters
  setToc: (toc) => set({ toc }),
  setFraction: (fraction) => set({ fraction }),
  reset: () => set(DEFAULT_STATE),
}));
