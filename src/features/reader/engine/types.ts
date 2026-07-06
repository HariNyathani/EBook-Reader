/**
 * ReaderEngine interface — format-agnostic abstraction over EPUB/PDF/CBZ renderers.
 *
 * ISD §9.F: This is the isolation contract between React and the rendering engine.
 * React must NEVER directly access the engine's iframe/DOM. All communication flows
 * through this interface via the useReaderEngine hook.
 *
 * SAD §5.1: Strict React↔engine boundary. React state (reader-store) is the single
 * source of truth for UI; the engine is an imperative black box that React controls
 * via commands (open/next/prev/goTo/setStyles) and observes via events (ready/relocate/error).
 *
 * SAD §7: This interface is extensible for future formats (PDF, CBZ) via the
 * createReaderEngine factory. Each format implements the same interface.
 */

/**
 * Reader theme identifier.
 * Mapped to CSS variables by the styles-mapper (src/features/reader/lib/styles-mapper.ts).
 */
export type ReaderTheme = 'light' | 'sepia' | 'dark';

/**
 * Text alignment options for the reader.
 */
export type ReaderTextAlign = 'start' | 'justify';

/**
 * Durable reader style parameters.
 * Injected into the engine via setStyles() as CSS variables.
 *
 * ISD §9.C (Decision C): These fields are stored in reader-store and persisted
 * in Phase 12. Phase 9 defines the shape; Phase 11 wires controls; Phase 12 wires persistence.
 */
export interface ReaderStyle {
  theme: ReaderTheme;
  fontFamily: string;
  fontSizePx: number;
  lineHeight: number;
  marginPct: number;
  textAlign: ReaderTextAlign;
  columns: 'auto' | '1' | '2';
}

/**
 * Current reading location within the book.
 * Emitted by the engine on navigation (relocate event).
 */
export interface ReaderLocation {
  /** EPUB CFI (Canonical Fragment Identifier) for precise position. */
  cfi: string;
  /** Overall reading fraction (0..1) for progress calculation. */
  fraction: number;
  /** Current chapter/spine item href (optional, for TOC highlighting). */
  chapterHref?: string;
}

/**
 * Table of Contents entry.
 * Populated by the engine on the 'ready' event.
 */
export interface TocItem {
  /** Display label (chapter title). */
  label: string;
  /** href to navigate to (passed to engine.goTo). */
  href: string;
  /** Nested children (for multi-level TOCs). */
  children?: TocItem[];
}

/**
 * Search result within the book.
 * Returned by engine.search() as an async iterable.
 */
export interface SearchResult {
  /** CFI of the match location. */
  cfi: string;
  /** Text excerpt surrounding the match. */
  excerpt: string;
  /** Chapter href where the match was found. */
  chapterHref?: string;
}

/**
 * Events emitted by the engine via the on() subscription.
 * React consumes these in the useReaderEngine hook and maps them to reader-store updates.
 */
export type ReaderEngineEvent =
  | {
    type: 'ready';
    /** Table of contents (empty if the book has no TOC). */
    toc: TocItem[];
    /** Total reading fraction denominator (for progress calculation). */
    totalFraction: number;
  }
  | {
    type: 'relocate';
    /** Current reading location. */
    location: ReaderLocation;
  }
  | {
    type: 'error';
    /** Error that occurred during load or rendering. */
    error: Error;
  };

/**
 * ReaderEngine interface — the contract for all format-specific adapters.
 *
 * Lifecycle:
 * 1. Construct the engine (via createReaderEngine factory)
 * 2. Call open(source) to load the book
 * 3. Subscribe to events via on()
 * 4. Send commands (next/prev/goTo/setStyles) as the user interacts
 * 5. Call destroy() on unmount to release resources
 *
 * The engine is imperative (not reactive). React wraps it in useReaderEngine
 * to bridge between the imperative engine and reactive Zustand state.
 */
export interface ReaderEngine {
  /**
   * Opens a book from a Blob or objectURL string.
   * Resolves when the book is loaded and ready for interaction.
   * Emits a 'ready' event on success, 'error' on failure.
   */
  open(source: Blob | string): Promise<void>;

  /**
   * Destroys the engine and releases all resources (iframe, blob URLs, listeners).
   * Must be called on React unmount to prevent leaks.
   */
  destroy(): void;

  /**
   * Navigates to the next page/spread.
   */
  next(): void;

  /**
   * Navigates to the previous page/spread.
   */
  prev(): void;

  /**
   * Navigates to a target (CFI string or href).
   * Resolves when navigation is complete.
   */
  goTo(target: string): Promise<void>;

  /**
   * Injects CSS variables for styling.
   * Called by useReaderEngine when reader-store typography/theme state changes.
   */
  setStyles(style: ReaderStyle): void;

  /**
   * Searches the book for a query string.
   * Returns an async iterable of search results (consumed in Phase 11).
   */
  search(query: string): AsyncIterable<SearchResult>;

  /**
   * Subscribes to engine events.
   * Returns an unsubscribe function.
   * React uses this in useReaderEngine to bridge events → reader-store.
   */
  on(handler: (e: ReaderEngineEvent) => void): () => void;
}

/**
 * Supported book formats.
 * ISD §9.A: Only 'epub' is implemented in Phase 9. The factory pattern allows
 * future formats (PDF, CBZ) per SAD §7 without changing the React layer.
 */
export type BookFormat = 'epub';

/**
 * Error thrown when the reader fails to load the book.
 * Surfaced by the reader error boundary (src/app/(app)/reader/[bookId]/error.tsx).
 */
export class ReaderLoadError extends Error {
  constructor(
    message: string,
    public readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'NETWORK' | 'CORRUPT',
  ) {
    super(message);
    this.name = 'ReaderLoadError';
  }
}
