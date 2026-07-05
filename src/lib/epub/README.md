# lib/epub — EPUB Metadata & Parsing Utilities

## Status: Placeholder — populated in a later phase

This directory will contain server-side EPUB processing utilities using `node-stream-zip`:

- Extract `OPF` metadata (title, author, cover image) from an uploaded EPUB
- Used during the admin upload pipeline to auto-populate `books.title`, `books.author`, `books.cover_key`

## Planned Files

- `metadata.ts` — `extractEpubMetadata(fileBuffer): Promise<EpubMetadata>` (server-only)

## Dependencies

- `node-stream-zip` — installed in the upload pipeline phase

## Notes

- This module is **server-only** — never imported by client code.
- The actual `foliate-js` rendering engine is a vendored client asset, not an npm package. It lives in `public/foliate-js/` and is loaded via iframe in the reader feature (Phase 5).
