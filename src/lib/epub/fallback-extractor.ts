import 'server-only';

import type { MetadataExtractor, EpubMetadata, ExtractInput } from './types';

/**
 * Derives a human-readable title from a filename.
 * Strips extension, replaces hyphens/underscores with spaces, trims.
 *
 * @param filename - e.g. "my-great-book.epub" → "my great book"
 */
export function deriveTitleFromFilename(filename: string): string {
  // Strip extension
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  // Replace hyphens and underscores with spaces, collapse multiple spaces
  return withoutExt.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled';
}

/**
 * Fallback metadata extractor — Phase 6.
 *
 * Minimal implementation: derives title from filename (or form override),
 * takes author from form override (or null). Extracts NO cover.
 *
 * This is the default binding for `activeExtractor` until Phase 7
 * swaps in the real OPF-based extractor.
 */
export const fallbackExtractor: MetadataExtractor = {
  async extract(input: ExtractInput): Promise<EpubMetadata> {
    const title = input.formTitle?.trim() || deriveTitleFromFilename(input.filename);
    const author = input.formAuthor?.trim() || null;

    return {
      title,
      author,
      // No cover extracted — Phase 7 adds cover extraction.
    };
  },
};
