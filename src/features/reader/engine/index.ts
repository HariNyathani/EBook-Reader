/**
 * ReaderEngine factory — creates format-specific engine adapters.
 *
 * ISD §9.F: This is the seam for SAD §7 format extensibility. Currently only 'epub'
 * is implemented (FoliateEngine). Future formats (PDF, CBZ) will add branches here
 * without changing the React layer.
 *
 * Usage:
 *   const engine = createReaderEngine('epub', containerRef.current);
 *   await engine.open(blobOrUrl);
 */

import type { BookFormat, ReaderEngine } from './types';
import { FoliateEngine } from './foliate-engine';

/**
 * Creates a ReaderEngine adapter for the given format.
 *
 * @param format - The book format ('epub' only in Phase 9)
 * @param container - The HTMLElement to mount the reader into
 * @returns A ReaderEngine instance
 * @throws Error if the format is not supported
 */
export function createReaderEngine(format: BookFormat, container: HTMLElement): ReaderEngine {
  switch (format) {
    case 'epub':
      return new FoliateEngine(container);
    default:
      throw new Error(`Unsupported book format: ${format}. Only 'epub' is currently supported.`);
  }
}

// Re-export types for convenience
export type { ReaderEngine, BookFormat } from './types';
export { FoliateEngine } from './foliate-engine';
