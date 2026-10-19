# Shopify E-commerce internal task tables — one-time STAGING release

This PR prepares a guarded, explicit SQL migration. It does not apply DDL by itself. Keep the current Railway bootstrap pre-deploy command unchanged until a separately approved migration run.

## Pinned target
- Railway project: 1d22ff35-a259-4977-9375-377dda1cdd2b
- Railway environment: staging / 43e4c163-6da9-4be5-ad93-0a3534234613
- Railway app service: WhachatCRM Staging App / 7663b193-b936-41cd-a810-a4940d9912fc
- Railway DB service: Postgres-JSIn, at postgres.railway.internal, database railway; NOT Neon
- Origin: https://whachatcrm-staging-app-staging.up.railway.app

## Confirm backup before any DDL
The available Railway connector does not expose PostgreSQL volume snapshots or SQL execution. Do not claim a backup is verified without evidence.
1. Open Railway -> WhachatCRM Shopify Staging -> Postgres-JSIn -> Backups.
2. Confirm a recent COMPLETED volume backup of postgres-volume-N58l, or create and wait for a new one.
3. Record the backup identifier/time and check that Restore is offered. Do not click Restore.
4. Verify staging app DATABASE_URL references that PostgreSQL service. Never paste the URL/token into a chat.
5. Get explicit release acceptance before the one-time DDL operation.

## Guarded execution
- Read-only command: node scripts/migrate-ecommerce-order-support-tasks.mjs --preflight
- One-time write command: node scripts/migrate-ecommerce-order-support-tasks.mjs --apply
- Apply requires exact pinned Railway project, environment, app, private database URL, APP_URL, bootstrap marker and compatible base schema.
- Apply also requires STAGING_DATABASE_BOOTSTRAP=1, ECOMMERCE_STAGING_TASK_MIGRATION_APPROVAL=apply-after-verified-railway-backup and ECOMMERCE_STAGING_TASK_BACKUP_REF=<verified reference>.
- Run inside staging service environment only after approval; for example, temporarily add the apply command after the existing bootstrap pre-deploy command, then revert the one-time command and approval variables.
- The runner wraps SQL in a transaction, verifies resulting columns and primary/foreign/unique constraints, and rejects partial schema. Re-running with compatible existing tables is an idempotent no-op.

## Acceptance and rollback
- Native PostgreSQL CI executes the actual SQL and verifies uniqueness, default OFF, no backfill, FK deletion and idempotency.
- Staging Shopify event preview should show internalTasks.schemaReady=true after applying.
- Existing order #1003 remains pending and untouched; no new Shopify order, message, automation or checkout action.
- The independent execution flag ECOMMERCE_ORDER_SUPPORT_TASKS_ENABLED remains absent/OFF and no merchant is opted in automatically.
- If rollback is needed BEFORE task activation and both new tables are empty, a separately reviewed staging-only transaction can drop task table first, settings second. Never automate DROP on startup.
- Full volume restore is a broader incident response action: it can discard newer unrelated data; do not use it as the default migration rollback.
