# EPUB Processing & Metadata Extraction

This module implements EPUB metadata extraction and cover image processing for the upload pipeline.

## Overview

The `streamZipExtractor` is the active metadata extractor (Phase 7). It parses EPUB files using `node-stream-zip`, extracts metadata from OPF files using `fast-xml-parser`, and normalizes cover images to JPEG using `sharp`.

## Architecture

### Extractor Seam (ISD §5·0.2 A)

The upload pipeline uses the `MetadataExtractor` interface defined in `types.ts`. The active extractor is bound in `index.ts`:

```typescript
export const activeExtractor: MetadataExtractor = streamZipExtractor;
```

This is the **single swap point** — the upload action imports `activeExtractor` and doesn't need to change when the implementation is swapped.

### Components

- **`stream-zip-extractor.ts`** — Main extractor implementation
  - Uses `node-stream-zip` to read EPUB without extracting to disk
  - Validates EPUB structure (mimetype, container.xml, no encryption)
  - Parses OPF to extract title, author, and cover href
  - Extracts and normalizes cover image to JPEG
  - Applies form overrides (title/author take precedence)
  - Always closes zip handle (finally block) to prevent FD leaks

- **`opf.ts`** — OPF and container.xml parsing
  - `parseContainer()` — Extracts OPF path from META-INF/container.xml
  - `parseOpf()` — Extracts title, author, and cover href from OPF
  - Supports both EPUB2 (`<meta name="cover">`) and EPUB3 (`properties="cover-image"`)
  - Resolves relative cover paths correctly
  - XXE-safe: `processEntities: false` prevents external entity injection

- **`cover.ts`** — Cover image normalization
  - `normalizeCoverToJpeg()` — Transcodes cover to JPEG using `sharp`
  - Max width: 800px (without enlargement)
  - JPEG quality: 80
  - Auto-rotates based on EXIF orientation
  - Strips potentially malicious embedded payloads

- **`validate.ts`** — EPUB structure validation
  - `assertValidEpub()` — Verifies mimetype, container.xml, no encryption.xml
  - `validateZipEntryPath()` — Prevents path traversal attacks

- **`errors.ts`** — Error hierarchy
  - `EpubError` — Base class
  - `EpubInvalidError` — Invalid EPUB structure
  - `EpubEncryptedError` — DRM/encrypted EPUB
  - `EpubParseError` — OPF/XML parse failure

## Security (ISD §7.Z)

- **XXE Defense**: `fast-xml-parser` configured with `processEntities: false`
- **DRM Rejection**: Detects `META-INF/encryption.xml` and throws `EpubEncryptedError`
- **Path Traversal Prevention**: Validates all zip entry paths
- **Cover Re-encoding**: `sharp` transcodes covers, stripping malicious payloads
- **Zip-Bomb Defense**: Bounded by `MAX_UPLOAD_BYTES`

## Performance (ISD §7.Y)

- **Streaming**: Reads only container.xml, OPF, and cover entry (no full extraction)
- **Single Zip Handle**: Opens once, closes in finally block
- **Cover Optimization**: Resized to max 800px width

## Runtime Requirements

- **Node.js runtime only** (not Edge)
- `sharp` native binary must be available in deploy environment
- `node-stream-zip` and `fast-xml-parser` are server-only dependencies

## Usage

The upload action (`src/features/admin/upload/actions.ts`) calls:

```typescript
const meta = await activeExtractor.extract({
  fileBytes,
  filename: file.name,
  formTitle, // optional override
  formAuthor, // optional override
});
```

Error mapping:

- `EpubInvalidError` / `EpubEncryptedError` → `fail('INVALID_FILE')`
- `EpubParseError` → `fail('INVALID_FILE')`
- Cover extraction failure → dropped gracefully (book still created)

## Testing

Unit tests in `tests/unit/epub-extractor.test.ts` cover:

- OPF parsing (EPUB2 and EPUB3 cover detection)
- Container.xml parsing
- Form override precedence
- XXE safety
- Error handling (invalid/encrypted/corrupt EPUBs)
- Zip handle cleanup (no FD leaks)

Test fixtures are generated dynamically using `archiver` (see `tests/helpers/epub-factory.ts`).

## Fallback Extractor

The `fallbackExtractor` is retained for tests and emergency use. It derives title from filename and takes author from form override (no cover extraction).

## Future Work

- TOC/nav parsing (future phase)
- Full-text indexing/search (future phase)
- Non-EPUB formats (SAD §7 future)
