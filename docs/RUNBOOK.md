# Operational Runbook

**Project:** Private EPUB Reader
**Phase:** 15 (operational readiness) + 16 (CI/CD)
**Status:** v1.0
**Last updated:** 2026-07-05

This runbook is the canonical reference for the on-call engineer.
It covers common operational scenarios, the monitoring stack, and
the escalation paths.

For secrets management and the threat model, see
[`SECURITY.md`](./SECURITY.md). For database recovery and RTO/RPO,
see [`BACKUP_DR.md`](./BACKUP_DR.md). For the deployment workflow
and rollback, see [`ROLLBACK.md`](./ROLLBACK.md).

---

## 1. Stack overview

| Layer | Service | Region | Notes |
|---|---|---|---|
| Application | Vercel (Next.js 15) | `iad1` (primary) | Auto-scaling serverless. |
| Database | Supabase (Postgres 15) | `us-east-1` | RLS enforced on every table. |
| Object storage | Cloudflare R2 | Global (origin in `us-east-1`) | Strictly private. |
| Rate limiting | Upstash Redis | `us-east-1` | Sliding-window counters. |
| Error tracking | Sentry | SaaS | PII-scrubbed. |
| Auth | Supabase Auth | Same as DB | JWT with top-level claims. |
| PWA service worker | Serwist (compiled) | Browser-side | `/sw.js` (cache-first shell). |
| Offline storage | IndexedDB (user device) | Browser-side | Per-user, per-book. |

Three environments, fully isolated:
* **development** — local Supabase + local R2 (or mocked), `APP_ENV=development`.
* **preview** — per-PR Supabase + R2, `APP_ENV=preview`.
* **production** — `APP_ENV=production`, isolated project + bucket.

---

## 2. Health checks

* `GET /api/health` — returns 200 (ok/degraded) or 503 (down).
  * `supabase` probe: `auth.getUser()` on the service-role client
    (validates the key without leaking the user list).
  * `r2` probe: `HeadBucket` on the configured bucket.
  * Cached for at most 2s. NEVER logs secrets.
* The probe is wired to Sentry via `monitoring/sentry.server.config.ts`.
* Uptime monitor: every 60s. Pages on-call when down for >2 minutes.

### Health endpoint contract

```
GET /api/health
200 → { status: "ok" | "degraded", timestamp, uptimeSec, version, env, checks }
503 → { status: "down", timestamp, uptimeSec, version, env, checks }
```

`status: "degraded"` means a non-critical dependency is slow or down
(R2); the app still serves most flows. `status: "down"` means a
critical dependency is down (Supabase); the app cannot serve any
authenticated flow.

---

## 3. Common failure modes

### 3.1 "Supabase down" or "RLS denying everyone"

* **Symptom:** `/api/health` returns 503 with `checks.supabase.status: "down"`.
* **Likely cause:** Supabase project paused (free tier), Postgres
  connection pool exhausted, or a recent migration left the schema
  inconsistent.
* **Action:**
  1. Open the Supabase dashboard for the affected environment.
  2. Check the project status; restart if paused.
  3. Check the SQL log for recent errors.
  4. If a recent migration is the cause, see [`ROLLBACK.md`](./ROLLBACK.md#3-database-rollback).

### 3.2 "R2 down" or uploads failing

* **Symptom:** `/api/health` returns 200 with `status: "degraded"`
  and `checks.r2.status: "down"`.
* **Likely cause:** R2 credential rotation, regional outage, or a
  revoked access key.
* **Action:**
  1. Verify the R2 token in the environment's secret store is valid.
  2. Rotate if needed: see [`SECURITY.md`](./SECURITY.md#2-secrets-rotation).
  3. Reads still succeed (degraded); uploads fail until R2 is back.

### 3.3 "Rate limit false positives"

* **Symptom:** Users report `429 RATE_LIMITED` on legitimate
  sign-in or progress saves.
* **Likely cause:** Upstash unreachable, the in-memory fallback is
  per-process and resets on each cold start, or the policy limits
  are too tight for the user base.
* **Action:**
  1. Check Upstash status; restart if needed.
  2. Review the per-policy limits in
     `src/lib/security/rate-limit.ts`. The current values:
     * `auth`: 5/min/IP+email
     * `upload`: 20/hour/admin user
     * `progress`: 600/min/user
     * `default`: 60/min/IP
  3. Update the policy in code; redeploy.

### 3.4 "Service worker is serving stale assets"

* **Symptom:** Users see the old UI after a deploy.
* **Likely cause:** The Serwist precache isn't invalidating on the
  new deploy; users without the new SW are stuck on the old one.
* **Action:**
  1. Confirm a deploy happened; check the SW URL (`/sw.js`) is
     returning the new bytes.
  2. Phase 13's `UpdateAvailableToast` prompts the user to reload.
     Verify it is visible on the page.
  3. As a last resort, bump the cache name in
     `src/app/sw.ts` (e.g. `epub-reader-pages-v1` → `-v2`) and
     redeploy. This evicts the old cache.

### 3.5 "Login fails with 500"

* **Symptom:** `signInAction` returns `INTERNAL`.
* **Likely cause:** Supabase Auth is down, or the custom JWT
  hook is misconfigured.
* **Action:**
  1. Check `/api/health` for Supabase status.
  2. Verify the `custom_access_token_hook` is enabled in the
     Supabase dashboard (Auth → Hooks). Without it, every user
     has `is_approved=false` and gets redirected to
     `/pending-approval`.

---

## 4. Monitoring

* **Sentry** — `@sentry/nextjs` wired in `sentry.{client,server,edge}.config.ts`.
  * Traces sample rate: 0.1 (10% of transactions).
  * Source maps uploaded by the production deploy workflow
    (`SENTRY_RELEASE=${{ github.sha }}`).
  * PII scrubbing: `beforeSend` hook redacts emails, JWTs, secret
    key shapes, and sensitive headers. See the Sentry configs.
* **Web Vitals** — `src/lib/perf/report-vitals.tsx` reports LCP,
  INP, CLS, FCP, TTFB. Sink: optional `NEXT_PUBLIC_VITALS_ENDPOINT`
  beacon; default no-op (Vercel Speed Insights is the canonical
  RUM in production).
* **Health endpoint** — see §2.
* **Upstash dashboard** — rate-limit metrics; alert on
  sustained 429 spikes.

### Alert thresholds

| Signal | Threshold | Action |
|---|---|---|
| `health.status: down` for >2 min | Page on-call | §3.1 |
| 5xx error rate >1% for 5 min | Slack #epub-alerts | Investigate Sentry. |
| Rate-limit 429s >100/min for 5 min | Slack #epub-alerts | §3.3. |
| LCP p75 > 2500ms for 15 min | Slack #epub-perf | Check bundle output + image sizes. |
| INP p75 > 200ms for 15 min | Slack #epub-perf | Reader perf regression. |

---

## 5. Common operations

### 5.1 Promote a user to admin

```sql
update public.profiles
set is_admin = true
where id = '<user-uuid>';
```

The custom_access_token_hook re-injects the claim on the next
sign-in. Have the user sign out + sign in to see the change.

### 5.2 Approve a pending user

Same SQL as 5.1 but with `is_approved = true`.

### 5.3 Reject a user (and trigger offline purge)

1. Set `is_approved = false` in the profile.
2. The next time the user loads any page, the client-side
   `useApprovalPurge` hook clears their offline book downloads
   (see `src/features/offline/use-approval-purge.ts`).
3. The server-side route handlers also refuse to serve
   `/api/books/<id>/file` (RLS + `requireApproved`).

### 5.4 Rotate the Supabase service-role key

1. Generate a new service-role key in the Supabase dashboard.
2. Update the `SUPABASE_SERVICE_ROLE_KEY` secret in each
   environment's secret store.
3. Redeploy. The new key is read by `getServerEnv()` on cold start.
4. Revoke the old key.

### 5.5 Rotate the R2 access key

Same pattern as 5.4. R2 supports two active keys, so the
old key can be revoked AFTER the new one is verified.

---

## 6. Environment matrix

| Variable | development | preview | production |
|---|---|---|---|
| `APP_ENV` | `development` | `preview` | `production` |
| Supabase project | local stack | per-PR project | dedicated prod project |
| R2 bucket | local/minio | `epub-reader-assets-preview` | `epub-reader-assets-production` |
| Sentry DSN | unset (no-op) | preview project | production project |
| Upstash | unset (in-mem fallback) | preview namespace | production namespace |
| HSTS | off | off | **on** (1y + preload) |
| COOP | off | off | **on** (same-origin) |
| CSP nonce | per-request | per-request | per-request |

See [`ENVIRONMENTS.md`](./ENVIRONMENTS.md) for the full env matrix.

---

## 7. Escalation

* **Tier 1 (on-call):** page via PagerDuty (linked to `/api/health`).
* **Tier 2 (engineering lead):** Slack #epub-oncall.
* **Tier 3 (CTO / security):** PII exposure, RLS bypass, key leak
  → call immediately; do not wait for the next standup.

---

## 8. Glossary

* **CFI** — Canonical Fragment Identifier. The reader's location
  pointer in an EPUB.
* **LWW** — Last-write-wins. The progress + preferences sync
  algorithm.
* **RLS** — Row-Level Security. Postgres-level policy enforcement
  on every query.
* **Serwist** — Service worker build tool we adopted in Phase 13.
