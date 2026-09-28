# SEO Intelligence Phase 2C: automatic analysis and review-only GitHub execution

Phase 2C preserves the mandatory human gate:

`scheduled Search Console sync → automatic analysis → proposed action → human approval → GitHub branch/PR → human review/merge`

It never merges a pull request, pushes to `main`, or deploys. The executor uses the GitHub Git Data and Pull Requests APIs, starts every change at the latest remote `main` SHA, and can write only a generated `seo/*` branch.

## Scheduling and durability

After—and only after—a successful scheduled Search Console sync, the scheduler claims `(property_id, reporting_day)` in `seo_scheduled_analysis_claims`. The unique key and expiring database lease prevent replicas from analyzing the same property/day concurrently. A partial or failed sync does not invoke analysis. The existing manual Analyze endpoint remains available.

Approved action versions are inserted once into `seo_github_executions`. Replicas claim pending work with `FOR UPDATE SKIP LOCKED` and an expiring lease. Execution persists `pending`, `running`, `pr_created`, `failed`, or `stale`, together with the branch, commit, PR, bounded error, and timestamps.

## Initial mutation allowlist

The initial adapter intentionally supports only exact `meta_description` proposals for routes represented in `PAGE_META` in `server/seo.ts`. Both the action type and destination file are selected by trusted application code; model/Search Console output cannot supply a repository path. Unsupported action types remain approved recommendations but fail closed until a reviewed adapter is added.

Before reading or changing source, the executor resolves the latest remote `main`. It then captures the public page again and compares the resulting normalized fingerprint with the approved action's captured fingerprint. A mismatch marks the execution `stale`, moves the action to `revision_required`, and creates no branch or source mutation.

## Required Railway environment variables

- `SEO_GITHUB_TOKEN`: a fine-grained personal access token or GitHub App installation token with **Contents: read/write** and **Pull requests: read/write** for this repository.
- `SEO_GITHUB_OWNER`: repository owner, for example `yanivwpu`.
- `SEO_GITHUB_REPO`: repository name, for example `Lead-Flow-Manager`.
- `SEO_GITHUB_API_URL` (optional): GitHub API base URL; defaults to `https://api.github.com`.

Existing Search Console variables remain required: `GSC_SITE_URL`, `GSC_CLIENT_EMAIL`, and `GSC_PRIVATE_KEY`. `DATABASE_URL` remains required by the application.

Tokens are sent only in an Authorization header. API failures store bounded, redacted messages and never include response bodies, request headers, credentials, or source content.

## Migration

Apply `migrations/0102_seo_automation_and_github_execution.sql`. Production startup also applies the same additive objects idempotently and refuses to start SEO automation unless patches `0093` through `0102` succeed.
