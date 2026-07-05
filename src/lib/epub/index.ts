import 'server-only';

import type { MetadataExtractor } from './types';
import { fallbackExtractor } from './fallback-extractor';

// ============================================================================
// ⚠️ SINGLE SWAP POINT — Phase 7 replaces this binding
// ============================================================================
//
// This is the ONLY place where the active metadata extractor is bound.
// The upload pipeline (uploadBookAction) imports `activeExtractor` from this module.
//
// Phase 6: activeExtractor = fallbackExtractor (filename → title, form → author, no cover)
// Phase 7: activeExtractor = streamZipExtractor (real OPF parsing + cover extraction)
//
// When swapping, DO NOT change the type (MetadataExtractor) or the export name.
// The fallback remains exported for use in tests or emergency fallback.
//
// ============================================================================

/**
 * The active metadata extractor used by the upload pipeline.
 * Currently bound to the Phase 6 fallback (no real EPUB parsing).
 *
 * Phase 7 will swap this to streamZipExtractor without touching any consumer code.
 */
export const activeExtractor: MetadataExtractor = fallbackExtractor;

// Re-export types for convenience
export type { EpubMetadata, ExtractInput, MetadataExtractor } from './types';
export { fallbackExtractor } from './fallback-extractor';
