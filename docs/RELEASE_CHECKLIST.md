# Release Checklist — v1.0

**Project:** Private EPUB Reader
**Phase:** 16 (release readiness)
**Status:** v1.0
**Last updated:** 2026-07-05

This is the final release gate. Every item must be checked
before tagging `v1.0.0`.

For the canonical v1.0 completion criteria, see
[`ISD-Phases-13-16.md`](./implementation/ISD-Phases-13-16.md)
Appendix H. For the operational runbook, see
[`RUNBOOK.md`](./RUNBOOK.md).

---

## H.1 Functional

- [ ] Register → pending-approval → admin approval → login → dashboard works.
- [ ] Admin: user management (approve/revoke, admin toggle with self/last-admin guards).
- [ ] Admin: book upload (EPUB) with metadata + cover extraction; book delete with R2 cleanup.
- [ ] Library: catalog grid, personal library add/remove, book details, Continue Reading, progress badges.
- [ ] Reader: opens EPUBs, paginates, TOC, in-book search, tap zones, keyboard, mobile gestures, typography + theme controls.
- [ ] Progress: debounced save, resume, beacon last-position, offline queue + reconnect sync, multi-device LWW.
- [ ] Preferences: local-first persist + cloud sync + settings page + reset.
- [ ] PWA: installable; explicit offline download + offline reading; offline fallback; update prompt.

## H.2 Performance

- [ ] Core Web Vitals meet targets (LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1) on key routes in CI.
- [ ] First-load JS per route within `performance-budgets.json`; foliate not in main bundle; reader panels code-split.
- [ ] Reader page-turn ≤ ~100ms; no reader re-mount on unrelated state changes; queries pruned/paginated/no N+1; required indexes present.
- [ ] Caching correct: covers `private` cached, EPUB `no-store`, `/api/*` not publicly cached, catalog tag-revalidated.

## H.3 Accessibility

- [ ] WCAG 2.1 AA: automated axe passes (no serious/critical) on all key pages.
- [ ] Full keyboard operability; visible focus; logical order; skip link; landmarks/labels; focus trap+restore in modals/reader panels.
- [ ] Screen-reader support incl. reader live announcements; reduced-motion honored; AA contrast across light/sepia/dark; touch targets ≥ 44px.
- [ ] Manual keyboard + SR + reduced-motion + contrast sign-off completed.

## H.4 Security

- [ ] Strict nonce CSP (no `unsafe-inline` scripts) + full header set + HSTS (prod); reader iframe sandboxed.
- [ ] RLS enabled + verified on all tables; three-layer authz; top-level claims path consistent; sensitive columns write-protected.
- [ ] Private R2; delivery gated by auth+approval; keys-not-URLs; service-role/R2 secrets server-only and env-isolated.
- [ ] All inputs Zod-validated server-side; rate limiting on auth/upload/beacon; logs/monitoring scrub PII/secrets; no client-side token persistence.
- [ ] Secrets management + rotation documented; dev/preview/prod fully isolated (Supabase + R2).

## H.5 Testing

- [ ] Unit coverage thresholds met (critical `lib/*` well-covered; lines ≥ 70%).
- [ ] Integration/RLS tests pass against local Supabase (unapproved denied, own-row, conditional upserts, extractor fixtures).
- [ ] E2E critical journeys pass on desktop + mobile (auth, admin, upload/read/resume, offline, preferences).
- [ ] Automated a11y + performance budgets are green in CI.
- [ ] Post-deploy smoke (health + login + open book) passes on preview and production.

## H.6 Documentation

- [ ] README, ARCHITECTURE (indexing SAD + ISD 0–16), CONTRIBUTING, ENVIRONMENTS, RUNBOOK, SECURITY, ROLLBACK, BACKUP_DR, RELEASE_CHECKLIST, QA_CHECKLIST, CHANGELOG present and current.
- [ ] Env variable matrix documented; vendored foliate `VENDOR.md` (source + commit + license) present.

## H.7 Production readiness

- [ ] CI/CD pipeline gates merges and automates preview + production deploys with migration gating.
- [ ] Monitoring (Sentry) + `/api/health` operational; alerting configured.
- [ ] Rollback (app + DB) documented; backups (Supabase PITR + R2 versioning) enabled; DR restore **drilled** with defined RTO/RPO.
- [ ] Versioning (semver + tags + CHANGELOG) in place; v1.0 tagged.

## H.8 Quality gates (all must be green)

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` pass.
- [ ] All test suites (unit/integration/E2E/a11y) pass; coverage + performance budgets met.
- [ ] **Project-Wide Invariants (Appendix G) hold** across the codebase (spot-audited).
- [ ] No `NEXT_PUBLIC_*` secret leakage; no `process.env` reads outside `src/lib/env.ts`; frozen contracts intact.
- [ ] Final Definition of Done (Phase 16 §16.EE) satisfied.

---

## Pre-tag verification

Before tagging `v1.0.0`:

1. **CI is green on `main`.** All five jobs (static, unit, integration, build, e2e) pass.
2. **Preview deploy is green.** The most recent PR merged to main has a passing preview smoke.
3. **Production dry-run.** A previous tagged release (e.g. `v1.0.0-rc.1`) has been deployed to production with a passing smoke + a 24-hour observation window.
4. **DR drill completed.** The PITR restore + R2 versioning restore drills have been executed at least once (per [`BACKUP_DR.md`](./BACKUP_DR.md) §4).
5. **All docs reviewed.** README, RUNBOOK, SECURITY, ROLLBACK, BACKUP_DR, RELEASE_CHECKLIST, QA_CHECKLIST are current.
6. **CHANGELOG updated.** The `v1.0.0` section lists the major changes since `v0.x`.
7. **Version bumped.** `package.json` version is `1.0.0`.

## Tagging

```bash
git checkout main
git pull
# Verify everything is green:
pnpm typecheck && pnpm lint && pnpm test && pnpm build
# Tag:
git tag -a v1.0.0 -m "Release v1.0.0 — Private EPUB Reader"
git push origin v1.0.0
```

The `deploy-production.yml` workflow triggers on the `v1.0.0`
tag (the workflow's `on.push.tags` matcher).

## Post-tag verification

After the production deploy:

1. The smoke test passes (`pnpm smoke`).
2. `/api/health` returns 200 with `status: "ok"`.
3. Sentry shows no new error spikes in the first hour.
4. A real user (admin or test account) can:
   - Sign in
   - Open a book
   - See progress sync
   - Toggle a preference
5. The CHANGELOG has a `v1.0.0` section.
6. The release is announced in `#epub-releases` and the
   public changelog (if applicable).

## Rollback

If anything is wrong, see [`ROLLBACK.md`](./ROLLBACK.md) for the
app + DB rollback procedure. The auto-rollback in
`deploy-production.yml` handles the common case (smoke failure).
