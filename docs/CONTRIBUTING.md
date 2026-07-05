# Contributing

**Project:** Private EPUB Reader
**Phase:** 16 (release readiness)
**Status:** v1.0
**Last updated:** 2026-07-05

Thanks for contributing to the Private EPUB Reader! This
document covers the day-to-day workflow.

For the architecture, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).
For the security model, see [`SECURITY.md`](./SECURITY.md).

---

## 1. Development setup

### 1.1 Prerequisites

* Node.js 20.11+ (use the version in `.nvmrc`).
* pnpm 9.15+ (`npm i -g pnpm`).
* The Supabase CLI (`brew install supabase/tap/supabase`).
* A Supabase project + Cloudflare R2 bucket for the development
  environment. See [`ENVIRONMENTS.md`](./ENVIRONMENTS.md).

### 1.2 First-time setup

```bash
# Clone
git clone <repo>
cd <repo>

# Install deps
pnpm install --frozen-lockfile

# Copy env template
cp .env.example .env.local
# Fill in real values for SUPABASE_URL, R2_*, etc.

# Start local Supabase
supabase start

# Apply migrations to local DB
supabase db reset

# Generate types
pnpm db:types

# Run the app
pnpm dev
```

### 1.3 Useful commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the Next.js dev server. |
| `pnpm build` | Production build. |
| `pnpm test` | Run unit tests. |
| `pnpm test:watch` | Watch unit tests. |
| `pnpm test:coverage` | Unit tests with coverage report. |
| `pnpm test:e2e` | Playwright E2E tests. |
| `pnpm test:a11y` | axe-core a11y tests. |
| `pnpm typecheck` | TypeScript type check. |
| `pnpm lint` | ESLint. |
| `pnpm format` | Prettier (write). |
| `pnpm format:check` | Prettier (check only). |
| `pnpm perf:budgets` | Enforce performance budgets. |
| `pnpm smoke` | Run the post-deploy smoke test. |
| `pnpm verify:migrations` | Apply all migrations to a scratch DB. |
| `pnpm db:migrate:prod` | Apply migrations to the prod Supabase project. |

---

## 2. Code style

* **TypeScript strict** — `tsc --noEmit` must pass. No `any`
  without a comment justifying it.
* **Prettier** — run `pnpm format` before committing. CI runs
  `pnpm format:check`.
* **ESLint** — `pnpm lint` must pass. We extend
  `next/core-web-vitals` and `next/typescript`.
* **No barrel files** for re-exports under `src/lib/**/index.ts`
  (excluded from coverage for that reason).
* **Frozen import contracts** (Appendix A/C/E in the ISD) must
  not be renamed or relocated.

---

## 3. Branching

* `main` — always green, always deployable. Direct push is
  disabled; everything goes through a PR.
* `feature/<short-name>` — a feature branch off `main`. Rebase
  before merging.
* `fix/<short-name>` — a bug-fix branch.
* `chore/<short-name>` — a non-functional change (deps, docs).

---

## 4. Pull requests

1. Branch off `main`.
2. Write code + tests. Every PR should have tests for any new
   behavior. Coverage must remain ≥ 70%.
3. Run the local checks:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm format:check
   pnpm test
   pnpm build
   ```
4. Push and open a PR. The CI pipeline runs:
   - Static analysis (lint + typecheck + format)
   - Unit tests + coverage
   - Integration tests (local Supabase + RLS)
   - Build + performance budgets
   - E2E tests
   - a11y checks
5. Get a code review from at least one other engineer.
6. Merge via squash (keeps `main` history clean).

A PR that does not pass CI cannot be merged.

---

## 5. Adding a migration

1. Generate a new file in `supabase/migrations/` with the
   next number: `0014_<name>.sql`.
2. Write the migration. Prefer additive changes
   (CREATE TABLE, ALTER TABLE ADD COLUMN, CREATE INDEX).
3. If the migration is destructive, add a `down.sql` section at
   the top of the file (a `-- DOWN` block) or a sibling file.
4. Document the migration in the file's header.
5. Run `supabase db reset` to verify it applies cleanly from
   scratch.
6. Update the integration tests in
   `tests/integration/rls-policies.test.ts` to assert the new
   schema.
7. If the migration adds an RLS policy, add a test that asserts
   the policy works.
8. Open a PR. CI runs the full migration on a scratch DB.

---

## 6. Adding a feature

1. Open an issue first (or comment on the existing one) to
   discuss the design. This avoids wasted work.
2. Branch off `main`.
3. Implement following the project's architectural patterns:
   - Domain code under `src/features/<domain>/`.
   - Shared infra under `src/lib/`.
   - Shared UI under `src/components/`.
   - Stores under `src/store/`.
4. Add tests (unit + integration + E2E as appropriate).
5. Update the documentation:
   - The relevant feature README (if it exists).
   - The architecture docs if the design changes.
   - The CHANGELOG.
6. Open a PR. The CI pipeline + a code review are required.

---

## 7. Security reports

If you find a security issue, do NOT open a public issue. Email
`security@epub-reader.example.com`. See
[`SECURITY.md`](./SECURITY.md) for the full process.

---

## 8. Code of conduct

Be respectful. Disagree on ideas, not on people. We're all here
to ship a good product.
