# One authorized production privacy-alert transport test

Preparation only. This procedure does not authorize merge, deployment, infrastructure,
production permissions/settings changes, or sending. The staging procedure remains
staging-only. Railway app/runner identities and receiver URLs are supplied independently. The reviewed
Neon production identities below are pinned in source; runner variables cannot redirect them.

## What this verifies

The deployed production receiver must reject anonymous and incorrect Bearer tokens
with 401 and accept the correct token far enough to return `503 delivery_disabled`.
The deployed receiver remains disabled. An isolated loopback-only instance of the
same receiver validates authentication/idempotency and dispatches one fixed synthetic
notification through the existing `sendEmailDetailed` Resend transport. Recipient:
`support@whachatcrm.com`; subject: `PRODUCTION TEST — Shopify Privacy Alert`.
The body explicitly says no customer data, privacy request or action is involved.

This is an authentication and transport smoke test. It does not exercise the live
production outbox worker, a real issue, Admin reporting, customer records or erasure.
It imports no app startup, migrations, cron or deletion adapters. It never sets the
production web service's alert URL or enables its email flag. No production app
release is needed to execute the separately built reviewed runner.

## Existing durable persistence and minimum permissions

The existing `public.shopify_privacy_erasure_tasks` table is the persistence
mechanism. No new table, column, index, migration or database is created. One fixed
synthetic row is inserted **completed from birth** with `status=smoke_consumed`,
`request_kind=privacy_email_smoke`, no required checks and `next_attempt_at=infinity`.
Both existing worker claims and current-issue queries exclude completed rows. No
outbox alert, payload, customer or Shopify request is inserted. One `checks` update
stores the sanitized receipt. The row is not counted as `verified_complete`.

Fixed primary key: `8b0b231e-a197-4bda-982a-397ec42b2b0c`.
Fixed dedupe key: `production-privacy-email-once-v1`.
An acknowledged autocommit insert consumes the authorization before the provider
boundary. Concurrent runners, restarts, rebuilds and variable changes cannot consume
it again. A lost commit acknowledgment stops without sending; the committed row
still blocks replay. A local burn prevents multiple invocations in the winning
process. Resend receives a fixed idempotency key as additional protection.
There is **no retry**, even on definite rejection or uncertain acceptance.

The synthetic row is a permanent replay tombstone. Retain it and its receipt after
runner cleanup. Do not delete, reset or change its IDs to retry. Database restoration,
manual deletion or moving execution to another database can remove the guarantee;
operator recovery/retention policy must preserve this tombstone. An ambiguous send
must be reconciled with Resend, never repeated. Exactly one acceptance cannot be
guaranteed through a provider outage; the guarantee is at most one invocation.

Separate approval is required for the strictly necessary synthetic INSERT and
receipt UPDATE. Use an **existing approved restricted database login** via a secret
reference, not the app's `DATABASE_URL`. Its minimum privileges are:

- CONNECT to the existing Neon `neondb` database; USAGE on `public`.
- Read-only catalog visibility for `pg_settings`, `pg_roles` and the task primary-key metadata.
  No `pg_control_system()` or elevated monitoring role is needed.
- No SET privilege on `neon.project_id`, `neon.branch_id` or `neon.endpoint_id`.
- INSERT on task columns `id,dedupe_key,request_kind,status,completed_at,deadline_at,next_attempt_at,required_checks,checks`.
- SELECT on `id,dedupe_key,request_kind,status,completed_at`; UPDATE on `checks` only.
- No elevated role flags, database/schema CREATE, DELETE, TRUNCATE, UPDATE on status,
  other table privileges, customer reads, or role memberships granting broader access.

The runner rejects an elevated role, CREATE, DELETE, TRUNCATE and status UPDATE.
An operator must independently inspect remaining privileges and role memberships;
these checks are defense in depth, not a substitute for permission review. If this
approved login/reference or permission to inspect database identity is missing,
**stop**. Role creation/grants are production configuration changes requiring
separate approval; this PR includes no provisioning or grant script. Do not fall
back to app credentials. If persistence cannot be approved, do not send.

## Runner-only configuration (after separate approval)

### Independently verified Neon production identity

On 2026-10-14, authenticated Neon control-plane reads confirmed:

- Project: `fancy-truth-71283112`.
- Production branch: `br-lucky-salad-anatrtle` (named `production`).
- Database: `neondb` (owner `neondb_owner`, which the runner must never use).
- Read-write endpoint: `ep-polished-boat-an973ovy`.
- Direct hostname: `ep-polished-boat-an973ovy.c-6.us-east-1.aws.neon.tech`.

A separately routed, read-only query of server catalog metadata on those explicit
project/branch/endpoint/database IDs returned the same `neon.project_id`,
`neon.branch_id` and `neon.endpoint_id`. Project/branch settings were `postmaster`;
the deployed endpoint setting was `superuser`. No merchant tables, rows or credentials
were read. These non-secret identities are pinned in reviewed source. This metadata
check used the connector's existing access; it does **not** establish that a suitable
least-privilege runner login exists or has approved permissions.

The runtime requires a direct connection and forces TLS certificate/hostname
validation (`rejectUnauthorized: true` with the pinned SNI hostname). Only optional
`sslmode=verify-full` is accepted in the URL; it is removed before constructing the
Pool so pg URL options cannot override the explicit verified TLS configuration.
Pooled hosts, other databases, role substitutions, SSL downgrades and URL options
are rejected. Hostname is a transport constraint, never proof of tenant identity.

On the **same pinned database session** used for the guard and receipt writes, the
runner validates `current_database()=neondb`, schema `public`, and current/session
user both equal the independently approved restricted login. It requires registered
`pg_settings` entries to match the pinned Neon project/branch/endpoint IDs. Project
and branch must be postmaster-only; endpoint must be postmaster/superuser-only; the
login must have no SET privilege for any of them. Merely setting custom GUC placeholders
cannot satisfy this check. Missing, empty, mutable, inaccessible or mismatched
metadata is a hard stop; no hostname-only or `pg_control_system()` fallback exists.
The pinned connection does not reconnect before consuming authorization.

Neon's [server implementation](https://github.com/neondatabase/neon/blob/main/pgxn/neon/libpagestore.c)
defines these registered identity settings. Their visibility/context is checked on
the deployed server rather than assumed from the latest source. Reverify the
control-plane manifest and restricted-role access before execution. A changed
endpoint requires a reviewed source update; never automatically repin from the
connection under test. Independently verify Railway app/runner identities and the
receiver domain separately. Sender/key authorization remains unverified.

Prepare one domainless service named `production-privacy-email-once`, pinned to the
reviewed commit and `/railway/privacy-production-smoke.json`, repository root `/`.
One replica, restart policy Never, no cron, public/private domain, healthcheck,
pre-deploy command, volume, app start command or automatic GitHub deploys. The
Dockerfile starts only this script; the receiver binds to `127.0.0.1`. The two-minute
watchdog bounds execution. Keep authorization absent while reviewing setup.

All variables below are service-scoped. Never set shared or web app variables.
Secret values must be existing secure Railway references; never copy their plaintext
into commands, logs, PRs or source. Do not attach the app's full environment.

| Variable | Required value |
| --- | --- |
| `PRIVACY_SMOKE_PROJECT_ID`, `PRIVACY_SMOKE_ENVIRONMENT_ID` | Independently verified production UUIDs |
| `PRIVACY_SMOKE_RUNNER_ID` | Literal independently verified new runner UUID; never self-reference the runtime ID |
| `PRIVACY_SMOKE_APP_ID` | Verified existing Railway app UUID, distinct from runner |
| `PRIVACY_SMOKE_APPROVED_APP_ORIGIN` | Independently verified HTTPS production origin, e.g. `https://app.whachatcrm.com` |
| `PRIVACY_SMOKE_RECEIVER_URL` | That origin plus `/api/internal/shopify/privacy-alerts` |
| `PRIVACY_SMOKE_NEON_PROJECT_ID` | `fancy-truth-71283112`; must equal the independently verified source pin |
| `PRIVACY_SMOKE_NEON_BRANCH_ID` | `br-lucky-salad-anatrtle`; must equal the source pin |
| `PRIVACY_SMOKE_NEON_ENDPOINT_ID` | `ep-polished-boat-an973ovy`; must equal the source pin |
| `PRIVACY_SMOKE_DATABASE_NAME` | `neondb`; must equal the source pin |
| `PRIVACY_SMOKE_DATABASE_ROLE` | Independently approved existing least-privilege Neon login; never `neondb_owner` |
| `PRIVACY_SMOKE_DATABASE_URL` | Existing approved restricted Neon login reference, direct pinned host and `/neondb`, optionally `?sslmode=verify-full`; not `${{App.DATABASE_URL}}` |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SHOPIFY_PRIVACY_ALERT_TOKEN` | References to existing production sending key, sender and rotated token |
| `PRIVACY_SMOKE_RESEND_VERIFY_KEY` | Existing Resend account credential permitted to GET the verified sender domain, runner-only reference |
| `PRIVACY_SMOKE_RESEND_DOMAIN_ID` | Independently verified Resend UUID for `crm.whachatcrm.com` |
| `PRIVACY_SMOKE_SENDER_APPROVAL` | `VERIFIED SENDING KEY AUTHORIZED FOR noreply@crm.whachatcrm.com`, only after operator checks key scope/domain authorization in Resend |
| `SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED` | `false` |
| `SHOPIFY_PRIVACY_S3_DELETE_ENABLED` | `0` |
| `PRIVACY_SMOKE_AUTHORIZE` | Initially absent; after execution approval: `SEND ONE PRODUCTION PRIVACY TEST EMAIL TO support@whachatcrm.com` |
| `PRIVACY_SMOKE_EXPIRES_AT` | Initially absent; approved explicit UTC ISO timestamp within the next hour, allowing build time |

Railway supplies runtime identities; do not override them. Sender is strictly
`WhachatCRM <noreply@crm.whachatcrm.com>` or the bare address. Before sending, a
read-only Resend domain lookup must report the matching ID/name, `verified` status
and sending capability `enabled`. The domain lookup does not prove which domain a
sending-only key is authorized for: the operator's independent key-scope review
is mandatory. If the inspection credential or scope evidence is absent, stop.
Do not generate a new key as a fallback. The eventual send remains the definitive
provider check of the sending key's permission.

Do not configure `DATABASE_URL`, Admin/session secrets, Shopify API/request secrets,
evidence credentials or S3 deletion credentials. No Admin login or real records
are needed. Do not configure ongoing alert delivery on the production app.

## Exact execution and cleanup plan

1. Review/approve this PR and CI results. Independently verify the non-secret target
   manifest, sender/key authorization and restricted role. Approve merge separately
   if desired; runner deployment can pin the reviewed commit without app deployment.
2. Obtain separate approval to create/configure/deploy this disposable runner,
   reference only the listed secrets, insert the fixed completed synthetic guard,
   update its receipt, and retain that guard permanently. If any minimum setup is
   missing, stop and report it before executing.
3. Prepare the domainless service with authorization absent. Review its actual
   Railway source SHA, identities, restart policy, replica count, lack of domains,
   cron and automatic deploys, and secret-reference names without printing values.
4. Obtain approval for the concrete reviewed setup and one bounded send window.
   Set only runner authorization/expiry. Deploy it **once**. Start command:
   `node dist/privacy-production-smoke.cjs --send-one-production-test`.
5. The runtime validates configuration, restricted role and database identity,
   probes production authentication/disabled delivery, verifies the Resend domain,
   checks its private receiver, consumes the guard, then invokes Resend once.
   It verifies private replay adds no provider call and probes production remains
   disabled. Any failure is terminal. Never retry an attempted or ambiguous send.
6. Capture sanitized `resendAccepted`, genuine UUID `providerMessageId`,
   `providerCalls: 1`, receipt result and production-disabled checks. A 2xx Resend
   response with a valid message ID establishes provider acceptance, not inbox
   receipt. Reconcile lost acknowledgments in the existing Resend account.
7. Remove runner authorization and all secret references, then delete the temporary
   service, including on failure. Verify deletion in Railway. Retain only the fixed
   synthetic database tombstone/receipt and sanitized execution evidence. No database
   deletion is part of cleanup. Keep production automatic privacy emails disabled.

## Validation

`node --import tsx --test tests/shopify-privacy-production-smoke.test.ts` tests identity,
authorization/expiry, verified TLS, wrong/missing/spoofable Neon identity metadata,
database/login mismatches, dangerous configuration, disabled authenticated receiver,
live domain-verification failures, restricted role, PostgreSQL uniqueness races,
lost commit acknowledgment, restarts and provider rejection/timeout. CI uses the
explicit disposable localhost `whachat_shopify_test` database; local fallback uses
embedded PostgreSQL (PGlite). All external HTTP/provider calls are mocked.
The existing privacy receiver/transport suites continue to cover genuine-ID parsing
and authenticated HTTP behavior. CI also compiles the standalone runner bundle.
No test accesses Railway, Resend or production data.
