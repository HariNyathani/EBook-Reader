# Backup & Disaster Recovery

**Project:** Private EPUB Reader
**Phase:** 16 (operational readiness)
**Status:** v1.0
**Last updated:** 2026-07-05

This document describes the backup strategy, recovery procedures,
RTO / RPO targets, and the drill schedule for the Private EPUB
Reader.

For app/database rollback procedures, see [`ROLLBACK.md`](./ROLLBACK.md).
For secrets management, see [`SECURITY.md`](./SECURITY.md).

---

## 1. Backup strategy

| Resource | Backup mechanism | Frequency | Retention |
|---|---|---|---|
| Supabase Postgres | PITR (point-in-time recovery) | Continuous (WAL shipping) | 7 days (production), 1 day (preview) |
| R2 (EPUB + cover bytes) | Object versioning | On every write | 30 days (production) |
| Application code | GitHub | On every push | Forever |
| Configuration | GitHub Actions secrets + this repo | On every change | Forever |

### 1.1 Supabase PITR

Supabase's PITR (paid plan feature) captures every change to the
Postgres database. We can restore to any point in the retention
window.

* **Production:** 7 days.
* **Preview:** 1 day (the preview environment is ephemeral; PITR
  is not critical here).

To use PITR, open the Supabase dashboard → Project → Settings →
Database → Point in Time Recovery. The PITR restore operation
replaces the database with a snapshot from the chosen timestamp.

### 1.2 R2 object versioning

R2 has versioning enabled on the production bucket. Every
`PutObject` creates a new version. To restore a previous
version, use the R2 dashboard or the AWS CLI:

```bash
aws s3api list-object-versions --bucket epub-reader-assets-production --prefix epubs/<id>.epub
aws s3api get-object --bucket epub-reader-assets-production --key epubs/<id>.epub --version-id <versionId> epubs/<id>.epub.restored
```

### 1.3 Application configuration

* `next.config.ts` is in git.
* Env vars are in the GitHub Actions secrets store (encrypted).
  * `BACKUP_GITHUB_SECRETS: true` (manual workflow) exports the
    encrypted secret values to a private S3 bucket monthly.
* Operational documentation (this folder) is in git.

---

## 2. RTO and RPO

| Incident class | RTO (recovery time) | RPO (data loss) |
|---|---|---|
| Single app instance down (Vercel auto-recovers) | < 1 min | 0 |
| Bad app deploy | < 5 min (Vercel rollback) | 0 |
| Supabase Postgres corruption (PITR restore) | 30 min | < 5 min (PITR window) |
| R2 region failure (Cloudflare multi-region) | < 1 min (auto-failover) | 0 |
| Total loss of Supabase project | 4 hours (re-create + restore from PITR) | < 5 min (PITR window) |
| Total loss of R2 bucket | 24 hours (restore from versioning + S3 mirror) | < 30 days (versioning) |
| Complete AWS/GCP/cloud-provider failure | 24 hours (failover to DR region) | < 1 hour (cross-region replica) |

### 2.1 Definitions

* **RTO** — Recovery Time Objective. The maximum time between the
  incident being detected and the service being available again.
* **RPO** — Recovery Point Objective. The maximum acceptable
  window of data loss.

### 2.2 Acceptable thresholds

The current RTO/RPO targets are appropriate for a private
walled-garden product with < 1000 users. As the user base grows,
we will revisit (especially the Supabase PITR retention window
and the cross-region replication).

---

## 3. Disaster recovery procedures

### 3.1 Scenario: Supabase Postgres corruption

1. Detect via the `/api/health` endpoint and the
   `checks.supabase.status` field.
2. Open the Supabase dashboard.
3. Go to Settings → Database → Point in Time Recovery.
4. Choose a timestamp BEFORE the corruption was introduced
   (review the migration log and Sentry errors for the
   approximate time).
5. Click "Restore". The database will be replaced; expect
   ~5-10 minutes of downtime.
6. Re-deploy the application (so the app picks up the restored
   schema if a migration was involved).
7. Verify the smoke test passes.

### 3.2 Scenario: Total Supabase project loss

1. Create a new Supabase project in the same region.
2. Apply ALL migrations from `supabase/migrations/` IN ORDER.
   The `verify-migrations.ts` script (`pnpm verify:migrations`)
   is the same script CI uses to verify a fresh DB.
3. Restore from PITR (if the original project is recoverable
   via Supabase support).
4. Re-issue service-role + anon keys; update GitHub secrets.
5. Re-deploy the application.
6. Verify the smoke test passes.

### 3.3 Scenario: R2 bucket loss

1. R2 has versioning; use the version list to find the most
   recent good version of every object.
2. Bulk-restore via the R2 dashboard or a script:
   ```bash
   # Pseudo-code: for every key in the version list, copy the
   # most recent version to the live key.
   for key in $(aws s3api list-object-versions ...); do
     VERSION_ID=$(aws s3api list-object-versions --bucket ... --prefix $key | jq -r '.[] | select(.IsLatest) | .VersionId')
     aws s3api get-object --bucket ... --key $key --version-id $VERSION_ID | aws s3api put-object --bucket ... --key $key
   done
   ```
3. Verify the smoke test (specifically the book download step).

### 3.4 Scenario: Total loss of the cloud provider

This is the worst case. We rely on:
* The codebase being in GitHub (public, no risk of loss).
* The documentation being in the repo (this file).
* The secrets being exportable from GitHub Actions.
* The Supabase PITR data being exportable (Supabase can produce
  a Postgres dump on request).

To recover:
1. Provision a new Supabase project, R2 bucket, and Upstash
   instance in a new region.
2. Apply all migrations.
3. Restore the Postgres data from the most recent dump.
4. Restore R2 from versioning or from the most recent dump.
5. Update all env vars in the new environment.
6. Re-deploy the application.

---

## 4. Drill schedule

We DRILL the recovery procedures quarterly to ensure they work
and that the team is familiar with them. A drill is a TEST —
not a real recovery. The current schedule:

| Drill | Frequency | Last run | Owner |
|---|---|---|---|
| PITR restore (Supabase) | Quarterly | n/a (post-1.0) | Engineering lead |
| R2 versioning restore | Quarterly | n/a (post-1.0) | Engineering lead |
| App rollback (Vercel) | Monthly (via CI smoke fail) | every CI run | CI |
| Migration verification (scratch DB) | Every PR (CI) | every PR | CI |

### 4.1 Drill procedure (PITR)

1. Spin up a new Supabase project in a non-prod environment.
2. Apply all migrations to verify the script works.
3. Use the PITR snapshot to restore a recent state.
4. Run the integration test suite against the restored DB.
5. Document the duration + any failures.
6. Update this file with the actual RTO/RPO observed.

### 4.2 Failure modes

* If a PITR restore takes longer than 30 min, the target is not
  met — escalate to engineering lead.
* If a migration is missing the `verify-migrations` assertions
  (table, RLS, index), block the next deploy until fixed.

---

## 5. Cross-region considerations

The current setup is single-region (us-east-1) for cost reasons.
If we go multi-region:

* **Database** — Supabase has read replicas; a standby in a
  second region is the standard pattern.
* **R2** — Cloudflare R2 is already multi-region; buckets can
  be in any region with automatic failover.
* **Upstash** — global Redis with low-latency reads from any
  region.
* **Vercel** — multi-region by default; the Next.js build runs
  close to the user.

We will revisit this at > 1000 active users.

---

## 6. Contact

For any DR-related question, contact the engineering lead or
the on-call (see [`RUNBOOK.md`](./RUNBOOK.md)).
