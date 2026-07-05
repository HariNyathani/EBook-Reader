# Architecture

**Project:** Private EPUB Reader
**Phase:** 16 (release readiness)
**Status:** v1.0
**Last updated:** 2026-07-05

This document is the high-level architecture map for the Private
EPUB Reader. It indexes the master specification documents
(SDD + ISD) and the operational docs, and lists the key
architectural decisions.

For the operational view, see [`RUNBOOK.md`](./RUNBOOK.md). For
security, see [`SECURITY.md`](./SECURITY.md). For DR, see
[`BACKUP_DR.md`](./BACKUP_DR.md).

---

## 1. Document index

| Document | Purpose |
|---|---|
| [SAD (Software Architecture Document)](./implementation/ISD-Phases-0-4.md) | Source of truth for the architecture. |
| [ISD Phases 0-4](./implementation/ISD-Phases-0-4.md) | Phases 0-4: setup, auth, RLS, server actions. |
| [ISD Phases 5-8](./implementation/ISD-Phases-5-8.md) | Phases 5-8: admin, R2 + delivery, EPUB extraction, library. |
| [ISD Phases 9-12](./implementation/ISD-Phases-9-12.md) | Phases 9-12: reader engine, progress sync, premium reader UI, preferences. |
| [ISD Phases 13-16](./implementation/ISD-Phases-13-16.md) | Phases 13-16: offline/PWA, performance, a11y + security hardening, CI/CD. |
| [`RUNBOOK.md`](./RUNBOOK.md) | Operational runbook (on-call, failure modes). |
| [`SECURITY.md`](./SECURITY.md) | Security model + threat model + secrets inventory. |
| [`ROLLBACK.md`](./ROLLBACK.md) | App + DB rollback procedures. |
| [`BACKUP_DR.md`](./BACKUP_DR.md) | Backup strategy + RTO/RPO + DR drills. |
| [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md) | v1.0 release gate. |
| [`QA_CHECKLIST.md`](./QA_CHECKLIST.md) | Manual QA checklist. |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | How to contribute. |
| [`ENVIRONMENTS.md`](./ENVIRONMENTS.md) | Env matrix + secrets sourcing. |
| [`CHANGELOG.md`](./CHANGELOG.md) | Versioned changelog. |
| [Phase 13-14 summary](../PHASES-13-14-SUMMARY.md) | Implementation summary of Phases 13-14. |
| [Phase 9-10 summary](../PHASES-9-10-SUMMARY.md) | Implementation summary of Phases 9-10. |
| [Phase 7-8 summary](../PHASES-7-8-SUMMARY.md) | Implementation summary of Phases 7-8. |
| [Phase 5-6 summary](../PHASES-5-6-SUMMARY.md) | Implementation summary of Phases 5-6. |

---

## 2. High-level diagram

```
┌────────────────────────────────────────────────────────────┐
│                        Browser (user)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────────┐  │
│  │  Next.js    │  │ Service     │  │ IndexedDB          │  │
│  │  client     │  │ worker      │  │  - offline books   │  │
│  │  (React)    │  │ (Serwist)   │  │  - progress queue  │  │
│  └──────┬──────┘  └──────┬──────┘  └─────────┬──────────┘  │
└─────────┼────────────────┼──────────────────┼──────────────┘
          │ HTTPS          │ (postMessage)    │
          ▼                ▼                  │
┌────────────────────────────────────────────────────────────┐
│                  Vercel (Next.js 15)                        │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Edge Middleware                                     │  │
│  │   - Session refresh (Supabase)                       │  │
│  │   - CSP nonce generation                             │  │
│  │   - Rate limiting (Upstash)                          │  │
│  │   - Route guards                                     │  │
│  └──────────────────────┬──────────────────────────────┘  │
│  ┌──────────────────────▼──────────────────────────────┐  │
│  │  Server Components / Server Actions / Route Handlers │  │
│  │   - requireApproved / requireAdmin                    │  │
│  │   - Zod validation                                    │  │
│  │   - logger (PII-scrubbing, JSON in prod)              │  │
│  │   - Sentry capture (errors + perf)                    │  │
│  └────┬──────────────────┬──────────────────┬───────────┘  │
└───────┼──────────────────┼──────────────────┼──────────────┘
        │ SQL (RLS)        │ HTTPS (S3)       │ HTTPS
        ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────┐ ┌────────────────────┐
│ Supabase          │ │ Cloudflare   │ │ Upstash Redis      │
│  - Postgres (RLS) │ │   R2         │ │  - rate limit       │
│  - Auth (JWT)     │ │  - EPUB bytes│ │    counters         │
│  - Custom JWT     │ │  - covers    │ │  - (sliding window) │
│    hook           │ │  (versioned) │ └────────────────────┘
└──────────────────┘ └──────────────┘
        │
        ▼
┌──────────────────┐
│ Sentry            │
│  - errors         │
│  - perf traces    │
│  - releases       │
│  - source maps    │
└──────────────────┘
```

---

## 3. Key architectural decisions

### 3.1 Three-layer authorization (SAD §3.1, ISD §3.4)

* **Edge middleware** reads top-level JWT claims
  (`is_approved`, `is_admin`) and redirects.
* **Server layout/action guards** (`requireApproved`,
  `requireAdmin`) re-check claims. Every protected Server
  Action begins with one of these.
* **Row-Level Security (RLS)** at the database level enforces
  own-row + approval on every query.

UI is NEVER the sole gate. The "Admin" link being visible does
not mean the action is permitted.

### 3.2 Reader isolation (SAD §5.1)

React NEVER reads or writes the reader's iframe DOM. All
interaction flows through the `ReaderEngine` interface
implemented by `FoliateEngine` and bridged via
`useReaderEngine`. Theme/typography reach the book only via
`engine.setStyles(...)` (CSS-variable injection).

### 3.3 Streaming (SAD §2.1)

`GET /api/books/[id]/file` streams EPUBs to avoid memory spikes
on large files. The route handler uses the `ReadableStream`
pattern. `Cache-Control: no-store` is enforced on the response
so private content is never cached by CDNs.

### 3.4 Keys, not URLs (SAD §1.2)

The `books` table stores `file_key` and `cover_key` (R2 object
keys), not public URLs. Bytes are reachable ONLY through the
gated Route Handlers after auth + approval checks. The R2
bucket is strictly private; there is no public list/read.

### 3.5 Scoped offline-persistence exception (ISD §13.0.2 A)

EPUB bytes may be persisted in IndexedDB ONLY for books the
user explicitly downloads for offline. They are:
* Namespaced per user (`offline-book:{userId}:{bookId}`).
* Evicted on sign-out.
* Evicted on approval loss (the `useApprovalPurge` hook,
  Phase 15).
* Evicted on admin book deletion.

No tokens are ever persisted. Streaming (non-downloaded)
reading remains ephemeral (objectURL, revoked on unmount).

### 3.6 Three-environment separation (ISD §13.0.2 E, §15.DD #5)

* **development** — local Supabase + R2 (or mocked).
* **preview** — per-PR Supabase + R2 (separate projects).
* **production** — dedicated Supabase + R2 (separate projects).

Each environment has its own:
* Supabase project
* R2 bucket (`epub-reader-assets-{env}`)
* Upstash namespace
* Sentry project

No credentials are shared between environments.

### 3.7 Nonce-based strict CSP (ISD §15.G, §15.Z)

The CSP is nonce-based, strict, and never includes
`'unsafe-inline'` for scripts. A per-request nonce is generated
in middleware and threaded through the `x-nonce` request header
to the document. `'strict-dynamic'` is used so nonce-allowlisted
scripts can load additional scripts (CDN chunks) without
further allowlisting.

`blob:` is preserved in `frame-src` (foliate sandboxed iframe)
and `img-src` (foliate covers/thumbnails).

### 3.8 Rate limiting at the edge (ISD §15.B)

Auth, upload, and the progress beacon are rate-limited via
`@upstash/ratelimit` + `@upstash/redis`. An in-memory fallback
is used when Upstash env vars are missing (documented in
`src/lib/security/rate-limit.ts`).

### 3.9 Forward-only migrations (ISD §13.0.2 F)

Every migration is additive/safe or ships a documented reverse
script. The `verify-migrations.ts` script in CI applies all
migrations to a scratch DB before production deploy.

### 3.10 Performance budgets as code (ISD §14.G)

`performance-budgets.json` declares per-route JS budgets and
Core Web Vitals targets. CI enforces them via
`scripts/check-performance-budgets.ts`. A violation fails the
build.

---

## 4. Folder map (top level)

```
src/
├─ app/                        # Next.js App Router
│  ├─ (auth)/                  # /login, /register, /pending-approval
│  ├─ (app)/                   # /dashboard, /reader, /settings (protected)
│  ├─ admin/                   # /admin/* (admin-only)
│  ├─ api/                     # Route handlers (binary, beacons)
│  ├─ offline/                 # SW navigation fallback
│  └─ sw.ts                    # Serwist SW source
├─ features/                   # Domain code
│  ├─ auth/                    # sign-in/up/out, session, schemas
│  ├─ admin/                   # user mgmt, upload, book mgmt
│  ├─ library/                 # catalog, library grid, queries
│  ├─ reader/                  # engine, hooks, panels, progress
│  ├─ preferences/             # settings, cloud sync
│  └─ offline/                 # IDB store, hooks, install, LRU
├─ lib/                        # Shared infra
│  ├─ env.ts                   # Zod-validated env (the ONLY file that reads process.env)
│  ├─ security/                # CSP, rate limit, headers
│  ├─ logging/                 # PII-scrubbing logger
│  ├─ perf/                    # web vitals
│  ├─ cache/                   # cache header builders
│  ├─ supabase/                # server/admin/browser/middleware clients
│  ├─ r2/                      # R2 ops
│  ├─ epub/                    # EPUB extraction
│  └─ ...                      # utils, constants, validation
├─ store/                      # Zustand stores (reader, ui, offline)
├─ types/                      # shared types
├─ components/                 # shared UI
│  ├─ ui/                      # button, spinner
│  ├─ pwa/                     # SW registrar, update toast
│  └─ a11y/                    # skip link, live announcer
└─ vendor/foliate-js/          # vendored reader (pinned commit)
```

---

## 5. Request lifecycle (authenticated)

1. Browser sends request to the app.
2. **Edge middleware** (`src/middleware.ts`):
   1. Generate a fresh CSP nonce.
   2. Refresh the Supabase session cookie (via `updateSession`).
   3. Read top-level JWT claims.
   4. Apply rate limiting (auth, upload, progress).
   5. Apply route guards (redirect to /login, /pending-approval,
      or /dashboard as needed).
   6. Attach security headers (CSP, HSTS, COOP, Permissions-Policy).
3. **Server Component** (e.g. `/dashboard`):
   1. Call `requireApproved()` — re-checks claims.
   2. Fetch data (with RLS-enforced queries).
   3. Render the page.
4. **Server Action** (e.g. upload):
   1. Call `requireAdmin()`.
   2. Validate input (Zod).
   3. Apply server-side rate limit.
   4. Perform the mutation (R2, Supabase).
   5. Revalidate the cache tag.
   6. Return `ActionResult<T>`.
5. **Route Handler** (e.g. `/api/progress`):
   1. Authenticate via `getClaims()`.
   2. Apply rate limit (progressLimiter).
   3. Validate input (Zod).
   4. Mutate via the appropriate Supabase client.
   5. Return 204 (beacon) or 200.

---

## 6. Key invariants (see ISD Appendix G)

These are the project-wide invariants. The codebase is
spot-audited against them at every release:

1. `process.env` is read ONLY in `src/lib/env.ts`.
2. The `ReaderEngine` interface is the sole bridge between
   React and the reader.
3. RLS is enabled on every table; policies enforce own-row +
   approval.
4. Custom JWT claims are top-level (`is_approved`, `is_admin`).
5. The R2 bucket is strictly private; bytes are reachable only
   through gated Route Handlers.
6. The service-role key + R2 secrets are server-only, isolated
   per environment.
7. EPUB responses are `no-store`; covers are `private`; `/api/*`
   is never publicly cacheable; the SW never caches `/api/*`.
8. Server-only modules begin with `import 'server-only'`.
9. Client modules begin with `'use client'`.
10. Strict nonce-based CSP (no `'unsafe-inline'` for scripts).
11. All server inputs are Zod-validated.
12. Rate limiting protects auth, upload, and the progress beacon.
13. Logs and monitoring scrub PII and secrets.
14. Durable reader preferences persist in `reader-store` with
    cloud LWW sync.
15. Offline persistence is the documented exception, per-user
    namespaced, evicted on sign-out/approval-loss/deletion.

Violations of any of these are release blockers.
