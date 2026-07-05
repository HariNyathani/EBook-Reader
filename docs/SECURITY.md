# Security Policy

**Project:** Private EPUB Reader
**Phase:** 15 (security hardening) + 16 (CI/CD)
**Status:** v1.0
**Last updated:** 2026-07-05

This document describes the security model of the Private EPUB
Reader: what we defend against, the layered defenses in place,
the secrets inventory and rotation policy, and the reporting
process for security issues.

For incident response, see [`RUNBOOK.md`](./RUNBOOK.md). For
database recovery, see [`BACKUP_DR.md`](./BACKUP_DR.md).

---

## 1. Threat model

### 1.1 What we defend

* **Private content leakage** — EPUB bytes must never leave the
  gated delivery path or be cached by CDNs/SWs.
* **Credential stuffing / brute force** — Auth endpoints must be
  rate-limited and not enumerable.
* **Privilege escalation** — Unapproved users must not be able
  to read books; non-admins must not be able to upload or modify
  user records.
* **Cross-origin / XSS** — Inline scripts, eval, and remote
  embedding are forbidden.
* **PII exposure in logs / monitoring** — Tokens, emails, secret
  keys must be redacted in every log path.

### 1.2 Out of scope (deferred to post-1.0)

* **In-book annotations / highlights** — Not implemented yet.
* **Format expansion (PDF, CBZ)** — Not implemented yet.
* **Multi-tenant admin** — Single-instance admin only.

### 1.3 Adversary models

* **External attacker** — can hit our public routes, but cannot
  reach R2 directly (no public bucket), cannot forge JWTs (HS256
  with Supabase-managed secret), and cannot bypass RLS (the
  service-role key is server-only).
* **Authenticated malicious user** — has an approved account.
  Can attempt abuse (mass download, enumeration of book IDs).
  Defended by: rate limits, RLS (own-row only), audit logs.
* **Compromised admin** — has admin rights. Defended by:
  Sentry alerting on unusual upload patterns, R2 bucket audit
  logs, Sentry user-id tagging.
* **Compromised R2 key** — attacker can read/write R2. Defended
  by: bucket is private; reads only via `/api/books/<id>/file`
  and `/api/covers/<id>` (which check auth + approval). Attacker
  cannot list bucket contents (no public list API).

---

## 2. Layered defenses

### 2.1 Application-level authorization (three layers)

1. **Edge middleware** — `src/middleware.ts` reads top-level
   `is_approved` / `is_admin` claims from the JWT and redirects
   to `/login`, `/pending-approval`, or `/dashboard` as
   appropriate. (Per-route matching is in the `config` export.)
2. **Server layout/action guards** — `requireApproved()` and
   `requireAdmin()` in `src/features/auth/session.ts` re-check
   the claims at render time. Every protected Server Action
   begins with one of these calls. Defense-in-depth: middleware
   can be bypassed (direct render, test envs).
3. **Row-level security (RLS)** — Postgres policies enforce
   own-row + approved at the database level. Even a misconfigured
   app code path cannot read another user's row.

UI is NEVER the sole gate. A button being visible does not mean
the action is permitted; the server always re-validates.

### 2.2 Content Security Policy (CSP)

`src/lib/security/csp.ts` builds a strict, nonce-based CSP:

* `script-src 'self' 'nonce-…' 'strict-dynamic'` — **never**
  `'unsafe-inline'` for scripts in any environment. `'unsafe-eval'`
  is allowed ONLY in development (for HMR).
* `style-src 'self' 'nonce-…'` — strict, nonced.
* `img-src 'self' blob: data:` — covers foliate canvas blobs.
* `frame-src 'self' blob:` — covers foliate's sandboxed iframe.
* `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
  `frame-ancestors 'self'`.
* `upgrade-insecure-requests` in production.
* `connect-src` is allowlisted to Supabase, Sentry, and the app's
  own origin.

A fresh nonce is generated per request in middleware and
forwarded via the `x-nonce` request header. Next.js applies the
nonce to inline boot scripts.

### 2.3 Security response headers

Set in `next.config.ts` and re-applied in `src/middleware.ts`:

* `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` (prod only).
* `X-Content-Type-Options: nosniff`.
* `Referrer-Policy: strict-origin-when-cross-origin`.
* `Permissions-Policy` — denies every feature the app does not
  use (camera, microphone, geolocation, payment, USB, MIDI, etc.).
* `Cross-Origin-Opener-Policy: same-origin` (prod only).
* `Cross-Origin-Embedder-Policy` is DELIBERATELY omitted because
  it breaks the reader's `blob:` iframe. Verified.

### 2.4 Rate limiting

`src/lib/security/rate-limit.ts` implements a per-route rate
limiter using `@upstash/ratelimit` + `@upstash/redis`. When
Upstash env vars are missing, an in-memory fallback is used
(documented in the file as `ISD-NOTE`).

Policies:
* `auth` — 5 / minute / IP+email. Protects `/login`, `/register`.
* `upload` — 20 / hour / admin user id. Protects admin uploads.
* `progress` — 600 / minute / user id. Protects the progress
  beacon. Beacons are fire-and-forget; we return 204 on reject.
* `default` — 60 / minute / IP. Catch-all.

A Upstash outage fails OPEN (the limiter falls back to the
in-memory implementation) so legitimate users are not locked
out during an incident. The fallback is logged at `warn` level.

### 2.5 Input validation

Every server boundary validates input with Zod:
* Server Actions: `safeParse` on the FormData/object.
* Route Handlers: `safeParse` on the parsed body.
* File uploads: presence + extension + MIME + size + re-parse
  in the EPUB extractor.

### 2.6 No token persistence

Tokens are NEVER written to:
* localStorage
* sessionStorage
* IndexedDB
* The Zustand `reader-store` (only durable preferences)

The Supabase auth client manages cookies via `@supabase/ssr`'s
chunked cookie helpers. The cookie is `HttpOnly`, `Secure`
(in prod), and `SameSite=Lax` by default.

---

## 3. Secrets inventory

| Secret | Where | Rotation | Notes |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Server env (all envs) | 90 days | Service-role bypasses RLS; rotation invalidates any cached admin clients. |
| `SUPABASE_JWT_SECRET` | Server env (all envs) | 180 days | Used to verify JWTs; rotates invalidate all sessions. |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Server env | 90 days | R2 supports two active keys. |
| `UPSTASH_REDIS_REST_TOKEN` | Server env | 90 days | Rotation invalidates in-flight rate-limit counters. |
| `SENTRY_AUTH_TOKEN` | CI only | 90 days | Used to upload source maps from CI. |
| `SENTRY_DSN` | Server + client | As needed | Two DSNs: server (canonical) + NEXT_PUBLIC_SENTRY_DSN (browser). |
| `SLACK_WEBHOOK_URL` | CI only | 90 days | Used for deploy notifications. |
| `VERCEL_TOKEN` | CI only | 90 days | Per-environment Vercel tokens. |

### 3.1 Secrets sourcing

* **development** — `.env.local` (git-ignored).
* **preview** — GitHub Actions secrets (`PREVIEW_*`).
* **production** — GitHub Actions secrets (`PROD_*`).

See [`ENVIRONMENTS.md`](./ENVIRONMENTS.md) for the full matrix.

### 3.2 NEVER

* Never put a secret in a `NEXT_PUBLIC_*` variable.
* Never log a secret, even in development.
* Never commit `.env.local` or any populated `.env*` file.
* Never paste a secret into a Slack channel or ticket.

The `assertNoPublicSecretLeak()` guard in
`src/lib/env.ts` runs at server boot and throws if any
`NEXT_PUBLIC_*` variable name contains `SECRET`, `SERVICE_ROLE`,
or `SERVICE` — defense-in-depth against accidental leaks.

---

## 4. Monitoring

* **Sentry** — Errors + performance traces.
  * `tracesSampleRate: 0.1` (10% of transactions).
  * PII scrubbing: emails, JWTs, Bearer tokens, and any key
    named `password`, `token`, `secret`, `apikey`, etc. are
    redacted in `beforeSend`. The Sentry configs (`sentry.client.config.ts`,
    `sentry.server.config.ts`, `sentry.edge.config.ts`) are the
    canonical source of truth.
* **Structured logging** — `src/lib/logging/logger.ts` is a
  PII-scrubbing JSON-in-prod logger. Sensitive keys are redacted
  recursively; emails are masked (`a***@example.com`); JWTs and
  secret-shaped strings are redacted.

---

## 5. Reporting a security issue

* **Email:** security@epub-reader.example.com
* **GPG key:** available at `/security.asc` on the deployed app.
* **Response time:** we acknowledge within 24 hours and aim to
  remediate within 7 days for high-severity issues.

Please DO NOT open a public GitHub issue for security problems.

---

## 6. Compliance notes

* **GDPR** — The app stores no PII beyond the email address used
  to sign in (Supabase Auth) and the reader's reading history
  (Postgres, RLS-protected). Cookies are functional only. No
  third-party trackers. Sentry data is scrubbed of emails.
* **COPPA** — The app is a walled-garden product for adults.
  Sign-up requires admin approval.
* **WCAG 2.1 AA** — Accessibility is a release gate. See the QA
  checklist in [`QA_CHECKLIST.md`](./QA_CHECKLIST.md).
