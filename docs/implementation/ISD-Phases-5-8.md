# Implementation Specification Document (ISD) — Continuation

**Project:** Private EPUB Reader (Walled-Garden Web App + PWA)
**Document:** Master Implementation Blueprint — Phases 5 through 8
**Author:** Technical Lead / Principal Engineer
**Status:** Finalized for execution
**Source of Truth:** Software Architecture Document (SAD), as revised by the Senior Staff Engineer Architecture Review
**Predecessor:** `ISD-Phases-0-4.md` (Phases 0–4 are **locked**; do not modify)
**Date:** 2026-07-05

---

## 5·0 Reading Guide for This Continuation

This document continues the ISD. **Phases 0–4 are finalized and locked.** Everything they established — the technology baseline (§0.2 of the predecessor), the frozen import contracts (Appendix A), the global Definition-of-Done gate (Appendix B), the resolved JWT-claims path (§0.4), and the phase dependency rules — **remains in force and is not repeated here except where a Phase 5–8 dependency requires it.**

**Restated baseline facts a Phase 5–8 agent must assume as already true (do not re-implement):**

- Next.js 15 (App Router, React 19), TypeScript `strict`, pnpm, Tailwind, Zustand, Zod — installed and configured.
- `src/features`, `src/lib`, `src/store`, `src/types`, `src/components` module tree exists (SAD §8.2).
- Frozen contracts available for import:
  - `@/lib/result` → `ActionResult<T>`, `ok`, `fail`
  - `@/lib/routes` → `ROUTES`
  - `@/lib/constants` → `epubKey(id)`, `coverKey(id)`, `ROLES`
  - `@/types` → `Book`, `Profile`, `UserLibraryEntry`, `ReadingProgress` (+ generated `database.ts`)
  - `@/lib/env` → `getServerEnv()`, `publicEnv`
  - `@/lib/r2` → `putObject`, `getObjectStream`, `deleteObject`, `getSignedReadUrl`, typed `R2Error`s
  - `@/lib/http/headers` → `epubDeliveryHeaders`, `coverDeliveryHeaders`, `securityHeaders`
  - `@/lib/supabase/{server,browser,admin,middleware}` → Supabase clients + `updateSession`
  - `@/features/auth/session` → `getClaims`, `requireApproved`, `requireAdmin`
  - JWT carries **top-level** `is_approved` / `is_admin` claims; RLS + middleware enforce them.
- Every protected Server Action **must** begin with `requireApproved()` or `requireAdmin()` (project-wide authorization contract from Phase 4).
- Every Server Action returns `ActionResult<T>`.
- Server-only modules start with `import 'server-only'`; client modules with `'use client'`.
- `process.env` is read **only** in `src/lib/env.ts`.

### 5·0.1 Phase Dependency Graph (this segment)

```
Phase 4 (Auth/Authz) ──> Phase 5 (Admin System: user administration + admin shell)
                              └─> Phase 6 (R2 Upload Pipeline + Secure Delivery Handlers + Admin Book Mgmt)
                                     └─> Phase 7 (EPUB Metadata Extraction — upgrades Phase 6's extractor seam)
                                            └─> Phase 8 (Library Management & Dashboard Foundation)
```

Strictly sequential and forward-only. No phase reaches forward. The one dependency inversion (Phase 6 needs metadata that Phase 7 produces) is resolved by a **`MetadataExtractor` interface seam** introduced in Phase 6 with a minimal fallback implementation, then upgraded in Phase 7 — see §5·0.2.

### 5·0.2 Critical Implementation Notes Discovered During Planning (and their minimal corrections)

Three issues were found while planning Phases 5–8. None alter the architecture; each has the smallest possible correction, applied within the phase noted.

**(A) Dependency inversion — upload needs metadata (Phase 6 ↔ Phase 7).**
SAD §6.1 requires the upload pipeline to extract Title/Author/Cover *during* upload, but metadata extraction is scheduled as Phase 7. To keep phases forward-only and independently executable:
- **Phase 6** defines the contract `interface MetadataExtractor { extract(input): Promise<EpubMetadata> }` in `src/lib/epub/types.ts` and ships a **minimal fallback implementation** (`fallbackExtractor`) that derives a title from the uploaded filename and takes Author from an admin form field; it extracts **no cover**.
- **Phase 7** replaces the bound implementation with the real `streamZipExtractor` (OPF parsing + cover extraction) behind the **same interface**, and upgrades the pipeline so metadata auto-populates and covers are stored. The upload Server Action's signature and the `books` insert do **not** change — only the extractor implementation and the form's "manual vs. auto" behavior.

**(B) Platform request-body size limit for uploads (Phase 6) — potential blocker.**
Next.js Server Actions cap the request body at **1 MB by default** (`serverActions.bodySizeLimit`), and some serverless hosts (e.g., Vercel serverless functions) impose a **hard ~4.5 MB request-body ceiling**. EPUBs routinely exceed both. Uploading a large EPUB through a FormData Server Action will fail.
- **Minimal correction (Phase 6):** raise `experimental.serverActions.bodySizeLimit` to a documented value (default **`'50mb'`**, configurable via env) in `next.config.ts`. This keeps the SAD's FormData-streaming pipeline intact for self-hosted/Node deployments and generous platform tiers.
- **Documented fallback (Phase 6, optional, behind a flag):** for hosts that enforce a hard small body ceiling, add a **presigned direct-to-R2 upload** path: a `getSignedUploadUrl(key)` helper (extends the Phase-2 R2 layer), client `PUT`s the EPUB straight to R2, then calls a metadata-only Server Action referencing the already-uploaded key. This is **not** the default and is only wired if `UPLOAD_STRATEGY=presigned`. The SAD's pipeline remains primary.

**(C) Cover image format normalization (Phase 7).**
SAD stores covers as `covers/{id}.jpg`, but EPUB covers are frequently PNG/GIF/WebP. Phase 7 must **normalize** extracted cover bytes to JPEG. The correction is additive: introduce `sharp` in Phase 7 to transcode/resize covers to JPEG. This must run on the **Node.js runtime** (not Edge). No schema change (`cover_key` still points at `.jpg`).

### 5·0.3 Conventions (unchanged from predecessor)

Paths are repo-root relative. "Create" = new file; "Modify" = file exists from a prior phase. Route Handlers and modules that use `node-stream-zip`, `sharp`, or the R2/AWS SDK must declare `export const runtime = 'nodejs'` (Route Handlers) or be server-only modules — never Edge. `ActionResult` is the only Server Action return shape.

---
---

# Phase 5 — Admin System

## 5.A Objective

Deliver the **complete administrative console for user/account governance**: an admin application shell with navigation, an **admin overview dashboard** (key counts), and a **comprehensive user-management surface** (list, search, paginate, approve/revoke approval, grant/revoke admin) built on Server Actions and the service-role client. This phase generalizes and supersedes the *minimal* Phase-4 approvals table into a production user-administration module, while preserving Phase 4's `setUserApprovalAction` contract. **Book/content administration is intentionally out of scope here** — it lands in Phase 6 alongside R2 (see §5·0.2 note (A) rationale for placement).

## 5.B Scope

**In scope:**
- Admin shell: `admin/layout.tsx` enhanced with a persistent nav (Overview, Users; plus disabled/"coming soon" links for Books & Uploads that Phase 6 activates).
- Admin overview page `/admin` with counts: total users, pending approvals, approved users, admins, total books (books count reads the Phase-3 `books` table; will be `0` until Phase 6 — that is expected and correct).
- User management page `/admin/users`: paginated, searchable table of all users with status badges and per-row actions.
- Server Actions (admin-guarded, service-role): `setUserApprovalAction` (relocated/consolidated from Phase 4), `setUserAdminAction`, and read helpers for listing users.
- Self-protection guards: an admin may not revoke **their own** admin rights or approval (prevents accidental self-lockout / last-admin lockout).
- Zod schemas for admin mutations; standardized `ActionResult` responses; error/empty/loading states.

**Out of scope:** book listing/deletion/upload (Phase 6), library/reader UI (Phase 8+), email notifications to users on approval (future), destructive user deletion (explicitly deferred; see Edge Cases).

## 5.C Prerequisites

- Phases 0–4 complete and green.
- `requireAdmin()` guard, `setUserApprovalAction`, `admin/layout.tsx`, and `admin/approvals/page.tsx` exist from Phase 4.
- Access-token hook emits top-level `is_approved`/`is_admin`; at least one admin exists (via `pnpm bootstrap:admin`).
- Service-role admin client (`@/lib/supabase/admin`) available (server-only).

## 5.D Expected Existing Project State

- `src/features/admin/` contains `actions.ts` (`setUserApprovalAction`), `schemas.ts` (`approvalSchema`), and `components/approvals-table.tsx` (minimal).
- `src/app/admin/{layout,page,uploads,approvals}` exist; `page.tsx` and `uploads/page.tsx` are placeholders; `approvals/page.tsx` renders the minimal table.
- `profiles` table (Phase 3) holds `id, email, is_approved, is_admin, created_at, updated_at` with RLS; admins can read all profiles.

## 5.E Dependencies

- No new runtime dependencies required. (Optional: a lightweight table/pagination is hand-rolled with Tailwind — do **not** add a heavy table library.) If server-side pagination helpers are desired, use Supabase `.range()` — no new package.

## 5.F Folder Structure After Phase 5 (additions/changes)

```
src/
├─ app/
│  └─ admin/
│     ├─ layout.tsx                     # MODIFY — nav shell (Overview, Users; Books/Uploads disabled)
│     ├─ page.tsx                       # MODIFY — overview dashboard (counts)
│     ├─ users/
│     │  ├─ page.tsx                    # NEW — user management (list/search/paginate)
│     │  └─ loading.tsx                 # NEW — skeleton
│     ├─ approvals/                     # MODIFY — redirect to /admin/users (back-compat) OR remove
│     │  └─ page.tsx                    # MODIFY — permanent redirect to /admin/users
│     └─ uploads/page.tsx               # UNCHANGED placeholder (Phase 6 owns it)
├─ features/
│  └─ admin/
│     ├─ actions.ts                     # MODIFY — add setUserAdminAction; keep setUserApprovalAction
│     ├─ schemas.ts                     # MODIFY — add adminToggleSchema; keep approvalSchema
│     ├─ queries.ts                     # NEW — server-only: listUsers, getAdminStats
│     ├─ constants.ts                   # NEW — page size, status enums
│     └─ components/
│        ├─ users-table.tsx             # NEW — replaces approvals-table usage
│        ├─ user-row-actions.tsx        # NEW — 'use client' approve/revoke/admin buttons
│        ├─ stat-card.tsx               # NEW — presentational count card
│        └─ approvals-table.tsx         # MODIFY/DEPRECATE — re-export or delete (see 5.H)
```

## 5.G Files to Create

- **`src/features/admin/queries.ts`** (`import 'server-only'`):
  - `getAdminStats(): Promise<{ totalUsers; pendingApprovals; approvedUsers; admins; totalBooks }>` — uses the **service-role** client (or admin-scoped server client) to `count` rows on `profiles` (filtered) and `books`. Use `head: true, count: 'exact'` queries for efficiency.
  - `listUsers({ query?, status?, page, pageSize }): Promise<{ rows: Profile[]; total: number }>` — filter by email substring (`ilike`), by status (`all | pending | approved | admin`), ordered by `created_at desc`, paginated via `.range()`. Service-role read (admins legitimately see all users).
- **`src/features/admin/constants.ts`** — `ADMIN_USERS_PAGE_SIZE = 25`, `USER_FILTERS = ['all','pending','approved','admin'] as const`.
- **`src/app/admin/users/page.tsx`** (Server Component) — calls `requireAdmin()`, reads search/filter/page from `searchParams`, calls `listUsers`, renders `<UsersTable>`; includes a search input (GET form) and filter tabs and pagination controls (all URL-driven, no client state needed).
- **`src/app/admin/users/loading.tsx`** — skeleton rows.
- **`src/features/admin/components/users-table.tsx`** (Server Component) — renders columns: email, status badges (Pending/Approved, Admin), joined date, and a `<UserRowActions>` cell.
- **`src/features/admin/components/user-row-actions.tsx`** (`'use client'`) — buttons wired to `setUserApprovalAction` / `setUserAdminAction` via `useActionState`; disables the action that would self-demote the current admin (receives `currentUserId` prop); shows pending/disabled states and surfaces `ActionResult` errors (via `ui-store` toast or inline).
- **`src/features/admin/components/stat-card.tsx`** — presentational count tile.

## 5.H Files to Modify

- **`src/app/admin/layout.tsx`** — add nav (Overview → `/admin`, Users → `/admin/users`; Books/Uploads rendered but disabled with a "Phase 6" tooltip or simply omitted — prefer omit to avoid dead links; if shown, mark `aria-disabled`). Keep `requireAdmin()` guard (already present). Provide a sign-out control (reuse Phase 4 `SignOutButton`).
- **`src/app/admin/page.tsx`** — replace placeholder with overview using `getAdminStats()` + `<StatCard>` grid. Server Component; `requireAdmin()`.
- **`src/app/admin/approvals/page.tsx`** — convert to a permanent redirect (`redirect('/admin/users?status=pending')`) to preserve the Phase-4 route without duplicating UI. (Alternatively delete the route; **redirect is preferred** to avoid breaking any bookmarked link.)
- **`src/features/admin/actions.ts`** — keep `setUserApprovalAction` **unchanged in signature/behavior** (Phase 4 contract); add `setUserAdminAction({ userId, makeAdmin })`: `requireAdmin()` → parse `adminToggleSchema` → **guard self-demotion and last-admin** (see §5.W) → service-role update `profiles.is_admin` → `revalidatePath('/admin/users')` and `revalidatePath('/admin')`.
- **`src/features/admin/schemas.ts`** — add `adminToggleSchema = z.object({ userId: uuidSchema, makeAdmin: z.boolean() })`. Keep `approvalSchema`.
- **`src/features/admin/components/approvals-table.tsx`** — deprecate: either delete (and update imports) or re-export `UsersTable`. Prefer delete; ensure no dangling imports.
- **`src/features/admin/index.ts`** — export new queries/components.

## 5.I Database Migrations

None. Phase 5 operates entirely on the Phase-3 `profiles`/`books` schema. No schema change.

## 5.J Database Schema Updates

None.

## 5.K Environment Variables

None new. Consumes existing `SUPABASE_SERVICE_ROLE_KEY` (server-only) via the admin client.

## 5.L Configuration

- No new config. `revalidatePath` used for admin views. Ensure admin pages are dynamically rendered (they depend on `searchParams` + per-request auth) — Next will infer `dynamic` due to `searchParams`/cookies; if needed add `export const dynamic = 'force-dynamic'` to `/admin/users` and `/admin`.

## 5.M React Components

- `StatCard` (presentational), `UsersTable` (server), `UserRowActions` (client), enhanced `admin/layout` nav. Search/filter/pagination are **URL-driven** (GET forms + links) to minimize client state.

## 5.N Custom Hooks

- Optional `useActionState`-based helper reused from Phase 4 for pending/error handling in `UserRowActions`. No new domain hook required.

## 5.O Zustand Stores

- None new. May use the existing `ui-store` toast to surface action results. Do not store user lists in Zustand (server-rendered + URL state).

## 5.P Utility Modules

- `src/features/admin/queries.ts` (server-only read layer), `constants.ts`.

## 5.Q TypeScript Interfaces

- `AdminStats = { totalUsers; pendingApprovals; approvedUsers; admins; totalBooks }`.
- `ListUsersParams`, `ListUsersResult` in `queries.ts`.
- `UserFilter = typeof USER_FILTERS[number]`.

## 5.R Validation Schemas

- `approvalSchema` (existing), `adminToggleSchema` (new). Search/pagination params validated in the page via a small Zod schema (`z.coerce.number()` for page, enum for status) — reject/normalize invalid input to defaults.

## 5.S Server Actions

- `setUserApprovalAction({ userId, approve })` — **unchanged** (Phase 4 contract): `requireAdmin()` → service-role update `is_approved` → revalidate. Add self-guard: an admin cannot revoke **their own** approval.
- `setUserAdminAction({ userId, makeAdmin })` — new; guards described in §5.W. Both revalidate `/admin/users` and `/admin`.

## 5.T Route Handlers

- None. All mutations are Server Actions (SAD §4.1). No binary streaming here.

## 5.U API Contracts

- Server Action inputs/outputs:
  - `setUserApprovalAction(input: { userId: string; approve: boolean }) => ActionResult`
  - `setUserAdminAction(input: { userId: string; makeAdmin: boolean }) => ActionResult`
  - Errors use `fail(message, code)` with codes: `FORBIDDEN`, `SELF_DEMOTE`, `LAST_ADMIN`, `NOT_FOUND`, `INTERNAL`.

## 5.V Integration Points

- **Supabase service-role client** for privileged reads/writes on `profiles`.
- **Phase 4** `requireAdmin`, `SignOutButton`, `ROUTES`.
- **Phase 3** `profiles`/`books` schema + access-token hook (approval/admin changes take effect on the affected user's **next token refresh**, per SAD §3.1 — surface this expectation in the UI copy: "Changes apply on the user's next sign-in.").

## 5.W State Management

- Server-rendered lists; **URL is the source of truth** for search/filter/page. Client state limited to per-row action pending/error. No global admin store.
- **Authorization self-protection (critical business rules):**
  - An admin **cannot** set `is_admin=false` on **their own** account (`userId === currentUserId` → `fail('You cannot remove your own admin access', 'SELF_DEMOTE')`).
  - The system **cannot** drop to **zero admins**: before demoting any admin, check `count(is_admin=true) > 1`; otherwise `fail('At least one admin must remain', 'LAST_ADMIN')`.
  - An admin cannot revoke **their own** approval.

## 5.X Error Handling

- Actions catch and map errors to `ActionResult`; unexpected → `fail('Something went wrong','INTERNAL')` + server log.
- Page uses the Phase-2 admin `error.tsx` boundary; `loading.tsx` provides skeleton.
- Empty search results render an explicit empty state.

## 5.Y Performance Considerations

- Use `count: 'exact', head: true` for stat counts (no row transfer).
- Paginate with `.range()`; default page size 25; index on `profiles(is_approved)` (partial) already exists from Phase 3 for the pending filter.
- Avoid N+1: `listUsers` is a single query; stats are a handful of count queries (acceptable) — optionally combine via a single RPC later (not required).

## 5.Z Security Considerations

- Every admin action re-verifies `requireAdmin()` server-side (never trusts the client).
- Service-role client used **only** inside admin server code; never imported client-side.
- Self-demotion and last-admin guards prevent privilege lockout.
- No user PII beyond email is exposed; do not render tokens or password hashes (never accessible anyway).
- Search input is parameterized via Supabase client (no SQL injection surface); still validate/limit query length.
- Admin routes protected at three layers (middleware + `requireAdmin` layout guard + RLS).

## 5.AA Testing Requirements

- **Unit:** `setUserAdminAction` denies non-admin callers; blocks self-demote; blocks last-admin demote; `adminToggleSchema`/`approvalSchema` reject bad input. `listUsers` builds correct filters (mock client).
- **Integration/E2E:**
  1. Admin sees Overview counts consistent with DB (e.g., pending count matches).
  2. Admin approves a pending user → user disappears from `status=pending`; user gains dashboard access after re-login.
  3. Admin grants admin to a user → that user can reach `/admin` after re-login.
  4. Admin attempts to self-demote → blocked with `SELF_DEMOTE`.
  5. Only one admin exists → demote attempt blocked with `LAST_ADMIN`.
  6. Non-admin hitting `/admin/users` → redirected (middleware + guard).
- Where live Supabase is unavailable, author as runnable specs marked pending-environment; logic unit tests must pass with mocked claims/clients.

## 5.BB Edge Cases

- Zero users / zero pending → empty states, counts show 0.
- Search returns no matches → explicit "No users found."
- Concurrent approval of same user → idempotent; last write wins; revalidation refreshes.
- Pagination beyond last page → clamp to last valid page or show empty gracefully.
- **User deletion** is intentionally **not** implemented (cascade risk + auth.users deletion requires admin API). If requested, it becomes a guarded future action; document as out-of-scope now.
- Approval/admin change staleness: the target user retains old access until token refresh — surface in UI copy.

## 5.CC Acceptance Criteria

1. `/admin` shows accurate counts via `getAdminStats()`.
2. `/admin/users` lists all users with working search, status filters, and pagination (all URL-driven).
3. Approve/revoke and grant/revoke-admin work via Server Actions; self-demote and last-admin demote are blocked with the specified codes.
4. `/admin/approvals` redirects to `/admin/users?status=pending` (no broken link).
5. Non-admins cannot access any `/admin/*` route; all admin actions re-verify `requireAdmin()`.
6. `pnpm typecheck`, `pnpm lint`, `pnpm build` pass; Phases 0–4 tests remain green; new admin tests pass.

## 5.DD Definition of Done

- All Acceptance Criteria pass.
- Phase-4 `setUserApprovalAction` contract preserved; new `setUserAdminAction` added with self-protection guards.
- No schema change; service-role usage stays server-only; three-layer authorization intact.
- Book/upload administration remains untouched (owned by Phase 6).
- Global DoD gate (predecessor Appendix B) satisfied.

---
---

# Phase 6 — Cloudflare R2 Integration & Upload Pipeline

## 6.A Objective

Implement the **admin EPUB upload pipeline** (SAD §6.1) as a Server Action that streams a file to the server, records book metadata, and stores the EPUB (and, once Phase 7 lands, the cover) in the **private** R2 bucket using **keys, not URLs** (SAD §1.2), with **transactional rollback** to prevent orphaned objects. Additionally, implement the **secure file-delivery Route Handlers** (SAD §2.1) — `/api/books/[id]/file` (EPUB stream) and `/api/covers/[id]` (cover stream) — that gate access on session + approval and stream binary from R2. Finally, provide **admin book management** (list + delete with R2 cleanup), now that books exist. This phase introduces the **`MetadataExtractor` seam** with a minimal fallback; Phase 7 upgrades it.

## 6.B Scope

**In scope:**
- `MetadataExtractor` interface + `EpubMetadata` type + `fallbackExtractor` (filename→title, form Author, no cover) in `src/lib/epub`.
- Upload Server Action `uploadBookAction` implementing SAD §6.1 ordering: validate → extract (fallback) → R2 upload EPUB → (cover upload only if extractor provides one; fallback provides none) → DB insert → `revalidateTag('library')` → **rollback** on any failure after R2 writes.
- Admin Upload UI (`/admin/uploads`): drag-drop/file-picker zone, client-side MIME/extension/size validation, progress/pending state, success/error surfaces.
- Secure delivery Route Handlers (Node runtime): `/api/books/[id]/file`, `/api/covers/[id]` — auth+approval gate, book lookup, R2 stream, correct headers (`no-store`, `application/epub+zip`, `inline`; `image/jpeg` for covers).
- Admin book management: `/admin/books` list + `deleteBookAction` (DB row + R2 objects, both keys).
- `next.config.ts` body-size configuration (see §5·0.2 note (B)); optional presigned fallback (`getSignedUploadUrl`) behind `UPLOAD_STRATEGY`.
- Zod schemas, typed errors, rollback logic.

**Out of scope:** real OPF metadata parsing and cover extraction (Phase 7 — the seam is the boundary), user-facing library/catalog UI (Phase 8), reading progress. Covers will typically be **absent** after Phase 6 (fallback extracts none); the cover Route Handler must therefore handle "no cover" gracefully (404/placeholder).

## 6.C Prerequisites

- Phases 0–5 complete and green.
- R2 layer (`putObject`, `getObjectStream`, `deleteObject`, `getSignedReadUrl`) and header helpers exist (Phase 2). **Live R2 bucket `epub-reader-assets` (private) with valid credentials in `.env.local`** — required for real upload/delivery verification; otherwise implement fully and mark integration "pending credentials" with mocked tests.
- `books` table + RLS (approved users can `SELECT`; no client insert policy — admin insert uses **service-role**) from Phase 3.
- `requireAdmin`, `requireApproved`, `getClaims` from Phase 4; admin shell from Phase 5.
- `epubKey(id)`, `coverKey(id)` from Phase 1.

## 6.D Expected Existing Project State

- `src/lib/epub/README.md` placeholder exists (Phase 1); no extractor code yet.
- `src/app/admin/uploads/page.tsx` is a placeholder; admin shell nav exists (Phase 5) — activate the Uploads/Books nav links here.
- `src/lib/r2/*` operations present; `books` table empty.
- No `src/app/api/*` Route Handlers exist yet.

## 6.E Dependencies

- **No new runtime package strictly required** for Phase 6 (R2 SDK already installed; `stream-zip`/`sharp` arrive in Phase 7). 
- If the optional presigned fallback is enabled: it uses the already-installed `@aws-sdk/s3-request-presigner` (Phase 2) — no new package.
- `uuid` generation: use Node's built-in `crypto.randomUUID()` (no dependency).

## 6.F Folder Structure After Phase 6 (additions/changes)

```
src/
├─ app/
│  ├─ api/
│  │  ├─ books/
│  │  │  └─ [id]/
│  │  │     └─ file/route.ts          # NEW — EPUB stream (Node runtime)
│  │  └─ covers/
│  │     └─ [id]/route.ts             # NEW — cover stream (Node runtime)
│  └─ admin/
│     ├─ uploads/page.tsx             # MODIFY — real upload UI
│     ├─ books/
│     │  ├─ page.tsx                  # NEW — admin book list
│     │  └─ loading.tsx               # NEW
│     └─ layout.tsx                   # MODIFY — enable Uploads/Books nav links
├─ features/
│  └─ admin/
│     ├─ upload/
│     │  ├─ actions.ts                # NEW — uploadBookAction ('use server')
│     │  ├─ schemas.ts                # NEW — uploadMetaSchema, deleteBookSchema
│     │  ├─ constants.ts              # NEW — MAX_UPLOAD_BYTES, ACCEPTED_MIME
│     │  └─ components/
│     │     ├─ upload-zone.tsx        # NEW — 'use client'
│     │     └─ upload-form.tsx        # NEW — 'use client' (title/author overrides)
│     ├─ books/
│     │  ├─ actions.ts                # NEW — deleteBookAction ('use server')
│     │  ├─ queries.ts                # NEW — listBooks (admin)
│     │  └─ components/
│     │     └─ admin-books-table.tsx  # NEW
├─ lib/
│  ├─ epub/
│  │  ├─ types.ts                     # NEW — EpubMetadata, MetadataExtractor
│  │  ├─ fallback-extractor.ts        # NEW — minimal extractor (no cover)
│  │  └─ index.ts                     # NEW — exports active extractor (fallback for now)
│  └─ r2/
│     └─ operations.ts                # MODIFY — add getSignedUploadUrl (optional fallback)
└─ next.config.ts                     # MODIFY — serverActions.bodySizeLimit
```

## 6.G Files to Create

### EPUB seam — `src/lib/epub/`
- **`types.ts`**:
  ```
  interface EpubMetadata { title: string; author: string | null; cover?: { bytes: Uint8Array; contentType: string } }
  interface ExtractInput { fileBytes: Uint8Array | ReadableStream; filename: string; formTitle?: string; formAuthor?: string }
  interface MetadataExtractor { extract(input: ExtractInput): Promise<EpubMetadata> }
  ```
  (Types only; server-safe.)
- **`fallback-extractor.ts`** (`import 'server-only'`): `fallbackExtractor: MetadataExtractor` — `title = formTitle ?? deriveTitleFromFilename(filename)`, `author = formAuthor ?? null`, **no cover**. Pure, no zip parsing.
- **`index.ts`** (`import 'server-only'`): `export const activeExtractor: MetadataExtractor = fallbackExtractor;` — **this is the single binding point Phase 7 will swap.** Document it loudly.

### Upload — `src/features/admin/upload/`
- **`constants.ts`**: `MAX_UPLOAD_BYTES` (from env, default 50 MB), `ACCEPTED_MIME = ['application/epub+zip']`, `ACCEPTED_EXT = ['.epub']`.
- **`schemas.ts`**: `uploadMetaSchema = z.object({ title: nonEmptyString.max(300).optional(), author: z.string().trim().max(200).optional() })`; `deleteBookSchema = z.object({ bookId: uuidSchema })`.
- **`actions.ts`** (`'use server'`) — `uploadBookAction(formData): Promise<ActionResult<{ bookId: string }>>` implementing **SAD §6.1 exactly**:
  1. `requireAdmin()`.
  2. Read `file` from FormData; validate presence, extension `.epub`, MIME `application/epub+zip`, and size ≤ `MAX_UPLOAD_BYTES`; parse optional `title`/`author` via `uploadMetaSchema`. On failure → `fail`.
  3. `const bookId = crypto.randomUUID();` compute `fileK = epubKey(bookId)`, `coverK = coverKey(bookId)`.
  4. `const meta = await activeExtractor.extract({ fileBytes, filename, formTitle, formAuthor });` (fallback → no cover).
  5. **R2 upload EPUB**: `putObject({ key: fileK, body: fileBytes, contentType: 'application/epub+zip' })`. (SAD orders cover-then-epub; because the fallback has no cover, EPUB upload is the first/only R2 write in Phase 6. Phase 7 adds the cover write **before** the DB insert, preserving the "files exist before DB references them" invariant.)
  6. **R2 upload cover** *if* `meta.cover` present (Phase 7 path).
  7. **DB insert** via **service-role** client into `books`: `{ id: bookId, title: meta.title, author: meta.author, file_key: fileK, cover_key: meta.cover ? coverK : null, format: 'epub' }`.
  8. **Rollback:** if the DB insert throws, `deleteObject(fileK)` and (if uploaded) `deleteObject(coverK)`; return `fail`. (SAD §6.1 step 8.)
  9. `revalidateTag('library')` (SAD §6.1 step 7 / §4.2).
  10. Return `ok({ bookId })`.
  - All errors mapped to `ActionResult`; never throw to client. Log server-side.
- **`components/upload-zone.tsx`** (`'use client'`): drag-drop + file input; validates extension/MIME/size **before** submit; shows selected filename; hands the `File` to `upload-form`.
- **`components/upload-form.tsx`** (`'use client'`): optional Title/Author fields (in Phase 6 these are the primary metadata source; Phase 7 makes them overrides), submits FormData to `uploadBookAction` via `useActionState`; shows pending/progress and success/error; on success clears and (optionally) navigates to `/admin/books`.

### Delivery Route Handlers
- **`src/app/api/books/[id]/file/route.ts`** (`export const runtime = 'nodejs'`; `export const dynamic = 'force-dynamic'`): `GET` handler:
  1. Resolve session via server Supabase client; `getClaims()`. If not authenticated → 401; if `is_approved !== true` → 403. (Defense-in-depth beyond RLS.)
  2. Look up the book by `id` (server client; RLS already restricts to approved users). If missing → 404.
  3. `const { body, contentLength } = await getObjectStream(book.file_key);` handle `R2NotFoundError` → 404.
  4. Return `new Response(body, { headers: epubDeliveryHeaders() , status: 200 })` including `Content-Length` when known. Headers enforce `Content-Type: application/epub+zip`, `Content-Disposition: inline`, `Cache-Control: no-store` (SAD §2.1).
- **`src/app/api/covers/[id]/route.ts`** (`runtime = 'nodejs'`, `force-dynamic`): `GET`:
  1. Auth + approval gate (same as above).
  2. Look up book; if `cover_key` is null → return a 404 (client renders placeholder) **or** a redirect to a static placeholder asset. **Decision:** return `404` and let `BookCard` (Phase 8) show its neutral placeholder — keeps this handler simple and avoids serving a body when no cover exists.
  3. Stream from R2 via `getObjectStream(book.cover_key)` with `coverDeliveryHeaders()` (`image/jpeg`, private cache). Since covers are static content, a **short private cache** (`Cache-Control: private, max-age=3600`) is acceptable (unlike EPUBs which are `no-store`).

### Admin books management — `src/features/admin/books/`
- **`queries.ts`** (`import 'server-only'`): `listBooks({ page, pageSize, query? })` — service-role or admin-scoped read of `books` ordered `created_at desc`, paginated.
- **`actions.ts`** (`'use server'`): `deleteBookAction({ bookId })`: `requireAdmin()` → parse → look up book (get `file_key`/`cover_key`) → **delete DB row (service-role)** → then `deleteObject(file_key)` and, if present, `deleteObject(cover_key)` → `revalidateTag('library')` + `revalidatePath('/admin/books')`. Order note: delete the DB row first so the book instantly disappears from all listings; then best-effort delete R2 objects (log and continue if an object is already missing — treat `R2NotFoundError` as success for idempotency). Return `ok()`.
- **`components/admin-books-table.tsx`**: list with title/author/created + delete button (client action cell with confirm).

### Admin pages
- **`src/app/admin/books/page.tsx`** (Server Component, `requireAdmin`) — renders `AdminBooksTable` from `listBooks`.
- **`src/app/admin/books/loading.tsx`** — skeleton.
- **`src/app/admin/uploads/page.tsx`** (MODIFY) — renders `<UploadZone>` + `<UploadForm>`; `requireAdmin`.

## 6.H Files to Modify

- **`src/lib/r2/operations.ts`** — add `getSignedUploadUrl(key, expiresInSeconds = 300, contentType = 'application/epub+zip')` (presigned `PutObjectCommand`) **only** for the optional fallback strategy; server-only; document.
- **`next.config.ts`** — add `experimental: { serverActions: { bodySizeLimit: process.env.SERVER_ACTIONS_BODY_LIMIT ?? '50mb' } }`. Ensure `/api/*` routes are excluded from any caching and served on Node runtime (per-route `runtime` already set). Confirm CSP `connect-src`/`img-src` permit same-origin `/api/covers/*` and `/api/books/*` (they are same-origin — already allowed by `'self'`).
- **`src/app/admin/layout.tsx`** — enable the previously-disabled **Uploads** (`/admin/uploads`) and **Books** (`/admin/books`) nav links.
- **`src/lib/env.ts`** — add optional server vars: `UPLOAD_STRATEGY` (`'stream' | 'presigned'`, default `'stream'`) and `MAX_UPLOAD_BYTES` (default `52428800`), `SERVER_ACTIONS_BODY_LIMIT` (default `'50mb'`). Validate.
- **`.env.example`** — add `UPLOAD_STRATEGY=stream`, `MAX_UPLOAD_BYTES=52428800`, `SERVER_ACTIONS_BODY_LIMIT=50mb`.
- **`src/lib/epub/README.md`** — replace with a note describing the extractor seam and that Phase 7 swaps `activeExtractor`.

## 6.I Database Migrations

None. Uses Phase-3 `books` table as-is (`title, author, cover_key, file_key, format`).

## 6.J Database Schema Updates

None. `cover_key` nullable already (Phase 3), which correctly models "no cover extracted yet" (Phase 6 fallback).

## 6.K Environment Variables

- New (server-only): `UPLOAD_STRATEGY` (default `stream`), `MAX_UPLOAD_BYTES` (default 52428800), `SERVER_ACTIONS_BODY_LIMIT` (default `50mb`).
- Consumes existing R2 + Supabase service-role vars.

## 6.L Configuration

- `next.config.ts` `serverActions.bodySizeLimit` raised (critical — see §5·0.2 note (B)).
- Route Handlers pinned to Node runtime (`export const runtime = 'nodejs'`) — R2 SDK + streaming require it; never Edge.
- Delivery caching: EPUB `no-store`; covers `private, max-age=3600`.

## 6.M React Components

- `UploadZone`, `UploadForm` (client), `AdminBooksTable` (+ client delete cell). Upload UI validates before hitting the network.

## 6.N Custom Hooks

- Optional `useFileValidation` (client) for MIME/extension/size checks in `UploadZone`. Keep small; no new global state.

## 6.O Zustand Stores

- None new. Upload progress/pending is local component state (`useActionState`); optional `ui-store` toast for results.

## 6.P Utility Modules

- `src/lib/epub/{types,fallback-extractor,index}`, upload `constants`, R2 `getSignedUploadUrl` (optional). `deriveTitleFromFilename` helper.

## 6.Q TypeScript Interfaces

- `EpubMetadata`, `MetadataExtractor`, `ExtractInput` (epub seam).
- `UploadResult = { bookId: string }`.
- `ListBooksParams`/`ListBooksResult`.

## 6.R Validation Schemas

- `uploadMetaSchema`, `deleteBookSchema`. Server-side re-validation of file (extension/MIME/size) independent of client checks (never trust the client).

## 6.S Server Actions

- `uploadBookAction(formData) => ActionResult<{ bookId }>` (admin-only; SAD §6.1 pipeline + rollback).
- `deleteBookAction({ bookId }) => ActionResult` (admin-only; DB row then R2 cleanup; idempotent on missing objects).

## 6.T Route Handlers

- `GET /api/books/[id]/file` → EPUB stream (auth+approval gate, `no-store`, `application/epub+zip`, `inline`). Node runtime.
- `GET /api/covers/[id]` → cover stream (auth+approval gate, `image/jpeg`, `private, max-age=3600`); 404 when no cover. Node runtime.

## 6.U API Contracts

- **Upload (Server Action):** FormData fields `file` (required, `.epub`), `title?`, `author?`. Returns `ActionResult<{ bookId }>`. Error codes: `FORBIDDEN`, `INVALID_FILE`, `TOO_LARGE`, `UPLOAD_FAILED`, `DB_FAILED`, `INTERNAL`.
- **Delivery (Route Handlers):** `GET /api/books/{id}/file` → `200` binary or `401/403/404`. `GET /api/covers/{id}` → `200` image/jpeg or `401/403/404`. No mutation. These are the URLs the Phase-8 library UI and the future reader consume (frozen contract).
- **Delete (Server Action):** `{ bookId } => ActionResult`.

## 6.V Integration Points

- **Cloudflare R2** (put/get/delete, optional presign) via Phase-2 layer.
- **Supabase** service-role for `books` insert/delete; server client + RLS for delivery lookups.
- **Phase 8** consumes `/api/covers/[id]` for `BookCard`, and `revalidateTag('library')` invalidation (SAD §4.2).
- **Future reader phase** consumes `/api/books/[id]/file` to obtain the EPUB stream → Blob → objectURL → foliate (SAD §2.1 step 5).
- **Phase 7** swaps `activeExtractor` (single binding point) and enables the cover-upload branch already present in `uploadBookAction`.

## 6.W State Management

- Upload flow: local component state only. Server state (books) is DB-backed and cache-tagged `library`. No global store.

## 6.X Error Handling

- Upload: validation failures → typed `fail`; R2 failure → `fail('UPLOAD_FAILED')`; DB failure → **rollback R2** then `fail('DB_FAILED')`. Guarantees no orphaned objects (SAD §6.1) and no dangling DB rows.
- Delivery handlers: map auth→401/403, missing book/object→404; never leak internal errors; `R2NotFoundError`→404.
- Delete: treat missing R2 object as success (idempotent); if DB delete fails, do **not** delete R2 (abort) and return `fail`.

## 6.Y Performance Considerations

- **Stream, don't buffer** for delivery (`getObjectStream` → `Response(body)`); avoids serverless memory spikes (SAD §2 rationale). For upload, reading the FormData file into bytes is bounded by `MAX_UPLOAD_BYTES`; for very large files prefer the presigned direct-to-R2 fallback to bypass the function entirely.
- Covers cached (`private, max-age=3600`) to reduce repeated R2 reads on the library grid; EPUBs `no-store` (privacy > caching).
- `revalidateTag('library')` on upload/delete keeps the Phase-8 grid fresh without over-invalidation.
- Book lookups by PK (`id`) are O(1) index hits.

## 6.Z Security Considerations

- **Bucket stays strictly private** (SAD §1.1/§1.2); files reachable **only** through gated Route Handlers (auth + `is_approved`), never via public URL.
- Delivery handlers enforce approval **independently** of RLS (defense-in-depth) so a misconfigured RLS or a service-role slip cannot leak files.
- EPUB responses are `no-store` (SAD §2.1) to discourage casual download/caching.
- Upload restricted to admins; file re-validated server-side (extension + MIME + size); random UUID keys prevent enumeration/overwrite of others' objects.
- Store **keys, not URLs** (SAD §1.2) — no storage domain leaks into the DB.
- Presigned upload URLs (if used) are short-lived (≤300s) and scoped to a single computed key.
- Rollback prevents orphaned private objects (cost + data-hygiene).

## 6.AA Testing Requirements

- **Unit:** `uploadBookAction` — rejects non-admin, bad MIME/extension, oversize; on DB-insert failure calls `deleteObject(fileK)` (rollback) — assert with mocked R2/DB. `fallbackExtractor` derives title from filename. `deleteBookAction` idempotent on missing R2 object.
- **Route Handler tests:** unauthenticated → 401; approved but unauthorized book → RLS 404; missing key → 404; happy path streams with correct headers (`no-store`, `application/epub+zip`).
- **Integration (with live R2 if available):** upload a small valid `.epub` → object exists at `epubs/{id}.epub`, DB row present; `GET /api/books/{id}/file` streams it back; delete removes both DB row and object.
- Mark live-R2 cases pending-credentials if unavailable; logic tests must pass with mocks.

## 6.BB Edge Cases

- Upload > `MAX_UPLOAD_BYTES` → rejected before/at server (and platform body limit respected via config or presigned fallback).
- Non-EPUB with `.epub` extension → MIME check + (Phase 7) structural validation reject.
- Duplicate upload of same content → new UUID → distinct book (dedup is out of scope; note as future).
- R2 up but DB down → rollback deletes uploaded object(s).
- DB up but R2 down → action fails before DB insert (no dangling row).
- Cover requested for a book with `cover_key = null` (common in Phase 6) → 404 → UI placeholder.
- Delivery requested by approved user for non-existent book id → 404.
- Concurrent delete + delivery of same book → delivery gets 404 after DB row gone (acceptable).

## 6.CC Acceptance Criteria

1. An admin can upload a `.epub` via `/admin/uploads`; the file lands at `epubs/{id}.epub` in R2 and a `books` row is created with correct `title/author/file_key/format`; `cover_key` is null (Phase 6 fallback).
2. Upload failures roll back cleanly — no orphaned R2 objects and no dangling DB rows (verified via injected-failure test).
3. `GET /api/books/[id]/file` streams the EPUB only to authenticated, approved users with `no-store`/`application/epub+zip`/`inline`; unauthenticated→401, unapproved→403, missing→404.
4. `GET /api/covers/[id]` gates identically and 404s when no cover exists.
5. `/admin/books` lists uploaded books; `deleteBookAction` removes the DB row and R2 object(s) idempotently and revalidates `library`.
6. `next.config.ts` raises `serverActions.bodySizeLimit`; large uploads within `MAX_UPLOAD_BYTES` succeed (or presigned fallback documented/working if `UPLOAD_STRATEGY=presigned`).
7. `activeExtractor` is the single swap point for Phase 7; the cover-upload branch and `cover_key` insert are already present but inactive under the fallback.
8. `pnpm typecheck`, `pnpm lint`, `pnpm build` pass; Phases 0–5 tests remain green; new tests pass.

## 6.DD Definition of Done

- All Acceptance Criteria pass.
- SAD §6.1 pipeline order + rollback and SAD §2.1 delivery semantics implemented exactly; bucket remains private; keys-not-URLs preserved.
- Route Handlers run on Node runtime, stream (no full-buffer), and enforce approval independently of RLS.
- `MetadataExtractor` seam in place with fallback; Phase 7 can swap without touching `uploadBookAction`'s signature or the `books` insert.
- Body-size blocker mitigated via config (and optional presigned path).
- Global DoD gate satisfied.

---
---

# Phase 7 — EPUB Processing & Metadata Extraction

## 7.A Objective

Implement **real EPUB metadata extraction** (SAD §6.1 step 3) — parsing the EPUB container/OPF **without extracting the whole archive to disk** — to obtain **Title**, **Author**, and the **cover image binary**, plus **structural validation** that a file is a genuine EPUB. Normalize covers to JPEG. Then **swap this implementation into the Phase-6 extractor seam** (`activeExtractor`) so the existing upload pipeline auto-populates metadata and stores covers at `covers/{id}.jpg` — with **no change** to `uploadBookAction`'s signature or the `books` insert. Manual Title/Author form fields become **optional overrides**.

## 7.B Scope

**In scope:**
- `streamZipExtractor` implementing `MetadataExtractor` (Phase-6 interface) using `node-stream-zip`: read `META-INF/container.xml` → locate OPF → parse OPF (`<dc:title>`, `<dc:creator>`, cover via `<meta name="cover">` → manifest item, or `properties="cover-image"`) → read the cover entry bytes.
- Structural EPUB **validation**: presence of `mimetype` entry equal to `application/epub+zip` and a resolvable OPF; reject otherwise.
- Cover **normalization** to JPEG (and sane max dimensions) via `sharp`.
- Bind `activeExtractor = streamZipExtractor` (the Phase-6 swap point).
- Enable/verify the cover branch of `uploadBookAction`: cover uploaded to `coverKey(id)` **before** the DB insert; `cover_key` set; rollback covers both objects.
- Robust handling of missing/partial metadata, encrypted/DRM archives, corrupt zips.

**Out of scope:** rendering, TOC/nav parsing, full-text indexing/search (future), non-EPUB formats (SAD §7 future), changing the DB schema.

## 7.C Prerequisites

- Phases 0–6 complete and green.
- Phase 6 extractor seam present: `src/lib/epub/{types,index}` with `activeExtractor = fallbackExtractor`, and `uploadBookAction` already containing the (currently inactive) cover-upload branch and `cover_key` insert.
- R2 `putObject`/`deleteObject` and `coverKey(id)` available; Node runtime for server actions/handlers.

## 7.D Expected Existing Project State

- `uploadBookAction` uploads EPUB, inserts book with `cover_key = meta.cover ? coverKey(id) : null`, rolls back on DB failure (Phase 6).
- `fallbackExtractor` returns no cover; covers are currently null in the DB.
- `/api/covers/[id]` 404s when `cover_key` is null (Phase 6).

## 7.E Dependencies

- **Runtime (server-only):**
  - `node-stream-zip@1` — streaming zip entry access without full extraction.
  - `sharp@0.33` — cover transcode/resize to JPEG. (Runs on Node runtime only; ensure host provides the native binary — on Vercel it is supported on the Node runtime.)
  - An XML parser: `fast-xml-parser@4` (lightweight, no native deps) for OPF/container parsing. (Do **not** hand-roll XML parsing with regex.)
- No client dependencies.

## 7.F Folder Structure After Phase 7 (additions/changes)

```
src/
└─ lib/
   └─ epub/
      ├─ types.ts                     # UNCHANGED (Phase 6 interface)
      ├─ fallback-extractor.ts        # UNCHANGED (kept as safety fallback)
      ├─ stream-zip-extractor.ts      # NEW — real extractor (node-stream-zip + fast-xml-parser)
      ├─ opf.ts                       # NEW — OPF/container XML parsing helpers
      ├─ cover.ts                     # NEW — sharp normalization to JPEG
      ├─ validate.ts                  # NEW — structural EPUB validation
      ├─ errors.ts                    # NEW — EpubParseError, EpubInvalidError, EpubEncryptedError
      └─ index.ts                     # MODIFY — activeExtractor = streamZipExtractor
```

## 7.G Files to Create

- **`src/lib/epub/errors.ts`**: `EpubInvalidError` (not a valid EPUB), `EpubParseError` (OPF/XML parse failure), `EpubEncryptedError` (DRM/`META-INF/encryption.xml` present) — all extend a base `EpubError`.
- **`src/lib/epub/validate.ts`** (`import 'server-only'`): `assertValidEpub(zip)` — verify a `mimetype` entry exists and equals `application/epub+zip`; verify `META-INF/container.xml` resolves to an OPF; detect `META-INF/encryption.xml` → throw `EpubEncryptedError`. Throw `EpubInvalidError` on structural failure.
- **`src/lib/epub/opf.ts`** (`import 'server-only'`): `parseContainer(xml): { opfPath }`; `parseOpf(xml, opfDir): { title; author; coverHref? }` using `fast-xml-parser`. Resolve cover via: (1) `<meta name="cover" content="ID">` → manifest item `href` by id; else (2) manifest item with `properties="cover-image"`. Normalize hrefs relative to the OPF directory. Return `author` from first `<dc:creator>` (trimmed) or null; `title` from `<dc:title>` (trimmed) — fall back to filename-derived title if absent.
- **`src/lib/epub/cover.ts`** (`import 'server-only'`): `normalizeCoverToJpeg(bytes): Promise<{ bytes: Uint8Array; contentType: 'image/jpeg' }>` — `sharp(input).rotate().resize({ width: 800, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()`. Guard against decode failures (corrupt image) → return no cover rather than failing the whole upload.
- **`src/lib/epub/stream-zip-extractor.ts`** (`import 'server-only'`): implements `MetadataExtractor`:
  1. Materialize input to a Buffer (bounded by `MAX_UPLOAD_BYTES`) or a temp stream that `node-stream-zip` can read. (`node-stream-zip` reads from a file path or buffer; if only a stream is available, buffer it within the size cap.)
  2. Open with `node-stream-zip`; `assertValidEpub`.
  3. Read `container.xml` → `parseContainer` → read OPF entry → `parseOpf`.
  4. If `coverHref` resolved, read that entry's bytes → `normalizeCoverToJpeg` (on failure, drop cover).
  5. Apply overrides: `title = formTitle?.trim() || parsedTitle || filenameTitle`; `author = formAuthor?.trim() || parsedAuthor || null`.
  6. Always **close** the zip (finally). Return `EpubMetadata`.
  - On `EpubEncryptedError`/`EpubInvalidError`, **throw** (upload action maps to `fail('INVALID_FILE')`); on soft metadata gaps, degrade gracefully (use fallbacks) rather than throwing.

## 7.H Files to Modify

- **`src/lib/epub/index.ts`** — `export const activeExtractor: MetadataExtractor = streamZipExtractor;` (the single swap; fallback remains exported for emergency use/tests).
- **`src/features/admin/upload/actions.ts`** — **no signature change.** Confirm the cover branch now activates because `meta.cover` is populated: upload cover to `coverKey(bookId)` with `contentType: 'image/jpeg'` **before** the DB insert (preserving "files exist before DB references them"); set `cover_key` accordingly; rollback deletes both objects on DB failure. Add mapping: `EpubInvalidError`/`EpubEncryptedError` → `fail('This file is not a valid or supported EPUB', 'INVALID_FILE')`. Make the form Title/Author **optional** (validation already allows optional).
- **`src/features/admin/upload/components/upload-form.tsx`** — relabel Title/Author as **optional overrides** ("Leave blank to auto-detect"). No behavioral requirement beyond copy + optionality.
- **`src/features/admin/upload/constants.ts`** — add `COVER_MAX_WIDTH = 800`, `COVER_JPEG_QUALITY = 80` (or keep these in `cover.ts`).
- **`.env.example`** / **`src/lib/env.ts`** — no new required vars. (If a temp-dir path is needed for `node-stream-zip`, use the OS temp dir via Node; do not add an env var unless the host requires it — document with `// ISD-NOTE:` if so.)

## 7.I Database Migrations

None. `cover_key` already nullable; extractor now populates it for most books.

## 7.J Database Schema Updates

None.

## 7.K Environment Variables

None new (unless a host requires an explicit temp dir — documented, not mandated).

## 7.L Configuration

- Ensure the upload Server Action and any code path invoking `sharp`/`node-stream-zip` runs on the **Node.js runtime** (Server Actions run on Node by default; do not move them to Edge).
- `sharp` native binary must be available in the deploy environment; document the install/runtime requirement.

## 7.M React Components

- No new components. `upload-form.tsx` copy/optionality update only.

## 7.N Custom Hooks

- None.

## 7.O Zustand Stores

- None.

## 7.P Utility Modules

- `stream-zip-extractor`, `opf`, `cover`, `validate`, `errors` — all server-only under `src/lib/epub`.

## 7.Q TypeScript Interfaces

- Reuses `EpubMetadata`/`MetadataExtractor`/`ExtractInput` (Phase 6). Internal types: `ContainerInfo { opfPath }`, `OpfInfo { title; author; coverHref? }`.

## 7.R Validation Schemas

- Structural validation is imperative (`validate.ts`), not Zod (binary/XML domain). Form overrides continue to use Phase-6 `uploadMetaSchema`.

## 7.S Server Actions

- No new Server Actions. `uploadBookAction` behavior **upgraded** transparently via the swapped `activeExtractor` and the now-active cover branch. Signature and `ActionResult` contract unchanged.

## 7.T Route Handlers

- No new handlers. `/api/covers/[id]` now serves real covers for books that have one (unchanged code; `cover_key` is now populated).

## 7.U API Contracts

- Unchanged. Upload FormData contract identical; Title/Author now optional overrides. Delivery handlers unchanged.

## 7.V Integration Points

- **Phase 6 upload pipeline** via the `activeExtractor` swap — the sole integration seam (§5·0.2 note A).
- **R2** cover upload at `coverKey(id)` (Phase 1 key builder), served by Phase-6 `/api/covers/[id]`.
- **Phase 8** benefits automatically: `BookCard` covers now resolve for most books.

## 7.W State Management

- None (server-side processing during a single action invocation).

## 7.X Error Handling

- Invalid/encrypted EPUB → `fail('INVALID_FILE')`; upload aborts **before** any R2 write when validation fails early (no rollback needed) — validation should occur **before** the EPUB R2 upload where feasible; if validation happens after buffering but before upload, ensure no partial writes.
- Corrupt cover image → drop cover (book still created, `cover_key = null`), do not fail the upload.
- Missing title/author in OPF → fall back to filename/null; never fail on soft gaps.
- Always close the zip handle (finally) to avoid file-descriptor leaks.
- Map `EpubError` subclasses to friendly messages; log details server-side.

## 7.Y Performance Considerations

- **Do not extract the whole archive** — read only `container.xml`, the OPF, and the cover entry (SAD §6.1 step 3 "without extracting the whole file to disk").
- Bound processing by `MAX_UPLOAD_BYTES`; `sharp` resize keeps covers small (≤800px width) → faster grid loads and lower R2 storage/egress.
- Reuse a single zip handle per extraction; avoid re-opening.
- `sharp` is CPU-bound; acceptable for admin-triggered uploads (low frequency). Note cold-start cost of the native binary.

## 7.Z Security Considerations

- **Validate before trusting**: confirm real EPUB structure; reject DRM/encrypted archives (`EpubEncryptedError`) — do not attempt to bypass DRM.
- **Zip-bomb / path-traversal defense**: only read specific, resolved entries (container→OPF→cover); never write archive entries to disk by their internal path; cap total read bytes; treat entry names as untrusted (resolve/normalize, reject `..`).
- XML parsing via `fast-xml-parser` configured to **disable external entity/DTD** processing (prevent XXE). Explicitly set safe options.
- Cover transcoded through `sharp` (re-encode) — strips potentially malicious embedded payloads and normalizes format.
- Extractor is server-only; never bundled to client.

## 7.AA Testing Requirements

- **Unit (fixtures):** include small fixture EPUBs in `tests/fixtures/`:
  - valid EPUB with cover → extracts correct title/author + JPEG cover bytes.
  - valid EPUB without cover → title/author, no cover.
  - EPUB with cover via `properties="cover-image"` (EPUB3) and via `<meta name="cover">` (EPUB2) → both resolve.
  - corrupt zip → `EpubInvalidError`.
  - encrypted (`encryption.xml`) → `EpubEncryptedError`.
  - non-EPUB renamed `.epub` → `EpubInvalidError`.
  - override precedence: form title/author beats parsed values.
  - corrupt cover image → cover dropped, extraction still succeeds.
- **XXE test:** OPF with an external entity does not read local files / does not crash.
- **Integration:** with the extractor swapped in, `uploadBookAction` on a real fixture creates a book with `cover_key` set and the JPEG present in R2 (live-R2 or mocked).
- Confirm zip handles are closed (no FD leak) — e.g., spy on `close`.

## 7.BB Edge Cases

- OPF path with subdirectories → cover href resolved relative to OPF dir.
- Multiple `<dc:creator>` → use the first (or `role=aut` if present); document choice.
- Title/author with HTML entities/whitespace → decoded/trimmed.
- Very large embedded cover → resized down; extremely small/decorative cover still accepted.
- EPUB with cover referenced but entry missing → treat as no cover (graceful).
- Non-UTF-8 OPF encoding → parser handles declared encoding; fall back gracefully.

## 7.CC Acceptance Criteria

1. `streamZipExtractor` extracts correct Title/Author and a normalized **JPEG** cover from valid EPUBs (both EPUB2 `<meta name="cover">` and EPUB3 `properties="cover-image"`), reading only necessary entries (no full extraction).
2. Invalid or DRM-encrypted files are rejected with a clear `INVALID_FILE` result and cause **no** R2 writes.
3. `activeExtractor` now points to `streamZipExtractor`; `uploadBookAction` auto-populates metadata, uploads the cover to `covers/{id}.jpg` **before** the DB insert, sets `cover_key`, and rolls back both objects on DB failure — **with no signature change**.
4. Form Title/Author function as **optional overrides** that take precedence when provided.
5. `/api/covers/[id]` returns real covers for books that have them; `BookCard` (Phase 8) will resolve them.
6. XML parsing is XXE-safe; cover transcoding strips original encoding; zip handles are always closed.
7. `pnpm typecheck`, `pnpm lint`, `pnpm build` pass; Phases 0–6 tests remain green; new extractor tests pass.

## 7.DD Definition of Done

- All Acceptance Criteria pass.
- SAD §6.1 step 3 satisfied (stream-based metadata + cover extraction, no full extraction); cover normalized to JPEG per storage convention (`covers/{id}.jpg`).
- Extractor swapped at the single Phase-6 seam without altering the upload contract or DB schema.
- Security: EPUB validated, DRM rejected (not bypassed), XXE/zip-traversal defended, covers re-encoded.
- Fallback extractor retained for tests/emergency; Node runtime + `sharp` availability documented.
- Global DoD gate satisfied.

---
---

# Phase 8 — Library Management & Dashboard Foundation

## 8.A Objective

Build the **approved user's reading dashboard and library foundation**: a cached **catalog grid** of all books (approved users may read any book in the walled garden — SAD §3.2 RLS), a **personal library** layer backed by `user_libraries` (add/remove a book to "My Library"), **reading-progress display** (percentage) sourced from `reading_progress`, a **book details** view, and the supporting **cached data layer** (`unstable_cache` + `revalidateTag('library')`, SAD §4.2). Covers render via the Phase-6 `/api/covers/[id]` handler; the "Read" affordance links to `/reader/[bookId]` (which remains the Phase-1 placeholder — the reader engine is a later phase). This phase **reads** progress but does **not** write it (progress writing/CFI sync belongs to the reader phase).

## 8.B Scope

**In scope:**
- Cached library data layer: `getCatalog()`, `getMyLibrary(userId)`, `getBookById(id)`, `getProgressMap(userId)` — server-only, tagged `library` / per-user tags.
- Dashboard `/dashboard`: catalog grid + "My Library" section, using `BookCard` (Phase 1) with covers, progress badges, and add/remove controls.
- Personal library Server Actions: `addToLibraryAction`, `removeFromLibraryAction` (approved-user-guarded; write `user_libraries`).
- Book details view `/dashboard/books/[id]` (or a details panel) showing title/author/cover/progress and a "Read" CTA + add/remove.
- Search/sort/filter of the catalog (URL-driven).
- Loading skeletons, empty states, and error boundaries for the library segment.

**Out of scope:** the reader/foliate integration, reading-progress **writes**/CFI sync (later phase), highlights/annotations/search-in-book (SAD §7 future), recommendations. The `/reader/[bookId]` route stays a placeholder; Phase 8 only links to it.

## 8.C Prerequisites

- Phases 0–7 complete and green.
- `books` populated via Phase-6/7 upload; `/api/covers/[id]` serves covers; RLS lets approved users `SELECT books`, and `user_libraries`/`reading_progress` are restricted to `user_id = auth.uid()` (Phase 3).
- `requireApproved`, `getClaims` (Phase 4); `BookCard` (Phase 1); `ROUTES` incl. `READER(bookId)`.
- `revalidateTag('library')` is already emitted by upload/delete (Phase 6).

## 8.D Expected Existing Project State

- `/dashboard` is a Phase-4 placeholder greeting the user; `(app)/layout.tsx` enforces `requireApproved()`.
- `src/features/library/README.md` placeholder exists (Phase 1); no library code yet.
- `BookCard` presentational component accepts `title`, `author`, `coverSrc?`, `onOpen?` (Phase 1).
- `reading_progress` table exists (Phase 3) with `unique(user_id, book_id)`, `percentage`, `cfi`.

## 8.E Dependencies

- No new runtime packages required. (Sorting/filtering hand-rolled; data fetching via existing Supabase server client + `unstable_cache`.) Optional: none.

## 8.F Folder Structure After Phase 8 (additions/changes)

```
src/
├─ app/
│  └─ (app)/
│     ├─ dashboard/
│     │  ├─ page.tsx                  # MODIFY — catalog + My Library grids
│     │  ├─ loading.tsx               # NEW — grid skeleton
│     │  ├─ error.tsx                 # (Phase 2 app-segment boundary already covers; add local if needed)
│     │  └─ books/
│     │     └─ [id]/
│     │        ├─ page.tsx            # NEW — book details
│     │        └─ loading.tsx         # NEW
├─ features/
│  └─ library/
│     ├─ queries.ts                   # NEW — server-only cached reads
│     ├─ actions.ts                   # NEW — add/remove to library ('use server')
│     ├─ schemas.ts                   # NEW — libraryMutationSchema
│     ├─ cache.ts                     # NEW — cache tag/key helpers
│     ├─ constants.ts                 # NEW — page size, sort options
│     └─ components/
│        ├─ library-grid.tsx          # NEW — server component grid of BookCards
│        ├─ book-card-actions.tsx     # NEW — 'use client' add/remove + Read link
│        ├─ catalog-toolbar.tsx       # NEW — search/sort (URL-driven)
│        ├─ progress-badge.tsx        # NEW — presentational % badge
│        └─ empty-state.tsx           # NEW
└─ types/
   └─ library.ts                      # NEW — view models (BookWithProgress, etc.)
```

## 8.G Files to Create

- **`src/features/library/cache.ts`**: tag helpers — `LIBRARY_TAG = 'library'`, `userLibraryTag(userId) = \`library:${userId}\``, `progressTag(userId) = \`progress:${userId}\``. Used to scope `unstable_cache` and `revalidateTag`.
- **`src/features/library/queries.ts`** (`import 'server-only'`):
  - `getCatalog({ query?, sort?, page, pageSize }): Promise<{ rows: Book[]; total: number }>` — Supabase server client (RLS ensures approved-only); wrapped in `unstable_cache` tagged `LIBRARY_TAG`. Sort by `created_at desc` (default), `title asc`, etc. `ilike` on title/author for search.
  - `getBookById(id): Promise<Book | null>` — cached, tagged `LIBRARY_TAG`.
  - `getMyLibrary(userId): Promise<Book[]>` — join `user_libraries` → `books`; cached, tagged `userLibraryTag(userId)`. **Note:** user-scoped caches must include the userId in the cache key (never share across users).
  - `getProgressMap(userId): Promise<Record<string, number>>` — map `book_id → percentage` from `reading_progress`; cached, tagged `progressTag(userId)`. Read-only in Phase 8.
  - **Security caution:** because `unstable_cache` keys are explicit, **always** include `userId` in the cache key + tag for per-user data to prevent cross-user leakage. Catalog (same for all approved users) may be shared, but is still fetched under the requesting user's RLS session — if RLS makes catalog user-invariant (it does: approved users see all books), a shared cache is safe. Document this reasoning inline.
- **`src/features/library/actions.ts`** (`'use server'`):
  - `addToLibraryAction({ bookId }): Promise<ActionResult>` — `requireApproved()` → parse → insert into `user_libraries` (`user_id = claims.userId`, `book_id`) with `on conflict do nothing` (idempotent via unique constraint) → `revalidateTag(userLibraryTag(userId))` → `ok()`.
  - `removeFromLibraryAction({ bookId }): Promise<ActionResult>` — `requireApproved()` → delete matching row (RLS ensures own-row only) → `revalidateTag(userLibraryTag(userId))` → `ok()`.
  - Use the **request-scoped server client** (not service-role) so RLS enforces ownership; never trust `user_id` from the client (derive from session claims).
- **`src/features/library/schemas.ts`**: `libraryMutationSchema = z.object({ bookId: uuidSchema })`; catalog params schema (`query?`, `sort ∈ SORTS`, `page` coerced int).
- **`src/features/library/constants.ts`**: `LIBRARY_PAGE_SIZE = 24`, `SORTS = ['recent','title','author'] as const`.
- **`src/types/library.ts`**: `BookWithProgress = Book & { percentage: number; inLibrary: boolean }`; `CatalogView`, `MyLibraryView`.
- **Components:**
  - **`components/library-grid.tsx`** (Server Component) — takes `books: BookWithProgress[]`, renders responsive grid of `BookCard` with `coverSrc={\`/api/covers/${book.id}\`}` and a `<ProgressBadge percentage/>` + `<BookCardActions>`.
  - **`components/book-card-actions.tsx`** (`'use client'`) — "Read" link → `ROUTES.READER(book.id)` (placeholder target, acceptable), and Add/Remove toggle wired to `addToLibraryAction`/`removeFromLibraryAction` via `useActionState`; optimistic UI optional (use `useOptimistic`); surfaces errors via `ui-store` toast.
  - **`components/catalog-toolbar.tsx`** (client or server GET form) — search input + sort select, URL-driven (updates `searchParams`).
  - **`components/progress-badge.tsx`** (presentational) — shows `0%`–`100%`; hides at 0 or shows "Not started".
  - **`components/empty-state.tsx`** — reusable empty UI (no books / empty library / no search results).
- **Pages:**
  - **`(app)/dashboard/page.tsx`** (MODIFY→) Server Component: `requireApproved()`; read `searchParams`; fetch `getCatalog`, `getMyLibrary`, `getProgressMap`; compose `BookWithProgress` view models (merge progress + inLibrary flags); render "My Library" (if any) + "Browse Catalog" with `<CatalogToolbar>` + `<LibraryGrid>` + pagination.
  - **`(app)/dashboard/loading.tsx`** — grid skeleton.
  - **`(app)/dashboard/books/[id]/page.tsx`** — `requireApproved()`; `getBookById`; if null → `notFound()`; show cover (large), title, author, progress, "Read" CTA, Add/Remove.
  - **`(app)/dashboard/books/[id]/loading.tsx`** — skeleton.

## 8.H Files to Modify

- **`src/app/(app)/dashboard/page.tsx`** — replace Phase-4 placeholder with the composed dashboard (above).
- **`src/features/library/README.md`** — describe the library surface, cache tags, and that progress is read-only here.
- **`src/features/admin/upload/actions.ts` / `src/features/admin/books/actions.ts`** — **verify** they already `revalidateTag('library')` (Phase 6). Additionally, when a book is deleted, cascades remove `user_libraries`/`reading_progress` rows (Phase 3 FK) — but per-user caches won't auto-invalidate; **accept eventual consistency** (per-user library revalidates on their next mutation or cache TTL). Document this; do not add cross-user fan-out invalidation (over-engineering). Optionally set a short `revalidate` TTL on user-scoped caches to bound staleness.
- **`src/lib/routes.ts`** — confirm `READER(bookId)` and add `BOOK_DETAILS(bookId) = \`/dashboard/books/${bookId}\`` if not present.

## 8.I Database Migrations

None. Uses Phase-3 `books`, `user_libraries` (unique `(user_id, book_id)`), `reading_progress`.

## 8.J Database Schema Updates

None.

## 8.K Environment Variables

None new.

## 8.L Configuration

- Library reads use `unstable_cache` with explicit keys + tags (`library`, `library:{userId}`, `progress:{userId}`). Dashboard is per-request dynamic (auth + searchParams) but wraps cached data fetches.
- Ensure `/dashboard` is dynamically rendered (cookies/searchParams) while the underlying catalog query is cached across users.

## 8.M React Components

- `LibraryGrid` (server), `BookCardActions` (client), `CatalogToolbar`, `ProgressBadge`, `EmptyState`, details page. Reuses Phase-1 `BookCard`. Client interactivity limited to add/remove + toolbar.

## 8.N Custom Hooks

- Optional `useOptimistic`-based toggle in `BookCardActions` for snappy add/remove. No new global hook required.

## 8.O Zustand Stores

- None new. May use `ui-store` toast for action feedback. Library data is server-cached, not in Zustand. (The `reader-store` remains untouched — reader phase owns it.)

## 8.P Utility Modules

- `library/{queries,cache,constants,schemas}`; view-model composition helper (merge books + progress + library membership).

## 8.Q TypeScript Interfaces

- `BookWithProgress`, `CatalogView`, `MyLibraryView`, cache-tag helper signatures, `SortOption = typeof SORTS[number]`.

## 8.R Validation Schemas

- `libraryMutationSchema` (`{ bookId }`), catalog search/sort/page schema (coerce + enum, default on invalid).

## 8.S Server Actions

- `addToLibraryAction({ bookId }) => ActionResult` (approved-only; idempotent insert; RLS-scoped).
- `removeFromLibraryAction({ bookId }) => ActionResult` (approved-only; own-row delete; RLS-scoped).
- Both derive `user_id` from session claims (never from client input) and `revalidateTag(userLibraryTag(userId))`.

## 8.T Route Handlers

- None new. Consumes Phase-6 `/api/covers/[id]` (covers) and links to `/reader/[bookId]` (placeholder). Does **not** consume `/api/books/[id]/file` (that's the reader phase).

## 8.U API Contracts

- Server Action contracts as above (codes: `FORBIDDEN`, `NOT_FOUND`, `INVALID_INPUT`, `INTERNAL`).
- Consumes existing cover contract `GET /api/covers/{id}` (200 image/jpeg | 404).
- Frozen consumer expectation: `/reader/[bookId]` route exists (placeholder) and will later obtain the EPUB via `/api/books/[id]/file`.

## 8.V Integration Points

- **Supabase** RLS-scoped reads/writes (`books`, `user_libraries`, `reading_progress`).
- **Phase 6** covers handler + `library` cache tag invalidation.
- **Phase 3** unique constraints (idempotent add) + FK cascades.
- **Future reader phase**: `/reader/[bookId]` link + will populate `reading_progress` that this phase already reads for display.

## 8.W State Management

- Server-cached data + URL-driven catalog controls. Client state limited to per-card optimistic add/remove. No auth token or book data in client global state.

## 8.X Error Handling

- Actions return typed `ActionResult`; RLS violations/not-found → `fail('NOT_FOUND')`; unexpected → `INTERNAL` + log.
- `getBookById` null → `notFound()` on the details page.
- Segment `error.tsx` (Phase 2 app boundary) catches render failures; `loading.tsx` skeletons for suspense.
- Cover 404 handled by `BookCard` placeholder (no thrown error).

## 8.Y Performance Considerations

- Catalog cached with `unstable_cache` (tag `library`), shared across approved users → fast grid loads; invalidated on upload/delete (SAD §4.2).
- Paginate catalog (`.range()`, page size 24); index `books(created_at desc)` (Phase 3) supports default sort.
- Covers cached (`private, max-age=3600` from Phase 6) → fewer R2 reads on scroll.
- Progress map fetched once per dashboard render (single query keyed by user) → avoids N+1 per card.
- Per-user caches keyed + tagged by `userId`; short TTL bounds staleness without heavy invalidation.

## 8.Z Security Considerations

- **Per-user cache isolation:** user-scoped caches (`library:{userId}`, `progress:{userId}`) **must** include `userId` in both key and tag — never serve one user's library/progress to another. (Explicitly tested.)
- Add/remove actions derive `user_id` from **session claims**, not client input; RLS enforces ownership as defense-in-depth.
- All library reads occur under the approved user's RLS session (or a shared catalog that RLS makes user-invariant); no service-role in the user-facing path.
- Approval enforced at three layers (middleware, `requireApproved` guard, RLS) — unapproved users cannot reach `/dashboard` or query books.
- Covers/EPUBs remain gated; the grid never exposes R2 URLs (uses `/api/covers/[id]`).

## 8.AA Testing Requirements

- **Unit:** `addToLibraryAction`/`removeFromLibraryAction` — reject unapproved; idempotent add (conflict → success); derive `user_id` from claims (ignore client-supplied user_id). Catalog params schema normalizes bad input.
- **Cache isolation test (critical):** two users with different libraries do not see each other's `getMyLibrary`/`getProgressMap` results (assert cache key includes userId).
- **Integration/E2E:**
  1. Approved user sees catalog grid populated by Phase-6/7 uploads, with covers loading via `/api/covers/[id]`.
  2. Add a book → appears in "My Library"; remove → disappears; both idempotent.
  3. Progress badge reflects `reading_progress` rows (seed a row → badge shows %).
  4. Book details page renders; missing id → 404.
  5. Search/sort update the grid via URL; pagination works; empty search shows empty state.
  6. Unapproved user cannot reach `/dashboard` (redirected).
- Live-Supabase cases pending-environment if unavailable; logic tests pass with mocks.

## 8.BB Edge Cases

- Empty catalog (no uploads yet) → catalog empty state; "My Library" empty state.
- Book deleted by admin while shown → cover 404s / details `notFound()`; catalog refreshes on next `library` revalidation.
- Adding an already-added book → idempotent success (unique constraint).
- Removing a book not in library → no-op success.
- Progress row absent → badge shows "Not started" (0%).
- Very large catalog → pagination prevents overfetch.
- Cover missing (`cover_key` null, e.g., some Phase-6-era books) → placeholder.
- Concurrent add/remove on same card → optimistic UI reconciles with action result; last write wins.

## 8.CC Acceptance Criteria

1. `/dashboard` shows a cached **catalog grid** of all books (approved-only) with covers via `/api/covers/[id]`, plus a **My Library** section.
2. `addToLibraryAction`/`removeFromLibraryAction` work idempotently, are approval-guarded, derive `user_id` from claims, and revalidate the user's library cache.
3. Reading-progress percentages display from `reading_progress` (read-only); "Not started" when absent.
4. Book details page renders and 404s on unknown id; "Read" links to `/reader/[bookId]` (placeholder).
5. Search/sort/pagination are URL-driven; empty/loading/error states present.
6. Per-user caches are isolated by `userId` (no cross-user leakage) — verified by test.
7. Catalog invalidates on admin upload/delete (`revalidateTag('library')`).
8. `pnpm typecheck`, `pnpm lint`, `pnpm build` pass; Phases 0–7 tests remain green; new library tests pass.

## 8.DD Definition of Done

- All Acceptance Criteria pass.
- SAD §4.2 caching (tagged `library`, revalidated on mutation) implemented; per-user data cached with isolated keys/tags.
- Library reads/writes are RLS-scoped; approval enforced at three layers; no R2 URLs exposed.
- Progress is **read-only** here; reader/CFI writing cleanly deferred to a later phase; `/reader/[bookId]` untouched placeholder.
- No schema change; no new env vars; reuses Phase-1 `BookCard` and Phase-6 cover delivery.
- Global DoD gate satisfied.

---
---

## Appendix C — New Frozen Contracts Introduced in Phases 5–8

| Contract | Introduced | Import path / location | Consumers |
|---|---|---|---|
| `setUserApprovalAction`, `setUserAdminAction` | Phase 5 | `@/features/admin/actions` | Admin UI |
| Admin queries (`listUsers`, `getAdminStats`) | Phase 5 | `@/features/admin/queries` | Admin pages |
| `MetadataExtractor`, `EpubMetadata`, `ExtractInput` | Phase 6 | `@/lib/epub/types` | Upload pipeline, Phase 7 |
| `activeExtractor` (single swap point) | Phase 6→7 | `@/lib/epub` | `uploadBookAction` |
| `uploadBookAction`, `deleteBookAction` | Phase 6 | `@/features/admin/upload`, `@/features/admin/books` | Admin UI |
| `GET /api/books/[id]/file` | Phase 6 | Route Handler | Future reader phase |
| `GET /api/covers/[id]` | Phase 6 | Route Handler | Phase 8 `BookCard` |
| `getSignedUploadUrl` (optional) | Phase 6 | `@/lib/r2` | Presigned upload fallback |
| Library cache tags (`library`, `library:{userId}`, `progress:{userId}`) | Phase 8 | `@/features/library/cache` | Upload/delete revalidation, reader phase |
| `addToLibraryAction`, `removeFromLibraryAction` | Phase 8 | `@/features/library/actions` | Dashboard |
| Library queries (`getCatalog`, `getMyLibrary`, `getBookById`, `getProgressMap`) | Phase 8 | `@/features/library/queries` | Dashboard, details |

## Appendix D — Global Definition-of-Done Gate (every phase, restated for convenience)

A phase is complete only when: (1) `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm build` pass; (2) all prior phases' tests remain green; (3) the phase's own Acceptance Criteria pass; (4) no forward-phase functionality was implemented; (5) no secret is exposed to the client bundle; (6) frozen contracts (predecessor Appendix A + this Appendix C) were not renamed; (7) the private R2 bucket, keys-not-URLs, and three-layer authorization invariants are preserved.

*End of ISD — Phases 5 through 8. Remaining phases (Reader/foliate integration, reading-progress & offline CFI sync, theming, PWA offline, extensibility features) to be authored on request.*
