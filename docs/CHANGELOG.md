# Changelog

**Project:** Private EPUB Reader
**Phase:** 16 (release readiness)
**Status:** v1.0
**Last updated:** 2026-07-05

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

* Phase 15: nonce-based strict CSP (no `unsafe-inline` scripts).
* Phase 15: full security header set (HSTS prod-only, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy, COOP prod-only).
* Phase 15: rate limiting via Upstash (auth, upload, progress beacon) with
  in-memory fallback.
* Phase 15: `@sentry/nextjs` integration with PII-scrubbing `beforeSend` hooks.
* Phase 15: structured PII-scrubbing logger (JSON in prod, pretty in dev).
* Phase 15: `/api/health` endpoint with Supabase + R2 probes.
* Phase 15: skip-to-content links across all layouts.
* Phase 15: ARIA live-region announcer for reader page/chapter changes.
* Phase 15: focus traps in TOC, search, and typography panels.
* Phase 15: client-side approval-loss purge for offline IndexedDB data.
* Phase 15: bug fix — `/offline` page no longer hardcodes the userId as
  `'me'`; resolves from URL `?u=…`, in-memory mirror, or body
  `data-user-id`.
* Phase 16: GitHub Actions CI (lint, typecheck, unit, integration, build,
  E2E, a11y, performance budgets).
* Phase 16: GitHub Actions preview deploy (per-PR) with smoke.
* Phase 16: GitHub Actions production deploy (tag/main) with migration
  gating, Sentry release + source maps, auto-rollback on smoke failure.
* Phase 16: operational docs (RUNBOOK, SECURITY, ROLLBACK, BACKUP_DR,
  RELEASE_CHECKLIST, QA_CHECKLIST, ARCHITECTURE, ENVIRONMENTS,
  CONTRIBUTING).

### Changed

* `next.config.ts` now applies the full security header set and wraps
  the build with `withSentryConfig` when `SENTRY_DSN` is configured.
* Middleware generates a per-request CSP nonce and forwards it via the
  `x-nonce` header.
* `src/lib/env.ts` enforces a production-env gate (refuses to start
  without Upstash + Sentry, unless `SENTRY_REQUIRED=false`).
* `vitest.config.ts` declares coverage thresholds (lines ≥ 70%).
* `playwright.config.ts` adds a mobile project (Pixel 5).

---

## [0.x] — Phases 0-12 (pre-1.0)

Phases 0-12 are summarized in:

* [`PHASES-5-6-SUMMARY.md`](../PHASES-5-6-SUMMARY.md)
* [`PHASES-7-8-SUMMARY.md`](../PHASES-7-8-SUMMARY.md)
* [`PHASES-9-10-SUMMARY.md`](../PHASES-9-10-SUMMARY.md)
* [`PHASES-13-14-SUMMARY.md`](../PHASES-13-14-SUMMARY.md)

The pre-1.0 versions are not individually tagged; the codebase
grew organically through the implementation phases and we cut
v1.0.0 as the first release-grade tag.
