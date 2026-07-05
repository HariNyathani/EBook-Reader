/**
 * EPUB metadata extraction types.
 *
 * This module defines the contract between the upload pipeline and the metadata extractor.
 * Phase 6 introduces the interface + a minimal fallback implementation.
 * Phase 7 swaps in the real extractor (streamZipExtractor) at the single binding point.
 *
 * FROZEN CONTRACT: The MetadataExtractor interface and EpubMetadata type must not change
 * shape — only the bound implementation changes between phases.
 */

/**
 * Extracted metadata from an EPUB file.
 */
export interface EpubMetadata {
  /** Book title (required — derived from OPF, form override, or filename). */
  title: string;
  /** Book author (nullable — may not be present in all EPUBs). */
  author: string | null;
  /** Cover image bytes (optional — Phase 6 fallback returns no cover; Phase 7 extracts). */
  cover?: {
    bytes: Uint8Array;
    contentType: string;
  };
}

/**
 * Input provided to the metadata extractor.
 */
export interface ExtractInput {
  /** The raw EPUB file bytes (bounded by MAX_UPLOAD_BYTES). */
  fileBytes: Uint8Array | ReadableStream;
  /** Original filename of the uploaded file. */
  filename: string;
  /** Optional title override from the admin form. */
  formTitle?: string;
  /** Optional author override from the admin form. */
  formAuthor?: string;
}

/**
 * Metadata extractor interface.
 *
 * The upload pipeline calls `activeExtractor.extract()` to obtain metadata.
 * Phase 6 binds `fallbackExtractor` (filename → title, form → author, no cover).
 * Phase 7 binds `streamZipExtractor` (real OPF parsing + cover extraction).
 *
 * Implementations MUST be server-only (import 'server-only').
 */
export interface MetadataExtractor {
  extract(input: ExtractInput): Promise<EpubMetadata>;
}
