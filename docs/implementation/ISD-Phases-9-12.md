# Implementation Specification Document (ISD) — Continuation

**Project:** Private EPUB Reader (Walled-Garden Web App + PWA)
**Document:** Master Implementation Blueprint — Phases 9 through 12
**Author:** Technical Lead / Principal Engineer
**Status:** Finalized for execution
**Source of Truth:** Software Architecture Document (SAD), as revised by the Senior Staff Engineer Architecture Review
**Predecessors:** `ISD-Phases-0-4.md`, `ISD-Phases-5-8.md` (Phases 0–8 are **locked**; do not modify)
**Date:** 2026-07-05

---

## 9·0 Reading Guide for This Continuation

Phases 0–8 are finalized and locked. Their technology baseline, frozen import contracts (predecessor Appendices A + C), the global Definition-of-Done gate, the resolved top-level JWT-claims path, and the forward-only phase rule all remain in force and are **not repeated** except where a Phase 9–12 dependency requires it.

**Restated facts a Phase 9–12 agent must assume as already true (do not re-implement):**

- Next.js 15 (App Router, React 19), TypeScript `strict`, pnpm, Tailwind, Zustand, Zod — configured. Node runtime for server code touching R2/zip/sharp; never Edge.
- Frozen contracts available for import (subset relevant here):
  - `@/lib/result` → `ActionResult<T>`, `ok`, `fail`
  - `@/lib/routes` → `ROUTES` (incl. `READER(bookId)`, `BOOK_DETAILS(bookId)`)
  - `@/types` → `Book`, `Profile`, `UserLibraryEntry`, `ReadingProgress` (+ generated `database.ts`)
  - `@/lib/supabase/{server,browser,admin,middleware}`; JWT carries top-level `is_approved`/`is_admin`; RLS enforces them.
  - `@/features/auth/session` → `getClaims`, `requireApproved`, `requireAdmin`
  - `@/store` → `useReaderStore` (Phase-1 shape: `theme`, `fontSize`, `margin`, `currentCfi`, `isReady` + setters), `useUiStore`
  - `@/components` → `BookCard`
  - **`GET /api/books/[id]/file`** (Phase 6) — streams the EPUB (auth + approval gated, `no-store`, `application/epub+zip`). This is the reader's binary source (SAD §2.1 step 5).
  - **`GET /api/covers/[id]`** (Phase 6) — cover stream.
  - `@/features/library/queries` (`getCatalog`, `getMyLibrary`, `getBookById`, `getProgressMap`) and `@/features/library/cache` (`LIBRARY_TAG`, `userLibraryTag`, `progressTag`).
  - `reading_progress` table (Phase 3): `id, user_id, book_id, cfi, percentage, updated_at`, `unique(user_id, book_id)` — **read-only so far**; Phase 10 introduces writes.
  - PWA service worker (`public/sw.js`, Phase 2) with a `message` listener stub `SYNC_READING_PROGRESS`; `idb-keyval` installed (Phase 2).
  - `/reader/[bookId]` route exists as a **Phase-1 placeholder** — Phase 9 replaces it.
- Every protected Server Action begins with `requireApproved()`/`requireAdmin()` and returns `ActionResult<T>`. `process.env` is read only in `src/lib/env.ts`. Server-only modules start with `import 'server-only'`; client modules with `'use client'`.

### 9·0.1 Phase Dependency Graph (this segment)

```
Phase 8 (Library/Dashboard) ──> Phase 9 (Reader Engine Integration — foliate-js isolation layer)
                                     └─> Phase 10 (Reading Progress Sync: CFI, debounce, offline queue, resume, stats foundation)
                                            └─> Phase 11 (Reader Experience & UI: chrome, TOC, search, gestures, typography controls, themes)
                                                   └─> Phase 12 (Personalization & Preferences: persistence, cloud sync, settings, extensibility)
```

Strictly sequential, forward-only. Phase 9 establishes the engine boundary and the **full durable reader-state shape**; Phases 10–12 build on it without redesigning it.

### 9·0.2 Critical Planning Decisions & Refinements (applied within the noted phase)

These refine the outline without changing the SAD's architecture. Each is the smallest change that improves cohesion, robustness, or future-proofing.

**(A) Engine abstraction, not just a foliate wrapper (Phase 9).** SAD §5.1 mandates a strict React↔foliate boundary; SAD §7 anticipates PDF/CBZ via a `<FormatRouter>`. To satisfy both, Phase 9 defines a format-agnostic **`ReaderEngine` interface** (`open/destroy/next/prev/goTo/setStyles/search/on`). The foliate integration is one adapter (`FoliateEngine`) behind that interface. Future formats implement the same interface with zero change to the React layer. The `useFoliate` hook in the SAD becomes a generic **`useReaderEngine`** hook; a thin `useFoliate` alias is retained for continuity.

**(B) foliate-js is vendored + dynamically imported client-only (Phase 9).** foliate-js is a set of ES modules (not a stable, semver-pinned npm package) that render sandboxed `<iframe>`s and require the DOM. It is therefore **vendored into the repo** (`src/vendor/foliate-js/…`, pinned to a recorded commit) and loaded via `next/dynamic(..., { ssr: false })` inside a client boundary. CSP is extended to permit `blob:` frames/images the reader needs.

**(C) Durable reader state is centralized in `reader-store` up front (Phase 9).** To minimize cross-phase coupling, Phase 9 **additively** extends the Phase-1 `reader-store` with the full durable typography/theme shape (`theme`, `fontFamily`, `fontSize`, `lineHeight`, `margin`, `textAlign`) plus the `setStyles` mapping. Phase 11 only wires **controls** to these setters; Phase 12 only wires **persistence + cloud sync**. (Additive fields are allowed; Phase-1 field names are not renamed.)

**(D) Offline progress = last-write-wins keyed store, not an append log (Phase 10).** Only the *latest* position per book matters. Phase 10 stores `progress:{bookId}` (latest `{cfi, percentage, updatedAt, dirty}`) in IndexedDB via `idb-keyval` and flushes dirty entries on reconnect/load. This is simpler and correct vs. an append-only queue.

**(E) Guaranteed last-position save via a beacon Route Handler (Phase 10).** Server Actions cannot be sent with `navigator.sendBeacon` on `pagehide`/tab-close. Phase 10 adds **`POST /api/progress`** (cookie-authed, approval-gated, conditional upsert) that `sendBeacon` targets on `visibilitychange`/`pagehide`, alongside the debounced Server Action for normal saves. Both share one `persistProgress` server util.

**(F) Multi-device-safe conditional upsert (Phase 10).** The progress write compares timestamps and only overwrites when the incoming `updated_at` is newer, so a delayed offline flush cannot clobber a newer position saved from another device. This is the "multi-device synchronization preparation" the outline asks for.

**(G) Reading-statistics foundation = a minimal, capture-only `reading_sessions` table (Phase 10).** Per SAD §7 ("snapshot into a `reading_statistics` table … without bloating the core progress table"), Phase 10 adds a lean `reading_sessions` table (session start/end/duration) written on reader unmount/idle. **No charts, no aggregation** are built — this is strictly the data foundation. (Judgment call; kept minimal to avoid scope creep.)

**(H) Preferences are local-first with optional cloud sync (Phase 12).** A persisted (localStorage) partial slice of `reader-store` gives instant restoration; a versioned `user_preferences` (jsonb) table provides cross-device sync via last-write-wins. The jsonb shape reserves namespaces for future `highlights`/`annotations`/`dictionary` settings (SAD §7 extensibility).

**(I) Theme/typography split across 11 and 12.** The outline lists line-height/margins under Phase 12; their **controls and live application** ship in Phase 11 (that's where the reading UX lives), while their **persistence, restoration, and cloud sync** are Phase 12. State fields for all of them are defined once in Phase 9 (see (C)).

### 9·0.3 Conventions (unchanged)

Paths are repo-root relative. Reader/engine code is **client-only** (`'use client'` / dynamic `ssr:false`). Progress Route Handler runs on Node runtime. `ActionResult` is the only Server Action return shape. Respect `prefers-reduced-motion` for all animations.

---
---

# Phase 9 — Reader Engine Integration (foliate-js)

## 9.A Objective

Replace the `/reader/[bookId]` placeholder with a working reader that (1) downloads the EPUB via the gated `GET /api/books/[id]/file` handler, converts it to a Blob → ephemeral `objectURL`, and opens it in **foliate-js**; (2) enforces a **strict React↔engine isolation boundary** (React never touches the reader's iframe DOM — SAD §5.1); (3) exposes a **format-agnostic `ReaderEngine` interface** with a `FoliateEngine` adapter; (4) wires engine **events → Zustand** and **Zustand → engine commands** via a `useReaderEngine` hook; and (5) implements the **theme/typography injection** pipeline (`setStyles` driven by `reader-store`, SAD §5.2). This phase delivers a readable book with page navigation and live theming, but **no chrome/TOC/search/gestures** (Phase 11) and **no progress persistence** (Phase 10).

## 9.B Scope

**In scope:**
- `ReaderEngine` interface + `FoliateEngine` adapter (vendored foliate-js).
- `ReaderView` client component: download → Blob → objectURL → `engine.open`; lifecycle (mount/destroy, objectURL revocation).
- `useReaderEngine` hook: instantiates the engine, subscribes to events (`ready`, `relocate`, `error`), pushes to `reader-store`; sends commands (`next/prev/goTo/setStyles`).
- Additive extension of `reader-store` with the full durable typography/theme shape + `setStyles` mapping (decision C).
- Theme/typography injection via `engine.setStyles(...)` on state change (SAD §5.2).
- Minimal in-view navigation (prev/next via engine API; buttons or basic key handling deferred to Phase 11 — a **temporary** hidden prev/next control is acceptable for verification).
- CSP extension for `blob:` frames/images; vendoring foliate-js.
- Reader route becomes a real server component (`requireApproved`) rendering `ReaderView`.

**Out of scope:** toolbar/chrome, TOC, in-book search, tap zones, gestures, keyboard map, animations polish (all Phase 11); progress save/resume/offline (Phase 10); preference persistence (Phase 12). Non-EPUB formats (future) — but the interface must not preclude them.

## 9.C Prerequisites

- Phases 0–8 complete and green.
- `GET /api/books/[id]/file` streams EPUBs to approved users (Phase 6). At least one uploaded book exists (Phase 6/7).
- `reader-store` (Phase 1) present with `theme/fontSize/margin/currentCfi/isReady`.
- Reader error boundary `src/app/(app)/reader/[bookId]/error.tsx` exists (Phase 2, "Failed to load book. Return to Library.").

## 9.D Expected Existing Project State

- `/reader/[bookId]/page.tsx` is a placeholder; `(app)/layout.tsx` enforces `requireApproved()`.
- `src/features/reader/README.md` placeholder exists (Phase 1) describing future scope.
- CSP (Phase 2) allows `'self'` connect/img/frame but **not** `blob:` yet.

## 9.E Dependencies

- **Vendored (no npm install):** foliate-js source copied into `src/vendor/foliate-js/` at a **recorded commit hash** (document in `src/vendor/foliate-js/VENDOR.md`). Do not fetch at runtime.
- **Runtime:** none new from npm strictly required (foliate-js has no hard deps for EPUB). If a zip/inflate helper is needed by foliate at runtime, vendor it alongside. `idb-keyval` already present (used in Phase 10).
- **Types:** hand-authored ambient module declarations for the vendored modules (`src/vendor/foliate-js/foliate.d.ts`) since foliate-js ships no types.

## 9.F Folder Structure After Phase 9 (additions/changes)

```
src/
├─ app/
│  └─ (app)/
│     └─ reader/
│        └─ [bookId]/
│           ├─ page.tsx                 # MODIFY — server: requireApproved, fetch book, render ReaderView
│           └─ error.tsx                # UNCHANGED (Phase 2)
├─ features/
│  └─ reader/
│     ├─ engine/
│     │  ├─ types.ts                    # NEW — ReaderEngine interface, events, style params
│     │  ├─ foliate-engine.ts           # NEW — FoliateEngine adapter (client-only)
│     │  └─ index.ts                    # NEW — createReaderEngine(format) factory
│     ├─ hooks/
│     │  └─ use-reader-engine.ts        # NEW — 'use client' lifecycle + event↔store bridge
│     ├─ lib/
│     │  ├─ fetch-book-blob.ts          # NEW — download EPUB → Blob → objectURL (+ revoke)
│     │  └─ styles-mapper.ts            # NEW — reader-store state → engine style object
│     └─ components/
│        ├─ reader-view.tsx             # NEW — 'use client' container (useRef mount point)
│        └─ reader-view.dynamic.ts      # NEW — next/dynamic(ssr:false) wrapper
├─ store/
│  └─ reader-store.ts                   # MODIFY — additive durable typography/theme fields + setters
└─ vendor/
   └─ foliate-js/                       # NEW — vendored source + VENDOR.md + foliate.d.ts
```

## 9.G Files to Create

- **`src/features/reader/engine/types.ts`** — the isolation contract:
  ```
  type ReaderTheme = 'light' | 'sepia' | 'dark';
  interface ReaderStyle { theme; fontFamily; fontSizePx; lineHeight; marginPct; textAlign; }
  interface ReaderLocation { cfi: string; fraction: number; /* 0..1 */ chapterHref?: string; }
  type ReaderEngineEvent =
    | { type: 'ready'; toc: TocItem[]; totalFraction: number }
    | { type: 'relocate'; location: ReaderLocation }
    | { type: 'error'; error: Error };
  interface ReaderEngine {
    open(source: Blob | string): Promise<void>;
    destroy(): void;
    next(): void; prev(): void;
    goTo(target: string /* cfi or href */): Promise<void>;
    setStyles(style: ReaderStyle): void;
    search(query: string): AsyncIterable<SearchResult>;   // consumed in Phase 11
    on(handler: (e: ReaderEngineEvent) => void): () => void; // returns unsubscribe
  }
  ```
  Types only; framework-agnostic; no React import.
- **`src/features/reader/engine/foliate-engine.ts`** (`'use client'`) — `class FoliateEngine implements ReaderEngine`. Wraps the vendored `<foliate-view>` element mounted into a provided container `HTMLElement`. Translates foliate's `relocate`/`load`/`error` events into `ReaderEngineEvent`s; implements `setStyles` by calling foliate's style-injection API (inject CSS variables `--bg`, `--fg`, `--font-size`, `--line-height`, `--margin`, etc. into the reader iframe — SAD §5.2). **Never** exposes the iframe to React. Manages its own listeners and teardown in `destroy()`.
- **`src/features/reader/engine/index.ts`** — `createReaderEngine(format: 'epub', container: HTMLElement): ReaderEngine` factory (switch on format; only `'epub' → FoliateEngine` now; the seam for SAD §7 formats).
- **`src/features/reader/hooks/use-reader-engine.ts`** (`'use client'`) — given `{ containerRef, bookId, format, initialCfi? }`:
  1. On mount (container ready), `createReaderEngine`, `fetchBookBlob(bookId)` → `engine.open(objectURL)`.
  2. Subscribe via `engine.on`; map events → `reader-store` (`setIsReady(true)`, `setCurrentCfi`, TOC/fraction into store or a ref; `error` → throw to boundary or set error state).
  3. Subscribe to `reader-store` typography/theme slice; on change call `engine.setStyles(mapStateToStyle(state))` (via `styles-mapper`).
  4. On unmount: unsubscribe, `engine.destroy()`, `revokeObjectURL`.
  - Expose imperative controls (`next`, `prev`, `goTo`, `search`) to consumers.
- **`src/features/reader/lib/fetch-book-blob.ts`** (`'use client'`) — `fetchBookBlob(bookId): Promise<{ objectURL: string; revoke: () => void }>`: `fetch(ROUTES-based '/api/books/${bookId}/file', { credentials: 'include' })`; handle 401/403/404 → throw typed `ReaderLoadError`; `await res.blob()`; `URL.createObjectURL(blob)`; return with a `revoke` closure. Support an `AbortController` for cancel on unmount. Optionally surface download progress via a streamed reader for the loading UI (Phase 11 consumes it).
- **`src/features/reader/lib/styles-mapper.ts`** — pure `mapStateToStyle(state): ReaderStyle` and a `themePalette` map (light/sepia/dark → bg/fg values). Single source of truth for reader palettes.
- **`src/features/reader/components/reader-view.tsx`** (`'use client'`) — creates `containerRef`, calls `useReaderEngine`, renders the mount `<div ref={containerRef} />` filling the viewport, plus a minimal (temporary) prev/next affordance for verification and a loading/error fallback. **No chrome** (Phase 11).
- **`src/features/reader/components/reader-view.dynamic.ts`** — `export default dynamic(() => import('./reader-view'), { ssr: false, loading: ReaderSkeleton })`.
- **`src/vendor/foliate-js/`** — vendored source + `VENDOR.md` (source URL, commit hash, license) + `foliate.d.ts` ambient types.

## 9.H Files to Modify

- **`src/store/reader-store.ts`** — **additively** add durable fields + setters (decision C): `fontFamily: string` (default e.g. `'serif'`), `lineHeight: number` (default `1.5`), `textAlign: 'start' | 'justify'` (default `'start'`); keep existing `theme`, `fontSize` (px), `margin` (pct). Add `toc: TocItem[]`, `totalFraction: number`, `fraction: number` transient fields + setters populated by the engine. Do **not** persist yet (Phase 12). Do **not** rename Phase-1 fields.
- **`src/app/(app)/reader/[bookId]/page.tsx`** — server component: `requireApproved()`; `getBookById(bookId)` (Phase 8) → if null `notFound()`; pass `bookId`, `format` to the dynamic `ReaderView`. (Initial CFI wiring is added in Phase 10; Phase 9 opens at the start.) Set `export const dynamic = 'force-dynamic'`.
- **`next.config.ts`** — extend CSP: add `blob:` to `frame-src`/`child-src` and `img-src` (reader iframe + images); keep everything else. Document the additions.
- **`src/features/reader/README.md`** — document the isolation boundary and the `ReaderEngine`/adapter pattern (SAD §5.1).
- **`tsconfig.json`** — ensure `src/vendor/**` is included and the ambient `foliate.d.ts` is picked up (no path changes expected; verify).

## 9.I Database Migrations

None. (Progress writes/tables come in Phase 10.)

## 9.J Database Schema Updates

None.

## 9.K Environment Variables

None new.

## 9.L Configuration

- CSP `frame-src/img-src` extended with `blob:`.
- foliate-js loaded client-only (`ssr:false`); vendored, pinned commit.
- Reader route `force-dynamic` (auth + per-book).

## 9.M React Components

- `ReaderView` (client) + dynamic wrapper + `ReaderSkeleton` (loading). Temporary minimal nav for verification only.

## 9.N Custom Hooks

- `useReaderEngine` — the **sole** bridge between React and the engine (SAD §5.1). No other component may talk to the engine directly.

## 9.O Zustand Stores

- `reader-store` extended additively (typography/theme durable fields + transient toc/fraction). No persistence (Phase 12).

## 9.P Utility Modules

- `engine/{types,foliate-engine,index}`, `hooks/use-reader-engine`, `lib/{fetch-book-blob,styles-mapper}`, vendored foliate-js + types.

## 9.Q TypeScript Interfaces

- `ReaderEngine`, `ReaderStyle`, `ReaderLocation`, `ReaderEngineEvent`, `TocItem`, `SearchResult`, `ReaderLoadError`.

## 9.R Validation Schemas

- Minimal: `bookId` validated as UUID at the page boundary (reuse `uuidSchema`). Engine I/O is not user-form data; no Zod needed inside the engine.

## 9.S Server Actions

- None in Phase 9. (Progress-save action is Phase 10.)

## 9.T Route Handlers

- None new. Consumes existing `GET /api/books/[id]/file` (Phase 6).

## 9.U API Contracts

- Consumes `GET /api/books/{id}/file` (binary, `no-store`). The `ReaderEngine` interface is the **new frozen contract** for all future reader work and formats.

## 9.V Integration Points

- **Phase 6 delivery handler** → Blob → objectURL → engine.
- **reader-store** ↔ engine (events in, commands out) via `useReaderEngine`.
- **Phase 10** will supply `initialCfi` and subscribe to `relocate` for persistence.
- **Phase 11** will consume `toc`, `search`, and the imperative controls.
- **Phase 12** will persist the typography/theme slice.

## 9.W State Management

- Engine is imperative/isolated; React state is `reader-store`. The iframe DOM is **off-limits** to React (SAD §5.1). Data flow: engine event → hook → store → (re-render + `setStyles`). Commands: UI → hook → engine.

## 9.X Error Handling

- Download failures (401/403/404/network) → `ReaderLoadError` → surfaced by the reader `error.tsx` boundary (Phase 2) with retry ("Return to Library" already provided; add a "Retry" that remounts).
- Engine `error` event → same boundary.
- Always revoke objectURL and destroy engine on unmount/failure to avoid leaks.

## 9.Y Performance Considerations

- Engine mounts **once**; container ref is stable; avoid re-creating the engine on unrelated store changes (subscribe narrowly to the typography slice).
- Stream the EPUB download; show progressive loading (Phase 11 polishes). Revoke objectURL promptly.
- `setStyles` is cheap (CSS-var injection) — debounce not required, but coalesce rapid changes (e.g., font-size slider) via requestAnimationFrame if needed.
- Dynamic import keeps foliate out of the main bundle.

## 9.Z Security Considerations

- EPUB fetched with `credentials: 'include'`; bytes held only as an ephemeral Blob/objectURL, revoked on unmount (aligns with `no-store`, SAD §2.1).
- foliate renders untrusted EPUB content in a **sandboxed iframe**; do not disable its sandbox. CSP permits `blob:` frames/images only — not arbitrary remote origins.
- React never injects into or reads the reader iframe (prevents XSS bridge from book content into the app).
- No book bytes persisted to disk/IndexedDB in this phase.

## 9.AA Testing Requirements

- **Unit:** `styles-mapper` maps each theme/typography combo to expected CSS values; `fetch-book-blob` maps 401/403/404 to `ReaderLoadError` and revokes on abort (mock `fetch`/`URL`).
- **Component (jsdom, engine mocked):** `useReaderEngine` opens on mount, wires `relocate` → `setCurrentCfi`, calls `setStyles` when the typography slice changes, and calls `destroy`/`revoke` on unmount. Mock `FoliateEngine` (do not load the real iframe in jsdom).
- **E2E (Playwright, real browser):** an approved user opens `/reader/{bookId}`, the book renders (a `<foliate-view>`/iframe is present), prev/next changes location, switching `theme` in the store visibly changes background (assert CSS var). Mark live-book cases pending-environment if no uploaded book.
- Confirm no objectURL leak (spy on `revokeObjectURL`).

## 9.BB Edge Cases

- Unapproved/expired session mid-read → download 401/403 → boundary; middleware also redirects on next navigation.
- Corrupt/incompatible EPUB slipping past Phase-7 validation → engine `error` → boundary + "Return to Library".
- Very large EPUB → streamed download + loading state; engine handles pagination lazily.
- Rapid unmount during download → AbortController cancels; no state update after unmount.
- Missing book id / deleted book → `notFound()` (server) or 404 on fetch.
- Reduced-motion users → engine page transitions respect it (configure foliate accordingly).

## 9.CC Acceptance Criteria

1. `/reader/[bookId]` renders a real reader; an approved user sees the book paginated in a sandboxed foliate iframe.
2. React communicates with the reader **only** via `ReaderEngine`/`useReaderEngine`; no code reads/writes the reader iframe DOM.
3. Events flow engine→store (`relocate` updates `currentCfi`/`fraction`; `ready` sets `isReady`, populates `toc`).
4. Changing `theme`/`fontSize`/`fontFamily`/`lineHeight`/`margin`/`textAlign` in `reader-store` live-updates the rendering via `setStyles`.
5. EPUB is fetched via the gated handler, held as an ephemeral objectURL, and revoked on unmount; engine destroyed on unmount.
6. Load/engine errors surface through the reader error boundary with retry; unapproved users cannot load.
7. foliate-js is vendored at a pinned commit with ambient types; loaded client-only; CSP permits `blob:` frames/images.
8. `pnpm typecheck`, `pnpm lint`, `pnpm build` pass; Phases 0–8 tests remain green; new reader tests pass.

## 9.DD Definition of Done

- All Acceptance Criteria pass.
- SAD §5.1 isolation boundary and §5.2 style-injection implemented; `ReaderEngine` abstraction in place for future formats (SAD §7).
- `reader-store` extended additively (no Phase-1 renames); no persistence yet.
- No book bytes persisted; objectURL/engine lifecycle leak-free; sandbox intact.
- Global DoD gate satisfied.

---
---

# Phase 10 — Reading Progress Synchronization

## 10.A Objective

Persist and restore reading position robustly across sessions, network conditions, and devices: **debounced CFI/percentage sync** to `reading_progress` via a Server Action (SAD §5.3); an **offline queue** (IndexedDB, last-write-wins per book) that flushes on reconnect/load; a **guaranteed last-position beacon** on tab close; **resume reading** (open at saved CFI); a dashboard **"Continue Reading"** section; a minimal **reading-statistics foundation** (`reading_sessions`, capture-only); **failure recovery**; and **multi-device conflict handling** (timestamp-based conditional upsert). No UI chrome changes beyond the Continue Reading section (full reader UI is Phase 11).

## 10.B Scope

**In scope:**
- `saveProgressAction` (Server Action, debounced client-side 3s) — conditional upsert by `updated_at`.
- `POST /api/progress` Route Handler for `navigator.sendBeacon` on `pagehide`/`visibilitychange`.
- Shared `persistProgress` server util used by both paths.
- Offline queue: `idb-keyval` keyed `progress:{bookId}` with `dirty` flag; flush on `online`, on app load, and via SW `SYNC_READING_PROGRESS` (progressive enhancement).
- Resume: reader opens at saved CFI (server-provided initial progress → `engine.goTo`).
- Dashboard "Continue Reading" section (query + component) + `getContinueReading`.
- `reading_sessions` table + `endSessionAction`/beacon to record session duration (foundation only).
- Conflict resolution (last-write-wins by timestamp) for multi-device.
- Failure recovery: retry/backoff, keep-dirty-on-failure, never lose the latest local position.

**Out of scope:** reader toolbar/TOC/search/gestures (Phase 11); statistics charts/aggregation (future); preference sync (Phase 12).

## 10.C Prerequisites

- Phases 0–9 complete and green. Reader emits `relocate` (`{cfi, fraction}`) and accepts `goTo(cfi)` (Phase 9).
- `reading_progress` table + RLS (own-row, approved) from Phase 3; `getProgressMap` (Phase 8).
- SW stub with `SYNC_READING_PROGRESS` listener (Phase 2); `idb-keyval` installed.

## 10.D Expected Existing Project State

- `useReaderEngine`/`reader-store` update `currentCfi`/`fraction` on `relocate` (Phase 9) but nothing persists.
- Reader page opens at the start (no resume yet).
- Dashboard (Phase 8) shows catalog + My Library + read-only progress badges.

## 10.E Dependencies

- No new npm packages (`idb-keyval` present). Optional tiny backoff helper — hand-rolled, no dependency.

## 10.F Folder Structure After Phase 10 (additions/changes)

```
supabase/migrations/
└─ 0011_reading_sessions.sql            # NEW
src/
├─ app/
│  ├─ api/
│  │  └─ progress/route.ts              # NEW — POST beacon endpoint (Node runtime)
│  └─ (app)/
│     ├─ reader/[bookId]/page.tsx       # MODIFY — fetch initial progress, pass initialCfi
│     └─ dashboard/page.tsx             # MODIFY — add Continue Reading section
├─ features/
│  ├─ reader/
│  │  ├─ progress/
│  │  │  ├─ actions.ts                  # NEW — saveProgressAction, endSessionAction
│  │  │  ├─ schemas.ts                  # NEW — progressSchema, sessionSchema
│  │  │  ├─ persist-progress.ts         # NEW — server-only shared upsert util
│  │  │  ├─ offline-queue.ts            # NEW — idb-keyval last-write-wins store + flush
│  │  │  ├─ use-progress-sync.ts        # NEW — 'use client' debounce + beacon + offline
│  │  │  └─ use-reading-session.ts      # NEW — 'use client' session timer → endSession
│  │  └─ components/reader-view.tsx     # MODIFY — mount progress-sync + session hooks, resume goTo
│  └─ library/
│     ├─ queries.ts                     # MODIFY — add getContinueReading
│     └─ components/continue-reading.tsx# NEW
└─ public/sw.js                         # MODIFY — implement SYNC_READING_PROGRESS → notify clients
```

## 10.G Database Migrations

- **`0011_reading_sessions.sql`**:
  - `public.reading_sessions`: `id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, `book_id uuid not null references public.books(id) on delete cascade`, `started_at timestamptz not null`, `ended_at timestamptz not null`, `duration_seconds int not null check (duration_seconds >= 0)`, `created_at timestamptz default now()`.
  - Index `(user_id, book_id, started_at desc)`.
  - **RLS:** enable; `select/insert` restricted to `user_id = auth.uid() AND (auth.jwt() ->> 'is_approved')::boolean = true` (mirrors Phase-3 pattern). No update/delete for users.
  - Comment: "Capture-only foundation for future reading statistics (SAD §7). No aggregation implemented."

## 10.H Database Schema Updates

- New `reading_sessions` table (above). `reading_progress` unchanged (already has `cfi`, `percentage`, `updated_at`, `unique(user_id, book_id)`).

## 10.I Files to Create

- **`src/features/reader/progress/schemas.ts`**: `progressSchema = z.object({ bookId: uuidSchema, cfi: nonEmptyString.max(4096), percentage: z.number().min(0).max(100), updatedAt: z.string().datetime() })`; `sessionSchema = z.object({ bookId: uuidSchema, startedAt: z.string().datetime(), endedAt: z.string().datetime(), durationSeconds: z.number().int().min(0) })`.
- **`src/features/reader/progress/persist-progress.ts`** (`import 'server-only'`): `persistProgress({ userId, bookId, cfi, percentage, updatedAt })` — **conditional upsert**: insert on `(user_id,book_id)`; on conflict update **only if** incoming `updatedAt >= existing.updated_at` (decision F, multi-device safety). Implement via a Postgres UPSERT with a `WHERE` guard or an RPC; use the request-scoped server client so RLS enforces ownership. Returns the effective stored row/timestamp. On no-op (stale), return the existing newer value so clients can reconcile. Also `revalidateTag(progressTag(userId))` where appropriate (only from the Server Action path, not the beacon).
- **`src/features/reader/progress/actions.ts`** (`'use server'`):
  - `saveProgressAction(input): Promise<ActionResult<{ storedAt: string }>>` — `requireApproved()` → parse `progressSchema` → `persistProgress` (userId from claims) → `revalidateTag(progressTag(userId))` → `ok({ storedAt })`.
  - `endSessionAction(input): Promise<ActionResult>` — `requireApproved()` → parse `sessionSchema` → insert `reading_sessions` (own row). Best-effort; tolerate failures silently (stats are non-critical).
- **`src/app/api/progress/route.ts`** (`export const runtime = 'nodejs'`): `POST` — read cookies → resolve session → if unauthenticated/unapproved → 204 (silently drop; never error a beacon) → parse JSON body (`progressSchema`) → `persistProgress` → 204. Designed for `navigator.sendBeacon` (fire-and-forget, no response consumption). Idempotent + conditional.
- **`src/features/reader/progress/offline-queue.ts`** (`'use client'`): using `idb-keyval` — `queueProgress(bookId, {cfi, percentage, updatedAt})` sets `progress:{bookId}` with `dirty: true` (last-write-wins overwrite); `getPending(): Entry[]`; `flushPending()` iterates dirty entries, calls `saveProgressAction`, clears `dirty` on success, **keeps dirty on failure** (decision D/G). Expose `hasPending()`.
- **`src/features/reader/progress/use-progress-sync.ts`** (`'use client'`): subscribes to `reader-store` `currentCfi`/`fraction`; on change, **debounce 3s** (SAD §5.3) then:
  - If online → `saveProgressAction`; on failure → `queueProgress`.
  - If offline → `queueProgress`.
  - Registers listeners: `online` → `flushPending`; `visibilitychange`/`pagehide` → `navigator.sendBeacon('/api/progress', blob(json))` with the **latest** position (guaranteed last save, decision E) **and** `queueProgress` as backup; on mount → `flushPending`.
  - Listens for SW `SYNC_READING_PROGRESS` messages → `flushPending`.
- **`src/features/reader/progress/use-reading-session.ts`** (`'use client'`): tracks active reading time (start on ready, pause on `visibilitychange=hidden`/idle, resume on visible); on unmount/pagehide, compute `durationSeconds` and call `endSessionAction` (or beacon). Ignore sessions < a small threshold (e.g., 5s).
- **`src/features/library/components/continue-reading.tsx`** (Server Component) — renders a horizontal list of `BookCard`s for in-progress books with a "Continue" CTA → `ROUTES.READER(bookId)`.

## 10.J Files to Modify

- **`src/features/library/queries.ts`** — add `getContinueReading(userId): Promise<BookWithProgress[]>` — books with `reading_progress.percentage > 0 AND < 100` for the user, ordered `updated_at desc`, limited (e.g., 12); tagged `progressTag(userId)` (revalidated by `saveProgressAction`).
- **`src/app/(app)/dashboard/page.tsx`** — render `<ContinueReading>` above catalog when non-empty.
- **`src/app/(app)/reader/[bookId]/page.tsx`** — fetch the user's saved progress for this book (server) and pass `initialCfi` to `ReaderView` for **resume**.
- **`src/features/reader/components/reader-view.tsx`** — after `ready`, if `initialCfi` present, `engine.goTo(initialCfi)`; mount `useProgressSync` and `useReadingSession`.
- **`src/features/reader/hooks/use-reader-engine.ts`** — accept `initialCfi`; expose current location for the sync hook (already via store).
- **`public/sw.js`** — implement the `SYNC_READING_PROGRESS` path: on a `sync` event (if Background Sync supported) or on message, `postMessage` all clients to trigger `flushPending` (client performs the authenticated save). Keep the SW from doing authenticated writes itself; it only nudges clients. Document.

## 10.K Environment Variables

None new.

## 10.L Configuration

- `/api/progress` on Node runtime; excluded from caching; CSP `connect-src` already allows `'self'` (beacon is same-origin).
- Debounce interval `PROGRESS_DEBOUNCE_MS = 3000` (SAD §5.3) as a constant.

## 10.M React Components

- `ContinueReading` (server). Reader-view modified to host sync/session hooks. No chrome (Phase 11).

## 10.N Custom Hooks

- `useProgressSync`, `useReadingSession` (both client, reader-scoped). They are the only writers of `reading_progress`/`reading_sessions` from the client.

## 10.O Zustand Stores

- No new store. `reader-store` provides `currentCfi`/`fraction`; sync hook reads them. (Optional transient `lastSavedAt`/`syncState: 'idle'|'saving'|'offline'|'error'` added to `reader-store` for a Phase-11 indicator — additive.)

## 10.P Utility Modules

- `persist-progress` (server), `offline-queue` (client), progress `schemas`.

## 10.Q TypeScript Interfaces

- `ProgressInput`, `SessionInput`, `PendingProgressEntry`, `SyncState`.

## 10.R Validation Schemas

- `progressSchema`, `sessionSchema`. Applied in both the Server Action and the beacon Route Handler (server-side, never trust client).

## 10.S Server Actions

- `saveProgressAction({ bookId, cfi, percentage, updatedAt }) => ActionResult<{ storedAt }>` (approved-only; conditional upsert; revalidates `progress:{userId}`).
- `endSessionAction({ bookId, startedAt, endedAt, durationSeconds }) => ActionResult` (approved-only; best-effort).

## 10.T Route Handlers

- `POST /api/progress` (Node) — beacon-friendly conditional upsert; returns 204; drops unauthenticated silently.

## 10.U API Contracts

- Server Action + beacon share `progressSchema`. Beacon body = JSON `{ bookId, cfi, percentage, updatedAt }`. Conflict semantics: **stored iff `updatedAt >= existing.updated_at`**; otherwise no-op (existing newer position preserved) — this is the multi-device contract.

## 10.V Integration Points

- **Phase 9** engine `relocate` → `reader-store` → `useProgressSync`. `initialCfi` → `engine.goTo` (resume).
- **Phase 8** `getProgressMap`/badges + new `getContinueReading`.
- **Phase 2** SW `SYNC_READING_PROGRESS` → client flush.
- **Future stats** consume `reading_sessions` + `reading_progress` (no aggregation now).

## 10.W State Management

- Position: `reader-store` (live) → debounced persistence (server) with IndexedDB fallback (offline). Server is the cross-device source of truth; IndexedDB holds the **latest local, unsynced** position (last-write-wins). On flush/login, reconcile by timestamp.

## 10.X Error Handling

- Save failure (network/server) → enqueue to IndexedDB, mark `syncState='offline'|'error'`, retry on `online`/next load; **never** discard the newest local position (failure recovery).
- Beacon is fire-and-forget; the debounced action + offline queue are the reliable paths; beacon is the extra guarantee on close.
- Stale flush (older than server) → conditional upsert no-ops; client adopts the server's newer value.
- Session insert failure → ignored (stats non-critical); logged.

## 10.Y Performance Considerations

- Debounce 3s coalesces frequent `relocate` events into at most one write per 3s (SAD §5.3).
- Beacon sends only on hide/close (rare).
- `getContinueReading` limited + indexed (`reading_progress(user_id, updated_at desc)` from Phase 3).
- IndexedDB writes are cheap and keyed (one entry per book).
- `progressTag(userId)` revalidation scoped per-user (no global fan-out).

## 10.Z Security Considerations

- Both write paths derive `user_id` from the **session** (claims/cookie), never from client input; RLS enforces own-row.
- Beacon endpoint validates approval and silently drops otherwise (no info leak, no error surface).
- CFI length capped (`max(4096)`) to prevent abuse; percentage clamped 0–100 (DB check + Zod).
- IndexedDB stores only non-sensitive position data (cfi/percentage), never book bytes or tokens.
- Conditional upsert prevents malicious/stale overwrites of a newer device's position.

## 10.AA Testing Requirements

- **Unit:** `persistProgress` conditional logic (newer overwrites, older no-ops); `offline-queue` last-write-wins + keep-dirty-on-failure + flush success clears dirty; `progressSchema` rejects bad cfi/percentage.
- **Hook tests (jsdom):** `useProgressSync` debounces (only one save per 3s), enqueues on offline, flushes on `online`, sends beacon on `pagehide` (mock `sendBeacon`).
- **Route Handler:** unauthenticated → 204 no write; valid → upsert; stale → no-op.
- **E2E:** read a book, navigate pages, reload → resumes at last position; go offline, turn pages, come online → position syncs; open same book on a second session with a newer position → older offline flush does not clobber it; Continue Reading shows in-progress books.
- Live-Supabase cases pending-environment if unavailable; logic tests pass with mocks.

## 10.BB Edge Cases

- First open (no saved progress) → open at start; nothing to resume.
- Finished book (100%) → excluded from Continue Reading; still resumable.
- Rapid page flips → debounced to one save; final position guaranteed via beacon.
- Offline for a long session → single latest entry per book flushes on reconnect.
- Clock skew between devices → timestamps are client-generated ISO; acceptable for LWW; document that server `now()` could be used as tiebreak (future).
- Book deleted while in Continue Reading → cascade removes progress; section refreshes on next revalidation.
- Beacon unsupported → falls back to debounced action + offline queue.

## 10.CC Acceptance Criteria

1. Reading position saves (debounced 3s) to `reading_progress` via `saveProgressAction`; reopening resumes at the saved CFI.
2. Offline edits queue in IndexedDB (last-write-wins per book) and flush on reconnect/load; no position loss on failure.
3. `POST /api/progress` reliably captures the last position on tab close via `sendBeacon`.
4. Conditional upsert prevents a stale/offline flush from overwriting a newer position (multi-device safe).
5. Dashboard shows a "Continue Reading" section of in-progress books, ordered by recency.
6. `reading_sessions` records session durations (capture-only); RLS-scoped; failures are non-fatal.
7. All writes derive user from session; RLS + approval enforced; CFI/percentage validated.
8. `pnpm typecheck/lint/build` pass; Phases 0–9 tests green; new tests pass.

## 10.DD Definition of Done

- All Acceptance Criteria pass.
- SAD §5.3 (debounced UPSERT + offline queue) implemented, hardened with beacon + conditional upsert + failure recovery.
- Statistics foundation (`reading_sessions`) present and capture-only (no premature aggregation).
- No book bytes/tokens in IndexedDB; per-user cache scoping preserved.
- Global DoD gate satisfied.

---
---

# Phase 11 — Reader Experience & User Interface

## 11.A Objective

Wrap the isolated engine (Phase 9) and sync layer (Phase 10) in a **premium, Kindle-quality reading UI**: an auto-hiding **reader chrome** (top toolbar + bottom progress bar), a **Table of Contents** drawer, **in-book search**, **tap zones**, a **keyboard-shortcut** map, **mobile gestures**, **typography controls** (font family/size/line-height/margins/justify), **theme switching** (light/sepia/dark), **progress indicators**, **loading states**, tasteful **animations**, and robust **error states** — all driven by `reader-store`/`ui-store` and the engine's imperative API, with **no new engine coupling** (React still talks only through `useReaderEngine`). Preferences applied here are **session-scoped**; their persistence is Phase 12.

## 11.B Scope

**In scope:** reader layout shell; auto-hide toolbar + reveal logic; bottom progress/scrubber; TOC drawer (navigate + current-chapter highlight); search panel (query → results → jump/highlight); tap zones (prev/next/toggle-chrome); keyboard shortcuts; touch gestures (swipe/tap; respect selection); typography control panel; theme switcher; progress indicators (%, chapter, position); loading skeleton + download progress; page-turn/chrome/drawer animations (reduced-motion aware); comprehensive error/empty states.

**Out of scope:** preference persistence/cloud sync/settings page (Phase 12); highlights/annotations/dictionary (future, SAD §7); non-EPUB formats (future). No changes to the engine boundary or progress-write logic.

## 11.C Prerequisites

- Phases 0–10 complete and green. Engine exposes `next/prev/goTo/search`, `toc`, `fraction`, `totalFraction`; `reader-store` holds typography/theme + transient nav state; `useProgressSync` running.
- Reader route renders `ReaderView` (Phase 9) with progress/resume (Phase 10).

## 11.D Expected Existing Project State

- `ReaderView` shows the book with a temporary/minimal prev-next affordance (Phase 9) and mounts sync/session hooks (Phase 10). No real chrome/TOC/search/gestures yet.
- `ui-store` (Phase 1) has `isSidebarOpen`, `toast` + setters; extendable additively.

## 11.E Dependencies

- No required new packages. Optional (only if justified with `// ISD-NOTE:`): a headless a11y primitive (e.g., Radix) for the drawer/dialog focus-trap — **prefer** hand-rolled with proper ARIA + focus management to avoid bundle weight. Use existing Tailwind for styling and CSS/`Web Animations API` for animation (no animation library required).

## 11.F Folder Structure After Phase 11 (additions/changes)

```
src/
├─ features/
│  └─ reader/
│     ├─ components/
│     │  ├─ reader-view.tsx             # MODIFY — compose chrome + zones + engine mount
│     │  ├─ reader-chrome.tsx           # NEW — top toolbar + bottom bar (auto-hide)
│     │  ├─ reader-toolbar.tsx          # NEW — back, TOC, search, typography, theme buttons
│     │  ├─ reader-progress-bar.tsx     # NEW — scrubber + %/chapter/position
│     │  ├─ toc-drawer.tsx              # NEW — Table of Contents
│     │  ├─ search-panel.tsx            # NEW — in-book search
│     │  ├─ tap-zones.tsx               # NEW — prev/next/center overlay
│     │  ├─ typography-panel.tsx        # NEW — font/size/line-height/margin/justify controls
│     │  ├─ theme-switcher.tsx          # NEW — light/sepia/dark
│     │  ├─ reader-loading.tsx          # NEW — skeleton + download progress
│     │  └─ reader-error.tsx            # NEW — in-reader error/retry (works with boundary)
│     ├─ hooks/
│     │  ├─ use-reader-controls.ts      # NEW — keyboard shortcuts
│     │  ├─ use-tap-zones.ts            # NEW — pointer/tap handling
│     │  ├─ use-swipe-gestures.ts       # NEW — touch swipe (selection-aware)
│     │  └─ use-chrome-visibility.ts    # NEW — auto-hide/reveal logic
│     └─ constants.ts                   # NEW — zone ratios, idle timeout, shortcut map
└─ store/
   ├─ reader-store.ts                   # MODIFY — additive UI-nav state (searchResults, activeChapter)
   └─ ui-store.ts                       # MODIFY — additive reader UI flags (chromeVisible, activePanel)
```

## 11.G Files to Create

- **`reader-chrome.tsx`** — overlays top toolbar + bottom progress bar; visibility from `use-chrome-visibility`; fades in/out; does not overlap the engine container's pointer events except where intended.
- **`reader-toolbar.tsx`** — buttons: Back (→ `ROUTES.DASHBOARD` or book details), TOC, Search, Typography, Theme; shows title/author; accessible labels.
- **`reader-progress-bar.tsx`** — draggable scrubber bound to `fraction`; on release `engine.goTo(fractionToCfi)` (use engine's fraction API); shows `percentage`, current chapter, and "X min left in chapter" if available.
- **`toc-drawer.tsx`** — renders `reader-store.toc`; clicking an item `engine.goTo(href)`, closes drawer, highlights current chapter (derived from `relocate` chapterHref). Virtualize if TOC is very large.
- **`search-panel.tsx`** — input → `engine.search(query)` (async iterable, Phase 9); renders results incrementally; click → `engine.goTo(result.cfi)` + transient highlight; clear removes highlights. Debounce input; cancel prior search on new query.
- **`tap-zones.tsx`** + **`use-tap-zones.ts`** — left third → `prev`, right third → `next`, center → toggle chrome (SAD reader UX). Ignore taps that are text selections/long-press.
- **`typography-panel.tsx`** — controls mutating `reader-store`: font family (serif/sans/dyslexic option), font size (± with min/max), line-height, margins, justify toggle. Live preview via existing `setStyles` pipeline (Phase 9). **Session-scoped** (persistence is Phase 12).
- **`theme-switcher.tsx`** — light/sepia/dark → `setTheme`; live via `setStyles`.
- **`reader-loading.tsx`** — skeleton + optional download percentage (from `fetch-book-blob` progress, Phase 9).
- **`reader-error.tsx`** — friendly error + Retry (remount) + Return to Library; coordinates with the Phase-2 boundary.
- **Hooks:** `use-reader-controls` (keyboard: ←/→/Space/PageUp/PageDown navigate, Esc closes active panel, `/` search, `t` cycle theme, `+`/`-` font size, `c` toggle chrome), `use-swipe-gestures` (horizontal swipe → prev/next; vertical ignored; selection/long-press aware), `use-chrome-visibility` (hide on read/idle after N seconds, reveal on center tap/mouse move/keyboard/scrub).
- **`constants.ts`** — `TAP_ZONE_RATIO = 0.33`, `CHROME_IDLE_MS = 3000`, `FONT_SIZE_MIN/MAX/STEP`, `SHORTCUTS` map.

## 11.H Files to Modify

- **`reader-view.tsx`** — compose `<TapZones>`, `<ReaderChrome>` (toolbar + progress), `<TocDrawer>`, `<SearchPanel>`, `<TypographyPanel>`, `<ThemeSwitcher>` around the engine mount; wire `use-reader-controls`, `use-tap-zones`, `use-swipe-gestures`, `use-chrome-visibility`; replace the temporary Phase-9 nav.
- **`reader-store.ts`** — additive: `searchResults`, `searchState`, `activeChapterHref`, setters.
- **`ui-store.ts`** — additive: `chromeVisible: boolean`, `activePanel: 'none'|'toc'|'search'|'typography'|'theme'`, setters (ensures only one panel open at a time).
- **`src/features/reader/README.md`** — document the UI composition and that all engine interaction remains via `useReaderEngine` (SAD §5.1 preserved).

## 11.I / 11.J Database Migrations & Schema Updates

None. Pure UI/interaction layer.

## 11.K Environment Variables

None new.

## 11.L Configuration

- Animations gated by `prefers-reduced-motion`. Panels are mutually exclusive via `ui-store.activePanel`. Focus-trap + `Esc` for drawers/dialogs.

## 11.M React Components

- Chrome, toolbar, progress bar, TOC drawer, search panel, tap zones, typography panel, theme switcher, loading, error. All client components; presentational + wired to store/engine.

## 11.N Custom Hooks

- `use-reader-controls`, `use-tap-zones`, `use-swipe-gestures`, `use-chrome-visibility`. No direct engine-DOM access; commands via `useReaderEngine`.

## 11.O Zustand Stores

- `reader-store` (search/chapter nav, additive), `ui-store` (chromeVisible/activePanel, additive). No persistence (Phase 12).

## 11.P Utility Modules

- `constants` (zones/idle/shortcuts); fraction↔cfi helpers if not provided by engine (wrap engine API, do not reach into iframe).

## 11.Q TypeScript Interfaces

- `SearchResult` (from Phase 9), `ActivePanel`, `ShortcutMap`, `TapZone`.

## 11.R Validation Schemas

- Minimal (search query length clamp). No server input here.

## 11.S / 11.T Server Actions & Route Handlers

- None new. Navigation/search/typography are client-only. (Progress still saved by Phase-10 hooks.)

## 11.U API Contracts

- None new. Consumes engine imperative API (`next/prev/goTo/search`) and store setters.

## 11.V Integration Points

- **Phase 9** engine controls/events/`setStyles`; **Phase 10** progress bar reflects `fraction`, scrubbing calls `goTo` (which triggers `relocate` → sync).
- **Phase 12** will persist typography/theme changed here.

## 11.W State Management

- UI state in `ui-store` (chrome/panels); typography/theme in `reader-store` (live-applied). Single active panel invariant. Engine remains isolated.

## 11.X Error Handling

- In-reader `reader-error.tsx` + Phase-2 boundary for fatal errors; search errors shown inline (non-fatal); TOC/goTo failures toasted; controls degrade gracefully if a feature (e.g., search) is unsupported by a future engine.

## 11.Y Performance Considerations

- Chrome/panels render outside the engine subtree; engine never re-mounts on UI state changes (subscribe narrowly).
- Debounce search + font-size slider (coalesce `setStyles`); virtualize long TOC/search lists.
- Gesture/keyboard handlers use passive/pointer events; avoid layout thrash; use `transform`/opacity for animations (GPU-friendly).
- Auto-hide chrome reduces overdraw while reading.

## 11.Z Security Considerations

- All navigation via engine API; React never injects into the reader iframe (SAD §5.1) — search highlighting is performed by the engine, not by React DOM manipulation.
- Search query is passed to the engine's in-book search only (no server/network); length-clamped.
- No new secrets/endpoints.

## 11.AA Testing Requirements

- **Unit/component (engine mocked):** keyboard shortcuts invoke correct engine commands; tap zones map to prev/next/toggle; swipe triggers page turns but not during text selection; chrome auto-hides after idle and reveals on interaction; only one panel open at a time; typography/theme controls call the right store setters and thus `setStyles`.
- **Search:** query yields results, clicking jumps (mock engine.search iterable), clearing removes highlights.
- **A11y:** drawers/dialogs trap focus, `Esc` closes, controls have labels; reduced-motion disables animations.
- **E2E:** open book → toolbar hides while reading, reveals on center tap; TOC navigates; search finds and jumps; font-size/theme visibly change; keyboard/swipe navigate; responsive at mobile + desktop widths.

## 11.BB Edge Cases

- Book with empty/malformed TOC → drawer shows "No contents" gracefully.
- Search with no matches → empty state; very frequent typing → debounced/cancelled.
- Tiny screens → controls reflow; tap zones still reachable; chrome doesn't cover content.
- Text selection vs. tap/swipe conflict → selection wins (no accidental page turn).
- Rapid theme/size toggling → coalesced; no engine remount.
- Reduced-motion → instant transitions.
- Keyboard focus while a panel is open → shortcuts scoped (don't page-turn while typing in search).

## 11.CC Acceptance Criteria

1. Auto-hiding chrome (toolbar + progress bar) reveals on center tap/interaction and hides while reading.
2. TOC drawer lists chapters, navigates, and highlights the current chapter.
3. In-book search finds matches, jumps to them, and highlights via the engine (not React DOM).
4. Tap zones (prev/next/center), keyboard shortcuts, and mobile swipe all navigate correctly without breaking text selection.
5. Typography controls (font/size/line-height/margin/justify) and theme switcher live-update the rendering (session-scoped).
6. Progress bar shows %/chapter/position and supports scrubbing (`goTo`).
7. Loading, empty, and error states are polished; animations respect reduced-motion; UI is responsive mobile↔desktop.
8. Engine isolation preserved (no reader-iframe DOM access from React); `pnpm typecheck/lint/build` pass; Phases 0–10 tests green; new tests pass.

## 11.DD Definition of Done

- All Acceptance Criteria pass; the reader feels premium/Kindle-quality and is fully responsive and accessible.
- Only `ui-store`/`reader-store` additive changes; engine boundary intact; no persistence introduced (Phase 12 owns it).
- Global DoD gate satisfied.

---
---

# Phase 12 — Personalization & User Preferences

## 12.A Objective

Make the reading experience **durable and personal across sessions and devices**: persist reader preferences (theme, font family, font size, line-height, margins, justify) **local-first** (instant restore) with **optional cloud sync** via a versioned `user_preferences` (jsonb) table; implement **preference restoration** (local → cloud reconciliation by recency); provide a **Settings** surface; and establish a **versioned, extensible settings architecture** whose schema reserves namespaces for future **highlights, annotations, and dictionary** preferences (SAD §7) — all without redesigning the reader UI (Phase 11) or the engine boundary (Phase 9).

## 12.B Scope

**In scope:** local persistence of the reader preference slice (zustand `persist` + `partialize`); `user_preferences` table + RLS; `getPreferences`/`savePreferencesAction` with LWW reconciliation; hydration on app/reader load (local instant, cloud authoritative if newer); Settings page (`/settings`) to view/edit preferences (+ account info/sign-out); versioned preference schema with a migration function and Zod validation; reserved extension namespaces; reset-to-defaults.

**Out of scope:** implementing highlights/annotations/dictionary features themselves (future); non-preference settings beyond account basics; changing reader UI controls (they already mutate `reader-store` — Phase 12 makes those changes persist).

## 12.C Prerequisites

- Phases 0–11 complete and green. `reader-store` holds the full preference slice (Phase 9) and is mutated by Phase-11 controls. Supabase clients + RLS pattern available.

## 12.D Expected Existing Project State

- Typography/theme changes apply live but reset on reload (session-scoped, Phases 9/11).
- `(app)` layout guards approved users; `ROUTES` defined; `ui-store`/`reader-store` present.

## 12.E Dependencies

- No new npm packages (Zustand `persist`/`immer` middleware are part of `zustand`). `idb-keyval` already available (optional storage backend). Zod present.

## 12.F Folder Structure After Phase 12 (additions/changes)

```
supabase/migrations/
└─ 0012_user_preferences.sql            # NEW
src/
├─ app/
│  └─ (app)/
│     └─ settings/
│        ├─ page.tsx                    # NEW — settings surface
│        └─ loading.tsx                 # NEW
├─ features/
│  └─ preferences/
│     ├─ schema.ts                      # NEW — versioned Preferences shape + Zod + defaults
│     ├─ migrate.ts                     # NEW — version migration (v1→vN)
│     ├─ actions.ts                     # NEW — savePreferencesAction ('use server')
│     ├─ queries.ts                     # NEW — getPreferences (server-only)
│     ├─ sync.ts                        # NEW — client hydrate + debounced cloud push + reconcile
│     └─ components/
│        ├─ settings-form.tsx           # NEW — edit prefs
│        └─ preferences-provider.tsx    # NEW — 'use client' hydration on mount
└─ store/
   └─ reader-store.ts                   # MODIFY — wrap preference slice with persist+partialize
```

## 12.G Database Migrations

- **`0012_user_preferences.sql`**:
  - `public.user_preferences`: `user_id uuid primary key references auth.users(id) on delete cascade`, `preferences jsonb not null default '{}'::jsonb`, `version int not null default 1`, `updated_at timestamptz not null default now()`.
  - `before update` → `set_updated_at` (reuse Phase-3 trigger function).
  - **RLS:** enable; `select/insert/update` restricted to `user_id = auth.uid() AND (auth.jwt() ->> 'is_approved')::boolean = true`; `WITH CHECK` same. No delete needed.
  - Comment: "Cloud copy of user reader preferences; local-first, LWW by updated_at. `preferences` jsonb reserves namespaces {reader, highlights?, annotations?, dictionary?} for future features (SAD §7)."

## 12.H Database Schema Updates

- New `user_preferences` table. No change to existing tables.

## 12.I Files to Create

- **`src/features/preferences/schema.ts`**: `PREFERENCES_VERSION = 1`; `readerPreferencesSchema` (Zod) = `{ theme, fontFamily, fontSize, lineHeight, margin, textAlign }` with bounds; `preferencesSchema = z.object({ version: z.number(), reader: readerPreferencesSchema /*, highlights?, annotations?, dictionary? reserved */ })`; `DEFAULT_PREFERENCES`. Types inferred (`Preferences`, `ReaderPreferences`).
- **`src/features/preferences/migrate.ts`**: `migratePreferences(raw): Preferences` — validate + upgrade older `version` shapes to current (identity for v1); on invalid → merge with defaults (never throw; personalization must not break the app).
- **`src/features/preferences/queries.ts`** (`import 'server-only'`): `getPreferences(userId): Promise<{ preferences: Preferences; updatedAt: string } | null>` — read own row (RLS); migrate on read. (Not heavily cached; small and user-specific.)
- **`src/features/preferences/actions.ts`** (`'use server'`): `savePreferencesAction({ preferences, updatedAt }): Promise<ActionResult<{ storedAt: string }>>` — `requireApproved()` → validate via `preferencesSchema` → **LWW conditional upsert** (store iff incoming `updatedAt >= existing.updated_at`) into `user_preferences` (userId from claims) → return effective `storedAt` (so the client can adopt a newer server value). Never trust client `user_id`.
- **`src/features/preferences/sync.ts`** (`'use client'`): 
  - `hydratePreferences()` — on mount: local persisted store restores **instantly**; then fetch cloud (`getPreferences` via a Server Action or a small read) and if cloud `updatedAt` is newer, merge into `reader-store` (cloud authoritative); if local is newer/dirty, push via `savePreferencesAction`.
  - `schedulePush()` — subscribe to the preference slice; **debounce** (~1s) then `savePreferencesAction` with a fresh `updatedAt`; on failure keep local (retry on next change/online). Offline → skip cloud, rely on local persistence.
- **`src/features/preferences/components/preferences-provider.tsx`** (`'use client'`) — mounts in `(app)/layout` (or reader), runs `hydratePreferences()` + wires `schedulePush()`. Renders children unchanged.
- **`src/features/preferences/components/settings-form.tsx`** (`'use client'`) — controls bound to `reader-store` preference setters (reusing Phase-11 control semantics) + "Reset to defaults"; changes propagate live to the reader and are persisted via the provider's push.
- **`src/app/(app)/settings/page.tsx`** — `requireApproved()`; renders `<SettingsForm>` + account info (email from claims) + `SignOutButton`.
- **`src/app/(app)/settings/loading.tsx`** — skeleton.

## 12.J Files to Modify

- **`src/store/reader-store.ts`** — wrap with `persist(..., { name: 'reader-preferences', partialize: (s) => pick(s, ['theme','fontFamily','fontSize','lineHeight','margin','textAlign']), version: PREFERENCES_VERSION, migrate })`. **Only the durable preference slice persists**; transient fields (`currentCfi`, `isReady`, `toc`, `fraction`, search/nav) are excluded. (Additive middleware; no field renames.)
- **`src/app/(app)/layout.tsx`** — wrap children with `<PreferencesProvider>` so preferences hydrate for all authed pages (reader + settings + dashboard theming if applicable).
- **`src/lib/routes.ts`** — add `SETTINGS = '/settings'`.
- **`src/features/reader/README.md`** / **`src/features/preferences/README.md`** — document local-first + cloud-sync model and extension namespaces.

## 12.K Environment Variables

None new.

## 12.L Configuration

- Zustand `persist` storage: `localStorage` (default) — instant, synchronous restore; acceptable for small prefs. (IndexedDB via `idb-keyval` optional; document if chosen.)
- Persist `version` + `migrate` to safely evolve the shape.
- Cloud push debounce ~1s; hydration reconciliation LWW by `updatedAt`.

## 12.M React Components

- `PreferencesProvider`, `SettingsForm`, settings page/loading. `SettingsForm` reuses Phase-11 control semantics.

## 12.N Custom Hooks

- Sync helpers in `sync.ts` (may be expressed as `usePreferencesSync`), invoked by `PreferencesProvider`. No engine coupling.

## 12.O Zustand Stores

- `reader-store` gains `persist`+`partialize` (preference slice only). No separate store introduced (keeps Phase-1 shape authoritative; avoids duplication).

## 12.P Utility Modules

- `schema`, `migrate`, `queries`, `actions`, `sync`. `pick`/merge helpers.

## 12.Q TypeScript Interfaces

- `Preferences`, `ReaderPreferences`, `PreferencesEnvelope { version; reader; /* reserved */ }`. Reserved optional namespaces `highlights?`, `annotations?`, `dictionary?` documented but not implemented.

## 12.R Validation Schemas

- `readerPreferencesSchema`, `preferencesSchema` (versioned). Applied on save (server) and on hydrate/migrate (client) — never trust stored/remote blobs blindly.

## 12.S Server Actions

- `savePreferencesAction({ preferences, updatedAt }) => ActionResult<{ storedAt }>` (approved-only; validated; LWW conditional upsert; user from claims).

## 12.T Route Handlers

- None new. (Preferences are non-binary; Server Action suffices.)

## 12.U API Contracts

- `savePreferencesAction` input `{ preferences: Preferences; updatedAt: ISOString }`; LWW semantics identical in spirit to Phase-10 progress (store iff newer). `getPreferences` returns `{ preferences, updatedAt } | null`.

## 12.V Integration Points

- **Phase 9/11** `reader-store` preference slice is the single live source; Phase 12 persists + syncs it.
- **Phase 4** claims for user id; **Phase 3** RLS pattern.
- **Future (SAD §7)** highlights/annotations/dictionary preferences slot into reserved jsonb namespaces + new store slices without schema change.

## 12.W State Management

- Local-first: `reader-store` persisted slice restores instantly on load; cloud reconciled by recency; changes debounce-pushed to cloud. Reader applies preferences live via the existing `setStyles` pipeline (no new engine path).

## 12.X Error Handling

- Corrupt/invalid local or cloud preferences → `migrate`/validation falls back to defaults/merge (never crash).
- Cloud save failure → keep local; retry on next change/online.
- Cloud fetch failure on hydrate → proceed with local; try again later.
- Reset-to-defaults always available as an escape hatch.

## 12.Y Performance Considerations

- Local restore is synchronous and instant (no flash of default theme if hydrated before reader paints; guard against hydration mismatch by applying persisted theme early).
- Cloud push debounced; cloud read once per session (on hydrate).
- Preferences payload is tiny; no caching complexity needed.

## 12.Z Security Considerations

- Preferences derive `user_id` from session claims; RLS enforces own-row.
- Validate remote/stored jsonb before applying (prevent malformed/malicious blobs from breaking rendering).
- No secrets in preferences; localStorage holds only non-sensitive UI prefs.
- LWW conditional upsert prevents stale overwrites across devices.

## 12.AA Testing Requirements

- **Unit:** `migrate` upgrades/repairs old/invalid shapes to valid defaults; `savePreferencesAction` validates + LWW (newer stored, older no-op) + rejects unapproved; `partialize` persists only the preference slice (transient fields excluded).
- **Sync (jsdom):** local restores instantly; cloud-newer overrides local on hydrate; local-newer pushes to cloud; offline keeps local + retries.
- **E2E:** change theme/font on device A → reload persists (local); sign in on device B → preferences apply (cloud); reset-to-defaults works; corrupt localStorage → app still loads with defaults; no theme flash on reload.
- Live-Supabase cases pending-environment if unavailable; logic tests pass with mocks.

## 12.BB Edge Cases

- First-ever load (no local, no cloud) → defaults; first change seeds both.
- Conflicting local vs cloud timestamps → newer wins; equal → no-op.
- Schema version bump later → `migrate` upgrades transparently.
- User clears localStorage → cloud re-hydrates on next authed load.
- Rapid slider changes → coalesced push.
- Unapproved user → cannot reach settings (guarded) and cannot save (action rejects).
- Multiple tabs → `persist` storage events keep tabs roughly consistent; last write wins on cloud.

## 12.CC Acceptance Criteria

1. Reader preferences persist locally and restore **instantly** on reload (no theme flash).
2. Preferences sync to `user_preferences` (jsonb, versioned) and restore on another device, reconciled by recency (LWW).
3. `/settings` lets the user view/edit preferences (live-applied) and reset to defaults; account info + sign-out present.
4. Only the durable preference slice persists (transient reader state excluded); invalid stored/remote data falls back to defaults without crashing.
5. Save action is approval-guarded, validated, user-from-claims, and LWW-safe across devices.
6. Preference schema is versioned with a working `migrate`; jsonb reserves namespaces for future highlights/annotations/dictionary (documented, unimplemented).
7. Engine boundary and reader UI unchanged; `pnpm typecheck/lint/build` pass; Phases 0–11 tests green; new tests pass.

## 12.DD Definition of Done

- All Acceptance Criteria pass.
- Local-first persistence + cloud LWW sync + robust restoration implemented; settings architecture versioned and extensible (SAD §7-ready).
- `reader-store` persistence is additive (partialized); no Phase-1 renames; no engine/UI redesign.
- RLS/approval/claims security preserved; only non-sensitive prefs stored client-side.
- Global DoD gate satisfied.

---
---

## Appendix E — New Frozen Contracts Introduced in Phases 9–12

| Contract | Introduced | Import path / location | Consumers |
|---|---|---|---|
| `ReaderEngine` interface + events + `ReaderStyle` | Phase 9 | `@/features/reader/engine/types` | All reader/format work |
| `FoliateEngine` adapter + `createReaderEngine` | Phase 9 | `@/features/reader/engine` | `useReaderEngine` |
| `useReaderEngine` (sole React↔engine bridge) | Phase 9 | `@/features/reader/hooks/use-reader-engine` | Reader UI |
| `reader-store` durable preference slice (theme, fontFamily, fontSize, lineHeight, margin, textAlign) | Phase 9 | `@/store` | Phases 11, 12 |
| `saveProgressAction`, `POST /api/progress`, `persistProgress`, offline queue | Phase 10 | `@/features/reader/progress/*`, Route Handler | Reader, sync |
| `reading_sessions` table (capture-only) | Phase 10 | DB | Future statistics |
| `getContinueReading` | Phase 10 | `@/features/library/queries` | Dashboard |
| Reader UI store flags (`chromeVisible`, `activePanel`) + nav state | Phase 11 | `@/store` (ui/reader) | Reader UI |
| `user_preferences` table + `savePreferencesAction` + `getPreferences` | Phase 12 | DB, `@/features/preferences/*` | Settings, hydration |
| Versioned `Preferences` schema + `migrate` (reserved highlights/annotations/dictionary namespaces) | Phase 12 | `@/features/preferences/schema` | Future SAD §7 features |
| `ROUTES.SETTINGS` | Phase 12 | `@/lib/routes` | Settings |

## Appendix F — Global Definition-of-Done Gate (restated)

A phase is complete only when: (1) `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` pass; (2) all prior phases' tests remain green; (3) the phase's Acceptance Criteria pass; (4) no forward-phase functionality was implemented; (5) no secret is exposed to the client bundle; (6) frozen contracts (predecessor Appendices A/C + this Appendix E) were not renamed; (7) the invariants hold: private R2 bucket, keys-not-URLs, three-layer authorization, **strict React↔reader-engine isolation (SAD §5.1)**, no book bytes/tokens persisted client-side, and animations honor reduced-motion.

*End of ISD — Phases 9 through 12. Remaining/optional future work (highlights & annotations, in-book dictionary, additional formats via `FormatRouter`, reading-statistics charts, deeper PWA offline caching of owned books) to be authored on request.*
