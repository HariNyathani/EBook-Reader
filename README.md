# Private EPUB Reader

A walled-garden EPUB reader web application. Users sign in,
admins approve them, and they can read their library of EPUBs
in a beautiful, performant, installable reader. Offline reading,
preferences sync, and progress tracking are all built in.

This is the **v1.0** release.

---

## Quick start

```bash
# 1. Install
pnpm install --frozen-lockfile

# 2. Configure
cp .env.example .env.local
# Edit .env.local with your Supabase + R2 credentials.

# 3. Start the local Supabase stack (optional)
supabase start
supabase db reset

# 4. Run
pnpm dev
```

Open <http://localhost:3000>.

---

## Documentation

| Doc                                                                                  | Purpose                                                      |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)                                       | High-level architecture + document index.                    |
| [docs/RUNBOOK.md](./docs/RUNBOOK.md)                                                 | Operational runbook (on-call, failure modes).                |
| [docs/SECURITY.md](./docs/SECURITY.md)                                               | Security model, threat model, secrets inventory.             |
| [docs/ROLLBACK.md](./docs/ROLLBACK.md)                                               | App + DB rollback procedures.                                |
| [docs/BACKUP_DR.md](./docs/BACKUP_DR.md)                                             | Backup strategy, RTO/RPO, DR drills.                         |
| [docs/RELEASE_CHECKLIST.md](./docs/RELEASE_CHECKLIST.md)                             | v1.0 release gate.                                           |
| [docs/QA_CHECKLIST.md](./docs/QA_CHECKLIST.md)                                       | Manual QA checklist.                                         |
| [docs/ENVIRONMENTS.md](./docs/ENVIRONMENTS.md)                                       | Env matrix + secrets sourcing.                               |
| [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md)                                       | How to contribute.                                           |
| [docs/CHANGELOG.md](./docs/CHANGELOG.md)                                             | Versioned changelog.                                         |
| [docs/implementation/ISD-Phases-0-4.md](./docs/implementation/ISD-Phases-0-4.md)     | ISD Phases 0-4 (foundation).                                 |
| [docs/implementation/ISD-Phases-5-8.md](./docs/implementation/ISD-Phases-5-8.md)     | ISD Phases 5-8 (admin, R2, EPUB, library).                   |
| [docs/implementation/ISD-Phases-9-12.md](./docs/implementation/ISD-Phases-9-12.md)   | ISD Phases 9-12 (reader, progress, premium UI, preferences). |
| [docs/implementation/ISD-Phases-13-16.md](./docs/implementation/ISD-Phases-13-16.md) | ISD Phases 13-16 (offline, perf, a11y + security, CI/CD).    |

---

## Development

```bash
pnpm dev              # Start the dev server
pnpm test             # Run unit tests
pnpm test:coverage    # Unit tests with coverage
pnpm test:e2e         # Playwright E2E tests
pnpm test:a11y        # axe-core a11y tests
pnpm typecheck        # TypeScript check
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm format:check     # Prettier (check)
pnpm build            # Production build
pnpm perf:budgets     # Enforce performance budgets
pnpm smoke            # Run the post-deploy smoke test
pnpm verify:migrations # Apply all migrations to a scratch DB
```

See [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for the full
development workflow.

---

## Architecture in one paragraph

A Next.js 15 (App Router) app on Vercel, with Supabase for auth

- Postgres (with RLS on every table), Cloudflare R2 for private
  EPUB + cover bytes, Upstash for rate limiting, and Sentry for
  errors + perf. The reader uses a vendored foliate-js engine
  behind a `ReaderEngine` abstraction; React never touches the
  iframe DOM. EPUBs stream from a gated Route Handler, never
  cached by CDNs. Offline reading is a documented exception:
  IndexedDB, per-user, evicted on sign-out/approval-loss/deletion.

See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full
diagram + invariant list.

---

## License

The application code (everything outside `src/vendor/`) is
licensed under the project's main license (see [LICENSE](./LICENSE)).

The vendored foliate-js library is licensed under the
[ISC License](https://opensource.org/licenses/isc-license)
by John Su. See `src/vendor/foliate-js/VENDOR.md` for the
pinned commit + license text.
