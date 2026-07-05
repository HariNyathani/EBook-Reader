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

## Phase 10 Scope

✅ Debounced progress sync (3s) to `reading_progress` via Server Action
✅ Offline queue (IndexedDB, last-write-wins per book) with keep-dirty-on-failure
✅ `POST /api/progress` beacon endpoint for guaranteed last-position save
✅ Resume reading (initial CFI passed to `engine.goTo`)
✅ `reading_sessions` capture-only foundation (no aggregation)
✅ Dashboard "Continue Reading" section
✅ Multi-device LWW conditional upsert

## Phase 11 Scope (Reader Experience & UI)

✅ Auto-hiding reader chrome (toolbar + bottom progress bar)
✅ TOC drawer (left-side, with current-chapter highlight)
✅ In-book search panel (debounced, async iteration, with highlights)
✅ Tap zones (left/right/center) + keyboard shortcuts + swipe gestures
✅ Typography control panel (font/size/line-height/margin/justify)
✅ Theme switcher (light/sepia/dark)
✅ Loading + error states with retry
✅ Focus traps + Escape-to-close on all panels
✅ `prefers-reduced-motion` honoured by all animations
✅ Reader UI never touches the engine iframe DOM (SAD §5.1)

### Phase 11 Component Composition

`ReaderView` composes the full reader UI in this order (back-to-front):

1. `<div ref={containerRef}>` — engine mount point (foliate-js renders here)
2. `<TapZones>` — transparent pointer/touch handler (no DOM)
3. `<ReaderChrome>` — auto-hiding top toolbar + bottom progress bar
4. `<TocDrawer>`, `<SearchPanel>`, `<SettingsPopover>` — mutually-exclusive panels
5. `<ReaderLoading>`, `<ReaderError>` — overlay states

All engine interaction goes through `useReaderEngine` (SAD §5.1). No
component touches the engine iframe DOM directly. Commands: `next`, `prev`,
`goTo`, `search`, `setStyles` (via the styles mapper). Events: `ready`,
`relocate` (drives `setCurrentCfi`, `setFraction`, `setActiveChapterHref`).

### Phase 11 Hooks

- `useReaderControls` — keyboard shortcut map (←/→/Esc/`/`/t/+/-/c/Space/PageUp/PageDown/Enter)
- `useTapZones` — pointer/tap with selection/swipe awareness
- `useSwipeGestures` — mobile horizontal swipes
- `useChromeVisibility` — auto-hide/reveal logic (3s idle)
- `useFocusTrap` — focus trap utility (Tab/Shift+Tab, Escape)
- `usePrefersReducedMotion` — reactive media query

## Phase 12 Scope (Personalization & Preferences)

See `src/features/preferences/README.md` for the cloud-sync / settings
surface. The reader-store durability is the bridge between the two
features:

- The reader-store is wrapped in `zustand/persist` with `partialize`
  persisting only the durable preference slice (theme, fontFamily,
  fontSize, lineHeight, margin, textAlign). Transient state
  (currentCfi, isReady, toc, fraction, search*, activeChapterHref,
  lastSavedAt, syncState) is excluded.
- A `PreferencesProvider` mounted in the (app) layout hydrates from
  localStorage instantly on load, then reconciles with the cloud
  (LWW by `updated_at`).
- The `/settings` page exposes the same controls (TypographyPanel +
  ThemeSwitcher) plus a "Reset to defaults" action and account info.

## Out of Scope (future phases)

- Highlights & annotations (SAD §7, jsonb namespace reserved)
- In-book dictionary (SAD §7, jsonb namespace reserved)
- Reading-statistics charts (capture-only foundation in place)
- Non-EPUB formats (SAD §7 — `FormatRouter` seam already exists)
- Deeper PWA offline caching of owned books

## Security

- EPUB fetched with `credentials: 'include'` (cookie auth)
- Bytes held only as ephemeral Blob/objectURL, revoked on unmount
- foliate renders in **sandboxed iframe** — sandbox attribute is NOT removed
- React never injects into or reads the iframe DOM (prevents XSS bridge)
- No book bytes persisted to disk/IndexedDB in this phase
