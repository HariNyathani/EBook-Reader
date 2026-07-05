# Rollback Procedures

**Project:** Private EPUB Reader
**Phase:** 15 (operational readiness) + 16 (CI/CD)
**Status:** v1.0
**Last updated:** 2026-07-05

This document describes how to roll back the application (app +
database) when a deploy misbehaves. Two paths are described:

1. **App rollback** (fast) — Vercel's previous-deploy promotion.
2. **Database rollback** (slow, last resort) — Supabase migration
   reversal.

The default recovery is **app rollback**. Database rollback is
ONLY used if a migration is the root cause AND the migration is
not additive.

---

## 1. Decision tree

```
Production issue detected
  │
  ├── App-only issue (UI bug, perf, edge case)
  │   └── Go to §2: App rollback
  │
  ├── DB schema corruption / RLS bypass
  │   └── Go to §3: Database rollback
  │
  └── Both (app bug + DB problem)
      └── Go to §3 first, then §2
```

---

## 2. Application rollback

### 2.1 Vercel previous-deployment promotion

Vercel retains every successful production deploy. To roll
back, promote the previous successful deploy to the active slot.

```bash
vercel rollback --yes --token="$VERCEL_TOKEN"
```

This is what the `deploy-production.yml` workflow does
automatically when the smoke test fails (the `Auto-rollback on
smoke failure` step).

### 2.2 Verifying the rollback

1. `curl https://epub-reader.example.com/api/health` — should
   return 200 with `status: "ok"`.
2. `curl -I https://epub-reader.example.com/login` — should
   return 200.
3. Run the smoke script:
   `SMOKE_URL=... SMOKE_EMAIL=... SMOKE_PASSWORD=... SMOKE_BOOK_ID=... pnpm smoke`
4. Check Sentry for new error spikes.

### 2.3 When app rollback is NOT enough

App rollback cannot undo:
* Database schema changes (the new code may not be compatible).
* New files uploaded to R2 (the new code may reference keys
  that the old code does not understand — but the old code
  gracefully ignores unknown fields).
* Supabase auth changes (the custom_access_token_hook change is
  a one-way door — the old code will still work; rolling forward
  the new code is required to fix).

---

## 3. Database rollback

### 3.1 Migrations are forward-only by default

Per the ISD (§13.0.2 F, §16.I), every migration is either:

* **Additive / safe** — adding tables, columns, indexes, or RLS
  policies. These NEVER need to be rolled back because the
  previous app version still works against the new schema
  (extra columns are ignored; missing columns cause errors only
  if the app reads them — and we always make new columns
  nullable or with a default).
* **Documented reverse** — destructive changes ship a
  `down.sql` script in the same migration file under a comment,
  or in a sibling file. The reverse is documented in the
  migration file's header.

### 3.2 When to roll back the database

Only roll back the database if:
* A new column with a NOT NULL constraint was added without a
  default, and the app fails to insert.
* A new RLS policy is over-restrictive and the app fails to
  read/write legitimate rows.
* A new table was created in a way that conflicts with an
  existing constraint.

### 3.3 Procedure

```bash
# 1. Find the offending migration.
ls -la supabase/migrations/

# 2. Read its header for the documented reverse (if any).
head -50 supabase/migrations/<file>.sql

# 3. Connect to the production database using the supabase CLI
#    with the service-role key. NEVER via the anon client.
supabase db remote commit   # confirm the deployed schema
psql "$PROD_SUPABASE_DB_URL" -f supabase/migrations/<file>.down.sql
```

### 3.4 What if the migration has no reverse?

If the migration is destructive (DROP, type change, etc.) and
did NOT ship a reverse:

* **Try to recover from a backup.** Supabase PITR (point-in-time
  recovery) can restore the database to a point before the
  migration was applied. See [`BACKUP_DR.md`](./BACKUP_DR.md).
* **Document the incident** — write a `down.sql` for the
  migration so the next operator has a script to run.

### 3.5 Application rollback after a DB rollback

After rolling back the database, ALSO roll back the application
to the previous version (the one that worked against the
pre-migration schema). Use the procedure in §2.

---

## 4. R2 (object storage) rollback

R2 has two relevant features:
* **Versioning** — enabled in production; every object has a
  version history. A `GetObjectVersion` call can retrieve an
  old version.
* **Object lifecycle** — we do NOT auto-delete; the production
  bucket has no expiration policy.

If a bad upload writes a corrupt file:
1. Identify the object's key (from the Sentry / R2 audit log).
2. Use the R2 dashboard to list versions and restore the
   previous one.
3. The next user request for that file gets the restored
   version.

If a bad delete removes a file:
1. The book's `file_key` in the `books` table is no longer
   resolvable.
2. The DB row must be removed (or the file_key updated to a
   valid object).
3. Use R2 versioning to restore the object.
4. If the version is gone (e.g. the lifecycle policy deleted
   it), restore from the backup (see [`BACKUP_DR.md`](./BACKUP_DR.md)).

---

## 5. Post-incident checklist

After any rollback:

* [ ] Verify the application is healthy (`/api/health` returns 200).
* [ ] Verify the smoke test passes.
* [ ] File a post-mortem in `#epub-incidents` (private).
* [ ] Identify the root cause; write a regression test.
* [ ] Update the runbook ([`RUNBOOK.md`](./RUNBOOK.md)) with any
      new failure mode.
* [ ] If the migration was the cause, add a `down.sql` and update
      the migration's header.
* [ ] Notify stakeholders (#epub-team, security@ if relevant).
