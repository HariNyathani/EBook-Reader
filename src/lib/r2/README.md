# lib/r2 — Cloudflare R2 Object Storage Client

## Status: Placeholder — populated in Phase 2

This directory will contain the S3-compatible client for Cloudflare R2 with:

- `client.ts` — memoized `S3Client` factory (server-only)
- `operations.ts` — `putObject`, `getObjectStream`, `deleteObject`, `getSignedReadUrl`
- `errors.ts` — typed error classes (`R2NotFoundError`, `R2AccessError`, `R2UnknownError`)
- `index.ts` — barrel (exports operations + errors, **not** the raw client)

## Key Design Principles (from SAD §1, §2)

- **Keys only, never URLs** — all functions accept object keys (e.g. `epubs/abc-123.epub`), never full S3 URLs. URLs are constructed at the call site or via `getSignedReadUrl`.
- **Strictly private bucket** — `epub-reader-assets` has no public access. All delivery goes through signed URLs (covers) or streaming Route Handlers (EPUBs).
- **Stream, don't buffer** — `getObjectStream` returns a web `ReadableStream` to avoid memory spikes in serverless environments.

## Intended Consumers

- `GET /api/books/[id]/file` Route Handler — streams EPUB bytes using `getObjectStream`
- `GET /api/covers/[id]` Route Handler — short-lived signed URL via `getSignedReadUrl`
- Admin upload Server Action — stores files via `putObject`
- Upload rollback — removes orphaned objects via `deleteObject`
