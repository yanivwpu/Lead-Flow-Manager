# SEO PR release readiness

Date: 2026-09-27

## Revision identity

- Validated local head: `a546f1b22e483e0f07070de10ba7114586562ac6`.
- Locally inferred base/parent: `8d1c4f4` (`Fix RGE upgrade and walkthrough resume flows (#21)`).
- This checkout has no Git remote or upstream configuration. The remote PR head and base could not be fetched or verified, so this report does **not** claim that the local revisions match the hosted PR.

## Decision

**Do not merge yet.** Implementation scope is frozen and no new runtime defect was found in this validation pass. Release is waiting on the `SEO PR PostgreSQL validation` workflow to execute successfully on the hosted PR. Once the remote revisions are confirmed and that job passes, the currently observed TypeScript baseline does not add a PR-specific blocker.

## Executed validation

- Focused action-planner regression: passed.
- SEO intelligence and competitor rebinding: passed.
- Public-claim consistency: 7/7 passed.
- SEO registry synchronization: 3/3 passed.
- Production build: passed with existing non-fatal bundle-size warnings.
- PostgreSQL SEO tests: skipped locally because neither PostgreSQL tooling nor `SEO_TEST_DATABASE_URL` is available.
- TypeScript comparison used the same installed dependencies and `npm run typecheck -- --incremental false` in detached worktrees. Head and base both failed with 97 diagnostics. After normalizing worktree paths and source locations, there were zero head-only diagnostics and zero base-only diagnostics.

## Required CI execution

The workflow `.github/workflows/seo-pr-validation.yml` provisions a disposable PostgreSQL 16 service and runs the snapshot/MVCC, action atomicity/history/recovery, refresh and analysis leases, candidate selection, snapshot migration, and execution-lease concurrency suites. The remaining execution step is to push this commit to the existing PR and require the `SEO PR PostgreSQL validation / postgres-seo` job to pass. The database is CI-local; no production credentials or data are used.

## Release criteria

1. **Workspace isolation and approval:** no bypass is known from available regressions; database-backed atomic/history checks await CI.
2. **Data integrity:** the shared-snapshot and incomplete-sync contracts are covered in code and regression tests; the database proof awaits CI.
3. **Lifecycle:** review, reject/dismiss, refresh recovery, identity reservation, and historical evidence assertions pass locally; concurrency/history tests await CI.
4. **Proposal safety:** supported examples produce proposals and unsupported entity, qualifier, and language claims are withheld.
5. **Validation:** non-database regressions and build pass; TypeScript introduces no diagnostics relative to the local base; PostgreSQL execution remains pending.

## Deferred limitation

The reproduced article variation (`the Salesforce integration` versus `Salesforce integration`) is a missed-opportunity false negative: clustering differs and the proposal is withheld with `INSUFFICIENT_INTEGRATION_EVIDENCE`. It fails closed and does not merge material entities, fabricate claims, bypass approval, or verify incomplete data. Treat it as a nonblocking follow-up requiring separate, matrix-driven clustering and evidence grammar policies—not another vocabulary patch in this release.

## Finding classification

- **Must complete before merge:** verify hosted PR head/base and obtain a passing disposable-PostgreSQL CI job.
- **Nonblocking follow-up:** article/stopword grammatical normalization described above.
- **Already fixed or not reproduced:** `X`/`R`/`AI` and vendor entity collapse, unsupported integration evidence, singular/plural integration evidence, empty-opportunity coverage loss, incomplete-sync verified zero, stale refresh fallback, approval execution bypass, and destructive history mutation.
