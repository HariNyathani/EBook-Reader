# Environments

**Project:** Private EPUB Reader
**Phase:** 16 (release readiness)
**Status:** v1.0
**Last updated:** 2026-07-05

This document describes the three environments we maintain, the
env vars each one requires, and the secrets-sourcing strategy.

For the operational view, see [`RUNBOOK.md`](./RUNBOOK.md). For
the security model, see [`SECURITY.md`](./SECURITY.md).

---

## 1. Environments

| Env | Purpose | Supabase | R2 bucket | Upstash | Sentry |
|---|---|---|---|---|---|
| **development** | Local dev | Local stack | Local (or mocked) | unset (in-mem fallback) | unset (no-op) |
| **preview** | Per-PR deploys | Per-PR project | `epub-reader-assets-preview` | Preview namespace | Preview project |
| **production** | Live users | Dedicated project | `epub-reader-assets-production` | Production namespace | Production project |

The three environments are FULLY ISOLATED — no credentials are
shared. A production env var is NEVER used in preview or
development.

---

## 2. Env var matrix

| Variable | development | preview | production | Notes |
|---|---|---|---|---|
| `APP_ENV` | `development` | `preview` | `production` | Controls prod-only env validation. |
| `SUPABASE_URL` | local stack | per-PR project | dedicated prod | Postgres + Auth host. |
| `SUPABASE_SERVICE_ROLE_KEY` | local stack | per-PR project | dedicated prod | Server-only. Bypasses RLS. |
| `SUPABASE_JWT_SECRET` | optional | optional | required for manual sig verify | |
| `NEXT_PUBLIC_SUPABASE_URL` | local stack | per-PR project | dedicated prod | Client-visible. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | local stack | per-PR project | dedicated prod | Client-visible. |
| `R2_ACCOUNT_ID` | unset | per-PR | dedicated prod | |
| `R2_ACCESS_KEY_ID` | unset | per-PR | dedicated prod | |
| `R2_SECRET_ACCESS_KEY` | unset | per-PR | dedicated prod | |
| `R2_BUCKET` | local | `epub-reader-assets-preview` | `epub-reader-assets-production` | |
| `UPLOAD_STRATEGY` | `stream` | `stream` | `stream` | |
| `MAX_UPLOAD_BYTES` | `52428800` (50MB) | `52428800` | `52428800` | |
| `SERVER_ACTIONS_BODY_LIMIT` | `50mb` | `50mb` | `50mb` | |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | preview URL | production URL | |
| `NEXT_PUBLIC_PWA_ENABLED` | `true` | `true` | `true` | |
| `NEXT_PUBLIC_SW_DEV` | `false` | `false` | `false` | Set to `true` in dev to test SW. |
| `NEXT_PUBLIC_VITALS_ENDPOINT` | unset | unset | unset | Optional RUM endpoint. |
| `UPSTASH_REDIS_REST_URL` | unset | preview | production | Required in prod. |
| `UPSTASH_REDIS_REST_TOKEN` | unset | preview | production | Required in prod. |
| `SENTRY_DSN` | unset | preview | production | Required in prod. |
| `NEXT_PUBLIC_SENTRY_DSN` | unset | preview | production | |
| `NEXT_PUBLIC_SENTRY_ENABLED` | `true` | `true` | `true` | |
| `SENTRY_AUTH_TOKEN` | unset | unset | CI only | For source-map upload. |
| `SENTRY_ORG` | unset | preview | production | |
| `SENTRY_PROJECT` | unset | preview | production | |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` | `0.1` | `0.1` | |
| `SENTRY_RELEASE` | unset | git SHA | git SHA | |
| `SENTRY_REQUIRED` | `false` | `true` | `true` | Prod refuses to start without Sentry. |
| `LOG_LEVEL` | `debug` | `info` | `info` | |
| `SERVICE_NAME` | `epub-reader` | `epub-reader` | `epub-reader` | |
| `VERCEL_TOKEN` | unset | CI only | CI only | |
| `VERCEL_ORG_ID` | unset | CI only | CI only | |
| `VERCEL_PROJECT_ID` | unset | CI only | CI only | |
| `SLACK_WEBHOOK_URL` | unset | CI only | CI only | Deploy notifications. |
| `PROD_SMOKE_EMAIL` / `PROD_SMOKE_PASSWORD` / `PROD_SMOKE_BOOK_ID` | unset | CI only | CI only | Smoke test creds. |
| `PREVIEW_SMOKE_*` | unset | CI only | n/a | Preview smoke creds. |
| `SCRATCH_SUPABASE_DB_URL` | unset | CI only | CI only | For verify-migrations. |
| `PROD_SUPABASE_DB_URL` | unset | unset | CI only | For prod migrations. |

---

## 3. Secrets sourcing

### 3.1 Development

`.env.local` (git-ignored). Copy `.env.example` to start. Real
credentials are NOT required for development — most modules work
with placeholders (the Supabase server client + R2 are lazy and
will throw a clear error if you actually use them with
placeholders).

### 3.2 Preview

GitHub Actions secrets with the `PREVIEW_` prefix. The
`deploy-preview.yml` workflow maps them to the public env
names the app reads.

Set up a per-PR Supabase project + R2 bucket in advance (we use
a dedicated "preview" Supabase project that we reset per PR
rather than per-deploy to save costs).

### 3.3 Production

GitHub Actions secrets with the `PROD_` prefix. Stored in
GitHub's encrypted secret store; only the production deploy
workflow has access.

NEVER store production secrets in:
* `.env.local` or any committed file.
* A `NEXT_PUBLIC_*` variable.
* A Slack message or ticket.

---

## 4. Production env validation

`src/lib/env.ts` refuses to start a production build without
the required env vars:

* `UPSTASH_REDIS_REST_URL`
* `UPSTASH_REDIS_REST_TOKEN`
* `SENTRY_DSN` (unless `SENTRY_REQUIRED=false`, which is for
  emergency diagnostic deploys only)

This gate is enforced in `getServerEnv()`. A missing var throws
a descriptive error and the app does not start.

---

## 5. Per-environment smoke creds

Each non-development environment has a smoke test account
provisioned in its Supabase project. The smoke account:

* Has the `is_approved` claim set to `true` (so it can read
  books).
* Has NO admin claim.
* Has access to a single book (the "smoke book") so the smoke
  test does not touch real user data.

The smoke creds are stored as environment variables in the CI
secrets:

* `PREVIEW_SMOKE_EMAIL` / `PREVIEW_SMOKE_PASSWORD` / `PREVIEW_SMOKE_BOOK_ID`
* `PROD_SMOKE_EMAIL` / `PROD_SMOKE_PASSWORD` / `PROD_SMOKE_BOOK_ID`

Rotate quarterly; the smoke script does NOT print the password.

---

## 6. Promoting between environments

There is no automatic promotion. The flow is:

1. **development → preview** — push a branch, open a PR. CI
   deploys to the preview environment.
2. **preview → production** — merge to `main`. CI deploys to
   production.

To debug a production-only issue, the on-call can:

* View logs in Sentry.
* Run the smoke script against the production URL.
* Promote the previous deploy (Vercel rollback).
