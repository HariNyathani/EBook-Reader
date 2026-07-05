# EPUB Processing Module

## Responsibility Boundary

This module handles EPUB metadata extraction — parsing EPUB containers to extract Title, Author, and Cover image for cataloging.

## Architecture

### Metadata Extractor Seam

Phase 6 introduces the `MetadataExtractor` interface and a minimal fallback implementation. Phase 7 swaps in the real extractor (streamZipExtractor) at the single binding point.

**Single Swap Point**: `src/lib/epub/index.ts` exports `activeExtractor: MetadataExtractor`.

The upload pipeline (`uploadBookAction`) imports `activeExtractor` from this module. When swapping extractors, only `index.ts` changes — no consumer code is modified.

### Current Implementation (Phase 6)

- **`fallbackExtractor`**: Derives title from filename (or form override), takes author from form override (or null). Extracts NO cover.
- Used until Phase 7 implements real EPUB parsing.

### Phase 7 Implementation (TODO)

- **`streamZipExtractor`**: Real OPF parsing + cover extraction using `node-stream-zip`.
- Extracts Title/Author from EPUB metadata, normalizes cover to JPEG.
- Form Title/Author become optional overrides (take precedence when provided).

## Files

```
lib/epub/
├── types.ts                    # MetadataExtractor interface, EpubMetadata type
├── fallback-extractor.ts       # Phase 6 fallback (filename → title, no cover)
└── index.ts                    # activeExtractor binding (SINGLE SWAP POINT)
```

## Cross-Feature Dependencies

- Consumed by `@/features/admin/upload/actions.ts` — `uploadBookAction` calls `activeExtractor.extract()`.

## Security

- All extractors are server-only (`import 'server-only'`).
- Never bundled to client.
- Phase 7 will validate EPUB structure before parsing (reject DRM/encrypted archives).
