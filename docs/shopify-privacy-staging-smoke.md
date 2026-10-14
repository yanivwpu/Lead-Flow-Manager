# Staging-only Shopify privacy email smoke test

This explicitly invoked command reuses the privacy outbox, scoped worker, authenticated receiver and existing Resend transport. It creates one random-ID permanent-failure operation without merchant/customer selectors or verification evidence. Permanent-failure tasks cannot enter the erasure processor. The recipient remains `support@whachatcrm.com`; the immutable snapshot renders **STAGING TEST — Shopify Privacy Alert**. It never calls Shopify webhooks or deletion adapters.

Delivery is enabled **only in the one-shot process**. The deployed app must remain disabled; the command checks its actual receiver returns `delivery_disabled`. A temporary loopback HTTP listener runs the existing receiver in the same Railway app container; it accepts only this test's alert. The worker uses that receiver, which calls the real Resend transport. This verifies the delivery implementation, not the deployed app's authenticated HTTPS delivery path while disabled. The deployed HTTPS receiver's unauthorized rejection and authenticated disabled response are checked separately.

The command fails closed before writes unless the exact Railway project/environment/app service IDs, internal PostgreSQL host/port/database, receiver URL, explicit invocation, email configuration, independently obtained PostgreSQL **cluster system identifier**, server address, staging bootstrap marker and migration 0106 columns/view all match. There is no localhost/disposable-test bypass. `NODE_ENV=production` is normal for the staging build and does not establish database identity. The smoke sender must already be `WhachatCRM <noreply@crm.whachatcrm.com>` (legacy brand capitalization or the bare same address is accepted); personal or unreviewed senders are rejected without changing configuration.

## Staging database configuration contract

| Setting | Exact staging value |
| --- | --- |
| Database service | `Postgres-JSIn` |
| Database service ID | `88d5aec0-1cf7-4fe1-9084-5745a97736bd` |
| App DATABASE_URL reference | `${{Postgres-JSIn.DATABASE_URL}}` |
| Database private endpoint | `postgres.railway.internal` |

The original preserved Postgres service is not the app's connected database. Railway's current service configuration confirms Postgres-JSIn's private endpoint label is `postgres`. Its host remains allowlisted exactly; changing the service ID does not relax host, cluster-system-ID, schema or any other verification. The app reference above was confirmed in PR #64's blocking review and by the staging operator; the Codex Railway OAuth connection redacts variable values. Before execution, an operator must inspect the app's DATABASE_URL reference in Railway and require this exact source. If it differs, stop for a reviewed correction. Never sample identity from an arbitrary PostgreSQL service or from the app connection itself.

Regression tests compare this non-secret configuration contract and the actual database SSH command against `PRIVACY_SMOKE_TARGET`, including service name/reference and private host. They detect repository documentation/configuration divergence; offline CI cannot detect future live Railway variable drift, which still requires the operator check and independent cluster-identity match.

## Safe Railway execution

Codex has not inspected the live database schema or obtained its cluster identity/credentials. Do not derive the expected cluster ID from the app's `DATABASE_URL`: that would validate the connection against itself. These commands require an authenticated Railway operator with SSH access and the staging Sales Admin token. Never paste keys or tokens into command arguments, logs, PR comments or screenshots.

1. Check out the reviewed PR commit and run the required CI. Deploy that reviewed source **only** to the allowlisted staging app if its smoke artifact is not present. The normal build produces `dist/shopify-privacy-smoke.cjs`.

   ```bash
   railway link --project 1d22ff35-a259-4977-9375-377dda1cdd2b --environment 43e4c163-6da9-4be5-ad93-0a3534234613 --service 7663b193-b936-41cd-a810-a4940d9912fc
   railway status --json
   railway up --service 7663b193-b936-41cd-a810-a4940d9912fc --environment 43e4c163-6da9-4be5-ad93-0a3534234613 --detach
   railway deployment list --service 7663b193-b936-41cd-a810-a4940d9912fc --environment 43e4c163-6da9-4be5-ad93-0a3534234613 --json
   ```

   Require the new deployment to reach `SUCCESS`. Keep `SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED=false` in Railway settings; do not set any persistent smoke variables.

2. Obtain the database cluster ID **independently**, by SSH to the exact staging **Postgres-JSIn** service (not any of the other PostgreSQL services). This is a read-only query and prints only a non-secret numeric identity:

   ```bash
   railway ssh --project 1d22ff35-a259-4977-9375-377dda1cdd2b --environment 43e4c163-6da9-4be5-ad93-0a3534234613 --service 88d5aec0-1cf7-4fe1-9084-5745a97736bd -- sh -c 'psql -U "$PGUSER" -d "$PGDATABASE" -Atc "SELECT system_identifier::text FROM pg_control_system()"'
   ```

   If SSH/query permission or this identity is unavailable, **stop**. Do not create an identity marker, grant database permissions, swap database references, or relax the guard to make the test pass.

3. Open SSH to the exact staging app:

   ```bash
   railway ssh --project 1d22ff35-a259-4977-9375-377dda1cdd2b --environment 43e4c163-6da9-4be5-ad93-0a3534234613 --service 7663b193-b936-41cd-a810-a4940d9912fc
   ```

   In its Bash shell, run the following in a subshell. Input the cluster ID from step 2 and the staging Sales Admin token from the existing authenticated Admin login (the `whachat_admin_token` browser storage value). The token prompt is hidden. Do not enable shell tracing.

   ```bash
   (
     set +x
     read -r -p 'Independently verified staging PostgreSQL system ID: ' SHOPIFY_PRIVACY_SMOKE_DATABASE_SYSTEM_ID
     read -r -s -p 'Staging Sales Admin token (hidden): ' SHOPIFY_PRIVACY_SMOKE_ADMIN_TOKEN
     printf '\n'
     export SHOPIFY_PRIVACY_SMOKE_DATABASE_SYSTEM_ID SHOPIFY_PRIVACY_SMOKE_ADMIN_TOKEN
     export SHOPIFY_PRIVACY_SMOKE_TEST=1 SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED=true
     node dist/shopify-privacy-smoke.cjs --send-one-synthetic-alert
   )
   ```

   Source-checkout equivalent, inside the same verified Railway staging app runtime:

   ```bash
   npm run smoke:shopify-privacy:staging -- --send-one-synthetic-alert
   ```

   It requires the same process-only inputs above; do not run with `railway run` on localhost or substitute a public database proxy.

## Evidence and cleanup

Success requires a real Resend response containing a message UUID, persisted `email_accepted_at`/`provider_message_id`/`delivered_at`, exactly one provider call, queue and receiver replays with no second call, and the **deployed** Admin → Privacy endpoint showing the matching random IDs, `permanent_failure` and `emailStatus=accepted`. Admin uses this endpoint to render its Privacy tab. The test fails if its alert falls outside Admin's existing 50-row window; it does not alter other jobs to make it visible. It prints only stage/status, random operation IDs, message ID and provider-call count.

The `verified` result proves provider acceptance, **not inbox receipt**. Check the support inbox separately if receipt evidence is required. A timeout, rejection, malformed provider acknowledgment, identity failure, or Admin failure exits nonzero with the exact failing stage and whatever acceptance was actually observed. No success is fabricated. Do not rerun an ambiguous provider failure until the support operator checks Resend for that operation: a fresh invocation creates a new operation and could send another test email.

The `finally` block removes only the generated task matching both its random ID and `staging-privacy-smoke:<same ID>` marker, with the expected permanent-failure status. Its alerts cascade; unrelated tasks, encrypted requests, suppression locks and historical verification records remain untouched. The deployed Admin result is checked **before cleanup**; the synthetic row disappears afterward. Process termination/host loss can bypass `finally`. If cleanup reports failure or the process is killed, preserve the random ID and investigate; do not bulk-delete by reason, age or prefix.

After an interrupted run, on the verified staging app runtime with the same independently obtained cluster identity and process-only flag, a reviewed source checkout can run this narrow cleanup (replace the one UUID with the printed test ID):

   ```bash
   node --import tsx --input-type=module -e 'import pg from "pg"; import { verifyPrivacySmokeDatabase, cleanupPrivacySmokeTask } from "./server/shopifyPrivacySmokeSafety.ts"; const p = new pg.Pool({connectionString:process.env.DATABASE_URL,max:1}); try { const c=await p.connect(); try { await verifyPrivacySmokeDatabase(c); } finally { c.release(); } await cleanupPrivacySmokeTask(p,process.argv[1]); } finally { await p.end(); }' '<printed-test-operation-UUID>'
   ```

Do not reset a provider acceptance record to retry an ambiguous send. Normal scheduler processes refuse to send test-marked snapshots outside the verified smoke runtime.

## Regression validation

The Shopify privacy workflow runs pure guard tests plus real disposable PostgreSQL tests for scoped queue/worker isolation, one accepted send across replays, staging-marked snapshot refusal in normal runtimes, unchanged recipient/subject, and ownership-scoped repeat-safe cleanup. Existing Shopify privacy, onboarding and staging database bootstrap workflows remain required. Tests mock Resend and never send live email. The smoke command itself has no test/mock mode.
