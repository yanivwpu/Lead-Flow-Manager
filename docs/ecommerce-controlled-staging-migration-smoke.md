# Controlled staging migration + one Shopify test-store recovery check

**Designated test store:** `whachatcrm.myshopify.com`, already used for Shopify development testing. The existing one-cart claim concerns **The Collection Snowboard: Hydrogen**, variant `51638768632090`, quantity **1**, listed **$600.00 USD**. Do not create a second cart, charge a card, submit an order or contact a live shopper to force a result.

## Platform gate and scope

Railway project `1d22ff35-a259-4977-9375-377dda1cdd2b`, staging environment `43e4c163-6da9-4be5-ad93-0a3534234613`, dedicated staging Postgres **Postgres-JSIn**. The latest staging application deployment and the existing independent backup service were verified, but the Railway API currently responds **"Deploys have been paused temporarily"** to attempts to provision a one-shot runner. As a result, none of the five migrations have been applied by this runbook.

The Neon project named WhachatCRM has only a production branch. **Never apply the staging migrations to it.** Never inject a raw DB password into code, logs or GitHub.

## Fresh backup then migration

Run `scripts/ecommerce-recovery-staging-migrate.sh` only on a dedicated one-shot **postgres:18** container within the exact staging environment, with the five source migration files available under `migrations/`. The script requires:

- `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_ENVIRONMENT_NAME`: the exact staging identifiers.
- `RAILWAY_SERVICE_ID` matching operator-provided `RECOVERY_MIGRATION_JOB_SERVICE_ID`: prevents execution in the app/web service.
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE=railway` from **staging Postgres-JSIn** reference variables, not copied database credentials.
- A separate mounted persistent `/backup` volume, without replacing/remounting the existing verified independent backup volume.
- `RECOVERY_MIGRATION_APPROVAL=backup_restore_verified_then_apply_five_20261020_migrations`, set only for the approved one-shot job.

The script checks environment IDs, private Railway database host, application schema and writable primary, then creates a fresh custom-format `pg_dump`, **restores that dump to a separate temporary database**, verifies existing users/contacts tables, drops the verification DB, and only then applies the **five migrations in one PostgreSQL transaction** with `ON_ERROR_STOP=1`. It verifies all recovery tables and receipt/consent columns, existing user/contact row counts, and logs an explicit completion marker with backup basename. The dump stays on the persistent backup volume. The script contains no Meta sends or flag activation.

Do not enable any `ECOMMERCE_RECOVERY_*` or `ECOMMERCE_CHECKOUT_*` sending switch as part of schema migration.

## One development-store read-only acceptance probe

After the above verified migration, run `npx tsx scripts/ecommerce-recovery-staging-readonly-smoke.ts` **from a separate authorized staging diagnostic job with the app code and referenced staging `DATABASE_URL`**, setting:
- `RECOVERY_TEST_READONLY_APPROVED=true`
- `RECOVERY_TEST_SHOP=whachatcrm.myshopify.com`
- optionally `RECOVERY_TEST_CHECKOUT_GID` for **one already-created, approved test checkout**, never a random real shopper checkout.

The script is non-mutating. It requires the exact staging project/environment, unique installed test merchant, complete recovery schema, tests `abandonedCheckouts` on Shopify Admin GraphQL 2026-10 for **read_orders and manage_abandoned_checkouts** authorization, and if the approved checkout GID exists, performs a fresh Shopify purchase/order recheck. It reports only sanitized outcomes: schema, API authorization, number of observed checkouts (max 25), completed/eligible state, and whether a *matching, current, signed WhatsApp-specific* consent exists. No credentials, GIDs, URLs, customer names or phone numbers are printed.

A missing explicit checkout ID means only API/schema smoke passed; it **does not** mean an abandoned checkout journey passed. No new `cartCreate` is authorized, and **no WhatsApp message is sent**.

## Still required for customer-message acceptance

1. Merchant-reviewed checkout reminder disclosure, current approved Meta marketing template, and a signed WhatsApp opt-in for the designated test shopper, or report consent missing.
2. Approved current developer-store abandoned checkout, exact live Admin API permission, verified identity and checkout URL.
3. Only after separate explicit authorization: enable *test-store-only* scheduler and send gates and check one approved reminder, matching Meta delivery receipt, purchase cancellation, STOP revocation and no second send under retry.
4. Review backups/privacy erasure and any provider acceptance uncertainties before merchant-wide activation.

The migration runner and read-only probe should be run only when Railway permits service deployment and the correct stage credentials can be referenced. Passing CI or creating these scripts is **not** proof they ran.