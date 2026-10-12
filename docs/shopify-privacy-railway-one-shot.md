# Railway one-click staging privacy email test

Review-only implementation based on `ec2969e94bc0ffac0ea24063248910d7d0caeb0f`.
No runner has been created, deployed, enabled or executed. No real email has been sent.

Use a temporary, domainless Railway service named **staging-privacy-email-once** in
project `1d22ff35-a259-4977-9375-377dda1cdd2b`, environment
`43e4c163-6da9-4be5-ad93-0a3534234613` (`staging`). Railway supports an exiting
service with [restart policy Never](https://docs.railway.com/deployments/restart-policy).
It needs no SSH, console, public test endpoint, copied Admin token, cron, volume,
or additional database. After reviewed setup, the operator clicks **Deploy** once.

## Preparation after code review

An authorized maintainer can prepare the service and variables through Railway
dashboard or deployment controls. Keep authorization unset while preparing it;
disable automatic GitHub deployments. Pin the reviewed source commit, repository
root `/`, and config file `/railway/privacy-email-smoke.json`. Do not select this
config for the web app. Use one replica in `us-east4-eqdc4a`, no cron, no domains,
no healthcheck, no pre-deploy command and restart policy **Never**. The Dockerfile
builds only the existing smoke script with esbuild and starts no web app or erasure
scheduler. The private receiver binds only to `127.0.0.1`.

Check the Railway control-plane identity and source of **Postgres-JSIn**, ID
`88d5aec0-1cf7-4fe1-9084-5745a97736bd`. This project contains several PostgreSQL
services: selecting one by generic name is unsafe. The independent expected
system identifier is pinned in code to **7695281403431092283**, from the previous
verified database-service observation. It is never learned from the connection
under test. The runtime revalidates `pg_control_system()` against that pinned
identifier on the actual connected database, both before any writes and before
sending a staging snapshot. It also checks database `railway`, schema `public`,
non-loopback server address, the staging bootstrap marker, and migration 0106
columns/current-issues view. A failed or unavailable query refuses the test.
The current implementation session verified Railway inventory, but did not make
a live SQL identity query. Runtime revalidation is still pending the reviewed run;
do not claim the supplied identifier has been independently reobserved today.

## Runner-only variables

Keep these variables service-scoped. Never create shared email-enabling variables.
References below are Railway references, not manually copied credentials.

| Variable | Value / purpose |
| --- | --- |
| `DATABASE_URL` | `${{Postgres-JSIn.DATABASE_URL}}`; existing verified staging PostgreSQL |
| `RESEND_API_KEY` | `${{WhachatCRM Staging App.RESEND_API_KEY}}`; existing transport, no new key |
| `RESEND_FROM_EMAIL` | `${{WhachatCRM Staging App.RESEND_FROM_EMAIL}}`; existing allowlisted sender |
| `SHOPIFY_PRIVACY_ALERT_TOKEN` | `${{WhachatCRM Staging App.SHOPIFY_PRIVACY_ALERT_TOKEN}}`; existing receiver authentication |
| `SESSION_SECRET` | `${{WhachatCRM Staging App.SESSION_SECRET}}`; existing Admin token HMAC secret, must be at least 32 characters and not the default |
| `SHOPIFY_PRIVACY_ALERT_URL` | `https://whachatcrm-staging-app-staging.up.railway.app/api/internal/shopify/privacy-alerts` |
| `SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED` | `false`; runner enables only its in-memory receiver after authorization |
| `SHOPIFY_PRIVACY_SMOKE_TEST` | `1` |
| `SHOPIFY_PRIVACY_SMOKE_MODE` | `railway-one-shot-v1` |
| `SHOPIFY_PRIVACY_SMOKE_RUNNER_SERVICE_ID` | Literal UUID of the independently verified new isolated service; do not reference `${{RAILWAY_SERVICE_ID}}` or infer it inside the runner |
| `SHOPIFY_PRIVACY_SMOKE_DATABASE_SYSTEM_ID` | `7695281403431092283`; must match the independent code pin |
| `SHOPIFY_PRIVACY_S3_DELETE_ENABLED` | `0` |
| `SHOPIFY_PRIVACY_SMOKE_AUTHORIZE` | Initially absent. After approval: `SEND ONE STAGING PRIVACY EMAIL TO support@whachatcrm.com` |
| `SHOPIFY_PRIVACY_SMOKE_AUTHORIZATION_EXPIRES_AT` | Initially absent. After approval: explicit UTC ISO timestamp in the next hour, allowing enough time for build/start |

Railway provides the project/environment/service IDs, service name and environment
name. Do not override those runtime identities. The explicit service UUID allowlist
must be independently checked in Railway and cannot equal the web app or database
service. Do not provision evidence variables or archive/provider deletion credentials.
The runner rejects configured evidence, deletion credentials or an enabled S3 adapter.

`SESSION_SECRET` gives the runner access to the existing Admin gate. On the verified
DB it reads the already initialized Admin password hash and computes the existing
HMAC token in memory; it neither creates an Admin password nor logs, stores or
copies an Admin token. The deployed Admin request must succeed before any provider
call. If the staging Admin is uninitialized or the explicit secret is absent,
short or default, the job fails closed; fix normal staging Admin configuration
before authorizing a new reviewed job. Remove the temporary service's secret
references after the test. No new provider or Admin credentials are needed.

Keep **WhachatCRM Staging App** service `7663b193-b936-41cd-a810-a4940d9912fc`
persistently configured with `SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED=false`.
Its start command and deployment configuration are untouched. Before inserting
anything synthetic, the runner confirms the deployed receiver rejects anonymous
POSTs with 401 and authenticated POSTs with `503 delivery_disabled`.

## Reviewed one-click run and result

Once the service configuration and authorization variables are reviewed, click
**Deploy** on the isolated service (or accept its explicitly scoped pending deployment).
It consumes the fixed logical job `railway-privacy-email-ec2969-v1` before creating
the random synthetic operation. No deployment ID or variable change resets that
job. Rebuilds, restarts, concurrent replicas, expiry, failures and ambiguous
provider acceptance cannot cause a second run to send another email.

The existing script queues a synthetic permanent-failure alert with no merchant
or customer data; uses the existing scoped outbox worker, authenticated receiver,
Resend transport and immutable provider idempotency key; verifies one accepted
message ID and exactly one provider attempt; exercises duplicate worker/receiver
delivery; and checks the actual deployed Admin → Privacy response reports
`permanent_failure` / `accepted`. The recipient is `support@whachatcrm.com` and
subject is **STAGING TEST — Shopify Privacy Alert**. Provider acceptance is not
inbox receipt: confirm receipt in that mailbox separately.

Look for `stage: verified` with `resendAccepted: true`, `providerCalls: 1`, an
accepted provider message ID, followed by `cleanup: test_records_removed`.
The alert is visible via the actual Admin route during verification; cleanup
then removes it, so it should not remain in Admin after completion.
The process exits; `Never` prevents automatic restart. A 180-second watchdog also
terminates a hung run. An exit or Railway deployment status alone is not proof
that email succeeded; inspect the sanitized verification and cleanup logs.

Cleanup deletes only the random task whose ID, `staging-privacy-smoke:` dedupe
marker and permanent-failure status all match. Existing FK cascades remove its
alerts. One staging-only metadata table, `public.shopify_privacy_smoke_jobs`, is
created after identity verification. Its consumed tombstone and sanitized receipt
remain intentionally: deleting it would permit replay after synthetic cleanup.
It contains job/task IDs, time, result and provider message ID, no credentials,
merchant/customer payload or Admin token. No general app migration is required.

Failures consume authorization too. Definitive provider rejection, timeout,
malformed response or uncertain acceptance all fail the smoke test; the wrapper
allows at most one provider invocation and never resets the logical job. Existing
normal privacy retry behavior is unchanged. Do not delete the tombstone or rotate
the fixed job key to retry. A new attempt needs a separate reviewed code change.
On hard kill, cleanup may not run; the tombstone still prevents replay. Reconcile
provider acceptance and remove only the task owned by the receipt using the same
ownership check, through a separately reviewed maintenance action.

After reviewing logs and inbox receipt, remove authorization and secret references,
then remove the temporary service when approved. Keep the tombstone. Never enable
the runner in production; exact project/environment gates reject other contexts.

## Regression validation

The existing PostgreSQL receiver/worker suite covers authentication, actual outbox
state, successful transport acceptance, duplicates, uncertain retry behavior,
Admin status and scoped cleanup. New tests cover isolated identity, authorization
expiry, pinned database identity, one provider invocation on every outcome,
atomic durable consumption and replay after failure/new operation IDs. CI runs
both with disposable PostgreSQL; all provider responses are mocked. Local tests
must use `SHOPIFY_TEST_DATABASE_URL` on `localhost`/`127.0.0.1` database
`whachat_shopify_test`, never staging.
