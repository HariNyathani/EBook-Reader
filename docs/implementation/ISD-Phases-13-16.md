# Implementation Specification Document (ISD) — Final Installment

**Project:** Private EPUB Reader (Walled-Garden Web App + PWA)
**Document:** Master Implementation Blueprint — Phases 13 through 16 + Permanent Appendices
**Author:** Technical Lead / Principal Engineer
**Status:** Finalized for execution — concludes the Version 1.0 ISD
**Source of Truth:** SAD (revised) + `ISD-Phases-0-4.md`, `ISD-Phases-5-8.md`, `ISD-Phases-9-12.md` (all **locked**)
**Date:** 2026-07-05

---

## 13·0 Reading Guide for This Final Installment

Phases 0–12 are finalized and locked. Their technology baseline, frozen import contracts (predecessor Appendices A / C / E), the global Definition-of-Done gate, the top-level JWT-claims path, the `ReaderEngine` isolation boundary (SAD §5.1), and the forward-only phase rule all remain in force and are **not repeated** except where a Phase 13–16 dependency requires it.

**Restated facts a Phase 13–16 agent must assume as already true (do not re-implement):**

- Next.js 15 (App Router, React 19), TypeScript `strict`, pnpm, Tailwind, Zustand, Zod. Server code touching R2/zip/sharp/streaming runs on the Node runtime; never Edge.
- Full app exists: auth/authz (Phases 3–4), admin (Phase 5), R2 upload + secure delivery Route Handlers `GET /api/books/[id]/file` & `GET /api/covers/[id]` (Phase 6), EPUB extraction (Phase 7), library/dashboard (Phase 8), reader engine `ReaderEngine`/`useReaderEngine` (Phase 9), progress sync incl. `POST /api/progress` + offline queue (Phase 10), premium reader UI (Phase 11), local-first preferences + `user_preferences` (Phase 12).
- PWA scaffolding from Phase 2: `public/manifest.webmanifest`, `public/sw.js` (with `SYNC_READING_PROGRESS` message hook), `ServiceWorkerRegistrar`, `idb-keyval` installed; per-segment error boundaries; centralized `src/lib/env.ts`; Vitest + Playwright harness.
- Migrations `0001`–`0012` applied (`profiles`, `books`, `user_libraries`, `reading_progress`, `reading_sessions`, `user_preferences`) with RLS enforcing own-row + approval.
- Every protected Server Action begins with `requireApproved()`/`requireAdmin()` and returns `ActionResult<T>`. `process.env` is read only in `src/lib/env.ts`.

### 13·0.1 Phase Dependency Graph (this segment)

```
Phase 12 ──> Phase 13 (Offline & PWA) ──> Phase 14 (Performance & Prod Caching)
                                              └─> Phase 15 (A11y, Security Hardening, Prod Readiness)
                                                     └─> Phase 16 (Testing, Deployment, Release) ──> v1.0
```

These four phases are **cross-cutting hardening phases**. They touch many existing files but must remain **behavior-preserving** for shipped features (no feature redesign). Each still respects forward-only ordering and independent execution.

### 13·0.2 Critical Planning Decisions & Refinements (applied within the noted phase)

**(A) Offline reading requires a *scoped exception* to the "no book bytes client-side" invariant (Phase 13).** Phases 9–12 established "no book bytes/tokens persisted client-side." True offline reading is impossible without caching EPUB bytes locally. Rather than silently break the invariant, Phase 13 **refines** it: EPUB bytes may be persisted **only** for books the user **explicitly downloads for offline**, stored in IndexedDB keyed by `bookId`, **namespaced per user**, and **evicted on sign-out / on losing approval / on admin book deletion**. Streaming (non-downloaded) reading remains ephemeral (objectURL, no persistence) exactly as before. The Project-Wide Invariants appendix restates this refined rule as the permanent contract. No tokens are ever persisted.

**(B) Adopt Serwist for the service worker build (Phase 13).** Phase 2 permitted a plugin with an `ISD-NOTE` as long as the SW stays at `/sw.js` with a message-based sync hook. Hand-maintaining a precache manifest and cache-versioning across deploys is error-prone. Phase 13 adopts **Serwist** (`@serwist/next`) to generate `/sw.js` with a versioned precache + runtime caching, while **retaining custom logic** for the offline book store (IndexedDB) and progress Background Sync. This is compatible with the Phase-2/Phase-10 registration and `SYNC_READING_PROGRESS` contract. (Judgment call; a fully hand-rolled SW remains acceptable if an agent prefers, documented via `ISD-NOTE`.)

**(C) Rate limiting via Upstash (Phase 15).** Edge middleware needs a distributed limiter for auth, upload, and the progress beacon. Phase 15 introduces `@upstash/ratelimit` + `@upstash/redis` (serverless, edge-compatible). If Upstash is unavailable in an environment, a documented in-memory fallback (single-region, best-effort) is used with an `ISD-NOTE`.

**(D) Error/perf monitoring via Sentry (Phase 15/14).** Phase 15 adds `@sentry/nextjs` for client+server error tracking and release health; Phase 14 wires Web Vitals reporting (`@vercel/speed-insights` or a custom `web-vitals` reporter). PII/secret scrubbing is mandatory.

**(E) Strict environment separation (Phase 15).** Three isolated stacks — **development**, **preview**, **production** — each with its **own Supabase project** and **own R2 bucket** (`epub-reader-assets-{env}`). No shared credentials across environments. Preview deployments never touch production data.

**(F) Reversible/forward-safe migrations + backups (Phase 16).** Supabase migrations are forward-applied; Phase 16 requires each migration to be **additive/safe** or ship a documented reverse script, plus Supabase PITR and R2 object versioning for recovery.

### 13·0.3 New Required Subsection

Per this installment's outline, **every phase below includes an explicit "Accessibility considerations" subsection**, in addition to the standard set.

---
---

# Phase 13 — Offline Support & Progressive Web App

## 13.A Objective

Turn the app into a **fully installable, offline-capable PWA**: a robust, versioned **service worker** (Serwist) that precaches the app shell and runtime-caches static assets; **explicit per-book offline download** that stores EPUB bytes in IndexedDB for offline reading (scoped exception, §13·0.2 A); a well-defined **IndexedDB cache lifecycle** with invalidation and eviction; **Background Synchronization** of reading progress (building on Phase 10); **installability** (manifest + install prompt UX); graceful **network-recovery**; and **storage-quota** handling. All additive and behavior-preserving for online flows.

## 13.B Scope

**In scope:** Serwist SW (precache + runtime cache + navigation fallback/offline page); offline book store (download/read/delete, per-user, evict on sign-out); cache versioning + update prompt on new deploy; Background Sync for progress (SW `sync` → nudges clients to flush the Phase-10 queue); PWA install prompt component + install state; online/offline detection UX; `navigator.storage` quota estimate/persist + LRU eviction of offline books; "Available offline" indicators in library/reader.

**Out of scope:** offline *writes* to catalog/admin (admin is online-only); syncing highlights/annotations (future); changing auth/RLS. Streaming (non-downloaded) reading remains ephemeral.

## 13.C Prerequisites

- Phases 0–12 complete and green.
- Phase 2 PWA scaffolding + Phase 10 offline progress queue (`offline-queue.ts`, `SYNC_READING_PROGRESS`) present.
- `GET /api/books/[id]/file` streams EPUBs (Phase 6); `ReaderView`/`fetch-book-blob` (Phase 9) opens Blobs.

## 13.D Expected Existing Project State

- `public/sw.js` is a minimal hand-rolled SW (Phase 2) with a `SYNC_READING_PROGRESS` message stub (Phase 10 nudges clients).
- Reader opens via ephemeral objectURL only; no book persisted locally.
- Manifest + registrar exist; app is installable-ish but without offline reading.

## 13.E Dependencies

- **Adopt:** `@serwist/next` + `serwist` (SW build/runtime). Replaces the hand-rolled `public/sw.js` generation while preserving the `/sw.js` + message-sync contract (§13·0.2 B).
- `idb-keyval` already present (offline book store + progress queue). No other new runtime deps required.

## 13.F Folder Structure After Phase 13 (additions/changes)

```
src/
├─ app/
│  ├─ ~offline/page.tsx                 # NEW — offline fallback page (or app/offline)
│  └─ sw.ts                             # NEW — Serwist SW source (compiled → /sw.js)
├─ features/
│  └─ offline/
│     ├─ book-store.ts                  # NEW — IndexedDB: download/get/delete owned EPUB bytes (per user)
│     ├─ use-offline-book.ts            # NEW — 'use client' download/read/remove + progress
│     ├─ use-network-status.ts          # NEW — online/offline + recovery events
│     ├─ use-install-prompt.ts          # NEW — beforeinstallprompt capture + install()
│     ├─ storage.ts                     # NEW — quota estimate, persist(), LRU eviction policy
│     └─ components/
│        ├─ install-button.tsx          # NEW
│        ├─ offline-indicator.tsx       # NEW — online/offline banner
│        └─ offline-toggle.tsx          # NEW — "Download for offline" per book
├─ store/
│  └─ offline-store.ts                  # NEW — offlineBooks map, isOnline, storageInfo
└─ public/
   └─ sw.js                             # REMOVE hand-rolled (now generated by Serwist)
```

## 13.G Files to Create

- **`src/app/sw.ts`** — Serwist SW: `precacheAndRoute` the build manifest (shell, JS/CSS, icons, offline page); runtime caching: static assets (cache-first, versioned), navigations (network-first → `~offline` fallback). **Explicitly exclude** `/api/*` (never cache private book/cover/progress responses in Cache Storage). Implement `sync` event for tag `SYNC_READING_PROGRESS` → `postMessage` clients to flush (client performs authed save — SW never holds tokens). Versioned cache names; `skipWaiting`/`clientsClaim` gated behind an **update prompt** (see below) to avoid disruptive mid-read reloads.
- **`src/features/offline/book-store.ts`** (`'use client'`) — IndexedDB store (via `idb-keyval` custom store or `idb`): key `offline-book:{userId}:{bookId}` → `{ blob, title, author, sizeBytes, downloadedAt }`. API: `downloadBook(userId, book)`, `getOfflineBook(userId, bookId)`, `removeOfflineBook(userId, bookId)`, `listOffline(userId)`, `clearUser(userId)` (called on sign-out / approval loss). Never stores tokens. Enforces per-user namespacing.
- **`src/features/offline/use-offline-book.ts`** (`'use client'`) — download with progress (stream `GET /api/books/[id]/file` → accumulate → store), read (return objectURL from cached blob when offline/available), remove; updates `offline-store`.
- **`src/features/offline/use-network-status.ts`** (`'use client'`) — `online`/`offline` listeners + `navigator.onLine`; on recovery, trigger progress flush (Phase 10) and revalidate visible data.
- **`src/features/offline/use-install-prompt.ts`** (`'use client'`) — capture `beforeinstallprompt`, expose `canInstall` + `promptInstall()`; track `appinstalled`.
- **`src/features/offline/storage.ts`** (`'use client'`) — `getStorageInfo()` via `navigator.storage.estimate()`; `requestPersistent()` via `navigator.storage.persist()`; LRU eviction when nearing quota (evict least-recently-read offline books, never the currently open one).
- **Components:** `install-button.tsx` (shows when `canInstall`), `offline-indicator.tsx` (banner when offline), `offline-toggle.tsx` ("Download for offline" / "Remove download" per book with progress + size).
- **`src/store/offline-store.ts`** (`'use client'`) — `offlineBooks: Record<bookId, OfflineMeta>`, `isOnline: boolean`, `storageInfo`, setters. Not persisted (rebuilt from IndexedDB on load).
- **`src/app/~offline/page.tsx`** — friendly offline fallback listing downloaded books (link to reader) + "You're offline" messaging.

## 13.H Files to Modify

- **`next.config.ts`** — wrap with `withSerwist({ swSrc: 'src/app/sw.ts', swDest: 'public/sw.js', ... })`; keep existing security headers/CSP. Ensure `/sw.js` served with `Service-Worker-Allowed: /` + `no-cache` (Phase 2 rule).
- **`src/components/pwa/service-worker-registrar.tsx`** — align with Serwist registration; add **update-available** handling: when a new SW is waiting, show a non-blocking "Update available — reload" toast (via `ui-store`) rather than auto-reloading mid-read.
- **`src/features/reader/lib/fetch-book-blob.ts`** — prefer an **offline copy** if present (via `getOfflineBook`) before hitting the network; fall back to `GET /api/books/[id]/file` when online and not downloaded.
- **`src/features/library/components/*` / `BookCard`** — add an "Available offline" badge + `offline-toggle` affordance (presentational; wired to `use-offline-book`).
- **`src/features/auth/actions.ts` (`signOutAction`)** — on sign-out, call a client cleanup that runs `book-store.clearUser(userId)` + clears the Phase-10 progress queue for the user (flush first if online). (Sign-out is a Server Action; trigger client cleanup via a post-signout client effect or a dedicated `useSignOutCleanup` hook — do not attempt IndexedDB access from the server.)
- **`public/sw.js`** — remove the hand-rolled file (now generated); ensure `.gitignore` ignores the generated `public/sw.js` and its Serwist artifacts.
- **`src/app/(app)/layout.tsx`** — mount `<OfflineIndicator/>`; keep `PreferencesProvider` (Phase 12).

## 13.I Database Migrations

None. Offline state is client-side only.

## 13.J Database Schema Updates

None.

## 13.K Environment Variables

None required. (Serwist is build-time.) Optional `NEXT_PUBLIC_PWA_ENABLED` flag to disable SW in certain preview envs — documented, default enabled in production.

## 13.L Configuration

- Serwist config (precache globs, runtime routes, exclude `/api/*`). Versioned caches; update-prompt strategy (no forced reload).
- `manifest.webmanifest` (Phase 2) verified: `display: standalone`, icons (192/512/maskable), `start_url`, `id`, `scope`, theme/background colors, and (optional) `shortcuts` to Dashboard/Continue.

## 13.M React Components

- `InstallButton`, `OfflineIndicator`, `OfflineToggle`, `~offline` page. Presentational + wired to `offline-store`.

## 13.N Custom Hooks

- `use-offline-book`, `use-network-status`, `use-install-prompt`. Reader/library consume them; no engine coupling.

## 13.O Zustand Stores

- `offline-store` (new, transient). Rebuilt from IndexedDB on load; not persisted itself.

## 13.P Utility Modules

- `book-store` (IndexedDB), `storage` (quota/persist/LRU). Client-only.

## 13.Q TypeScript Interfaces

- `OfflineMeta { bookId; title; author; sizeBytes; downloadedAt; lastReadAt }`, `StorageInfo { usage; quota; persisted }`, `NetworkStatus`.

## 13.R Validation Schemas

- Minimal; validate `bookId` (uuid) before download. IndexedDB payloads are app-generated (no external input).

## 13.S Server Actions

- None new. (Offline download reuses the existing gated `GET /api/books/[id]/file`.)

## 13.T Route Handlers

- None new. SW navigation fallback uses the `~offline` page. `/api/*` remains uncached by the SW.

## 13.U API Contracts

- Reuses `GET /api/books/[id]/file` for download; SW ↔ client message contract `SYNC_READING_PROGRESS` (Phase 10) formalized. No new HTTP contracts.

## 13.V Integration Points

- **Phase 6** delivery handler (download source). **Phase 9** `fetch-book-blob` prefers offline copy. **Phase 10** Background Sync flush. **Phase 4** sign-out → offline cleanup.

## 13.W State Management

- `offline-store` (transient) mirrors IndexedDB; `isOnline` drives UX. Reader chooses offline copy vs. network transparently. Progress still LWW-synced (Phase 10).

## 13.X Error Handling

- Download failure (network/quota) → surface error + keep partial cleaned up; QuotaExceeded → prompt eviction or `persist()`; offline read with no cached copy → clear "Not available offline" message; SW update failures → non-blocking.

## 13.Y Performance Considerations

- Precache only the shell (small); large book blobs go to IndexedDB on explicit user action, never auto-precached. Stream downloads with progress. LRU eviction bounds storage. Cache-first for static assets speeds repeat loads.

## 13.Z Security Considerations

- **Scoped exception to the no-persist rule (§13·0.2 A):** only user-downloaded EPUB bytes persist, per-user namespaced in IndexedDB, **evicted on sign-out / approval loss / book deletion**. **No tokens ever persisted.** SW never stores credentials and never caches `/api/*` responses in Cache Storage. Offline books are not accessible across user accounts on a shared device (namespaced + cleared on sign-out).
- On losing approval or account deletion, offline content must be purged on next authed load.

## 13.AA Accessibility Considerations

- Install button, offline banner, and download toggles are keyboard-operable with clear labels and `aria-live` for state changes (offline/online, download complete). Offline page is fully navigable and announced. Update-available toast is announced politely (not assertively) and dismissible via keyboard.

## 13.BB Testing Requirements

- **Unit:** `book-store` CRUD + per-user namespacing + `clearUser`; `storage` LRU eviction picks least-recently-read; `use-offline-book` download/progress/remove (mock fetch/IDB).
- **E2E (Playwright, offline emulation):** download a book online → go offline → open it from `~offline`/library → reads; progress edited offline syncs on reconnect; sign-out purges offline books; install prompt appears/installs; SW update shows prompt (no forced mid-read reload); `/api/*` not served from cache.
- Storage-quota simulation; verify no token/`/api/*` persistence.

## 13.CC Edge Cases

- Quota exceeded mid-download → clean partial, prompt user. Deleted book still downloaded → purge on detection; reader shows "removed by admin." Multiple users on one device → isolated + cleared on sign-out. SW controlling old clients after deploy → update prompt. Private-mode/no-IDB browsers → offline download disabled gracefully; online reading unaffected. Airplane mode at cold start → shell + downloaded books load from cache.

## 13.DD Acceptance Criteria

1. App is installable (valid manifest + SW) and passes a PWA install audit.
2. A user can explicitly download a book and read it fully offline; non-downloaded books read only when online (ephemeral).
3. Offline reading position syncs on reconnect (Phase-10 Background Sync/flush).
4. SW precaches the shell, serves an offline fallback, versions caches, and prompts (not forces) updates; `/api/*` never cached in Cache Storage.
5. Offline books are per-user, evicted on sign-out/approval loss/book deletion; no tokens persisted.
6. Storage quota is estimated, `persist()` requested, and LRU eviction protects against overflow.
7. Online/offline transitions are reflected in UX and recover cleanly.
8. `pnpm typecheck/lint/build` pass; Phases 0–12 tests green; new offline tests pass.

## 13.EE Definition of Done

- All Acceptance Criteria pass; PWA is installable and offline-capable with the **scoped, documented** persistence exception and no token persistence.
- Serwist adopted at `/sw.js` preserving the Phase-2/10 registration + sync contracts; online flows behavior-preserved.
- Global DoD gate + refined invariants satisfied.

---
---

# Phase 14 — Performance Optimization & Production Caching

## 14.A Objective

Bring the app to **production performance targets** without changing behavior: optimize the JS bundle and code-splitting; tune route/RSC streaming and lazy loading; optimize covers and reader rendering; eliminate wasteful React re-renders and Zustand subscriptions; audit and add DB indexes + tighten queries; formalize the caching strategy (Next `unstable_cache` tags, HTTP cache headers, Cloudflare/CDN for covers); manage memory (streaming, objectURL/engine lifecycle, SW cache bounds); enforce **performance budgets** in CI; and establish **Web Vitals monitoring**.

## 14.B Scope

**In scope:** bundle analysis + splitting; dynamic imports for heavy client modules (reader already dynamic — verify TOC/search/typography panels are split); route optimization (Suspense boundaries, streaming, prefetch); cover image optimization (sizes, cache headers, optional edge caching); reader perf (prefetch adjacent sections if engine supports, avoid re-renders); React perf (memoization, selective selectors, stable callbacks); DB indexes audit + additions; query column pruning + pagination + N+1 elimination; caching strategy consolidation; Cloudflare/R2 cache tuning; performance budgets (bundle size, LCP/INP/CLS) in CI; Web Vitals reporting.

**Out of scope:** feature changes; security/a11y hardening (Phase 15); test/deploy infra (Phase 16). Must not alter privacy semantics (EPUB `no-store` stays).

## 14.C Prerequisites

- Phases 0–13 complete and green.

## 14.D Expected Existing Project State

- Working app with library, reader, offline. `unstable_cache` used for catalog (Phase 8, tag `library`), covers cached `private, max-age=3600` (Phase 6). foliate dynamically imported (Phase 9).

## 14.E Dependencies

- **Dev:** `@next/bundle-analyzer`. **Runtime (light):** `@vercel/speed-insights` (or `web-vitals` + a custom reporter) for RUM. No heavy additions.

## 14.F Folder Structure After Phase 14 (additions/changes)

```
supabase/migrations/
└─ 0013_performance_indexes.sql         # NEW (only if audit finds gaps)
src/
├─ lib/
│  ├─ perf/
│  │  ├─ web-vitals.ts                  # NEW — report Core Web Vitals
│  │  └─ report-vitals.tsx              # NEW — 'use client' hook-in component
│  └─ cache/
│     └─ http.ts                        # NEW — shared Cache-Control builders
├─ (various) components/hooks           # MODIFY — memo/selectors/lazy (audit-driven)
next.config.ts                          # MODIFY — analyzer, headers, modularizeImports
performance-budgets.json                # NEW — budgets enforced in CI (Phase 16 runs it)
```

## 14.G Files to Create

- **`src/lib/perf/web-vitals.ts`** + **`report-vitals.tsx`** — capture LCP/INP/CLS/TTFB and forward to the analytics sink (Speed Insights or a `/api` beacon → logging). No PII.
- **`src/lib/cache/http.ts`** — centralized `Cache-Control` builders: `immutableAsset()`, `privateShort(maxAge)`, `noStore()` (reuse Phase-2 `headers.ts` for EPUB `no-store`; consolidate cover/static policies here).
- **`performance-budgets.json`** — budgets: first-load JS per route, total shell size, LCP/INP/CLS thresholds; consumed by CI (Phase 16).
- **`supabase/migrations/0013_performance_indexes.sql`** (only if the query audit finds missing indexes) — add indexes to cover hot paths not already indexed (e.g., composite for admin user search, `books` title/author search via `pg_trgm` if `ilike` search is slow). Keep additive/safe.

## 14.H Files to Modify

- **`next.config.ts`** — enable `@next/bundle-analyzer` (gated by env), add `modularizeImports`/`optimizePackageImports` for large libs if any, verify per-route caching headers via `cache/http.ts`, and image handling (covers served by Route Handler; if any static images exist, configure `images`).
- **Reader UI (Phase 11) components/hooks** — audit: memoize expensive components, ensure Zustand **selective selectors** (avoid whole-store subscriptions that re-render the reader), stable event handlers, split TOC/search/typography panels via dynamic import so they load on demand.
- **`src/features/library/queries.ts`** — select only needed columns; confirm pagination; ensure `getProgressMap`/`getContinueReading` avoid N+1; tune cache TTLs.
- **`src/features/admin/queries.ts`** — column pruning; ensure counts use `head:true`; confirm indexes.
- **Cover Route Handler (Phase 6)** — confirm `private, max-age=3600` (or tune) and consider `stale-while-revalidate`; document Cloudflare/R2 edge behavior (R2 is origin; CDN caches per headers). EPUB stays `no-store`.
- **`src/app/(app)/layout.tsx`** (or root) — mount `<ReportVitals/>`.

## 14.I Database Migrations

- Optional `0013_performance_indexes.sql` (audit-driven; additive). If `pg_trgm` used for search, `create extension if not exists pg_trgm` + GIN indexes on `books(title)`, `books(author)`.

## 14.J Database Schema Updates

- Indexes only (no column/table changes).

## 14.K Environment Variables

- Optional: `ANALYZE=true` (dev bundle analysis), `NEXT_PUBLIC_SPEED_INSIGHTS` toggle. No secrets.

## 14.L Configuration

- Bundle analyzer, caching header builders, performance budgets. Prefetching for likely navigations (Continue Reading → reader).

## 14.M React Components

- `ReportVitals` (client). Otherwise modifications to existing components (memoization/lazy), no new feature UI.

## 14.N Custom Hooks

- None new (audit may extract stable-callback helpers). Ensure reader hooks don't over-subscribe.

## 14.O Zustand Stores

- No new stores; enforce **selector discipline** (subscribe to minimal slices) across reader/offline stores to prevent re-render storms.

## 14.P Utility Modules

- `perf/web-vitals`, `cache/http`.

## 14.Q TypeScript Interfaces

- `WebVitalMetric`, `CachePolicy`, `PerformanceBudget`.

## 14.R Validation Schemas

- None new.

## 14.S Server Actions

- None new. (Optimize existing queries' shape only.)

## 14.T Route Handlers

- None new. Tune cache headers on the cover handler; keep EPUB `no-store`. Optional `/api/vitals` beacon sink (or use Speed Insights).

## 14.U API Contracts

- Unchanged externally. Cache-Control semantics documented centrally.

## 14.V Integration Points

- **Phase 6/8** caching; **Phase 9/11** reader render perf; **Phase 16** CI enforces `performance-budgets.json`; monitoring sink (Vercel/Sentry).

## 14.W State Management

- Selector-level subscriptions; avoid context/store changes causing reader re-mounts (engine must never re-mount on unrelated state changes).

## 14.X Error Handling

- Vitals reporting is best-effort (never blocks render). Cache misconfig must never leak private content (EPUB `no-store` invariant protected by tests).

## 14.Y Performance Considerations

- Targets: **LCP ≤ 2.5s**, **INP ≤ 200ms**, **CLS ≤ 0.1** on mid-tier mobile; first-load JS per route within budget; reader interaction (page turn) ≤ 100ms. Stream RSC; lazy-load reader panels; prefetch adjacent content; avoid layout shift (reserve cover space). Memory: revoke objectURLs, destroy engine, bound SW/IDB caches (Phase 13 LRU).

## 14.Z Security Considerations

- Caching changes must preserve privacy: EPUB `no-store`; covers `private`; never make `/api/*` publicly cacheable; CDN caches covers only per private headers (or keep origin-only). Vitals/RUM payloads carry no PII or URLs with identifiers beyond route templates.

## 14.AA Accessibility Considerations

- Performance work must not regress a11y: lazy-loaded panels still receive focus correctly; skeleton/loading states are announced; no CLS that disorients screen-magnifier users; prefetch does not steal focus. Reduced-motion honored in any perf-driven transitions.

## 14.BB Testing Requirements

- **Perf tests:** Lighthouse CI (or Playwright + web-vitals) asserting budgets on key routes (dashboard, reader). Bundle-size assertion against `performance-budgets.json`.
- **Regression:** cover cache headers correct; EPUB still `no-store` (test). Reader does not re-mount on theme/preference/store changes (render-count assertion with mocked engine). Query audits: no N+1 (assert single queries).
- **Monitoring smoke:** vitals reporter fires without blocking.

## 14.CC Edge Cases

- Slow 3G cold start → shell + skeletons; progressive hydration. Large TOC/search → virtualized (Phase 11) + lazy. Many covers on screen → lazy/`loading=lazy`, cache reuse. Low-memory device → bounded caches, engine teardown. Analyzer disabled in prod builds.

## 14.DD Acceptance Criteria

1. Core Web Vitals meet targets on key routes (measured in CI); budgets enforced.
2. First-load JS per route within budget; reader panels code-split; foliate not in the main bundle.
3. Reader does not re-mount on unrelated state changes; page-turn latency within target.
4. Queries prune columns, paginate, and avoid N+1; needed indexes exist.
5. Caching consolidated: covers `private` cached, EPUB `no-store`, `/api/*` never publicly cached; catalog tag-revalidated.
6. Web Vitals reported to a monitoring sink without PII; reporting is non-blocking.
7. No behavior/feature regressions; `pnpm typecheck/lint/build` pass; Phases 0–13 tests green; new perf tests pass.

## 14.EE Definition of Done

- All Acceptance Criteria pass; measurable perf targets met and guarded by CI budgets; privacy-preserving caching intact; no feature/a11y regressions. Global DoD gate satisfied.

---
---

# Phase 15 — Accessibility, Security Hardening & Production Readiness

## 15.A Objective

Achieve **WCAG 2.1 AA**, **hardened security**, and **operational readiness** for production: complete keyboard/screen-reader/reduced-motion/focus support across all flows; finalize CSP and security headers; add **rate limiting** (auth, upload, progress beacon); audit input validation and error-boundary coverage; implement **structured production logging + error/uptime monitoring**; formalize **secrets management** and **environment separation** (dev/preview/prod with isolated Supabase + R2); and produce **operational runbooks/health checks**. Behavior-preserving for features.

## 15.B Scope

**In scope:** a11y audit + fixes (keyboard, SR, focus, contrast, reduced motion, forms/labels, landmarks, skip links, reader announcements); CSP finalization (nonce/strict-dynamic where feasible; remove `unsafe-inline`); full security header set (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP as compatible with the reader iframe); rate limiting via Upstash (middleware); input-validation audit (all Zod boundaries; file/beacon/JSON); error-boundary coverage audit; Sentry (client+server) with PII scrubbing; structured logging util; health-check endpoint; secrets policy + rotation notes; three-environment separation; operational runbook.

**Out of scope:** new features; test/deploy pipeline (Phase 16, which consumes this phase's gates).

## 15.C Prerequisites

- Phases 0–14 complete and green.

## 15.D Expected Existing Project State

- CSP present (Phases 2/9) but may use `unsafe-inline`/broad `blob:`. Error boundaries per segment (Phase 2). Zod at action/route boundaries. Single Supabase project/R2 bucket if not yet separated.

## 15.E Dependencies

- `@upstash/ratelimit` + `@upstash/redis` (rate limiting; §13·0.2 C). `@sentry/nextjs` (monitoring; §13·0.2 D). Dev/a11y: `@axe-core/playwright` (automated a11y checks), `eslint-plugin-jsx-a11y` (if not already via `next/core-web-vitals`).

## 15.F Folder Structure After Phase 15 (additions/changes)

```
src/
├─ middleware.ts                        # MODIFY — add rate limiting (auth/upload/beacon)
├─ lib/
│  ├─ security/
│  │  ├─ csp.ts                         # NEW — nonce-based CSP builder
│  │  ├─ rate-limit.ts                  # NEW — Upstash limiter factory (+ in-memory fallback)
│  │  └─ headers.ts                     # NEW/MOVE — full security header set
│  ├─ logging/
│  │  └─ logger.ts                      # NEW — structured, PII-scrubbing logger
│  └─ monitoring/
│     └─ sentry.*                        # NEW — sentry.client/server/edge config
├─ app/
│  ├─ api/health/route.ts               # NEW — health check
│  └─ (a11y fixes across components)     # MODIFY
docs/
├─ RUNBOOK.md                           # NEW — operational runbook
└─ SECURITY.md                          # NEW — secrets/rotation/threat model
sentry.client.config.ts / server / edge # NEW (per @sentry/nextjs)
```

## 15.G Files to Create

- **`src/lib/security/csp.ts`** — per-request **nonce-based** CSP: `script-src 'self' 'nonce-…' 'strict-dynamic'`; `style-src 'self' 'nonce-…'` (or hashed); `frame-src 'self' blob:`; `img-src 'self' blob: data:`; `connect-src 'self' <supabase> <upstash?> <sentry?>`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'self'`. Applied via middleware/response headers; nonce threaded to the document. Preserve the reader's `blob:` needs (Phase 9).
- **`src/lib/security/rate-limit.ts`** — Upstash `Ratelimit` factory with named policies: `authLimiter` (e.g., 5/min/IP+email), `uploadLimiter` (admin, low), `progressLimiter` (generous), `defaultLimiter`. In-memory fallback with `ISD-NOTE` if Upstash env absent.
- **`src/lib/security/headers.ts`** — full header set (HSTS `max-age` w/ preload in prod only, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` locking down unused features, COOP; **CORP/COEP only if compatible** with the foliate iframe — test).
- **`src/lib/logging/logger.ts`** — structured logger (levels, JSON in prod), **scrubs** secrets/PII (emails hashed/omitted, no tokens, no CFIs of others). Server-only.
- **Sentry configs** (`sentry.{client,server,edge}.config.ts`) — DSN from env; `tracesSampleRate` modest; `beforeSend` scrubs PII/headers/cookies; release/version tagging; source maps upload in CI (Phase 16).
- **`src/app/api/health/route.ts`** — lightweight liveness/readiness (checks Supabase reachability + R2 credentials presence; returns 200/503). No secrets in body.
- **`docs/RUNBOOK.md`** — incident response, on-call, common failures (Supabase down, R2 down, SW cache poisoning, rate-limit tuning), rollback pointers (Phase 16), env matrix.
- **`docs/SECURITY.md`** — secrets inventory + rotation policy, environment separation, threat model, RLS/authorization summary, reporting process.

## 15.H Files to Modify

- **`src/middleware.ts`** — add rate limiting for `/login`/`/register` (auth), upload action route/segment, and `POST /api/progress`; apply CSP nonce header; keep Phase-4 auth guards + `updateSession`. Return `429` with a friendly message on limit.
- **`next.config.ts`** — replace static CSP with the nonce-based builder; add the full security header set; HSTS in prod only.
- **`.env.example` / `src/lib/env.ts`** — add `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (CI), `APP_ENV` (`development|preview|production`), and env-specific `R2_BUCKET` (`epub-reader-assets-{env}`). Validate; enforce that prod requires all monitoring/limiter vars (or explicit opt-out flag).
- **A11y fixes across components (audit-driven):** skip-to-content link; landmark roles; labelled controls/forms; focus-visible styles; focus trap + restore for reader panels/drawers/dialogs (Phase 11); reader **live-region announcements** (page/chapter changes, loading, errors); color-contrast fixes for all three themes (light/sepia/dark meet AA); ensure all interactive elements keyboard-reachable; error messages associated with inputs (`aria-describedby`).
- **Error boundaries audit** — ensure every route segment + the reader + admin + settings have boundaries; unify fallback UX; boundaries report to Sentry.
- **Server Actions/Route Handlers audit** — confirm every input is Zod-validated server-side; file upload re-validated (Phase 6); beacon/JSON validated (Phase 10); no unvalidated `formData` reads.

## 15.I Database Migrations

None required. (Rate-limit state lives in Upstash, not Postgres.)

## 15.J Database Schema Updates

None. (RLS already enforced; this phase audits/documents it, adds no columns.)

## 15.K Environment Variables

- New: `APP_ENV`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, env-scoped `R2_BUCKET`. Production build **fails** if required prod vars missing (env validation).

## 15.L Configuration

- Nonce CSP + full headers; HSTS prod-only; Sentry sample rates; rate-limit policies; environment matrix (isolated Supabase + R2 per env).

## 15.M React Components

- Skip link, focus-visible utilities, live-region announcer (reader), improved error fallbacks. Mostly a11y refinements to existing components.

## 15.N Custom Hooks

- `useAnnouncer` (reader SR announcements via `aria-live`), `useFocusTrap`/`useFocusReturn` (if not already in Phase 11) — consolidate.

## 15.O Zustand Stores

- No new stores. (Announcer may use a small transient slice or context.)

## 15.P Utility Modules

- `security/{csp,rate-limit,headers}`, `logging/logger`, Sentry configs, health route.

## 15.Q TypeScript Interfaces

- `RateLimitPolicy`, `SecurityHeaders`, `LogContext`, `HealthStatus`.

## 15.R Validation Schemas

- Audit-complete: every server boundary validated. Add any missing schemas discovered.

## 15.S Server Actions

- No new actions; wrap sensitive ones with rate-limit checks where applicable (auth/upload) and ensure standardized error handling + logging.

## 15.T Route Handlers

- `GET /api/health` (new). Existing handlers gain rate limiting (progress beacon) + security headers.

## 15.U API Contracts

- `429` responses standardized (`{ status:'error', code:'RATE_LIMITED' }` for actions; plain 429 for beacon). Health endpoint contract documented. No feature contract changes.

## 15.V Integration Points

- **Upstash** (limiter), **Sentry** (errors/perf), **Supabase/R2** (env-separated), **middleware** (CSP + limits + auth). **Phase 16** consumes health check + monitoring in CI/verification.

## 15.W State Management

- Unchanged; announcer state transient. Security is stateless at the edge (limiter state in Upstash).

## 15.X Error Handling

- Global boundaries + Sentry capture; structured server logs with scrubbing; friendly user-facing errors (no stack traces/PII to client); `429`/`503` handled gracefully.

## 15.Y Performance Considerations

- Rate limiting adds a fast Upstash call on sensitive routes only (not every request). CSP nonce generation is cheap. Sentry sampling modest to bound overhead. Health check is lightweight.

## 15.Z Security Considerations

- Strict nonce CSP (no `unsafe-inline` scripts), full header set, HSTS (prod). Rate limiting mitigates brute-force/abuse (auth/upload/beacon). All inputs validated server-side. Secrets: server-only, never `NEXT_PUBLIC_`, rotation documented; **isolated per environment** (no prod creds in preview/dev). RLS + three-layer authz reaffirmed. Logs/monitoring scrub PII/secrets. Reader iframe sandbox + `blob:`-scoped CSP preserved.

## 15.AA Accessibility Considerations (primary focus)

- **WCAG 2.1 AA**: keyboard operability for **every** flow (auth, library, admin, reader, settings, offline); visible focus; logical focus order; skip link; landmarks/headings; form labels + error association; SR support incl. reader **live announcements** for page/chapter/loading/errors; **reduced-motion** honored everywhere; **contrast AA** across all three themes; touch targets ≥ 44px; no keyboard traps (except intentional, escapable modal focus traps). Automated (`@axe-core/playwright`) + manual SR passes (NVDA/VoiceOver) required.

## 15.BB Testing Requirements

- **A11y:** `@axe-core/playwright` on all key pages (0 serious/critical violations); manual keyboard + screen-reader run-through checklist; contrast checks per theme; reduced-motion behavior.
- **Security:** CSP has no `unsafe-inline` script; header presence tests; rate-limit tests (429 after threshold on auth/upload/beacon); input-validation negative tests; RLS regression (unapproved denied) re-run; secrets never in client bundle (grep/test).
- **Monitoring:** Sentry captures a thrown error (test env); logger scrubs a seeded secret/email.
- **Health:** `/api/health` returns 200 when deps reachable, 503 when simulated down.

## 15.CC Edge Cases

- Upstash outage → limiter fails **open** or falls back to in-memory (documented; auth still protected by Supabase). CSP breaking a needed inline (e.g., a lib) → move to nonce/hash, never re-add blanket `unsafe-inline`. Reader iframe vs. COEP/CORP conflicts → relax only the specific directive, tested. Screen-reader focus after route change → moved to main/heading. Rate-limited legitimate user → clear retry-after messaging.

## 15.DD Acceptance Criteria

1. All key pages pass automated a11y (no serious/critical) and a manual keyboard + SR checklist; all three themes meet AA contrast; reduced-motion honored.
2. Nonce-based CSP (no `unsafe-inline` scripts) + full security header set active; reader still functions (blob: iframe).
3. Rate limiting protects auth, upload, and the progress beacon (429 on abuse) via Upstash (or documented fallback).
4. Every server input is Zod-validated; error boundaries cover all segments and report to Sentry; logs scrub PII/secrets.
5. Secrets are server-only and **isolated per environment** (dev/preview/prod own Supabase + R2); prod build fails without required vars.
6. `/api/health` reports dependency status; RUNBOOK + SECURITY docs exist.
7. No feature regressions; `pnpm typecheck/lint/build` pass; Phases 0–14 tests green; new a11y/security tests pass.

## 15.EE Definition of Done

- All Acceptance Criteria pass; WCAG 2.1 AA met; security hardened (CSP, headers, rate limiting, validation, secrets, env separation); monitoring/logging/health operational. Global DoD gate satisfied.

---
---

# Phase 16 — Testing, Deployment & Release Readiness

## 16.A Objective

Establish the **complete quality, delivery, and recovery apparatus** for Version 1.0: consolidate unit/integration/E2E test suites with coverage gates; produce a **manual QA checklist** and **release checklist**; build the **CI/CD pipeline** (lint, typecheck, test, a11y, build, budgets, migrations, preview deploys, production promotion); define **production verification (smoke)**, **rollback**, **backup**, and **disaster recovery**; set the **versioning** strategy; specify **documentation** deliverables; and define the **final Definition of Done for v1.0** (which the two appendices formalize).

## 16.B Scope

**In scope:** test-suite consolidation + coverage thresholds; Playwright E2E covering critical journeys; local Supabase for integration/RLS tests; manual QA + release checklists; GitHub Actions CI/CD (PR checks + preview + prod); DB migration gating in CI; post-deploy smoke tests; rollback (app + DB) runbook; backup (Supabase PITR, R2 versioning) + DR (RTO/RPO, restore drill); semver + changelog + tagging; documentation set (README, ARCHITECTURE, RUNBOOK already from Phase 15, CONTRIBUTING, ENV, API/notes); v1.0 DoD.

**Out of scope:** new features; further hardening (done in Phase 15). This phase wires and verifies, not redesigns.

## 16.C Prerequisites

- Phases 0–15 complete and green. Monitoring/health/security in place (Phase 15). Environment separation configured.

## 16.D Expected Existing Project State

- Vitest + Playwright configured (Phase 2); tests accumulated across phases; `performance-budgets.json` (Phase 14); a11y/security tests (Phase 15); `/api/health`; Sentry; isolated envs.

## 16.E Dependencies

- **Dev/CI:** `@vitest/coverage-v8` (coverage), `@axe-core/playwright` (Phase 15), Lighthouse CI (optional, budgets), `dotenv-cli` (optional). GitHub Actions (no npm). `supabase` CLI in CI for migrations + local integration DB.

## 16.F Folder Structure After Phase 16 (additions/changes)

```
.github/workflows/
├─ ci.yml                               # NEW — PR: lint, typecheck, unit, integration, e2e, a11y, build, budgets
├─ deploy-preview.yml                   # NEW — preview deploy + smoke
└─ deploy-production.yml                # NEW — prod promotion + migrations + smoke + Sentry release
tests/
├─ e2e/                                 # journeys (auth, library, reader, offline, admin)
├─ integration/                         # Supabase-local RLS + queries
└─ smoke/                               # post-deploy smoke (health, auth, read-a-book)
docs/
├─ README.md                            # MODIFY/CREATE
├─ ARCHITECTURE.md                      # NEW — points to SAD + ISD set
├─ CONTRIBUTING.md                      # NEW
├─ ENVIRONMENTS.md                      # NEW — env matrix + secrets sourcing
├─ RELEASE_CHECKLIST.md                 # NEW
├─ QA_CHECKLIST.md                      # NEW
├─ ROLLBACK.md                          # NEW
├─ BACKUP_DR.md                         # NEW
└─ CHANGELOG.md                         # NEW
scripts/
├─ smoke.ts                             # NEW — scripted prod/preview smoke
└─ verify-migrations.ts                 # NEW — asserts migrations apply cleanly on a scratch DB
```

## 16.G Files to Create

- **CI (`.github/workflows/ci.yml`)** — on PR/push: install (pnpm, cached), `lint`, `typecheck`, `format:check`, `test` (unit + coverage gate), spin up **local Supabase** → apply migrations → run **integration/RLS** tests, `build`, run **Playwright E2E** (against a built app) + **axe a11y**, enforce **performance budgets**. Fail fast; upload artifacts (Playwright report, coverage).
- **Preview deploy (`deploy-preview.yml`)** — on PR: deploy to a preview (Vercel) using **preview** Supabase/R2; run `smoke.ts` against the preview URL; comment status.
- **Production deploy (`deploy-production.yml`)** — on tag/`main`: apply **prod** migrations (gated, `verify-migrations.ts` first on a scratch DB), deploy, run prod smoke, create **Sentry release** + upload source maps, notify.
- **`scripts/smoke.ts`** — hits `/api/health`, loads `/login`, performs a scripted approved-user login + opens a known book (env-provided test creds) — non-destructive.
- **`scripts/verify-migrations.ts`** — applies all migrations to a throwaway DB and asserts success + presence of expected objects/policies (extends Phase-3 checks).
- **Docs:** `README`, `ARCHITECTURE` (index into SAD + ISD 0-16), `CONTRIBUTING`, `ENVIRONMENTS`, `RELEASE_CHECKLIST`, `QA_CHECKLIST`, `ROLLBACK`, `BACKUP_DR`, `CHANGELOG`.

## 16.H Files to Modify

- **`package.json`** — scripts: `test:integration`, `test:e2e`, `test:a11y`, `test:coverage`, `smoke`, `verify:migrations`, `db:migrate:prod` (gated). Coverage thresholds in `vitest.config.ts`.
- **`vitest.config.ts`** — coverage thresholds (e.g., **lines ≥ 70%**, higher for `lib/*` critical modules); exclude vendored foliate + generated types.
- **`playwright.config.ts`** — projects for desktop + mobile viewports; trace on failure; `webServer` builds+starts the app.
- **`README.md`** — setup, env, run, test, deploy; link the full doc set.

## 16.I Database Migrations

- No new schema. CI **verifies** all existing migrations (`0001`–`0013`) apply cleanly and are idempotent where declared. Establish the **reverse/rollback** note per migration (§13·0.2 F): additive-safe or documented down-script.

## 16.J Database Schema Updates

None.

## 16.K Environment Variables

- CI/CD secrets (GitHub Actions): Vercel token/project, Supabase project refs + service keys per env, R2 creds per env, Upstash, Sentry auth token, smoke-test creds. **Never** printed in logs. `ENVIRONMENTS.md` documents sourcing.

## 16.L Configuration

- Branch protection: PR must pass `ci.yml` before merge. Tag-based prod deploys. Preview per PR. Migration gating before prod deploy.

## 16.M React Components

- None (test/ops phase).

## 16.N Custom Hooks

- None.

## 16.O Zustand Stores

- None.

## 16.P Utility Modules

- `scripts/smoke.ts`, `scripts/verify-migrations.ts`.

## 16.Q TypeScript Interfaces

- `SmokeResult`, minimal CI types. (Tests define their own fixtures/types.)

## 16.R Validation Schemas

- Reuse existing; tests assert validation behavior.

## 16.S Server Actions / 16.T Route Handlers

- None new. E2E/smoke exercise existing actions/handlers (incl. `/api/health`).

## 16.U API Contracts

- CI verifies existing contracts (delivery handlers, progress beacon, health) via E2E/smoke; no changes.

## 16.V Integration Points

- **GitHub Actions ↔ Vercel/Supabase/R2/Sentry/Upstash**; local Supabase for integration; Playwright against built app; Sentry release tagging.

## 16.W State Management

- N/A (infra). Tests assert app state behavior (progress sync, preferences, offline).

## 16.X Error Handling

- CI fails on any gate; deploy aborts if migrations or smoke fail; documented rollback path. Flaky-test policy (retry + quarantine) documented.

## 16.Y Performance Considerations

- CI enforces `performance-budgets.json` (Phase 14). Cache pnpm store + Playwright browsers for fast CI. Parallelize test shards.

## 16.Z Security Considerations

- Secrets only via CI secret store; never in logs/artifacts. Preview never uses prod data (env separation, Phase 15). Source maps uploaded to Sentry but **not** publicly served. Dependency audit (`pnpm audit`/Dependabot) in CI. Smoke uses a dedicated non-privileged test account.

## 16.AA Accessibility Considerations

- CI runs automated a11y (axe) as a **required** gate; the manual **QA checklist** includes keyboard + screen-reader + reduced-motion + contrast sign-off before release. A11y regressions block release.

## 16.BB Testing Requirements

- **Unit:** coverage thresholds met; critical `lib/*` (r2, epub, progress, preferences, security) well-covered.
- **Integration:** RLS (unapproved denied, own-row only), conditional upserts (progress/preferences), extractor against fixtures — against local Supabase.
- **E2E (desktop + mobile):** critical journeys — register→pending→approve→login→dashboard; upload (admin)→appears→read→resume; offline download→read offline→sync; preferences persist + cross-device; admin user management; auth guards/redirects.
- **Smoke (post-deploy):** health + login + open book (non-destructive).
- **Perf/a11y gates** as above.

## 16.CC Edge Cases

- Migration fails in CI on scratch DB → block deploy. Preview secret missing → fail with clear message. Flaky E2E → retry/quarantine, don't mask real failures. Prod smoke fails post-deploy → auto-rollback (Vercel previous deployment) + alert. Partial deploy (app new, migration pending) → migrations run **before** app promotion; additive migrations keep old app compatible.

## 16.DD Acceptance Criteria

1. `ci.yml` runs lint/typecheck/format/unit(+coverage)/integration(RLS)/build/E2E/axe/budgets and gates merges.
2. Preview deploys per PR against isolated preview env with passing smoke; production promotion applies migrations (verified) then deploys, runs smoke, and tags a Sentry release.
3. Coverage thresholds met; critical journeys covered by E2E on desktop + mobile.
4. Rollback, backup (Supabase PITR + R2 versioning), and DR (RTO/RPO + tested restore) are documented and (restore) drilled.
5. Versioning (semver + CHANGELOG + tags) and the full documentation set exist.
6. Manual QA + release checklists exist and are satisfied for the v1.0 candidate.
7. `pnpm typecheck/lint/build` pass; all suites green; the two appendices' gates (below) are met.

## 16.EE Definition of Done — Version 1.0

- All Acceptance Criteria pass; CI/CD, verification, rollback, backup, and DR are operational and documented; versioning + docs complete.
- **Project-Wide Invariants** (Appendix G) hold across the codebase.
- **Version 1.0 Completion Checklist** (Appendix H) is fully satisfied.
- Global DoD gate satisfied. The product is releasable as **v1.0**.

---
---

# Appendix G — Project-Wide Invariants

**These are the permanent architectural contracts. Downstream implementation agents must NEVER violate them, in any phase, without an approved amendment to the SAD/ISD.**

### G.1 Architectural Boundaries & Folder Structure
1. Domain code lives under `src/features/<domain>/`; shared infra under `src/lib/`; shared UI under `src/components/`; stores under `src/store/`; types under `src/types/` (SAD §8.2). Features must not import each other's internals — cross-feature use goes through `src/lib` or explicit public barrels.
2. Route groups `(auth)`/`(app)` never appear in URLs. Admin under `/admin`, reader under `/reader/[bookId]`, settings under `/settings`.
3. `process.env` is read **only** in `src/lib/env.ts`; everything else imports `getServerEnv()`/`publicEnv`.
4. Frozen import contracts (predecessor Appendices A/C/E) must not be renamed or relocated.

### G.2 ReaderEngine Abstraction & React ↔ Reader Communication
5. All reader interaction goes through the **`ReaderEngine`** interface and the **`useReaderEngine`** hook. No other module may reference foliate/vendor internals.
6. React **never** reads or writes the reader's iframe DOM (SAD §5.1). Commands go engine-in via the interface; state comes out via engine events → Zustand. Search highlighting is performed by the engine, not React.
7. New formats (PDF/CBZ, SAD §7) implement `ReaderEngine` behind `createReaderEngine`; the React layer stays unchanged.
8. Theme/typography reach the book only via `engine.setStyles(...)` (CSS-variable injection); no direct stylesheet injection into the iframe from React.

### G.3 Database Invariants
9. All app tables have **RLS enabled**; policies enforce `user_id = auth.uid()` (own-row) **and** `(auth.jwt() ->> 'is_approved')::boolean = true` where applicable (SAD §3.2).
10. Custom JWT claims are **top-level** `is_approved`/`is_admin`, injected by the Custom Access Token Hook from `public.profiles`; middleware and RLS read the **same** top-level path (resolved blocker, ISD §0.4).
11. `books` stores **keys, not URLs** (`file_key`, `cover_key`) (SAD §1.2). Sensitive columns (`is_approved`, `is_admin`) have **no** user-facing write policy — changed only via service-role admin flows.
12. Migrations are ordered, additive/safe or ship a documented reverse; each is CI-verified to apply cleanly. `reading_progress`/`user_preferences` use LWW conditional upsert.

### G.4 Authorization Invariants
13. **Three-layer authorization**: Edge middleware (claims) + server layout/action guards (`requireApproved`/`requireAdmin`) + RLS. UI is **never** the sole gate.
14. Every protected Server Action begins with `requireApproved()` or `requireAdmin()` and derives `user_id` from **session claims**, never client input.
15. Admin-only mutations re-verify `requireAdmin()` server-side before using the service-role client. Self-demotion and last-admin lockout are prevented.

### G.5 R2 Storage Invariants
16. The R2 bucket is **strictly private**; book/cover bytes are reachable **only** through the gated Route Handlers (`/api/books/[id]/file`, `/api/covers/[id]`) after auth + approval checks.
17. The Supabase **service-role key** and R2 secrets are **server-only**, never `NEXT_PUBLIC_`, isolated per environment.
18. EPUB responses are `Cache-Control: no-store`; covers are `private`. `/api/*` is never publicly cacheable and never stored in the SW Cache Storage.
19. Upload writes files to R2 **before** the DB insert and **rolls back** R2 objects on DB failure (no orphans, SAD §6.1). Object keys are random UUID-derived (`epubs/{id}.epub`, `covers/{id}.jpg`).

### G.6 Security Invariants
20. Strict **nonce-based CSP** (no `unsafe-inline` scripts); full security header set; HSTS in production; reader iframe kept **sandboxed** with `blob:`-scoped CSP.
21. **All** server inputs are Zod-validated server-side (actions, route handlers, file uploads, beacons). Rate limiting protects auth, upload, and the progress beacon.
22. Logs/monitoring **scrub** PII and secrets. No tokens are ever persisted client-side. Secrets rotate per policy; environments (dev/preview/prod) are isolated.

### G.7 State Management Invariants
23. Server/cookie session is the auth source of truth; no auth tokens in Zustand/localStorage.
24. Durable reader preferences live in the `reader-store` preference slice (persisted, partialized — transient fields excluded) with cloud LWW sync (Phase 12). Zustand subscriptions use **selective selectors**; the reader engine must not re-mount on unrelated state changes.
25. **Offline persistence exception (refined):** EPUB bytes may be persisted **only** for user-initiated offline downloads, in IndexedDB, **per-user namespaced**, and **evicted on sign-out / approval loss / book deletion**. Streaming reads remain ephemeral (objectURL, revoked on unmount). No tokens, ever.

### G.8 API Design Invariants
26. Mutations are **Server Actions** returning `ActionResult<T>` (SAD §4.1). **Route Handlers** are used only for binary/streaming or beacon endpoints (delivery, progress beacon, health) and run on the **Node runtime**.
27. Streaming (never full-buffering) for EPUB delivery to avoid memory spikes (SAD §2).

### G.9 Dependency & Build Rules
28. Pinned versions per the baseline; `pnpm-lock.yaml` committed; no unapproved major bumps.
29. foliate-js is **vendored** at a recorded commit, loaded client-only (`ssr:false`); heavy client modules are code-split; foliate stays out of the main bundle.
30. Server-only modules begin `import 'server-only'`; client modules begin `'use client'`; accessibility (WCAG 2.1 AA), reduced-motion, and performance budgets are non-negotiable gates.

---

# Appendix H — Version 1.0 Completion Checklist

**The final release gate. Version 1.0 ships only when every item is satisfied.**

### H.1 Functional Requirements
- [ ] Register → pending-approval → admin approval → login → dashboard works end-to-end.
- [ ] Admin: user management (approve/revoke, admin toggle with self/last-admin guards); book upload (EPUB) with metadata + cover extraction; book delete with R2 cleanup.
- [ ] Library: catalog grid, personal library add/remove, book details, Continue Reading, progress badges.
- [ ] Reader: opens EPUBs, paginates, TOC, in-book search, tap zones, keyboard, mobile gestures, typography + theme controls.
- [ ] Progress: debounced save, resume, beacon last-position, offline queue + reconnect sync, multi-device LWW.
- [ ] Preferences: local-first persist + cloud sync + settings page + reset.
- [ ] PWA: installable; explicit offline download + offline reading; offline fallback; update prompt.

### H.2 Performance Requirements
- [ ] Core Web Vitals meet targets (LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1) on key routes in CI.
- [ ] First-load JS per route within `performance-budgets.json`; foliate not in main bundle; reader panels code-split.
- [ ] Reader page-turn ≤ ~100ms; no reader re-mount on unrelated state changes; queries pruned/paginated/no N+1; required indexes present.
- [ ] Caching correct: covers `private` cached, EPUB `no-store`, `/api/*` not publicly cached, catalog tag-revalidated.

### H.3 Accessibility Requirements
- [ ] WCAG 2.1 AA: automated axe passes (no serious/critical) on all key pages.
- [ ] Full keyboard operability; visible focus; logical order; skip link; landmarks/labels; focus trap+restore in modals/reader panels.
- [ ] Screen-reader support incl. reader live announcements; reduced-motion honored; AA contrast across light/sepia/dark; touch targets ≥ 44px.
- [ ] Manual keyboard + SR + reduced-motion + contrast sign-off completed.

### H.4 Security Requirements
- [ ] Strict nonce CSP (no `unsafe-inline` scripts) + full header set + HSTS (prod); reader iframe sandboxed.
- [ ] RLS enabled + verified on all tables; three-layer authz; top-level claims path consistent; sensitive columns write-protected.
- [ ] Private R2; delivery gated by auth+approval; keys-not-URLs; service-role/R2 secrets server-only and env-isolated.
- [ ] All inputs Zod-validated server-side; rate limiting on auth/upload/beacon; logs/monitoring scrub PII/secrets; no client-side token persistence.
- [ ] Secrets management + rotation documented; dev/preview/prod fully isolated (Supabase + R2).

### H.5 Testing Requirements
- [ ] Unit coverage thresholds met (critical `lib/*` well-covered).
- [ ] Integration/RLS tests pass against local Supabase (unapproved denied, own-row, conditional upserts, extractor fixtures).
- [ ] E2E critical journeys pass on desktop + mobile (auth, admin, upload/read/resume, offline, preferences).
- [ ] Automated a11y + performance budgets are green in CI.
- [ ] Post-deploy smoke (health + login + open book) passes on preview and production.

### H.6 Documentation Requirements
- [ ] README, ARCHITECTURE (indexing SAD + ISD 0–16), CONTRIBUTING, ENVIRONMENTS, RUNBOOK, SECURITY, ROLLBACK, BACKUP_DR, RELEASE_CHECKLIST, QA_CHECKLIST, CHANGELOG present and current.
- [ ] Env variable matrix documented; vendored foliate `VENDOR.md` (source + commit + license) present.

### H.7 Production Readiness Requirements
- [ ] CI/CD pipeline gates merges and automates preview + production deploys with migration gating.
- [ ] Monitoring (Sentry) + `/api/health` operational; alerting configured.
- [ ] Rollback (app + DB) documented; backups (Supabase PITR + R2 versioning) enabled; DR restore **drilled** with defined RTO/RPO.
- [ ] Versioning (semver + tags + CHANGELOG) in place; v1.0 tagged.

### H.8 Quality Gates (all must be green)
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` pass.
- [ ] All test suites (unit/integration/E2E/a11y) pass; coverage + performance budgets met.
- [ ] **Project-Wide Invariants (Appendix G) hold** across the codebase (spot-audited).
- [ ] No `NEXT_PUBLIC_*` secret leakage; no `process.env` reads outside `src/lib/env.ts`; frozen contracts intact.
- [ ] Final Definition of Done (Phase 16 §16.EE) satisfied.

---

*End of the Version 1.0 Implementation Specification Document. Phases 0–16 and the two permanent appendices constitute the complete master implementation blueprint. Post-1.0 work (highlights & annotations, in-book dictionary, additional formats via `FormatRouter`, reading-statistics dashboards, deeper offline caching) extends this document under the same invariants.*
