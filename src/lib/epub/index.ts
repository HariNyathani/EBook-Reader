import 'server-only';

import type { MetadataExtractor } from './types';
import { streamZipExtractor } from './stream-zip-extractor';

// ============================================================================
// ⚠️ ACTIVE EXTRACTOR BINDING — Phase 7 SWAP COMPLETE
// ============================================================================
//
// This is the ONLY place where the active metadata extractor is bound.
// The upload pipeline (uploadBookAction) imports `activeExtractor` from this module.
//
// Phase 6: activeExtractor = fallbackExtractor (filename → title, form → author, no cover)
// Phase 7: activeExtractor = streamZipExtractor (real OPF parsing + cover extraction)
//
// The fallback remains exported for use in tests or emergency fallback.
//
// ============================================================================

/**
 * The active metadata extractor used by the upload pipeline.
 *
 * Currently bound to the real OPF-based extractor (Phase 7).
 * - Parses META-INF/container.xml → OPF
 * - Extracts Title, Author, and Cover image
 * - Normalizes cover to JPEG via sharp
 * - Validates EPUB structure (rejects invalid/DRM archives)
 *
 * If you need to revert to the fallback (emergency), change this binding to:
 *   export const activeExtractor: MetadataExtractor = fallbackExtractor;
 */
export const activeExtractor: MetadataExtractor = streamZipExtractor;

// Re-export types for convenience
export type { EpubMetadata, ExtractInput, MetadataExtractor } from './types';
export { fallbackExtractor } from './fallback-extractor';
export { streamZipExtractor } from './stream-zip-extractor';

// Re-export error types for consumers (upload action maps them to ActionResult)
export { EpubError, EpubInvalidError, EpubEncryptedError, EpubParseError } from './errors';
