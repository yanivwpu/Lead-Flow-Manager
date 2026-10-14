# Isolated Shopify staging database initialization

## Confirmed diagnosis

The isolated Railway project "WhachatCRM Shopify Staging" has only a staging environment.
The app is sourced from codex/shopify-trial-first-onboarding at a187f3b.
Runtime logs for deployment 812086ae-6dda-46ac-999c-72744d9a5d3d show SQLSTATE 42P01,
missing users/contacts and other core tables, followed by fatal patches 0083/0084.
Hundreds of cascading SQL/stack logs caused Railway log throttling.

StartupSchemaPatches is an additive compatibility layer for existing databases, not an
empty-database migration. server/index.ts registers routes and begins optional worker
setup before calling it. No full schema initialization happens in npm start.
The migration journal only registers 0000 through 0005, references absent 0002_ghl_sync.sql,
and does not describe the complete current schema. Do not substitute a blind migration replay.

Railway currently configures npx drizzle-kit push --force as pre-deploy. Available build/runtime
logs do not include a conclusive pre-deploy execution result, and OAuth withholds variable
values. It is not confirmed whether that command ran against the runtime database,
failed in the runtime image, or exited without applying schema. Do not treat --force
as proof of successful initialization. This procedure replaces that uncertainty with
explicit target guards, a generated baseline, and a post-initialization catalog check.

## Operator commands (staging only; not applied automatically)

For the isolated staging APP service, after reviewing this PR and selecting its code:

Build command:

    npm run build:staging

Pre-deploy command (replace drizzle push):

    npm run db:bootstrap:staging

Start command (checks readiness before loading app code or workers):

    npm run db:bootstrap:staging && npm run start

Set STAGING_DATABASE_BOOTSTRAP=1 only on that staging app.
Keep DATABASE_URL referencing its own staging Postgres. The runtime accepts ONLY the
pinned project/environment/app service IDs, environment name staging, and the private
URL host postgres.railway.internal with database railway. Those host/database values are
an explicit expected configuration, not verified from redacted variable values; verify
the reference in Railway before running. Unexpected URLs fail closed before connecting.
Do not point the app at a public/production URL or relax the guard to bypass an error.

No Railway settings, variables, database objects, deployments, or connected branches were
changed by this implementation. Default build/start/db:push and all production migration
and additive patch code remain unchanged. Separate PR is based on and targets the supplied
onboarding branch so it contains only the staging fix.

## Bootstrap semantics

Build: generate a fresh full PostgreSQL DDL snapshot from shared/schema.ts using the
lockfile-installed Drizzle Kit in a temporary directory; no database access. Copy SQL
and a table/column manifest + checksum into dist. Production runtime requires only Node
and pg, not TypeScript source, drizzle-kit, or npx downloads.

Pre-deploy/start: validate explicit staging identity, lock within a transaction, require
an empty application database, execute all DDL including defaults, indexes and FKs,
verify expected table/column coverage, then record a dedicated staging baseline marker.
SQL failures roll back the entire baseline. Concurrent/repeat runs serialize and preserve
rows. A matching marker permits a verified no-op. Changed baselines or missing columns
fail closed for an explicitly reviewed migration; this is initialization, not a schema
upgrade/synchronization tool. It does not create a fake production migration journal.

An existing/partially initialized database without the marker is intentionally refused.
The currently crashed staging DB may contain tables created by startup patches; runtime
logs establish missing core tables but do not establish that every table is absent.
Do not drop/truncate it automatically. Use a newly provisioned, isolated empty staging
database after confirming its contents, or design a separately reviewed repair.
No production customer data is needed or copied. Existing app-owned startup seeds are
unchanged and are outside this schema-only initialization.

Failed bootstrap logs one bounded reason and optional SQLSTATE, never connection strings,
SQL dumps, or stacks. The start gate prevents the missing-table patch/error cascade.
Other preexisting unrelated startup warnings are outside this change.

## Validation

The dedicated workflow uses Node 24 (matching Railpack) and a disposable localhost
PostgreSQL 16 database named whachat_staging_bootstrap_test. Tests cover target rejection,
transaction rollback, partial database refusal, concurrent and repeat bootstrap,
generated ID defaults/FK enforcement, preserved fixture rows, artifact/incomplete-schema
rejection, bounded error output, and two executions of actual additive startup patches.

Local shell execution is unavailable in this session. CI results are reported in the PR.
No live staging bootstrap or Shopify browser flow is performed; no merge/deployment.
