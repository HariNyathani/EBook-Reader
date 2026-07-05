# Reader Feature — Implementation Notes

## Overview

The Reader feature implements a secure, isolated EPUB reading experience using foliate-js as the rendering engine. The architecture enforces a strict boundary between React and the engine (SAD §5.1).

## Architecture

### Isolation Boundary (SAD §5.1)

React **never** directly reads or writes the reader's iframe DOM. All communication flows through:

```
React (reader-store) ←→ useReaderEngine ←→ ReaderEngine ←→ FoliateEngine ←→ <foliate-view> (iframe)
```

- **ReaderEngine** interface (`engine/types.ts`): Format-agnostic contract
- **FoliateEngine** (`engine/foliate-engine.ts`): Adapter wrapping `<foliate-view>`
- **useReaderEngine** (`hooks/use-reader-engine.ts`): Sole React↔engine bridge
- **reader-store** (`store/reader-store.ts`): React state source of truth

### Engine Lifecycle

1. ReaderView mounts → `containerRef` created
2. `useReaderEngine` → `createReaderEngine('epub', container)` → `FoliateEngine`
3. `fetchBookBlob(bookId)` → Blob → `URL.createObjectURL()` → `engine.open(objectURL)`
4. Engine emits `ready` → store `isReady = true`, TOC populated
5. Engine emits `relocate` → store `currentCfi`, `fraction` updated
6. Store typography changes → `engine.setStyles()` (CSS variable injection)
7. Unmount → unsubscribe → `engine.destroy()` → `URL.revokeObjectURL()`

### Style Injection (SAD §5.2)

Typography/theme changes flow: `reader-store` → `mapStateToStyle()` → `mapStyleToCssVars()` → `engine.setStyles()` → CSS variables applied to iframe content.

### Vendored foliate-js

- **Location**: `src/vendor/foliate-js/`
- **Documentation**: `VENDOR.md` (source URL, commit hash, license)
- **Types**: `foliate.d.ts` (hand-authored ambient declarations)
- **Loading**: Client-only via `next/dynamic` with `ssr: false`
- **Security**: Sandboxed iframe; React never accesses the DOM directly

### CSP Configuration

- `frame-src 'self' blob:` — permits foliate's sandboxed iframe (blob URL)
- `img-src 'self' data: blob:` — permits EPUB images (blob URLs from ZIP entries)
- Configured in `src/lib/http/headers.ts` (securityHeaders function)

## File Structure

```
src/features/reader/
├── engine/
│   ├── types.ts              # ReaderEngine interface (frozen contract)
│   ├── foliate-engine.ts     # FoliateEngine adapter
│   └── index.ts              # createReaderEngine factory
├── hooks/
│   └── use-reader-engine.ts  # Sole React↔engine bridge
├── lib/
│   ├── fetch-book-blob.ts    # Download EPUB → Blob → objectURL
│   └── styles-mapper.ts      # State → CSS variables
├── components/
│   ├── reader-view.tsx       # Client container (mounts engine)
│   └── reader-view.dynamic.ts # Dynamic import wrapper (ssr: false)
└── README.md                 # This file

src/vendor/foliate-js/
├── foliate-view.js           # Vendored custom element
├── foliate.d.ts              # Ambient TypeScript declarations
└── VENDOR.md                 # Vendoring documentation
```

## State Management (reader-store)

### Durable Fields (Phase 12 persistence)
- `theme`: 'light' | 'sepia' | 'dark'
- `fontFamily`: string (CSS value)
- `fontSize`: number (pixels)
- `lineHeight`: number (unitless)
- `margin`: number (percentage)
- `textAlign`: 'start' | 'justify'

### Transient Fields (populated by engine)
- `currentCfi`: string | null
- `isReady`: boolean
- `toc`: TocItem[]
- `fraction`: number (0..1)

## Phase 9 Scope

✅ ReaderEngine interface + FoliateEngine adapter
✅ useReaderEngine hook (event↔store bridge)
✅ ReaderView component (client-only, dynamic import)
✅ Additive reader-store extension (typography fields)
✅ Style injection pipeline (theme/typography → CSS vars)
✅ Temporary prev/next navigation (Phase 11 adds chrome)
✅ CSP extended (blob: for frame-src, img-src)
✅ Vendored foliate-js with ambient types

## Out of Scope (later phases)

- Phase 10: Progress persistence, resume reading, offline queue
- Phase 11: Chrome (toolbar, progress bar), TOC drawer, search, tap zones, gestures
- Phase 12: Typography persistence (zustand persist), cloud sync

## Security

- EPUB fetched with `credentials: 'include'` (cookie auth)
- Bytes held only as ephemeral Blob/objectURL, revoked on unmount
- foliate renders in **sandboxed iframe** — sandbox attribute is NOT removed
- React never injects into or reads the iframe DOM (prevents XSS bridge)
- No book bytes persisted to disk/IndexedDB in this phase
