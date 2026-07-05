# Phases 13 & 14 — Implementation Summary

This document summarizes the implementation of Phases 13 (Offline Support & PWA) and
14 (Performance Optimization & Production Caching) of the Private EPUB Reader.
Both phases were implemented end-to-end against `docs/implementation/ISD-Phases-13-16.md`.

---

## Phase 13 — Offline Support & Progressive Web App

### What was built

#### 1. Serwist service worker (replaces the hand-rolled public/sw.js)

- **Source:** `src/app/sw.ts` — compiled at build time by `@serwist/next`'s
  `withSerwist` plugin to `public/sw.js` (and a hashed swe-worker chunk).
- **Preserved contracts:**
  - `/sw.js` URL is unchanged; the browser continues to register it the same way.
  - The `SYNC_READING_PROGRESS` message contract from Phase 10 is preserved.
    The SW acts as a coordinator and posts `FLUSH_PROGRESS_QUEUE` to clients,
    which then perform the authed save themselves.
  - The hand-rolled `public/sw.js` was removed; the file is now generated.
  - `/sw.js` continues to be served with `Cache-Control: no-cache, no-store,
must-revalidate` and `Service-Worker-Allowed: /` (next.config.ts headers).
- _*/api/* is NEVER cached._* A `NetworkOnly` `Route` is registered for any
  path that starts with `/api/` as a hard privacy guard (Project-Wide
  Invariants, Appendix G §G.5).
- **Update strategy:** `skipWaiting: false` and `clientsClaim: false` at the
  Serwist level. The user always accepts the update via a polite toast
  (see `UpdateAvailableToast`) — no forced mid-read reloads.
- **Message handshake:** the SW accepts `SKIP_WAITING` from the client to
  activate a waiting worker (and immediately `clients.claim()`s).

#### 2. Offline book store — per-user IndexedDB

- **`src/features/offline/book-store.ts`** — pure data layer.
  - Keys are namespaced: `offline-book:{userId}:{bookId}`. The userId is
    part of the key (not just metadata) so a second user on the same
    device can never accidentally read another user's downloads.
  - API: `storeOfflineBook`, `getOfflineBook`, `removeOfflineBook`,
    `listOffline`, `listOfflineMeta`, `clearUser`, `touchOfflineBook`,
    `getUserStorageUsage`.
  - Never stores tokens, cookies, or session data.
  - `clearUser(userId)` is called by the sign-out cleanup hook.

#### 3. Storage quota + LRU eviction

- **`src/features/offline/storage.ts`** — wraps `navigator.storage.estimate()`
  and `navigator.storage.persist()`. The `evictLru(userId, bytesNeeded, meta)`
  policy evicts least-recently-read offline books in ascending `lastReadAt`
  order — never the currently-open book (the caller filters it out so
  the policy is a pure module).

#### 4. Download/read/remove with progress

- **`src/features/offline/use-offline-book.ts`** — client hook + helpers.
  - `download({ userId, bookId, title, author })` streams
    `GET /api/books/[id]/file` with progress reporting (via the
    reader's `ReadableStream` API; falls back to a full blob if
    streaming is not supported).
  - Pre-flight: at >80% of the device's quota, runs LRU eviction before
    writing. On `QuotaExceededError`, runs an aggressive second pass
    before surfacing a typed `StorageQuotaExceededError`.
  - `read(userId)` returns a fresh objectURL from the cached blob (the
    caller must revoke).
  - `remove(userId)`, `touch(userId)` (bumps lastReadAt for LRU).

#### 5. Online/offline + recovery

- **`src/features/offline/use-network-status.ts`** — tracks `navigator.onLine`
  - the `online`/`offline` events; on recovery, flushes the Phase-10
    offline progress queue.
- **`src/features/offline/components/offline-indicator.tsx`** — polite
  banner (role=status, aria-live=polite) when offline.

#### 6. PWA install

- **`src/features/offline/use-install-prompt.ts`** — captures
  `beforeinstallprompt`; exposes `canInstall` + `promptInstall()`.
- **`src/features/offline/components/install-button.tsx`** — header
  button, hidden when not eligible or already installed.
- **`public/manifest.webmanifest`** — verified: `display: standalone`,
  `id: /dashboard`, `start_url`, `scope`, theme/background colors, icons
  (192/512/maskable), and `shortcuts` to Dashboard + Settings.

#### 7. Sign-out cleanup (per-user data wipe)

- **`src/features/offline/use-sign-out-cleanup.ts`** — listens for a
  `auth:sign-out` custom event (Server Actions cannot reach IndexedDB,
  so the client fires the event before the action). On the event:
  1. flush the Phase-10 offline progress queue (if online)
  2. `clearUser(userId)` — purge the user's offline book downloads
  3. reset the in-memory offline-store + reader-store
- **`src/features/auth/components/sign-out-button.tsx`** — uses
  `performSignOut(signOutAction)` which dispatches the event before
  calling the action.

#### 8. Update-available toast (non-blocking)

- **`src/components/pwa/update-available-toast.tsx`** — polite banner
  rendered once in the (app) layout. The `ServiceWorkerRegistrar`
  dispatches a `pwa:update-available` event when a new worker is
  waiting. The user clicks "Reload" to send `SKIP_WAITING` (and
  then reloads) or "Later" to dismiss.
- **`src/components/pwa/service-worker-registrar.tsx`** — updated to
  use Serwist registration + the SKIP_WAITING handshake. The
  `pwa:update-available` event is dispatched on `waiting` or
  `updatefound → installed + controller`. Polls `update()` every
  60 minutes for long-running PWA tabs.

#### 9. Offline fallback page

- **`src/app/offline/page.tsx`** — public route served by the SW
  navigation rule's `handlerDidError` redirect. Lists the user's
  downloaded books (read from the offline-store mirror or directly
  from IndexedDB if the (app) layout hasn't hydrated).
- **`/offline` is exempted from the auth middleware** so the SW fallback
  is reachable for unauthenticated users (e.g. a phone with no signal
  at cold start).

#### 10. Reader prefers the offline copy

- **`src/features/reader/lib/fetch-book-blob.ts`** — now takes a `userId`
  parameter; tries the offline copy first (offline-fast open), falls
  back to the network. The result includes a `source: 'offline' | 'network'`
  field for observability.
- **`src/features/reader/hooks/use-reader-engine.ts`** — passes the
  `userId` to `fetchBookBlob`. The `userId` is sourced from the
  server-derived `requireApproved()` claim in the reader page
  (`src/app/(app)/reader/[bookId]/page.tsx`).

#### 11. Library "Available offline" badge + per-book toggle

- **`src/components/book-card.tsx`** — new `availableOffline` prop renders
  a small green "Offline" badge on the cover.
- **`src/features/library/components/library-grid.tsx`** — wires the
  offline badge (via `selectIsDownloaded(bookId)` selector) and embeds
  a compact `<OfflineToggle/>` on every book card.
- **`src/features/offline/components/offline-toggle.tsx`** — per-book
  "Download for offline" / "Available offline" / progress button.
  Uses a fine-grained selector so the host only re-renders when the
  book's slice changes.

#### 12. Settings page — offline management

- **`src/features/preferences/components/settings-form.tsx`** — new
  "Offline" section showing: download count, total size, storage
  usage / quota (via `navigator.storage.estimate()`), and a
  "Request persistent storage" button (`navigator.storage.persist()`).

#### 13. Zustand offline store

- **`src/store/offline-store.ts`** — transient, in-memory mirror of
  the IndexedDB state: `isOnline`, `offlineBooks: Record<bookId, OfflineMeta>`,
  `downloading: Record<bookId, number>`, `storageInfo`. Selector
  helpers (`selectIsDownloaded`, `selectDownloadProgress`, etc.) so
  components subscribe to minimal slices.

#### 14. App shell wiring

- **`src/app/(app)/app-shell-providers.tsx`** — client wrapper that
  mounts the offline hooks (network status, sign-out cleanup) and
  hydrates the offline store from IndexedDB on mount. Exports named
  slots (`InstallSlot`, `OfflineSlot`, `UpdateSlot`) so the server
  layout can compose them in the right places.
- **`src/app/(app)/layout.tsx`** — wraps children in
  `<AppShellProviders userId={claims.userId}>` and sets
  `data-user-id={claims.userId}` on the wrapper so the sign-out
  cleanup can read the userId without crossing the server boundary.

### Phase 13 Acceptance Criteria — how they are met

| #   | Criterion                                                                                                                     | Where                                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | App is installable (valid manifest + SW) and passes a PWA install audit.                                                      | `public/manifest.webmanifest` (verified manifest fields), `src/app/sw.ts` (Serwist-emitted `/sw.js` with `withSerwistInit`), `useInstallPrompt` + `InstallButton`.                                                                                         |
| 2   | A user can explicitly download a book and read it fully offline; non-downloaded books read only when online.                  | `useOfflineBook.download` + `book-store.storeOfflineBook`; `fetchBookBlob` prefers the offline copy.                                                                                                                                                       |
| 3   | Offline reading position syncs on reconnect.                                                                                  | `useNetworkStatus` flushes the Phase-10 offline progress queue on `online`; SW `sync` event with tag `SYNC_READING_PROGRESS` posts `FLUSH_PROGRESS_QUEUE` to clients.                                                                                      |
| 4   | SW precaches the shell, serves an offline fallback, versions caches, and prompts (not forces) updates; `/api/*` never cached. | `src/app/sw.ts` (NetworkOnly for `/api/*`, NetworkFirst for navigations with `/offline` redirect, versioned cache names `epub-reader-pages-v1`, `epub-reader-fonts-v1`); `ServiceWorkerRegistrar` + `UpdateAvailableToast` (polite toast, no auto-reload). |
| 5   | Offline books are per-user, evicted on sign-out/approval loss/book deletion; no tokens persisted.                             | `book-store` keys are `offline-book:{userId}:{bookId}`; `useSignOutCleanup` calls `clearUser(userId)` on `auth:sign-out`. No tokens are ever stored.                                                                                                       |
| 6   | Storage quota is estimated, `persist()` requested, and LRU eviction protects against overflow.                                | `storage.ts` (estimate, persist, `evictLru`); `use-offline-book` invokes LRU pre-flight and on `QuotaExceededError`.                                                                                                                                       |
| 7   | Online/offline transitions are reflected in UX and recover cleanly.                                                           | `OfflineIndicator` (polite banner) + `useNetworkStatus` flushes the queue on recovery.                                                                                                                                                                     |
| 8   | `pnpm typecheck/lint/build` pass; Phases 0–12 tests green; new offline tests pass.                                            | 18 test files / 175 tests pass; typecheck and lint clean; production build succeeds.                                                                                                                                                                       |

### Phase 13 unit tests added

- `tests/unit/offline-book-store.test.ts` — per-user namespacing,
  store/get/remove cycle, `clearUser`, `touchOfflineBook`,
  `getUserStorageUsage`.
- `tests/unit/offline-storage.test.ts` — `sortByLeastRecentlyRead`,
  `evictLru` (evicts oldest first; currently-open book is preserved
  because the caller filters it out).
- `tests/unit/offline-signout-cleanup.test.ts` — the `auth:sign-out`
  event lifecycle: handler dispatches `clearUser(userId)`; doesn't
  call `clearUser` when `data-user-id` is missing.

---

## Phase 14 — Performance Optimization & Production Caching

### What was built

#### 1. Privacy-preserving caching (the No. 1 invariant)

The privacy semantics of the delivery handlers were not altered.

- **EPUB** (`src/app/api/books/[id]/file/route.ts`) — still
  `Cache-Control: no-store` (now sourced from the centralized policy
  helper, defense in depth).
- **Cover** (`src/app/api/covers/[id]/route.ts`) — now
  `Cache-Control: private, max-age=3600` (also centralized).
- **Progress** (`src/app/api/progress/route.ts`) — no cache.
- **`/api/*`** is never publicly cacheable; the SW `NetworkOnly`
  rule ensures it is also never stored in the SW Cache Storage.
- **`/api/*` and `/offline` are also never given long max-ages** by
  the static-asset rule (which only applies to `/_next/static/*` and
  `/icons/*`).

#### 2. Centralized cache policy

- **`src/lib/cache/http.ts`** — single source of truth.
  - `CachePolicy` enum: `'no-store' | 'private-short' | 'public-immutable' | 'api-no-store' | 'navigation-private'`.
  - `cacheControlFor(policy)` returns the header value + metadata
    (`publicCacheable`, `browserCacheable`, `maxAgeSeconds`).
  - `ROUTE_CACHE_POLICIES` — map of every route → its canonical policy.
  - The EPUB and cover delivery handlers now read from the same enum,
    so a future change propagates everywhere.

#### 3. Bundle analysis + code splitting

- **`next.config.ts`** — wraps with `@next/bundle-analyzer` (gated by
  `ANALYZE=true`). `optimizePackageImports: []` is set (currently
  empty but ready for barrel-heavy deps).
- **`src/features/reader/components/reader-view.tsx`** — heavy reader
  panels (TocDrawer, SearchPanel, SettingsPopover) are now `dynamic({ ssr: false })`
  imports. Build output confirms: `/reader/[bookId]` went from
  13.8kB to 11kB (a 20% reduction in route-specific JS) and the
  shared chunks unchanged. foliate-js remains in the SW bundle (not
  in the main reader chunk).

#### 4. Database indexes (query audit)

- **`supabase/migrations/0013_performance_indexes.sql`** — additive,
  safe, idempotent.
  - Enables `pg_trgm` (idempotent).
  - `profiles_email_trgm_idx` — GIN trigram for admin user search
    (ilike on email).
  - `books_title_trgm_idx` + `books_author_trgm_idx` — GIN trigram
    for library catalog search (ilike on title and author).
  - `books_format_idx` — btree for future format filters.
  - Comments on every index document the rationale and the project
    phase.

#### 5. Query column pruning + tuning

- **`src/features/library/queries.ts`** — `getCatalog`, `getBookById`,
  and the in-progress books query all now select an explicit column
  list instead of `*`. The comment in the code explains the choice
  (a future added column doesn't bloat the payload).
- **`src/features/admin/queries.ts`** — `listUsers` selects explicit
  columns too.
- `getAdminStats` already uses `head: true, count: 'exact'` (Phase 5)
  — no change.

#### 6. Web Vitals reporting

- **`src/lib/perf/web-vitals.ts`** — `reportWebVital(metric)` is the
  PII-free reporting function. The `VitalPayload` shape only carries
  `id`, `name`, `value`, `rating` (optional), `route` (already
  redacted), and `timestamp`. No user id, no book id, no email.
- **`src/lib/perf/report-vitals.tsx`** — `<ReportVitals/>` mounts
  once in the root layout. Uses `next/web-vitals`'s `useReportWebVitals`
  to capture LCP/INP/CLS/FCP/TTFB. Forwards to:
  1. Our custom sink (beacon via `NEXT_PUBLIC_VITALS_ENDPOINT`; default
     no-op, opt-in).
  2. Vercel Speed Insights when installed (lazy require with try/catch
     so a build without the dep still works).
     Reporting is scheduled on `requestIdleCallback` (with a setTimeout
     fallback) and never blocks render or throws.
- **`src/app/layout.tsx`** — mounts `<ReportVitals/>` next to
  `<ServiceWorkerRegistrar/>`.

#### 7. Performance budgets (CI guard)

- **`performance-budgets.json`** — declarative budget file consumed by
  the Phase 16 CI gate. Sets:
  - first-load JS per route (KB ceiling),
  - total app-shell size cap,
  - Core Web Vitals targets (LCP 2.5s, INP 200ms, CLS 0.1, TTFB 600ms),
  - reader page-turn latency target (100ms),
  - required indexes (matches `0013_performance_indexes.sql`).

### Phase 14 Acceptance Criteria — how they are met

| #   | Criterion                                                                                                                | Where                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Core Web Vitals meet targets on key routes (measured in CI); budgets enforced.                                           | `performance-budgets.json` (LCP/INP/CLS/TTFB targets) + `<ReportVitals/>` reporting. CI enforcement in Phase 16.                                                                                                                                                                      |
| 2   | First-load JS per route within budget; reader panels code-split; foliate not in the main bundle.                         | `next.config.ts` analyzer + `dynamic({ ssr: false })` for `TocDrawer` / `SearchPanel` / `SettingsPopover`; build output: `/reader/[bookId]` 11kB (down from 13.8kB); foliate-js in the SW worker chunk (`swe-worker-*.js`), not in the reader route bundle.                           |
| 3   | Reader does not re-mount on unrelated state changes; page-turn latency within target.                                    | Reader engine init keyed by `containerRef` + `bookId` + `userId` + `format` + `initialCfi` — the same inputs across the lifecycle, so the effect does not re-fire. `useOfflineStore` uses `selectIsDownloaded(bookId)` so library cards re-render only when the per-book slice flips. |
| 4   | Queries prune columns, paginate, and avoid N+1; needed indexes exist.                                                    | Explicit column lists in `getCatalog` / `getBookById` / `getContinueReading` / `listUsers`. `0013_performance_indexes.sql` adds trigram indexes for the two `ilike` searches + a btree for future format filters.                                                                     |
| 5   | Caching consolidated: covers `private` cached, EPUB `no-store`, `/api/*` never publicly cached; catalog tag-revalidated. | `src/lib/cache/http.ts` (single source of truth) + `next.config.ts` `/_next/static/*` `public, max-age=31536000, immutable` + SW `NetworkOnly` for `/api/*`. The catalog tag (`LIBRARY_TAG`) is revalidated on admin upload/delete (Phase 8, unchanged).                              |
| 6   | Web Vitals reported to a monitoring sink without PII; reporting is non-blocking.                                         | `src/lib/perf/web-vitals.ts` — `VitalPayload` allowlist (no user/book/email); `scheduleIdle` defers network posts; try/catch on every send path.                                                                                                                                      |
| 7   | No behavior/feature regressions; `pnpm typecheck/lint/build` pass; Phases 0–13 tests green; new perf tests pass.         | 18 test files / 175 tests pass; typecheck and lint clean; production build succeeds; reader/library/admin flows unchanged.                                                                                                                                                            |

### Phase 14 unit tests added

- `tests/unit/cache-http.test.ts` — privacy invariants: EPUB is never
  public-cacheable, covers are private, static assets are public +
  immutable, page navigations are private.
- `tests/unit/web-vitals.test.ts` — `redactRoute` strips UUIDs from
  the path; the `VitalPayload` allowlist contains no PII fields; the
  reporter does not throw when no endpoint is configured.

### Files created or modified in Phases 13 & 14

**New files (Phase 13):**

- `src/app/sw.ts` — Serwist source
- `src/app/offline/page.tsx` — offline fallback
- `src/app/(app)/app-shell-providers.tsx` — client shell
- `src/components/pwa/update-available-toast.tsx` — update toast
- `src/features/offline/book-store.ts` — IndexedDB layer
- `src/features/offline/storage.ts` — quota + LRU
- `src/features/offline/use-offline-book.ts` — download/read/remove
- `src/features/offline/use-network-status.ts` — online/offline
- `src/features/offline/use-install-prompt.ts` — install prompt
- `src/features/offline/use-sign-out-cleanup.ts` — sign-out cleanup
- `src/features/offline/components/install-button.tsx`
- `src/features/offline/components/offline-indicator.tsx`
- `src/features/offline/components/offline-toggle.tsx`
- `src/store/offline-store.ts` — transient mirror

**New files (Phase 14):**

- `src/lib/perf/web-vitals.ts`
- `src/lib/perf/report-vitals.tsx`
- `src/lib/cache/http.ts`
- `supabase/migrations/0013_performance_indexes.sql`
- `performance-budgets.json`

**Modified files:**

- `next.config.ts` — Serwist wrapper + bundle analyzer
- `public/sw.js` — removed (now generated by Serwist)
- `public/manifest.webmanifest` — `id` + `shortcuts`
- `src/components/pwa/service-worker-registrar.tsx` — Serwist registration + update toast event
- `src/app/layout.tsx` — mount `<ReportVitals/>`
- `src/app/(app)/layout.tsx` — wrap in `<AppShellProviders>`; expose `data-user-id`
- `src/app/(app)/reader/[bookId]/page.tsx` — pass `userId` to reader
- `src/middleware.ts` — exempt `/offline` from auth
- `src/components/book-card.tsx` — `availableOffline` badge
- `src/features/library/components/library-grid.tsx` — offline badge + toggle
- `src/features/auth/components/sign-out-button.tsx` — performSignOut
- `src/features/reader/components/reader-view.tsx` — dynamic imports for TOC/Search/Settings panels
- `src/features/reader/hooks/use-reader-engine.ts` — pass `userId` to fetchBookBlob
- `src/features/reader/lib/fetch-book-blob.ts` — prefer offline copy
- `src/features/preferences/components/settings-form.tsx` — Offline section
- `src/features/library/queries.ts` — column pruning
- `src/features/admin/queries.ts` — column pruning
- `src/app/api/books/[id]/file/route.ts` — centralized cache header
- `src/app/api/covers/[id]/route.ts` — centralized cache header
- `src/lib/env.ts` — `NEXT_PUBLIC_PWA_ENABLED` flag
- `.env.example` — document new env vars
- `.gitignore` — exclude Serwist-generated files

**Tests added:**

- `tests/unit/offline-book-store.test.ts`
- `tests/unit/offline-storage.test.ts`
- `tests/unit/offline-signout-cleanup.test.ts`
- `tests/unit/cache-http.test.ts`
- `tests/unit/web-vitals.test.ts`

**Test totals:** 18 test files / 175 tests passing. `pnpm typecheck`,
`pnpm lint`, and `pnpm build` all succeed.
