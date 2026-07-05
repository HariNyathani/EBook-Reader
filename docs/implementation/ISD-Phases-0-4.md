# Implementation Specification Document (ISD)

**Project:** Private EPUB Reader (Walled-Garden Web App + PWA)
**Document:** Master Implementation Blueprint — Phases 0 through 4
**Author:** Technical Lead / Principal Engineer
**Status:** Finalized for execution
**Source of Truth:** Software Architecture Document (SAD), as revised by the Senior Staff Engineer Architecture Review
**Date:** 2026-07-05

---

## 0. How to Read and Execute This Document

### 0.1 Audience

This ISD is written for **heterogeneous downstream AI coding agents** (Claude Sonnet, GLM, DeepSeek, Qwen, Kimi, Minimax, and others). Each agent may execute a **single phase** in isolation, with **no memory of any other phase**. Therefore:

- Every phase is **self-contained**. It restates the project state it expects, the exact files it touches, and the exact acceptance criteria that prove it is complete.
- Agents **must not** invent architecture. If a decision is not written here or in the SAD, the agent must choose the smallest, most conventional option consistent with the stack declared in Phase 0, and must leave a `// ISD-NOTE:` comment explaining the choice.
- Agents **must not** implement functionality that belongs to a later phase. "Stub, do not implement" is called out explicitly wherever it applies.

### 0.2 Global Technology Baseline (applies to all phases)

| Concern | Decision | Version / Notes |
|---|---|---|
| Runtime | Node.js | `>= 20.11` (dev machine confirmed on v22.x) |
| Package manager | **pnpm** | `>= 9`, enabled via `corepack enable` |
| Framework | Next.js (App Router) | `15.x` (React 19, async `cookies()`/`headers()`) |
| Language | TypeScript | `5.x`, `strict: true` |
| UI styling | Tailwind CSS | `3.4.x` |
| State | Zustand | `5.x` |
| Auth + DB | Supabase | Cloud project; `@supabase/ssr` + `@supabase/supabase-js` |
| Object storage | Cloudflare R2 (S3-compatible) | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` |
| Reader engine | `foliate-js` | Vendored (see Phase 1 note) |
| EPUB metadata | `node-stream-zip` | Server-only |
| Offline queue | `idb-keyval` | Client-only |
| Validation | Zod | `3.x` |
| Lint / format | ESLint (`next/core-web-vitals`) + Prettier | — |
| Testing | Vitest + Testing Library + Playwright | Playwright wired in Phase 2, first specs in Phase 4 |

> **Version pinning rule:** Every agent must pin the versions it installs into `package.json` using caret ranges as above and must commit the resulting `pnpm-lock.yaml`. Agents must not run `pnpm update` or bump major versions.

### 0.3 Phase Dependency Graph

```
Phase 0 (Bootstrap)
   └─> Phase 1 (Core Structure)
          └─> Phase 2 (Infrastructure: R2 client, PWA shell, error boundaries, config validation)
                 └─> Phase 3 (Database & Supabase Foundation: schema, RLS, claims hook)
                        └─> Phase 4 (Authentication & Authorization: middleware, auth flows, guards)
```

Each phase is **strictly sequential**. A phase may assume all prior phases are complete and green (typecheck, lint, and their acceptance tests pass). A phase must **never** reach forward.

### 0.4 Critical Implementation Blocker Found During Planning (and its minimal correction)

**Blocker:** The revised SAD is internally inconsistent about **where the custom JWT claims live**.

- §3.1 (Middleware) reads `app_metadata.is_approved` / `app_metadata.is_admin`.
- §3.2 (RLS) reads top-level `auth.jwt() ->> 'is_approved'`.

`app_metadata.is_approved` and a top-level `is_approved` claim are **different JSON paths** in the token. If we write the claim to one place and read it from the other, **every authorization check silently fails** (or silently passes), which is a security-critical defect and a hard implementation blocker.

**Smallest possible correction (adopted for all phases; does not alter the architecture):**

1. A **Supabase Custom Access Token Hook** injects **two top-level claims** into every issued JWT: `is_approved` (boolean) and `is_admin` (boolean). The hook derives these values from a `public.profiles` table (the source of truth), so we never write to the `auth.users` schema directly.
2. **All readers use the top-level claim path**:
   - RLS: `(auth.jwt() ->> 'is_approved')::boolean = true`
   - Middleware: decode JWT, read top-level `is_approved` / `is_admin`.
3. The SAD's phrase "embed into `app_metadata`" is interpreted as "embed into the access-token claims"; the mechanism is the Custom Access Token Hook reading from `public.profiles`. This preserves the SAD's intent (no per-request DB lookup in middleware) while removing the path ambiguity.

This correction is implemented in **Phase 3** (hook + profiles table + RLS) and **consumed** in **Phase 4** (middleware). No other change to the architecture is made.

### 0.5 Conventions Used Throughout

- **Paths** are relative to the repository root unless prefixed with `/`.
- **"Create"** = the file does not exist yet. **"Modify"** = the file exists from a prior phase.
- **Server-only modules** must begin with `import 'server-only';` to make accidental client imports a build error.
- **Client-only modules** must begin with `'use client';`.
- **Environment variable access** is centralized (Phase 2). Direct `process.env.X` reads outside `src/lib/env.ts` are forbidden after Phase 2.
- **Standardized Server Action result** shape (used from Phase 4 onward, defined in Phase 1 types):
  ```ts
  type ActionResult<T = undefined> =
    | { status: 'success'; data?: T }
    | { status: 'error'; message: string; code?: string };
  ```

---
---

# Phase 0 — Project Bootstrap

## 0.A Objective

Stand up a compiling, lintable, formatted Next.js 15 + TypeScript + Tailwind application skeleton managed by pnpm, with a clean, empty App Router entry point, deterministic tooling configuration, and a committed lockfile. At the end of Phase 0 the app runs locally (`pnpm dev`), typechecks, lints, and builds — with **zero domain logic**.

## 0.B Scope

**In scope:**
- Initialize the repository and pnpm workspace.
- Install and pin the base toolchain (Next.js, React, TypeScript, Tailwind, ESLint, Prettier).
- Configure TypeScript (`strict`), path aliases, Tailwind, ESLint, Prettier, `.gitignore`, `.editorconfig`, `.nvmrc`.
- Create a minimal App Router root (`layout.tsx`, `page.tsx`, `globals.css`, `not-found.tsx`).
- Establish npm scripts for `dev`, `build`, `start`, `lint`, `typecheck`, `format`.

**Explicitly out of scope (later phases):** any feature folder, Supabase, R2, Zustand stores, middleware, auth, PWA, testing frameworks.

## 0.C Prerequisites

- Node.js `>= 20.11` installed (dev machine confirmed on v22.23.1).
- `corepack enable` has been run (enables pnpm without a global install).
- Network access to the npm registry.
- Working directory: repository root (`/home/hariharan/Documents/Ebook Reader`).

## 0.D Expected Existing Project State

- Repository directory exists and is **empty except** for `docs/implementation/ISD-Phases-0-4.md` (this document).
- No `package.json`, no `node_modules`, no `.git`.

## 0.E Dependencies to Install

**Runtime:**
- `next@15`, `react@19`, `react-dom@19`

**Dev:**
- `typescript@5`, `@types/node@20`, `@types/react@19`, `@types/react-dom@19`
- `tailwindcss@3.4`, `postcss@8`, `autoprefixer@10`
- `eslint@9`, `eslint-config-next@15`
- `prettier@3`, `prettier-plugin-tailwindcss@0.6`

> Do **not** install Supabase, R2, Zustand, Zod, foliate, idb-keyval, or test runners in Phase 0. They belong to later phases and installing early creates unused-dependency drift.

## 0.F Folder Structure After Phase 0

```
.
├─ docs/implementation/ISD-Phases-0-4.md
├─ public/                      # empty placeholder (favicon may be added)
├─ src/
│  └─ app/
│     ├─ layout.tsx
│     ├─ page.tsx
│     ├─ not-found.tsx
│     └─ globals.css
├─ .editorconfig
├─ .gitignore
├─ .nvmrc
├─ .prettierrc.json
├─ .prettierignore
├─ eslint.config.mjs            # OR .eslintrc.json (see note)
├─ next.config.ts
├─ postcss.config.mjs
├─ tailwind.config.ts
├─ tsconfig.json
├─ package.json
└─ pnpm-lock.yaml
```

## 0.G Files to Create

1. **`package.json`** — with scripts:
   - `"dev": "next dev"`
   - `"build": "next build"`
   - `"start": "next start"`
   - `"lint": "next lint"`
   - `"typecheck": "tsc --noEmit"`
   - `"format": "prettier --write ."`
   - `"format:check": "prettier --check ."`
   - Add `"packageManager": "pnpm@9.x.x"` (exact resolved version) and `"engines": { "node": ">=20.11" }`.

2. **`tsconfig.json`** — `strict: true`, `moduleResolution: "bundler"`, `target: "ES2022"`, `jsx: "preserve"`, `paths`: `{ "@/*": ["./src/*"] }`, `plugins: [{ "name": "next" }]`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `forceConsistentCasingInFileNames: true`.

3. **`next.config.ts`** — minimal; `reactStrictMode: true`. Leave a commented placeholder block noting that image `remotePatterns`, PWA integration, and R2 config arrive in Phase 2. Do not add them now.

4. **`tailwind.config.ts`** — `content: ['./src/**/*.{ts,tsx}']`; extend theme with CSS-variable-driven color tokens named `background` and `foreground` mapped to `var(--background)` / `var(--foreground)` (these variables are declared in `globals.css`). Do **not** design a full theme system — reader theming is Phase 5+.

5. **`postcss.config.mjs`** — `tailwindcss` + `autoprefixer`.

6. **`src/app/globals.css`** — Tailwind `@tailwind base; @tailwind components; @tailwind utilities;` plus `:root` CSS variables `--background` / `--foreground` with a light/dark `prefers-color-scheme` block. No component styles.

7. **`src/app/layout.tsx`** — Root layout (Server Component). Sets `<html lang="en">`, imports `globals.css`, exports `metadata` (`title: 'EPUB Reader'`, `description`). Renders `{children}` inside `<body>`. No providers yet (providers are added in Phase 2 for error boundaries and Phase 4 for auth context).

8. **`src/app/page.tsx`** — Minimal landing placeholder: a centered heading "EPUB Reader" and a line "Bootstrap complete." Server Component, no interactivity.

9. **`src/app/not-found.tsx`** — Minimal 404 page.

10. **ESLint config** — Use the flat-config `eslint.config.mjs` extending `next/core-web-vitals` and `next/typescript`. If the installed `eslint-config-next` version does not yet support flat config cleanly, fall back to `.eslintrc.json` with `"extends": ["next/core-web-vitals", "next/typescript"]` and leave a `// ISD-NOTE:` explaining the fallback.

11. **`.prettierrc.json`** — `{ "singleQuote": true, "semi": true, "trailingComma": "all", "printWidth": 100, "plugins": ["prettier-plugin-tailwindcss"] }`.

12. **`.prettierignore`**, **`.gitignore`** (Node/Next defaults: `node_modules`, `.next`, `.env*` except `.env.example`, `*.log`, `.DS_Store`, `coverage`, `playwright-report`, `test-results`), **`.editorconfig`**, **`.nvmrc`** (`20`).

## 0.H Files to Modify

None (greenfield).

## 0.I Database Migrations / Schema Updates

N/A for this phase — no database is introduced until Phase 3.

## 0.J Environment Variables

None consumed in Phase 0. Create an **empty-but-committed** `.env.example` with a header comment only:
```
# Environment variables are introduced starting in Phase 2 (see docs/implementation).
```
Do not create `.env.local` yet.

## 0.K Configuration Notes

- Enforce `strict` TypeScript from day one; do not relax it later.
- `@/*` alias must resolve to `src/*` in both `tsconfig.json` and (implicitly) Next's bundler.
- Prettier + ESLint must not conflict; rely on `next lint` for lint rules and Prettier only for formatting.

## 0.L React Components

- `RootLayout` (Server Component) — structural only.
- `Home` page (Server Component) — placeholder only.
- `NotFound` (Server Component) — placeholder only.

No client components in Phase 0.

## 0.M Custom Hooks / Zustand Stores / Utility Modules / Interfaces / Validation Schemas / Server Actions / Route Handlers / API Contracts

N/A for this phase — none are introduced. (These begin in Phases 1–4.)

## 0.N Integration Points

None. Phase 0 has no external integrations.

## 0.O State Management

None. No client state yet.

## 0.P Error Handling

Rely on Next.js default error/404 behavior. `not-found.tsx` provides a friendly 404. Global error boundary UI is introduced in Phase 2.

## 0.Q Performance Considerations

- Keep `page.tsx` and `layout.tsx` as Server Components (zero client JS shipped).
- No fonts loaded via network in Phase 0 to keep the build offline-friendly; if a font is desired, use `next/font` with a system fallback (optional, not required).

## 0.R Security Considerations

- `.gitignore` must exclude all `.env*` files except `.env.example`. Verify before first commit.
- No secrets exist yet; ensure none are hardcoded.

## 0.S Testing Requirements

- No test runner in Phase 0. Verification is via the toolchain commands (see Acceptance Criteria).

## 0.T Edge Cases

- If `corepack` is unavailable, the agent may `npm i -g pnpm@9` and leave an `// ISD-NOTE:`. The lockfile must still be `pnpm-lock.yaml`.
- If Next 15 scaffolding conflicts with the pre-existing `docs/` folder, do **not** delete `docs/`; scaffold in place.

## 0.U Acceptance Criteria

1. `pnpm install` completes and produces `pnpm-lock.yaml`.
2. `pnpm typecheck` exits 0.
3. `pnpm lint` exits 0 with no errors.
4. `pnpm format:check` exits 0.
5. `pnpm build` completes successfully.
6. `pnpm dev` serves `/` showing "EPUB Reader — Bootstrap complete."; navigating to a random path renders the custom 404.

## 0.V Definition of Done

- All Acceptance Criteria pass.
- The folder structure matches §0.F exactly.
- `strict` TypeScript is on; `@/*` alias resolves.
- `.env.example` exists; no `.env.local` committed; `.gitignore` excludes secrets.
- A single commit (or clean working tree) represents the bootstrap. No domain code exists.

---
---

# Phase 1 — Core Project Structure

## 1.A Objective

Establish the **domain-oriented module skeleton** (`/features`, `/lib`, `/store`, `/types`, `/components`) exactly as mandated by SAD §8.2, plus the **shared TypeScript type system**, the **shared Zod primitive schemas**, the **shared `ActionResult` contract**, and **route-group placeholders** for the App Router. This phase produces the scaffolding and contracts that every later phase imports, with **no runtime behavior** beyond rendering placeholders.

## 1.B Scope

**In scope:**
- Full directory tree from SAD §8.2 with index barrels and README stubs where useful.
- Shared TypeScript interfaces for the domain entities (`Book`, `Profile`, `UserLibraryEntry`, `ReadingProgress`) as **type contracts only** (they mirror the DB schema built in Phase 3; kept in sync manually until Phase 3 generates types).
- Shared enums/const objects (`ROLES`, `ROUTES`, storage key helpers as pure string builders).
- The `ActionResult<T>` type and a small set of result helpers (`ok`, `fail`).
- Shared Zod primitive schemas (`uuidSchema`, `emailSchema`, `nonEmptyString`) in `src/lib/validation`.
- App Router **route groups** and placeholder pages: `(auth)`, `(app)`, and `admin` segments — all rendering "Coming soon" placeholders.
- Central design-token/util helpers (`cn` classname combiner).

**Out of scope:** Supabase/R2 clients (Phase 2/3), Zustand store logic (stores are declared as typed skeletons only, wired in later phases), middleware (Phase 4), any data fetching.

## 1.C Prerequisites

- Phase 0 complete and green.

## 1.D Expected Existing Project State

- Compiling Next 15 app with `src/app/{layout,page,not-found}.tsx`, Tailwind, ESLint, Prettier, strict TS, `@/*` alias.
- No `src/features`, `src/lib`, `src/store`, `src/types`, `src/components` folders yet.

## 1.E Dependencies to Install

- `zod@3`
- `zustand@5`
- `clsx@2` and `tailwind-merge@2` (for `cn`)

> No network/service SDKs in Phase 1.

## 1.F Folder Structure After Phase 1

```
src/
├─ app/
│  ├─ layout.tsx
│  ├─ page.tsx                     # redirect placeholder → /dashboard (client-safe stub; real redirect Phase 4)
│  ├─ not-found.tsx
│  ├─ globals.css
│  ├─ (auth)/
│  │  ├─ login/page.tsx            # placeholder
│  │  ├─ register/page.tsx         # placeholder
│  │  └─ pending-approval/page.tsx # placeholder
│  ├─ (app)/
│  │  ├─ layout.tsx                # authed shell placeholder (no guard yet)
│  │  ├─ dashboard/page.tsx        # library grid placeholder
│  │  └─ reader/[bookId]/page.tsx  # reader placeholder
│  └─ admin/
│     ├─ layout.tsx                # admin shell placeholder (no guard yet)
│     ├─ page.tsx                  # admin home placeholder
│     ├─ uploads/page.tsx          # placeholder
│     └─ approvals/page.tsx        # placeholder
├─ components/
│  ├─ ui/                          # primitives (Button, Spinner) — minimal
│  │  ├─ button.tsx
│  │  └─ spinner.tsx
│  ├─ book-card.tsx                # presentational placeholder
│  └─ index.ts
├─ features/
│  ├─ reader/README.md
│  ├─ library/README.md
│  ├─ auth/README.md
│  └─ admin/README.md
├─ lib/
│  ├─ supabase/README.md           # placeholder; clients added Phase 2/3
│  ├─ r2/README.md                 # placeholder; client added Phase 2
│  ├─ epub/README.md               # placeholder; parser added later phase
│  ├─ validation/
│  │  ├─ primitives.ts
│  │  └─ index.ts
│  ├─ result.ts                    # ActionResult + ok/fail helpers
│  ├─ routes.ts                    # ROUTES const map
│  ├─ constants.ts                 # ROLES, storage-key builders (pure)
│  └─ utils/
│     └─ cn.ts
├─ store/
│  ├─ reader-store.ts              # typed skeleton (state shape only)
│  ├─ ui-store.ts                  # typed skeleton
│  └─ index.ts
└─ types/
   ├─ domain.ts                    # Book, Profile, UserLibraryEntry, ReadingProgress
   ├─ action.ts                    # re-export ActionResult
   └─ index.ts
```

## 1.G Files to Create

### Types (`src/types`)
- **`domain.ts`** — Interfaces mirroring the Phase 3 schema. Field names use **snake_case** to match Postgres/Supabase row shape (avoids mapping churn):
  - `Book`: `id: string`, `title: string`, `author: string | null`, `cover_key: string | null`, `file_key: string`, `format: 'epub'` (enum, default epub — future formats per SAD §7), `created_at: string`, `updated_at: string`.
  - `Profile`: `id: string` (== auth user id), `email: string`, `is_approved: boolean`, `is_admin: boolean`, `created_at: string`, `updated_at: string`.
  - `UserLibraryEntry`: `id: string`, `user_id: string`, `book_id: string`, `added_at: string`.
  - `ReadingProgress`: `id: string`, `user_id: string`, `book_id: string`, `cfi: string | null`, `percentage: number`, `updated_at: string`.
  - Add a header comment: "MANUAL CONTRACT — must stay in sync with Phase 3 migrations until Supabase type generation is enabled."
- **`action.ts`** — `export type { ActionResult } from '@/lib/result';`
- **`index.ts`** — barrel re-export.

### Result contract (`src/lib/result.ts`)
- `ActionResult<T>` union (see §0.5).
- `ok<T>(data?: T): ActionResult<T>` and `fail(message: string, code?: string): ActionResult<never>` helpers.
- Pure, dependency-free, safe to import from client or server.

### Routes + constants (`src/lib`)
- **`routes.ts`** — a frozen `ROUTES` object mapping symbolic names to path strings, e.g. `LOGIN: '/login'`, `REGISTER: '/register'`, `PENDING_APPROVAL: '/pending-approval'`, `DASHBOARD: '/dashboard'`, `READER: (bookId: string) => \`/reader/${bookId}\``, `ADMIN: '/admin'`, `ADMIN_UPLOADS: '/admin/uploads'`, `ADMIN_APPROVALS: '/admin/approvals'`. This is the **single source of route strings** for middleware (Phase 4) and links.
- **`constants.ts`** — `ROLES = { USER: 'user', ADMIN: 'admin' } as const`; **pure storage-key builders** (no I/O): `epubKey(bookId: string) => \`epubs/${bookId}.epub\``, `coverKey(bookId: string) => \`covers/${bookId}.jpg\``. These match SAD §1.1 exactly and are consumed by the R2 layer (Phase 2) and upload pipeline (later phase).

### Validation primitives (`src/lib/validation`)
- **`primitives.ts`** — `uuidSchema = z.string().uuid()`, `emailSchema = z.string().email()`, `nonEmptyString = z.string().trim().min(1)`. Export a helper `parseOrThrow<T>(schema, value)` and a safe `parseResult` that returns `ActionResult`.
- **`index.ts`** — barrel.

### Utils
- **`utils/cn.ts`** — `cn(...inputs)` using `clsx` + `tailwind-merge`.

### Components (`src/components`)
- **`ui/button.tsx`** (`'use client'`) — minimal typed button with `variant` prop (`primary | ghost`) using `cn`. No business logic.
- **`ui/spinner.tsx`** — presentational SVG spinner.
- **`book-card.tsx`** — **presentational** props-driven card (`title`, `author`, `coverSrc?`, `onOpen?`). No data fetching. Cover image rendering will point at the Phase-2 cover route later; for now accept a `coverSrc?: string` prop and render a neutral placeholder if absent.
- **`index.ts`** — barrel.

### Zustand store skeletons (`src/store`)
- **`reader-store.ts`** (`'use client'`) — define the **state shape only** per SAD §5.2/§5.3, with typed actions that are currently no-ops or simple setters. Shape includes: `theme: 'light' | 'sepia' | 'dark'`, `fontSize: number`, `margin: number`, `currentCfi: string | null`, `isReady: boolean`, plus setters. **Do not** implement Foliate wiring, persistence, or offline queue (those are Phase 5+). Add a header comment marking future wiring points.
- **`ui-store.ts`** (`'use client'`) — `isSidebarOpen`, `toast: { message, type } | null`, setters. Minimal.
- **`index.ts`** — barrel.

### App Router placeholders
- All pages listed in §1.F render a simple centered placeholder with the segment name. `(app)/layout.tsx` and `admin/layout.tsx` render a shared shell (`<main>` wrapper) **without any auth guard** — guards are Phase 4. `app/page.tsx` renders a link/CTA to `/dashboard` (a real redirect is deferred to Phase 4 to avoid coupling before auth exists).

### Feature READMEs
- Each `src/features/*/README.md` states the feature's responsibility boundary (per SAD §8.2) and lists which phase will populate it. This prevents agents from cross-contaminating feature folders.

## 1.H Files to Modify

- **`src/app/layout.tsx`** — import barrels if needed; still no providers. Keep minimal.
- **`src/app/page.tsx`** — convert placeholder to reference `ROUTES.DASHBOARD` link.
- **`tsconfig.json`** — confirm `@/*` still resolves for new folders (no change expected).

## 1.I Database Migrations / Schema Updates

N/A — types in `domain.ts` are **contracts only**. The authoritative schema is created in Phase 3, which must match these contracts field-for-field.

## 1.J Environment Variables

None consumed. `.env.example` remains header-only.

## 1.K Configuration

- Add `src/features`, `src/lib`, `src/store`, `src/types`, `src/components` to Tailwind `content` implicitly via the existing `./src/**/*.{ts,tsx}` glob (no change needed — verify).

## 1.L React Components

See §1.G Components. All are presentational or placeholder. No component fetches data or holds server state.

## 1.M Custom Hooks

None implemented in Phase 1. (`useFoliate` etc. are declared as future work in `features/reader/README.md`.)

## 1.N Zustand Stores

`reader-store.ts`, `ui-store.ts` — **typed skeletons only**. State shape is fixed now so later phases add behavior without changing the public shape.

## 1.O Utility Modules

`cn`, `result` helpers, `routes`, `constants`, validation `primitives`. All pure and dependency-light.

## 1.P TypeScript Interfaces

`Book`, `Profile`, `UserLibraryEntry`, `ReadingProgress`, `ActionResult<T>`. Snake_case field names to match DB rows.

## 1.Q Validation Schemas

`uuidSchema`, `emailSchema`, `nonEmptyString` + helpers. Domain-object schemas (e.g., upload payloads) are added in the phases that own those flows.

## 1.R Server Actions / Route Handlers / API Contracts

None implemented. Define **only** the shared `ActionResult<T>` contract that all future Server Actions must return. Document it in `src/lib/result.ts` with a doc comment.

## 1.S Integration Points

- Downstream phases import: `@/lib/result`, `@/lib/routes`, `@/lib/constants`, `@/lib/validation`, `@/types`, `@/store`, `@/components`. These import paths are **frozen contracts** — later phases must not rename them.

## 1.T State Management

Client state shapes are declared (Zustand) but inert. No server state.

## 1.U Error Handling

Not yet centralized (Phase 2 adds error boundaries). Validation helpers return `ActionResult` errors rather than throwing where possible.

## 1.V Performance Considerations

- Keep placeholder pages as Server Components; only `button`, `spinner` interactive bits and stores are client modules.
- Barrels must not create import cycles; keep `index.ts` files thin re-exports.

## 1.W Security Considerations

- No secrets. Ensure `constants.ts` key builders do not leak bucket names or endpoints (they build **object keys only**, never full URLs — consistent with SAD §1.2 "store keys, not URLs").

## 1.X Testing Requirements

- No runtime tests required yet. Verification via typecheck/lint/build and a manual smoke of each placeholder route.
- Optional: a trivial unit test file may be added but the test runner is not installed until Phase 2, so prefer deferring.

## 1.Y Edge Cases

- Route groups `(auth)` and `(app)` must **not** appear in the URL. Verify `/login`, `/dashboard`, `/reader/abc`, `/admin/uploads` resolve.
- `noUncheckedIndexedAccess` may surface issues in barrels — handle with explicit exports, not `any`.

## 1.Z Acceptance Criteria

1. All folders/files in §1.F exist.
2. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` all pass.
3. Every placeholder route renders (manually verified): `/login`, `/register`, `/pending-approval`, `/dashboard`, `/reader/test-id`, `/admin`, `/admin/uploads`, `/admin/approvals`.
4. Route groups are not present in URLs.
5. `import { ok, fail } from '@/lib/result'`, `import { ROUTES } from '@/lib/routes'`, `import type { Book } from '@/types'`, `import { useReaderStore } from '@/store'` all resolve.

## 1.AA Definition of Done

- All Acceptance Criteria pass.
- Domain type contracts documented as "must match Phase 3".
- Store shapes finalized (public shape frozen).
- No feature folder contains logic; each has a README describing its future scope.
- No secrets, no service SDKs introduced.

---
---

# Phase 2 — Infrastructure Setup

## 2.A Objective

Build the **cross-cutting infrastructure** the whole app depends on: (1) a **validated, centralized environment/config module**; (2) the **Cloudflare R2 S3 client** and typed helpers (put/get/delete/presign) implementing the "store keys, not URLs" and "strictly private bucket" mandates (SAD §1, §2); (3) the **PWA shell** (manifest + service worker registration scaffolding) needed for the offline reading-progress queue (SAD §5.3); (4) **global error handling** (React Error Boundaries per feature segment + standardized server error shaping) per SAD §8.3; (5) the **testing harness** (Vitest + Testing Library + Playwright config). This phase must remain **framework-plumbing only** — no Supabase, no auth, no feature data flows.

## 2.B Scope

**In scope:**
- `src/lib/env.ts` — Zod-validated env accessor; server vs. public split.
- `src/lib/r2/` — S3 client factory, `putObject`, `getObjectStream`, `deleteObject`, `getSignedUrl` helpers, typed errors. **Server-only.**
- PWA: `public/manifest.webmanifest`, icons, service worker registration component, offline caching **shell only** (no data sync logic yet — that's Phase 5+; but the SW file and registration must exist so Phase 5 can extend it).
- Error handling: `error.tsx` + `not-found.tsx` per route segment, a reusable `<ErrorBoundary>` fallback UI, and `global-error.tsx`.
- `next.config.ts` hardening: security headers, image `remotePatterns` (for same-origin cover route only), and (optional) PWA wiring.
- Testing harness: `vitest.config.ts`, `playwright.config.ts`, test setup files, and one smoke test proving the harness runs.

**Out of scope:** any Supabase client (Phase 3), any authentication (Phase 4), the actual EPUB streaming Route Handler logic (that ships in a later "reader/delivery" phase — Phase 2 only provides the R2 helpers it will use), the offline **sync** implementation (Phase 5+).

## 2.C Prerequisites

- Phase 1 complete and green.
- A Cloudflare R2 account with a **private** bucket named `epub-reader-assets` created (or credentials to create one). **If credentials are unavailable at execution time**, the agent must still implement the R2 module and its unit tests using dependency-injected/mocked clients, and mark integration verification as "pending credentials" in the DoD — the code path must be complete and typed.

## 2.D Expected Existing Project State

- Phase 1 structure present: `src/lib/{result,routes,constants,validation}`, `src/types`, `src/store`, `src/components`, App Router route groups with placeholders.
- `src/lib/r2/README.md` and `src/lib/supabase/README.md` exist as placeholders (this phase replaces the R2 README's promise with real code; Supabase remains a placeholder until Phase 3).

## 2.E Dependencies to Install

**Runtime (server):**
- `@aws-sdk/client-s3@3`
- `@aws-sdk/s3-request-presigner@3`
- `server-only` (Next helper package)

**Runtime (client, PWA):**
- `idb-keyval@6` (installed now because the SW/offline shell references it; sync logic lands later)

**Dev (testing):**
- `vitest@2`, `@vitejs/plugin-react@4`, `jsdom@25`
- `@testing-library/react@16`, `@testing-library/jest-dom@6`, `@testing-library/user-event@14`
- `@playwright/test@1` (+ `pnpm exec playwright install --with-deps chromium` in CI/local)

> PWA approach: use a **hand-written minimal service worker** registered by a client component (no heavyweight PWA plugin) to keep the offline queue (Phase 5) fully under our control and avoid coupling to a plugin's caching model. If the agent prefers `@ducanh2912/next-pwa` or `serwist`, it may, but must document the choice with `// ISD-NOTE:` and keep the SW registration API identical to what Phase 5 expects (a globally registered SW at `/sw.js` with a `message`-based sync trigger).

## 2.F Folder Structure After Phase 2 (additions)

```
public/
├─ manifest.webmanifest
├─ sw.js                          # minimal service worker (shell caching only)
├─ icons/
│  ├─ icon-192.png
│  ├─ icon-512.png
│  └─ maskable-512.png
src/
├─ app/
│  ├─ global-error.tsx            # top-level error boundary
│  ├─ error.tsx                   # root segment error boundary
│  ├─ (app)/
│  │  ├─ error.tsx                # app segment error boundary
│  │  └─ reader/[bookId]/error.tsx# reader-specific error UI (SAD §8.3)
│  └─ admin/
│     └─ error.tsx                # admin segment error boundary
├─ components/
│  ├─ error-fallback.tsx          # reusable fallback UI
│  └─ pwa/
│     └─ service-worker-registrar.tsx  # 'use client', registers /sw.js
└─ lib/
   ├─ env.ts                      # Zod-validated env (server + public)
   ├─ r2/
   │  ├─ client.ts                # S3Client factory (server-only)
   │  ├─ operations.ts            # putObject/getObjectStream/deleteObject/getSignedUrl
   │  ├─ errors.ts                # R2Error types
   │  └─ index.ts
   └─ http/
      └─ headers.ts               # shared response header builders (no-store, epub content-type)
tests/
├─ setup.ts                       # testing-library/jest-dom setup
└─ unit/r2.operations.test.ts     # unit test with mocked S3 client
vitest.config.ts
playwright.config.ts
```

## 2.G Files to Create

### Environment module — `src/lib/env.ts`
- `import 'server-only'` is **not** used here because public vars must be readable client-side; instead split into two exports:
  - `serverEnv` — validated with Zod, **only** referenced from server code. Fields: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (declared now, consumed Phase 3+), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (default `epub-reader-assets`), `R2_ENDPOINT` (derived: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`), `SUPABASE_JWT_SECRET` (declared now for Phase 4 middleware verification; may be optional if middleware uses `getUser()` — see Phase 4).
  - `publicEnv` — validated subset with `NEXT_PUBLIC_` prefix: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`.
- Validation runs **lazily** (a `getServerEnv()` that parses once and caches) so that missing server vars don't crash client bundles. Throw a descriptive error listing missing keys if validation fails on the server.
- **Hard rule enforced here (SAD §8.1):** no `SERVICE_ROLE` or R2 secret may be exposed via a `NEXT_PUBLIC_` variable. Add a runtime assertion that fails the build if any `NEXT_PUBLIC_*` key contains `SERVICE_ROLE`, `SECRET`, or `SERVICE`.

### R2 layer — `src/lib/r2/`
- **`client.ts`** (`import 'server-only'`): create and memoize an `S3Client` configured with `region: 'auto'`, `endpoint: serverEnv.R2_ENDPOINT`, credentials from `serverEnv`. Export `getR2Client()`.
- **`operations.ts`** (`import 'server-only'`):
  - `putObject({ key, body, contentType, cacheControl? })` → wraps `PutObjectCommand`.
  - `getObjectStream(key)` → returns `{ body: ReadableStream, contentType, contentLength }` from `GetObjectCommand`; converts the AWS SDK stream to a web `ReadableStream` suitable for a Next Route Handler `Response`. This is the primitive the **secure delivery pipeline** (SAD §2.1) will use.
  - `deleteObject(key)` → `DeleteObjectCommand` (used by upload rollback, SAD §6.1 step 8).
  - `getSignedReadUrl(key, expiresInSeconds = 300)` → short-lived signed URL via `s3-request-presigner` (used for cover delivery fallback, SAD §1.2). Default TTL **300s**.
  - All functions accept **object keys only** (never full URLs), consistent with SAD §1.2.
- **`errors.ts`**: `R2Error` classes: `R2NotFoundError`, `R2AccessError`, `R2UnknownError`. Map SDK error `name`/`$metadata.httpStatusCode` to these.
- **`index.ts`**: barrel exporting operations + errors (but **not** the raw client).

### HTTP header helpers — `src/lib/http/headers.ts`
- `epubDeliveryHeaders(filename?)` → `Content-Type: application/epub+zip`, `Content-Disposition: inline`, `Cache-Control: no-store` (SAD §2.1). Used by the future EPUB Route Handler.
- `coverDeliveryHeaders()` → `Content-Type: image/jpeg`, private cache headers.
- `securityHeaders()` → object used by `next.config.ts` (see below).

### PWA
- **`public/manifest.webmanifest`** — name, short_name, `display: standalone`, `start_url: '/dashboard'`, `theme_color`, `background_color`, icons referencing `/icons/*`.
- **`public/sw.js`** — minimal service worker: install/activate lifecycle, a cache-first strategy for the **app shell/static assets only** (not for private book data). Include a `message` event listener stub named `SYNC_READING_PROGRESS` that Phase 5 will implement (leave a clearly commented no-op). **Do not** cache `/api/*` or any private content.
- **`public/icons/*`** — placeholder PNG icons (192, 512, maskable-512). If image generation is unavailable, commit simple solid-color PNGs and leave `// ISD-NOTE:`.
- **`src/components/pwa/service-worker-registrar.tsx`** (`'use client'`) — registers `/sw.js` on `load` (guards on `'serviceWorker' in navigator` and `NODE_ENV === 'production'` OR an explicit dev flag). Rendered from the root layout.

### Error handling
- **`src/components/error-fallback.tsx`** (`'use client'`) — reusable fallback: message + "Return to Library" button linking `ROUTES.DASHBOARD` (per SAD §8.3). Accepts `{ error, reset, homeHref? }`.
- **`src/app/global-error.tsx`** (`'use client'`) — wraps `<html><body>`, renders `ErrorFallback`, logs error.
- **`src/app/error.tsx`**, **`src/app/(app)/error.tsx`**, **`src/app/admin/error.tsx`**, **`src/app/(app)/reader/[bookId]/error.tsx`** (`'use client'`) — each renders `ErrorFallback` with segment-appropriate copy. The reader one uses SAD's exact copy: "Failed to load book. Return to Library."

### Testing harness
- **`vitest.config.ts`** — `jsdom` env, `setupFiles: ['tests/setup.ts']`, alias `@` → `src`, coverage via `v8`.
- **`tests/setup.ts`** — import `@testing-library/jest-dom`.
- **`playwright.config.ts`** — base URL from `NEXT_PUBLIC_APP_URL` or `http://localhost:3000`, `webServer` to run `pnpm build && pnpm start` (or `pnpm dev`), chromium project.
- **`tests/unit/r2.operations.test.ts`** — unit tests for `operations.ts` using a **mocked S3 client** (inject via a factory param or `vi.mock`). Assert correct commands/keys are constructed and error mapping works. This proves the harness runs without needing live R2.

## 2.H Files to Modify

- **`src/app/layout.tsx`** — render `<ServiceWorkerRegistrar />` near end of `<body>`. Still no auth providers.
- **`next.config.ts`** — add:
  - `async headers()` returning `securityHeaders()` for all routes (at minimum: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` **except** the reader iframe origin — note: the reader iframe is same-origin/sandboxed via foliate, so `frame-ancestors 'self'` is fine; do **not** globally block framing in a way that breaks foliate's internal iframe. Use `Content-Security-Policy` with `frame-ancestors 'self'` and appropriate `img-src`/`connect-src` for Supabase + same-origin. Keep CSP permissive enough for Phase 4 Supabase auth calls; document each directive).
  - `images.remotePatterns` limited to same-origin cover route (or omit and use plain `<img>` for the private cover route). Prefer **not** using `next/image` for private, `no-store` cover bytes; document the choice.
  - Ensure `.webmanifest` and `sw.js` are served with correct headers (`sw.js` must be served with `Service-Worker-Allowed: /` and `Cache-Control: no-cache`).
- **`package.json`** — add scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:e2e": "playwright test"`, `"test:coverage": "vitest run --coverage"`.
- **`.env.example`** — populate with **all** variable names (no values), grouped and commented:
  ```
  # --- Supabase (consumed from Phase 3) ---
  SUPABASE_URL=
  SUPABASE_SERVICE_ROLE_KEY=
  SUPABASE_JWT_SECRET=
  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_ANON_KEY=
  # --- Cloudflare R2 (consumed this phase) ---
  R2_ACCOUNT_ID=
  R2_ACCESS_KEY_ID=
  R2_SECRET_ACCESS_KEY=
  R2_BUCKET=epub-reader-assets
  # --- App ---
  NEXT_PUBLIC_APP_URL=http://localhost:3000
  ```
- **`.gitignore`** — ensure `playwright-report/`, `test-results/`, `coverage/` are ignored (added Phase 0; verify).

## 2.I Database Migrations / Schema Updates

N/A — no database in Phase 2.

## 2.J Environment Variables

Introduced/validated this phase (via `src/lib/env.ts`):
- **Server-only:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, plus **declared-but-not-yet-consumed** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`.
- **Public:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (declared; consumed Phase 3/4), `NEXT_PUBLIC_APP_URL`.

The agent must create a **local, git-ignored `.env.local`** with real R2 values if credentials are available; otherwise leave `.env.local` absent and rely on mocked tests (see §2.C).

## 2.K Configuration

- CSP and security headers centralized in `securityHeaders()`; documented directive-by-directive.
- Service worker scope: root (`/`), served with `Service-Worker-Allowed: /`.

## 2.L React Components

- `ServiceWorkerRegistrar` (client), `ErrorFallback` (client), four `error.tsx` boundaries + `global-error.tsx` (client). All are infrastructure UI — no domain data.

## 2.M Custom Hooks

None required. (An optional `useOnlineStatus` hook may be added here since Phase 5 needs it; if added, keep it pure and document it. Otherwise defer.)

## 2.N Zustand Stores

No new stores. Existing skeletons untouched.

## 2.O Utility Modules

`env`, `r2/{client,operations,errors}`, `http/headers`. All server-only except `env`'s public split and header helpers (header helpers are pure and safe anywhere, but only meaningfully used server-side).

## 2.P TypeScript Interfaces

- `R2PutParams`, `R2GetResult`, `R2Error` hierarchy in `src/lib/r2`.
- `AppEnv` (server) and `PublicEnv` types inferred from Zod schemas in `env.ts`.

## 2.Q Validation Schemas

- `serverEnvSchema`, `publicEnvSchema` (Zod) in `env.ts`. Reuse `nonEmptyString` from Phase 1 where appropriate.

## 2.R Server Actions / Route Handlers / API Contracts

- **No Route Handlers implemented yet.** The R2 `getObjectStream`/`getSignedReadUrl` helpers and `epubDeliveryHeaders`/`coverDeliveryHeaders` are the **contracts** the future delivery Route Handlers (`/api/books/[id]/file`, `/api/covers/[id]`) will consume. Document these intended handlers in `src/lib/r2/index.ts` doc comments so later phases wire them without redesign.

## 2.S Integration Points

- **Cloudflare R2** via `@aws-sdk/client-s3` (S3-compatible, `region: 'auto'`, custom endpoint). Private bucket, no public access.
- **Browser Service Worker** registration.
- Downstream consumers (frozen import paths): `@/lib/env` (`getServerEnv`, `publicEnv`), `@/lib/r2` (operations + errors), `@/lib/http/headers`.

## 2.T State Management

None new. Offline queue state (IndexedDB via `idb-keyval`) is **declared** (dependency installed, SW stub present) but **not implemented** until Phase 5.

## 2.U Error Handling

- Per-segment `error.tsx` boundaries (SAD §8.3) with a reusable fallback.
- `global-error.tsx` for root failures.
- R2 operations throw typed `R2Error`s; callers (future phases) translate to `ActionResult` / HTTP status.
- Env validation throws a descriptive, developer-facing error listing missing keys.

## 2.V Performance Considerations

- `getObjectStream` must **stream** (web `ReadableStream`), never buffer the whole EPUB into memory (SAD §2 rationale: avoid serverless memory spikes).
- Memoize `S3Client` and parsed env to avoid re-instantiation per request.
- Service worker must **not** cache private/large book payloads — shell/static only.

## 2.W Security Considerations

- **Secret boundary (SAD §8.1):** R2 secret keys and Supabase service role key are server-only; a build-time assertion forbids leaking them via `NEXT_PUBLIC_`.
- Delivery header helpers enforce `Cache-Control: no-store` for EPUB bytes so private content is not cached by intermediaries (SAD §2.1).
- CSP set conservatively; `connect-src` allows the Supabase URL (from `publicEnv`) and `'self'`; `frame-ancestors 'self'`.
- Signed URL TTL capped at 300s.
- SW registration guarded to avoid caching authenticated responses.

## 2.X Testing Requirements

- **Unit (Vitest):** `r2.operations.test.ts` with a mocked S3 client — asserts command construction (correct `Bucket`, `Key`), stream conversion shape, and error mapping (`NoSuchKey` → `R2NotFoundError`).
- **Unit:** `env` validation — missing required server var throws with a helpful message; a `NEXT_PUBLIC_*` secret triggers the guard.
- **Harness smoke (Playwright):** app boots and `/dashboard` placeholder renders (no auth yet), and the manifest is reachable at `/manifest.webmanifest`.
- Coverage target for this phase's new lib modules: **≥ 80% lines** for `src/lib/r2` and `src/lib/env`.

## 2.Y Edge Cases

- R2 `GetObject` on a missing key → `R2NotFoundError` (future handler returns 404).
- Empty/zero-byte object → still returns a valid (empty) stream; handler decides.
- Missing R2 credentials at runtime → `getR2Client()` throws a clear error; unit tests use mocks and pass regardless.
- Service worker unsupported (older browsers) → registrar no-ops silently.
- CSP too strict breaking Supabase calls in Phase 4 → verify `connect-src` includes the Supabase origin now to prevent a Phase-4 surprise.

## 2.Z Acceptance Criteria

1. `pnpm typecheck`, `pnpm lint`, `pnpm build` pass.
2. `pnpm test` runs and all unit tests pass (R2 mocked + env validation).
3. `getServerEnv()` throws a clear, itemized error when a required server var is missing; `publicEnv` never contains a secret (guard test passes).
4. `src/lib/r2` exposes `putObject`, `getObjectStream`, `deleteObject`, `getSignedReadUrl`, and typed errors; all accept **keys only**.
5. `/manifest.webmanifest` is served; `/sw.js` registers in production build without console errors; SW does not cache `/api/*`.
6. Each error boundary renders `ErrorFallback` when its segment throws (verifiable by temporarily throwing in a placeholder — remove after verifying); the reader boundary shows "Failed to load book. Return to Library."
7. Security headers/CSP present on responses; `connect-src` includes the Supabase origin.
8. If live R2 credentials are present: a manual `putObject`→`getObjectStream`→`deleteObject` round-trip against `epub-reader-assets` succeeds (documented). If absent: marked "pending credentials" and mocked tests pass.

## 2.AA Definition of Done

- All Acceptance Criteria pass.
- Env module is the **only** place `process.env` is read (grep confirms no stray `process.env` outside `src/lib/env.ts`).
- R2 helpers stream (no full-buffer reads), memoize the client, and never accept full URLs.
- Error boundaries and PWA shell exist and are wired into the root layout.
- Testing harness (Vitest + Playwright) is runnable via npm scripts; at least the specified unit tests are green.
- No Supabase client and no auth logic were introduced.

---
---

# Phase 3 — Database & Supabase Foundation

## 3.A Objective

Provision the **Supabase data foundation**: the relational schema (`profiles`, `books`, `user_libraries`, `reading_progress`), the **Custom Access Token Hook** that injects top-level `is_approved` / `is_admin` claims (resolving the §0.4 blocker), the **Row Level Security (RLS) policies** hardened with the approved-claim check (SAD §3.2), the **triggers** (auto-create profile on signup, auto-update `updated_at`, approval propagation), the **typed Supabase clients** (`server`, `browser`, `admin/service-role`) via `@supabase/ssr`, and **generated database types**. This phase makes the database queryable and secure but introduces **no application auth flows or UI** (those are Phase 4).

## 3.B Scope

**In scope:**
- SQL migrations (idempotent, ordered) creating enums, tables, indexes, triggers, functions, RLS policies, and the access-token hook function.
- Supabase client factories: `createServerClient` (cookie-based, request-scoped), `createBrowserClient`, and `createAdminClient` (service role, server-only, RLS-bypassing).
- Supabase type generation → `src/types/database.ts`; reconcile with Phase 1 `domain.ts` contracts.
- Seed/admin bootstrap script to mark the first user as admin+approved.
- Local Supabase config (`supabase/config.toml`) and migration files under `supabase/migrations/`.

**Out of scope:** middleware, sign-in/up/out flows, route guards, auth UI, Server Actions for approval (Phase 4). This phase provides the **data + security substrate** those consume.

## 3.C Prerequisites

- Phase 2 complete and green.
- A Supabase project (cloud) **or** local Supabase (`supabase` CLI + Docker) available. The migrations must run against either.
- `supabase` CLI installed (`pnpm dlx supabase` or global). If unavailable, migrations must still be authored as plain SQL files runnable via the Supabase SQL editor, and the agent documents that path.
- `serverEnv.SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `publicEnv.NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` populated in `.env.local`.

## 3.D Expected Existing Project State

- Phase 1 type contracts in `src/types/domain.ts` (snake_case fields for `Profile`, `Book`, `UserLibraryEntry`, `ReadingProgress`).
- Phase 2 `src/lib/env.ts` exposing Supabase env vars (declared) and `src/lib/supabase/README.md` placeholder.
- No Supabase client code exists yet.

## 3.E Dependencies to Install

- `@supabase/supabase-js@2`
- `@supabase/ssr@0.5` (cookie-based SSR helpers for App Router)
- Dev: `supabase` CLI (via `pnpm dlx` or documented global install) for type generation and migrations.

## 3.F Folder Structure After Phase 3 (additions)

```
supabase/
├─ config.toml
├─ migrations/
│  ├─ 0001_extensions_and_enums.sql
│  ├─ 0002_profiles.sql
│  ├─ 0003_books.sql
│  ├─ 0004_user_libraries.sql
│  ├─ 0005_reading_progress.sql
│  ├─ 0006_updated_at_trigger.sql
│  ├─ 0007_profile_on_signup_trigger.sql
│  ├─ 0008_access_token_hook.sql
│  ├─ 0009_rls_policies.sql
│  └─ 0010_grants.sql
└─ seed.sql                         # optional local seed
scripts/
└─ bootstrap-admin.ts               # promote a user to admin+approved (service role)
src/
├─ lib/
│  └─ supabase/
│     ├─ server.ts                  # request-scoped SSR client (cookies)
│     ├─ browser.ts                 # browser client (anon)
│     ├─ admin.ts                   # service-role client (server-only)
│     ├─ middleware.ts              # updateSession helper (used by Phase 4 middleware)
│     └─ index.ts
└─ types/
   └─ database.ts                   # generated Supabase types
```

## 3.G Database Migrations

> All migrations must be **idempotent where practical** (`create table if not exists`, `create or replace function`, `drop policy if exists` before create) and **ordered**. Use `public` schema for app tables. `id` columns are UUID. Timestamps are `timestamptz default now()`.

### `0001_extensions_and_enums.sql`
- Enable `pgcrypto` (for `gen_random_uuid()`).
- Create enum `book_format` with value `'epub'` (extensible per SAD §7).

### `0002_profiles.sql`
- Table `public.profiles`:
  - `id uuid primary key references auth.users(id) on delete cascade`
  - `email text not null`
  - `is_approved boolean not null default false`
  - `is_admin boolean not null default false`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- Index on `is_approved` (partial, for admin approvals listing: `where is_approved = false`).
- Comment: "Source of truth for authorization claims; read by the access-token hook."

### `0003_books.sql`
- Table `public.books`:
  - `id uuid primary key default gen_random_uuid()`
  - `title text not null`
  - `author text`
  - `cover_key text`            ← **key, not URL** (SAD §1.2)
  - `file_key text not null`    ← **key, not URL** (SAD §1.2)
  - `format book_format not null default 'epub'`
  - `created_at`, `updated_at` timestamptz
- Index on `created_at desc` (library ordering).

### `0004_user_libraries.sql`
- Table `public.user_libraries`:
  - `id uuid primary key default gen_random_uuid()`
  - `user_id uuid not null references auth.users(id) on delete cascade`
  - `book_id uuid not null references public.books(id) on delete cascade`
  - `added_at timestamptz not null default now()`
  - `unique (user_id, book_id)`
- Indexes on `user_id`, `book_id`.

### `0005_reading_progress.sql`
- Table `public.reading_progress`:
  - `id uuid primary key default gen_random_uuid()`
  - `user_id uuid not null references auth.users(id) on delete cascade`
  - `book_id uuid not null references public.books(id) on delete cascade`
  - `cfi text`
  - `percentage numeric(5,2) not null default 0 check (percentage >= 0 and percentage <= 100)`
  - `updated_at timestamptz not null default now()`
  - `unique (user_id, book_id)`   ← enables UPSERT by (user_id, book_id) per SAD §5.3
- Index on `(user_id, updated_at desc)` (future reading stats, SAD §7).

### `0006_updated_at_trigger.sql`
- `create or replace function public.set_updated_at()` → sets `new.updated_at = now()`.
- Attach `before update` triggers to `profiles`, `books`, `reading_progress`.

### `0007_profile_on_signup_trigger.sql`
- `create or replace function public.handle_new_user()` (SECURITY DEFINER, `search_path = public`): inserts a `public.profiles` row for `new.id` with `email = new.email`, `is_approved = false`, `is_admin = false`.
- `create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();`

### `0008_access_token_hook.sql` (resolves §0.4 blocker)
- `create or replace function public.custom_access_token_hook(event jsonb) returns jsonb` (SECURITY DEFINER, restricted `search_path`):
  - Look up the user's `is_approved` and `is_admin` from `public.profiles` by `event->>'user_id'`.
  - Merge **top-level claims** `is_approved` and `is_admin` (booleans) into `event->'claims'`.
  - Return the modified `event`.
- Grant execute to `supabase_auth_admin`; revoke from `public`/`authenticated`/`anon` per Supabase hook security guidance.
- **Documentation block** in the migration explaining that this hook must be **enabled** in the Supabase Dashboard (Authentication → Hooks → Custom Access Token) **or** via `config.toml` (`[auth.hook.custom_access_token]` with `enabled = true` and the function URI). The agent must enable it in whichever environment is used and record how.

### `0009_rls_policies.sql` (SAD §3.2 hardening)
- `alter table ... enable row level security` for all four tables.
- Helper predicate reused across policies: `(auth.jwt() ->> 'is_approved')::boolean = true` (top-level claim per §0.4).
- **profiles:**
  - `select`: a user may read **their own** profile (`id = auth.uid()`). Admins may read all (`(auth.jwt() ->> 'is_admin')::boolean = true`).
  - `update`: users may **not** update `is_approved`/`is_admin` (those are admin/service-role only). Allow users to update only benign fields if any (none for now → no user update policy). Admin updates go through the **service-role admin client** in Phase 4, which bypasses RLS; therefore **no** broad update policy is granted to `authenticated` for these sensitive columns.
  - `insert`: handled by the signup trigger (SECURITY DEFINER); no client insert policy.
- **books:**
  - `select`: `USING ((auth.jwt() ->> 'is_approved')::boolean = true)` — approved users only (SAD §3.2 example).
  - `insert/update/delete`: **no** policy for `authenticated` (admin uploads use service-role client in a later phase). Document this.
- **user_libraries:**
  - `select/insert/delete`: `USING (user_id = auth.uid() AND (auth.jwt() ->> 'is_approved')::boolean = true)` and matching `WITH CHECK`.
- **reading_progress:**
  - `select/insert/update`: `USING/WITH CHECK (user_id = auth.uid() AND (auth.jwt() ->> 'is_approved')::boolean = true)`.
- Every policy is created after a `drop policy if exists` for idempotency.

### `0010_grants.sql`
- Grant `usage` on schema `public` and appropriate `select/insert/update/delete` on tables to `authenticated` and `anon` **as needed** (RLS still gates rows). `anon` gets no access to app tables. Revoke defaults that are too broad.

## 3.H Database Schema Updates

- The generated `src/types/database.ts` must reflect all four tables. Reconcile against Phase 1 `src/types/domain.ts`: the manual contracts must match generated types **field-for-field and type-for-type**. If a mismatch exists, **the migration is authoritative for column existence** but the field set must equal Phase 1's contract; adjust `domain.ts` only to correct type nuances (e.g., `percentage: number`), and record the reconciliation in a comment. Do **not** silently diverge.

## 3.I Files to Create

- All migration SQL files (§3.G).
- `supabase/config.toml` — project config incl. enabling the access-token hook for local dev.
- `supabase/seed.sql` — optional: no rows that assume users; may seed nothing or a comment.
- `scripts/bootstrap-admin.ts` — a Node script (run with `pnpm dlx tsx` or via a `package.json` script) that, given an email, uses the **admin (service-role) client** to set `is_approved = true, is_admin = true` on that user's profile. Used to create the first admin (since new users default to unapproved). Must refuse to run without the service role key and must be clearly documented as an operator tool.
- `src/lib/supabase/server.ts` — `createClient()` returning a request-scoped SSR client built with `@supabase/ssr` `createServerClient`, wired to Next 15 **async** `cookies()`; `import 'server-only'`.
- `src/lib/supabase/browser.ts` — `createClient()` returning a singleton browser client via `@supabase/ssr` `createBrowserClient` using `publicEnv`.
- `src/lib/supabase/admin.ts` — `createAdminClient()` using `serverEnv.SUPABASE_SERVICE_ROLE_KEY`, `auth: { persistSession: false, autoRefreshToken: false }`; `import 'server-only'`; **hard warning comment** that this bypasses RLS and must never be imported into client code.
- `src/lib/supabase/middleware.ts` — `updateSession(request)` helper (per `@supabase/ssr` App Router recipe) that refreshes the auth cookie and returns the response. **Exported for Phase 4 to call from `middleware.ts`.** It performs token refresh only — **no route-guard logic** in this phase (guards are Phase 4).
- `src/lib/supabase/index.ts` — barrel exporting the three factories (but **not** re-exporting `admin` into any client-reachable path; keep `admin` importable only via `@/lib/supabase/admin`).
- `src/types/database.ts` — generated types.

## 3.J Files to Modify

- **`src/types/domain.ts`** — add a header note pointing to `database.ts` as generated source; reconcile types (see §3.H). Optionally re-export selected `Database['public']['Tables']['x']['Row']` aliases for convenience.
- **`src/lib/env.ts`** — no change if Phase 2 already declared Supabase vars; otherwise ensure they're validated as required now that they're consumed.
- **`package.json`** — add scripts: `"db:types": "supabase gen types typescript --project-id <or --local> > src/types/database.ts"`, `"db:migrate": "supabase db push"` (or documented equivalent), `"bootstrap:admin": "tsx scripts/bootstrap-admin.ts"`. Add `tsx` as a dev dependency if used.
- **`src/lib/supabase/README.md`** — replace placeholder with a short doc of the three clients and when to use each.

## 3.K Environment Variables

Now **required and consumed**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `SUPABASE_JWT_SECRET` remains declared for Phase 4 (only needed if Phase 4 opts to verify JWTs manually in middleware; if middleware uses `supabase.auth.getUser()`/`getClaims()`, the secret may be unnecessary — decided in Phase 4).

## 3.L Configuration

- Enable the **Custom Access Token Hook** in the target environment (dashboard or `config.toml`). This is **mandatory** — without it, no JWT carries `is_approved`/`is_admin`, and Phase 4 middleware + all RLS policies fail closed (everything denied). The agent must verify a freshly minted token contains the top-level claims (see §3.T).
- Cookie settings for SSR client follow `@supabase/ssr` defaults (httpOnly, secure in prod).

## 3.M React Components

None — Phase 3 is data/security only. No UI.

## 3.N Custom Hooks

None. (Client data hooks arrive with feature phases.)

## 3.O Zustand Stores

None new.

## 3.P Utility Modules

Supabase client factories (`server`, `browser`, `admin`, `middleware/updateSession`), the admin bootstrap script.

## 3.Q TypeScript Interfaces

- `src/types/database.ts` (generated) — `Database`, `Tables`, `Row`/`Insert`/`Update` types.
- Reconciled `domain.ts` contracts.

## 3.R Validation Schemas

- Optional but recommended: Zod schemas mirroring DB rows for runtime validation at trust boundaries (e.g., `bookRowSchema`) placed in `src/lib/validation`. Not required this phase unless a Server Action needs them (none here). If added, keep aligned with generated types.

## 3.S Server Actions / Route Handlers / API Contracts

- **None implemented.** The Supabase clients are the **integration contract** consumed by Phase 4 (auth actions, middleware) and later feature phases. Document intended usage in `src/lib/supabase/index.ts`.

## 3.T Integration Points

- **Supabase Postgres** — schema, RLS, triggers, hook.
- **Supabase Auth** — the access-token hook integrates auth with `public.profiles`.
- **Phase 4 dependency:** `updateSession` from `src/lib/supabase/middleware.ts` and the JWT top-level claims are the exact contract Phase 4's `middleware.ts` will consume.
- **Verification of claims:** after enabling the hook, sign up a test user, promote via `bootstrap:admin`, refresh the session, and decode the JWT to confirm top-level `is_approved`/`is_admin` are present and correct.

## 3.U State Management

N/A (no client state). Session state is cookie-based via `@supabase/ssr`, consumed in Phase 4.

## 3.V Error Handling

- Migrations must fail loudly on error and be re-runnable.
- Client factories throw clear errors if env is missing (delegated to `getServerEnv`/`publicEnv`).
- `bootstrap-admin.ts` exits non-zero with a clear message if the user/email is not found or the service key is missing.

## 3.W Performance Considerations

- Indexes: `books(created_at desc)`, `user_libraries(user_id)`, `reading_progress(user_id, updated_at desc)`, partial index on unapproved profiles — sized for the app's read patterns (library grid, approvals list, progress upsert).
- The access-token hook keeps authorization out of the request hot path (SAD §3.1 rationale): claims are baked into the JWT, so middleware/RLS need no extra round-trip.
- Reading progress uses `unique(user_id, book_id)` to enable a single UPSERT (SAD §5.3), avoiding read-modify-write.

## 3.X Security Considerations

- **RLS enabled on every table**, defense-in-depth with the approved-claim check (SAD §3.2): even a frontend bug cannot leak book data to unapproved/revoked users.
- **Service-role client is server-only** and RLS-bypassing — guarded by `import 'server-only'` and a loud comment; never reachable from the client bundle.
- **Sensitive columns** (`is_approved`, `is_admin`) have **no** user-facing update policy; only the service-role admin client (Phase 4 flows) or SQL may change them.
- Access-token hook is `SECURITY DEFINER` with a locked `search_path` and execute granted only to `supabase_auth_admin`.
- Signup trigger is `SECURITY DEFINER` with locked `search_path`; inserts only the minimal profile.
- Claim staleness (SAD §3.1): approval takes effect on next token refresh/login — documented as acceptable; a forced refresh path is a Phase 4 concern.

## 3.Y Testing Requirements

- **Migration apply test:** running all migrations from clean produces the expected schema (verify tables, policies, triggers exist; e.g., query `pg_policies`).
- **Claims test:** a minted JWT for an approved admin contains top-level `is_approved=true`, `is_admin=true`; for a fresh user, `is_approved=false`, `is_admin=false`.
- **RLS tests (critical):** using the anon/authenticated client with a **non-approved** user, `select` on `books` returns **0 rows / denied**; with an **approved** user it returns rows. A user cannot read another user's `reading_progress`. A user cannot set their own `is_approved` to true. These may be authored as SQL-based tests or Vitest integration tests against a local Supabase; if live testing is unavailable, author them as documented, runnable specs and mark "pending environment."
- **Type parity test:** a compile-time check (or a small script) asserting `domain.ts` fields ⊆/= generated `database.ts` rows.

## 3.Z Edge Cases

- Access-token hook **not enabled** → every RLS policy denies (fail-closed). Detect early via the claims test; surface a clear operator error.
- First-user bootstrap: since defaults are unapproved, the **very first** account cannot self-approve; `scripts/bootstrap-admin.ts` (service role) is the sanctioned escape hatch — document it prominently.
- Cascade deletes: deleting a `book` removes dependent `user_libraries`/`reading_progress` (FK `on delete cascade`) — intended.
- Duplicate library add / duplicate progress row → prevented by unique constraints; UPSERT path for progress.
- `percentage` out of range → `check` constraint rejects.

## 3.AA Acceptance Criteria

1. All migrations apply cleanly from a fresh database (local or cloud) and are idempotent on re-run where declared.
2. The four tables, their indexes, `updated_at` triggers, signup trigger, and access-token hook function exist.
3. RLS is enabled on all four tables with the specified policies; unapproved users are denied `books` access; users cannot read others' `reading_progress`; users cannot elevate their own `is_approved`/`is_admin`.
4. The Custom Access Token Hook is **enabled** and a freshly refreshed JWT contains **top-level** `is_approved` and `is_admin` matching the user's `profiles` row.
5. `src/lib/supabase/{server,browser,admin,middleware}.ts` exist, are correctly server/client-scoped, and `admin.ts` is `server-only`.
6. `src/types/database.ts` is generated and reconciles with `domain.ts`.
7. `pnpm bootstrap:admin <email>` promotes a user to admin+approved.
8. `pnpm typecheck`, `pnpm lint`, `pnpm build` still pass; Phase 2 tests remain green.

## 3.BB Definition of Done

- All Acceptance Criteria pass.
- The §0.4 claim-path ambiguity is resolved in code: **top-level** claims are injected by the hook and read the same way by RLS (and, in Phase 4, by middleware).
- RLS is proven to fail-closed for unapproved/foreign access via the RLS tests (or documented as pending-environment with runnable specs).
- Service-role client is unreachable from client code; secret boundary intact.
- No auth UI, middleware, or Server Actions were introduced (deferred to Phase 4).

---
---

# Phase 4 — Authentication & Authorization

## 4.A Objective

Deliver the complete **authentication and authorization layer** on top of the Phase 3 substrate: cookie-based **email/password auth** (register, login, logout) via Supabase; the **Edge middleware** that refreshes the session and enforces route protection using the **top-level JWT claims** (`is_approved`, `is_admin`) exactly as corrected in §0.4 and per SAD §3.1; the **auth UI** (login, register, pending-approval) wired to **Server Actions**; **guarded layouts** for `(app)` and `admin`; and the **admin approval Server Action** (service-role) that flips `is_approved` and takes effect on next token refresh. After Phase 4, an approved user can sign in and reach `/dashboard`; an unapproved user is parked at `/pending-approval`; non-admins are blocked from `/admin`.

## 4.B Scope

**In scope:**
- `src/middleware.ts` — session refresh (`updateSession`) + route guards driven by JWT claims.
- Auth Server Actions: `signUpAction`, `signInAction`, `signOutAction` (return `ActionResult`).
- Admin authorization Server Action: `setUserApprovalAction` (service-role; admin-guarded).
- Auth UI: real forms for `/login`, `/register`; a real `/pending-approval` screen; a working sign-out control; a minimal admin approvals table wired to `setUserApprovalAction`.
- Guarded layouts: `(app)/layout.tsx` requires approved session; `admin/layout.tsx` requires admin.
- Server-side session/claims helpers: `getSession()`, `getClaims()`, `requireApproved()`, `requireAdmin()`.
- Zod schemas for auth inputs.
- Auth E2E/integration tests.

**Out of scope:** password reset/email verification flows beyond Supabase defaults (may be stubbed with `// ISD-NOTE:` if the SAD later requires them), social auth, library/reader/upload features (later phases). The approvals table here is **minimal** — a full admin dashboard is a later phase; this phase implements only the approval toggle needed to exercise authorization end-to-end.

## 4.C Prerequisites

- Phase 3 complete and green: schema, RLS, access-token hook enabled and **verified** to emit top-level claims, Supabase clients (`server`, `browser`, `admin`, `updateSession`) present.
- At least one admin account creatable via `pnpm bootstrap:admin`.
- Phase 1 `ROUTES`, `ActionResult`/`ok`/`fail`, validation primitives; Phase 2 error boundaries and env module.

## 4.D Expected Existing Project State

- App Router route groups with **placeholder** `(auth)` pages, `(app)/layout.tsx` and `admin/layout.tsx` **without guards**, error boundaries in place.
- Supabase clients and `updateSession` helper exist; JWT carries top-level `is_approved`/`is_admin`.
- No `src/middleware.ts` yet; no auth actions; no auth UI logic.

## 4.E Dependencies to Install

- None strictly required beyond Phase 3 (Supabase + Zod already present). Optionally `react-hook-form@7` + `@hookform/resolvers@3` for form ergonomics — **allowed** but the forms must still function with Server Actions and progressive enhancement. If added, document with `// ISD-NOTE:`. To keep coupling minimal, plain Server-Action forms are the default; RHF is optional.

## 4.F Folder Structure After Phase 4 (additions/changes)

```
src/
├─ middleware.ts                        # NEW — Edge middleware (guards + session refresh)
├─ app/
│  ├─ page.tsx                          # MODIFY — redirect to /dashboard or /login based on session
│  ├─ (auth)/
│  │  ├─ layout.tsx                     # NEW — redirects already-authed users away from auth pages
│  │  ├─ login/page.tsx                 # MODIFY — real login form
│  │  ├─ register/page.tsx              # MODIFY — real register form
│  │  └─ pending-approval/page.tsx      # MODIFY — real pending screen + sign-out
│  ├─ (app)/
│  │  ├─ layout.tsx                     # MODIFY — requireApproved() guard + top nav w/ sign-out
│  │  └─ dashboard/page.tsx             # MODIFY — greet approved user (placeholder content ok)
│  └─ admin/
│     ├─ layout.tsx                     # MODIFY — requireAdmin() guard
│     └─ approvals/page.tsx             # MODIFY — minimal approvals table (server component + action)
├─ features/
│  └─ auth/
│     ├─ actions.ts                     # NEW — signUp/signIn/signOut server actions ('use server')
│     ├─ schemas.ts                     # NEW — zod: credentialsSchema, registerSchema
│     ├─ session.ts                     # NEW — getSession/getClaims/requireApproved/requireAdmin (server-only)
│     ├─ components/
│     │  ├─ login-form.tsx              # NEW — 'use client' or server-action form
│     │  ├─ register-form.tsx           # NEW
│     │  └─ sign-out-button.tsx         # NEW — 'use client', calls signOutAction
│     └─ index.ts
└─ features/
   └─ admin/
      ├─ actions.ts                     # NEW — setUserApprovalAction ('use server', service-role, admin-guarded)
      ├─ schemas.ts                     # NEW — approvalSchema
      └─ components/
         └─ approvals-table.tsx         # NEW — renders pending users + approve buttons
```

## 4.G Files to Create

### `src/middleware.ts` (SAD §3.1)
- Export `config.matcher` covering all protected routes and excluding static assets, `/api/*` webhooks if any, `_next`, favicon, manifest, `sw.js`. Recommended matcher: everything except `_next/static`, `_next/image`, `favicon`, image/asset extensions, `manifest.webmanifest`, `sw.js`.
- **Step 1 — Session refresh:** call `updateSession(request)` from `@/lib/supabase/middleware` to refresh the auth cookie and obtain the response + the current user/claims.
- **Step 2 — Read claims:** obtain claims from the refreshed session. Prefer Supabase's **`getClaims()`** (or decode via `getUser()` + reading top-level claims); read **top-level** `is_approved`/`is_admin` (per §0.4). Do **not** query the database in middleware (SAD §3.1 rationale). If manual JWT decode is chosen, verify signature with `SUPABASE_JWT_SECRET`; otherwise rely on the SSR client's validated session.
- **Step 3 — Guard logic (exact rules):**
  - Unauthenticated user requesting a protected route (`(app)/*`, `/admin/*`) → redirect to `ROUTES.LOGIN` with a `redirectTo` query param.
  - Authenticated but `is_approved === false` and requesting any `(app)/*` or `/admin/*` route → redirect to `ROUTES.PENDING_APPROVAL`.
  - Authenticated, approved, but `is_admin === false` and path matches `/admin/*` → redirect to `ROUTES.DASHBOARD`.
  - Authenticated user requesting an `(auth)` route (`/login`, `/register`) → redirect approved→`/dashboard`, unapproved→`/pending-approval`.
  - `/pending-approval` is reachable by any authenticated user (approved or not) but redirects **approved** users to `/dashboard`.
- **Must return the `updateSession` response object** (with refreshed cookies) on the pass-through path so Supabase cookie rotation works. Redirects must copy over the refreshed cookies.
- Keep middleware logic small and claim-driven; **no DB calls, no service-role usage** in middleware.

### `src/features/auth/schemas.ts`
- `credentialsSchema = z.object({ email: emailSchema, password: z.string().min(8).max(72) })` (72 = bcrypt limit).
- `registerSchema = credentialsSchema` (extend later if display name added). Optionally a `confirmPassword` refinement.

### `src/features/auth/actions.ts` (`'use server'`)
- `signUpAction(formData): Promise<ActionResult>`:
  - Parse with `registerSchema`; on failure return `fail(message)`.
  - Use the **server SSR client** `signUp({ email, password })`. On success the Phase 3 trigger creates the `profiles` row (unapproved). Return `ok()` and let the caller redirect to `/pending-approval` (or, if email confirmation is enabled, a "check your email" state — document which; default to no email confirmation for a private walled garden, or enable it and stub accordingly).
  - Map Supabase errors to friendly `ActionResult` messages (duplicate email, weak password).
- `signInAction(formData): Promise<ActionResult>`:
  - Parse `credentialsSchema`; `signInWithPassword`. On success, the session cookie is set by the SSR client; return `ok()`; the form redirects to `redirectTo` or `/dashboard` (middleware will bounce unapproved users to `/pending-approval`).
  - On invalid credentials return a generic "Invalid email or password" (avoid user enumeration).
- `signOutAction(): Promise<ActionResult>`:
  - `signOut()` on server client; revalidate/redirect to `/login`.
- All actions return the standardized `ActionResult` and never throw to the client; unexpected errors are caught and mapped to `fail('Something went wrong', 'INTERNAL')` while logging server-side.

### `src/features/auth/session.ts` (`import 'server-only'`)
- `getSession()` → returns the current Supabase session (or null) using the server client.
- `getClaims()` → returns `{ userId, isApproved, isAdmin } | null` derived from the **top-level** JWT claims (via `getClaims()`/validated session). Single source for reading auth state in Server Components/Actions.
- `requireApproved()` → returns claims or `redirect(ROUTES.LOGIN)`/`redirect(ROUTES.PENDING_APPROVAL)` as appropriate (for use in `(app)/layout.tsx` as defense-in-depth behind middleware).
- `requireAdmin()` → returns claims or redirects; used in `admin/layout.tsx`.
- These are **defense-in-depth** duplicating middleware checks server-side (middleware can be bypassed in some edge cases; layouts must independently verify — never trust middleware alone for authorization).

### `src/features/admin/schemas.ts`
- `approvalSchema = z.object({ userId: uuidSchema, approve: z.boolean() })`.

### `src/features/admin/actions.ts` (`'use server'`)
- `setUserApprovalAction(input): Promise<ActionResult>`:
  - **First** call `requireAdmin()` (server-side authorization — do not rely on UI).
  - Parse `approvalSchema`.
  - Use the **service-role admin client** (`@/lib/supabase/admin`) to update `public.profiles.set is_approved = approve where id = userId`.
  - `revalidatePath(ROUTES.ADMIN_APPROVALS)` so the table refreshes.
  - Return `ok()`; document that the target user's new access takes effect on **their next token refresh/login** (SAD §3.1). Optionally note a future enhancement to force-refresh.

### Auth UI components
- **`login-form.tsx`** — form bound to `signInAction` (via `useActionState` or a form `action`), shows validation/`ActionResult` errors, disabled state while pending, link to `/register`. Progressive-enhancement friendly.
- **`register-form.tsx`** — bound to `signUpAction`; on success routes to `/pending-approval`.
- **`sign-out-button.tsx`** (`'use client'`) — calls `signOutAction`.
- **`approvals-table.tsx`** — server component listing unapproved profiles (via server client under admin RLS, or service-role read) with an approve button per row wired to `setUserApprovalAction`.

### Guarded pages/layouts
- **`(auth)/layout.tsx`** — if already authenticated, redirect away (approved→dashboard, unapproved→pending). Otherwise render children (auth forms).
- **`(app)/layout.tsx`** — call `requireApproved()`; render a minimal authed shell with a sign-out control.
- **`admin/layout.tsx`** — call `requireAdmin()`.
- **`(app)/dashboard/page.tsx`** — greet the user by email (from claims/profile); placeholder library content is fine (library grid is a later phase).
- **`(auth)/pending-approval/page.tsx`** — explains the account awaits admin approval; includes sign-out.
- **`admin/approvals/page.tsx`** — renders `ApprovalsTable`.
- **`app/page.tsx`** — server component: redirect to `/dashboard` if approved, `/pending-approval` if authed-unapproved, else `/login`.

## 4.H Files to Modify

- Existing placeholder pages/layouts listed above become real (see §4.F "MODIFY").
- **`src/features/auth/README.md`** — replace with a short description of the auth surface and its actions.
- **`package.json`** — add/confirm `test:e2e` covers new auth specs.
- **`src/lib/routes.ts`** — confirm all needed routes exist (add `redirectTo` handling convention if desired). No breaking renames.

## 4.I Database Migrations / Schema Updates

None new — Phase 3 schema is sufficient. (If email confirmation is enabled, that's a Supabase Auth **setting**, not a migration.) The approval action only **updates** existing `profiles` rows.

## 4.J Environment Variables

- Consumes existing Supabase vars. `SUPABASE_JWT_SECRET` is **only** needed if middleware performs manual JWT signature verification. **Decision:** default to using the SSR client's validated session / `getClaims()` (no manual secret needed); if the agent chooses manual decode for edge performance, it must use `SUPABASE_JWT_SECRET` and document it. Either way, no new variables are introduced.

## 4.K Configuration

- Ensure Supabase Auth settings match the chosen flow: for a private walled garden, **email confirmation** may be **disabled** so approval (not email verification) is the gate — document the choice. If confirmation stays enabled, `signUpAction` returns a "check your email" state and the pending screen accounts for it.
- Middleware `matcher` configured to exclude static/PWA assets (so `sw.js`/manifest are not gated).

## 4.L React Components

- `LoginForm`, `RegisterForm`, `SignOutButton`, `ApprovalsTable`, plus the (mostly server) page/layout components. Client components limited to forms and the sign-out button; layouts and pages are Server Components that call session helpers.

## 4.M Custom Hooks

- Optional `useFormAction` wrapper around `useActionState` for consistent pending/error handling. Not required; if added, keep it in `src/features/auth`.

## 4.N Zustand Stores

- None required for auth (session lives in cookies + server). The `ui-store` toast may be used to surface action errors client-side (optional). Do not store auth tokens in Zustand.

## 4.O Utility Modules

- `session.ts` helpers (`getClaims`, `requireApproved`, `requireAdmin`) — the canonical server-side authorization utilities reused by every future protected feature.

## 4.P TypeScript Interfaces

- `Claims = { userId: string; isApproved: boolean; isAdmin: boolean }`.
- Action input types inferred from Zod schemas.

## 4.Q Validation Schemas

- `credentialsSchema`, `registerSchema` (auth), `approvalSchema` (admin). All reuse Phase 1 primitives.

## 4.R Server Actions / Route Handlers / API Contracts

**Server Actions (all return `ActionResult`):**
- `signUpAction(formData)` — creates user; profile auto-created unapproved.
- `signInAction(formData)` — establishes session cookie.
- `signOutAction()` — clears session.
- `setUserApprovalAction({ userId, approve })` — admin-only, service-role, flips `is_approved`.

**Route Handlers:** none in this phase (per SAD §4.1, mutations are Server Actions; binary streaming handlers come later). If Supabase requires an auth callback route (e.g., email confirmation/PKCE), add `src/app/(auth)/auth/callback/route.ts` per the `@supabase/ssr` recipe and document it; otherwise omit.

**Contract note:** Every future protected Server Action must begin by calling `requireApproved()` (or `requireAdmin()`), mirroring `setUserApprovalAction`. This is a **project-wide authorization contract** established here.

## 4.S Integration Points

- **Supabase Auth** (signUp/signIn/signOut) via SSR client (cookies).
- **Middleware ↔ claims** contract from Phase 3 (top-level claims) and `updateSession` helper.
- **Service-role admin client** for approval mutations (server-only).
- Downstream: all later feature phases consume `requireApproved`/`requireAdmin` and the `ActionResult` pattern.

## 4.T State Management

- Auth state is **server/cookie-based**; Server Components read it via `session.ts`. Client forms use `useActionState` for local pending/error state only. No auth token ever stored in client state or `localStorage`.

## 4.U Error Handling

- Actions return `fail(message, code)`; forms render messages inline. Unexpected errors are caught, logged server-side, and surfaced generically.
- Auth errors avoid user enumeration (generic invalid-credentials message).
- Middleware redirects on auth failures rather than throwing.
- Layout guards `redirect()` on unauthorized access (defense-in-depth behind middleware).

## 4.V Performance Considerations

- **No DB round-trip in middleware** — authorization uses JWT claims only (SAD §3.1: `<5ms` edge decisions).
- Session refresh handled once per request in middleware via `updateSession`.
- Layout guards read claims from the already-validated session (no extra network hop where avoidable).

## 4.W Security Considerations

- **Defense in depth:** middleware guards + independent layout guards (`requireApproved`/`requireAdmin`) + RLS (Phase 3). Authorization is enforced at **three** layers; UI never the sole gate.
- **Admin action** re-checks `requireAdmin()` server-side before any service-role mutation — never trusts the client that it's an admin.
- **Service-role client** used only inside `setUserApprovalAction` (server-only); never shipped to client.
- **CSRF:** Server Actions carry built-in CSRF protection (SAD §4.1).
- **Password limits:** min 8, max 72 (bcrypt); no password logging.
- **User enumeration:** generic auth error messages.
- **Claim staleness:** revocation/approval applies on next token refresh; documented. For immediate revocation, a later enhancement can force sign-out — noted, not implemented.
- **Redirect safety:** validate/whitelist `redirectTo` to same-origin internal paths only (prevent open redirect).

## 4.X Testing Requirements

- **Unit:** `signInAction`/`signUpAction` input validation (Zod) — invalid email/short password → `fail`. `setUserApprovalAction` denies when caller is not admin.
- **Integration/E2E (Playwright):**
  1. Register → lands on `/pending-approval`; `/dashboard` and `/admin` redirect back to pending.
  2. Admin approves the user (via approvals table or a seeded call); after the user re-logs-in (token refresh), `/dashboard` is reachable.
  3. Non-admin approved user hitting `/admin/*` → redirected to `/dashboard`.
  4. Unauthenticated user hitting `/dashboard` → redirected to `/login?redirectTo=/dashboard`; after login, returns to `/dashboard`.
  5. Sign-out clears session; protected routes redirect to `/login`.
- **RLS interplay:** an approved user's session can `select` from `books` (0 rows expected until books exist, but **not denied**); an unapproved user is denied — reuse/extend Phase 3 RLS tests.
- Where a live Supabase environment is unavailable, author these as runnable specs and mark "pending environment," but the middleware/action **logic** must be unit-testable with mocked claims.

## 4.Y Edge Cases

- Access-token hook disabled → claims missing → treat as unapproved (fail-closed); middleware sends everyone to `/pending-approval` or `/login`. Surface a diagnostic if `is_approved`/`is_admin` claims are absent for an authenticated user (misconfiguration signal).
- Token refresh race in middleware → always return the `updateSession` response so rotated cookies persist.
- Approved user whose approval was **revoked** → retains access until token refresh (documented staleness window).
- Direct navigation to `/admin/approvals` by a non-admin → blocked by both middleware and `requireAdmin()`.
- `redirectTo` containing an external URL → ignored/sanitized to `/dashboard`.
- Concurrent approve clicks → idempotent update; last write wins; table revalidates.
- Signup when email already exists → generic, non-enumerating error.

## 4.Z Acceptance Criteria

1. `src/middleware.ts` enforces all guard rules in §4.G Step 3 using **top-level** JWT claims, performs session refresh via `updateSession`, and does **no** DB queries.
2. Register/login/logout work end-to-end via Server Actions returning `ActionResult`; sessions are cookie-based.
3. Unapproved users are confined to `/pending-approval`; approved non-admins can use `(app)/*` but not `/admin/*`; admins can use `/admin/*`.
4. `(app)/layout.tsx` and `admin/layout.tsx` independently enforce `requireApproved()`/`requireAdmin()` (defense-in-depth), verified by attempting access with middleware hypothetically bypassed (e.g., direct server render test).
5. `setUserApprovalAction` is admin-guarded server-side, uses the service-role client, flips `is_approved`, and revalidates the approvals view; the approved user gains access after re-login/token refresh.
6. Redirects are same-origin only; auth errors are generic (no enumeration); no secrets on the client.
7. `pnpm typecheck`, `pnpm lint`, `pnpm build` pass; Phase 2/3 tests remain green; new auth unit tests pass; E2E specs pass (or are documented pending-environment with mocked-claim unit tests passing).

## 4.AA Definition of Done

- All Acceptance Criteria pass.
- Authorization is enforced at three layers (middleware, layout guards, RLS) and the UI is never the sole gate.
- The project-wide contract "every protected Server Action calls `requireApproved()`/`requireAdmin()` first" is established and demonstrated by `setUserApprovalAction`.
- The §0.4 claims correction is fully consumed: middleware and RLS read the **same** top-level claim path the Phase 3 hook writes.
- No later-phase functionality (library data, reader, uploads, offline sync) was implemented; those remain placeholders.

---
---

## Appendix A — Cross-Phase Frozen Contracts (do not rename after their introducing phase)

| Contract | Introduced | Import path | Consumers |
|---|---|---|---|
| `ActionResult<T>`, `ok`, `fail` | Phase 1 | `@/lib/result` | Phase 4+ Server Actions |
| `ROUTES` | Phase 1 | `@/lib/routes` | Middleware, links |
| Storage key builders (`epubKey`, `coverKey`) | Phase 1 | `@/lib/constants` | R2 layer, upload pipeline |
| Domain interfaces | Phase 1→3 | `@/types` | All features |
| `getServerEnv`, `publicEnv` | Phase 2 | `@/lib/env` | All server code |
| R2 operations + errors | Phase 2 | `@/lib/r2` | Delivery/upload phases |
| Delivery header helpers | Phase 2 | `@/lib/http/headers` | Delivery Route Handlers |
| Supabase clients + `updateSession` | Phase 3 | `@/lib/supabase/*` | Middleware, actions, features |
| Top-level JWT claims `is_approved`/`is_admin` | Phase 3 hook | JWT | Middleware, RLS |
| `getClaims`/`requireApproved`/`requireAdmin` | Phase 4 | `@/features/auth/session` | All protected features |

## Appendix B — Global Definition-of-Done Gate (every phase)

A phase is complete only when: (1) `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm build` pass; (2) all prior phases' tests remain green; (3) the phase's own Acceptance Criteria pass; (4) no forward-phase functionality was implemented; (5) no secret is exposed to the client bundle; (6) frozen contracts from Appendix A were not renamed.

*End of ISD — Phases 0 through 4. Remaining phases to be authored on request.*
