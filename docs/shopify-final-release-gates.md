# Shopify final release gates — October 13, 2026

## Current disposition

**Production launch remains blocked.** PR #59 is mergeable after the ancestry-preserving development merge `6d12d442285a0767b5656538a74aa1a2592ba263` (parents `4d7958aa82ec4ed229b377feb4534e9c31287fe9` and production `112ea8c61be69640ec5f63430d32ca7f7ce901f4`). The merge tree equals the previous development tree exactly. The sole import conflict retained privacy, sales-admin login and password policy imports. Production was not merged or deployed. PRs #74/#75 remain included. All three CI checks on that merge succeeded: onboarding run 38471316847, contact privacy 38471316889, bootstrap 38471316877.

| Gate | Result | Remaining evidence |
|---|---|---|
| PR #59 conflict/ancestry | Passed; real merge pushed to development; GitHub mergeable=true | Keep CI green on the final head and recheck before owner launch |
| Interrupted-order recovery | Local PostgreSQL harness passed; real staging unverified | Run the staging-only command below with authorized DB access; deployed HTTP/provider acceptance remains separate |
| Migrations | Ordered local replay and merchant compatibility verified; production unverified | Read-only production schema inventory, backup evidence and restore rehearsal |
| Privacy operations | Encryption/receipt/worker/alert tests pass; production blocked | Three missing secrets, named primary/backup operator, monitored alerts, fulfillment and genuine provider evidence |

## Access blockers and safe commands

Railway staging project is `1d22ff35-a259-4977-9375-377dda1cdd2b`, environment `43e4c163-6da9-4be5-ad93-0a3534234613`, database service `88d5aec0-1cf7-4fe1-9084-5745a97736bd`, app `7663b193-b936-41cd-a810-a4940d9912fc`. Connected OAuth returns variable **names only**, not database credentials. The managed workspace has no database credential binding, no TCP destination grants and no VPN. Railway CLI is absent. Elevated Git fetch worked, but does not supply DB credentials or database authorization. No production/staging DB query was attempted with guessed credentials.

Production project `2adeea49-431c-4ddf-8815-9ce89af66f32`, environment `fa2e8c30-72ea-4688-877f-4a68e24198bc`, app service `a7b75139-5bf8-4a02-b4ab-b7d12e17e770` is still sourced from `main`. Production names-only inspection confirms `DATABASE_URL` exists, while `SHOPIFY_PRIVACY_REQUEST_KEY`, `SHOPIFY_PRIVACY_EVIDENCE_KEY`, `SHOPIFY_PRIVACY_ALERT_TOKEN` and alert URL/email activation are absent. Presence of Resend names does not establish delivery permissions or monitoring. No secrets were created, read, changed or exposed.

From a checkout of this candidate, in an authorized **staging** shell with the staging database connection injected securely:

```sh
RAILWAY_PROJECT_ID=1d22ff35-a259-4977-9375-377dda1cdd2b \
RAILWAY_ENVIRONMENT_ID=43e4c163-6da9-4be5-ad93-0a3534234613 \
SHOPIFY_RECOVERY_DATABASE_URL="$DATABASE_URL" \
SHOPIFY_RECOVERY_FIXTURE_ACK=isolated-staging-schema \
node --import tsx scripts/verify-shopify-order-recovery.ts
```

The trusted operator must verify that the injected URL is actually the staging PostgreSQL service; environment ID guards cannot authenticate a mislabeled URL. Requires CREATE SCHEMA permission. Uses a random schema, fixture-only identities and an in-memory random webhook signing key. Executes the production order handler, mapping, commerce functions and privacy fence, with SQL-backed fixture storage adapters. Eight concurrent retries contend on the real PostgreSQL advisory fence. Fault injection is only in the fixture activity adapter. No deployed endpoint, merchant workflow, provider API, credential or production schema is touched. Final output contains counts/build SHA only. The script drops only its generated schema in finally; if killed, an operator may remove the recorded fixture schema after verifying its fixture tables. Do not add a fault toggle to the running staging app. This does not prove the full deployed HTTP route, actual storage hooks or Shopify provider retry schedule; record those limitations and any remaining live acceptance separately.

For **read-only** production verification, use a least-privilege account/service definition configured securely outside shell history:

```sh
PGSERVICE=whachat-production-readonly psql -X -v ON_ERROR_STOP=1 \
  -f scripts/verify-shopify-production-schema.sql > production-schema-metadata.txt
```

The script opens BEGIN READ ONLY with short statement/lock timeouts, reads only catalog metadata, and ends with ROLLBACK. Compare all listed columns, defaults, FKs, indexes and view definition with the five reviewed migration files. NULL/present=false is an unverified/missing prerequisite, not a passing migration. Verify the deployment's migration ledger separately; do not infer applied migration history from a running app. No production migrations/reset/db:push commands are supplied or executed here.

## Migration ordering, compatibility and release procedure

Required sequence: 0082 onboarding emails → 0084 one-trial ledger → 0104 merchant contact/external erasure base → 0105 task deadlines/leases/checkpoints, alerts, customer locks and encrypted payloads → 0106 alert acceptance/reconciliation, active-occurrence partial uniqueness and current-issues view. Earlier application schema migrations must already supply users and the existing Shopify/trial columns. `gen_random_uuid()` must be available; do not install extensions automatically. 0082 explicitly inspects public schema, so verify public is the intended application schema and restrict search_path for execution.

0082 stamps historical installed merchants once, avoiding a welcome-email blast; replay must leave new merchant send-once stamps untouched. 0084 retains dated histories, blocks conflicting/unknown histories and does not grant or extend user trials; the shop unique index and allowed-status CHECK are essential. Backfill uses ON CONFLICT DO NOTHING. Existing duplicate canonical shops in a pre-existing ledger require reviewed correction before adding uniqueness; do not delete ledger history. Its user FK uses ON DELETE SET NULL. 0104 merchant contacts cascade with the user; privacy tasks deliberately contain no raw selectors. 0105 deadline backfill preserves existing deadlines; suppressions remain independent of completion. 0106 changes uniqueness to one unresolved occurrence, retains historical resolved alerts and accepted email records, and serializes its changes with advisory lock 1060107. Do not remove that index or acceptance history during rollback.

Local PostgreSQL validation applies every file twice in order, then replays the whole sequence with existing suppression, a preserved deadline, resolved/active alerts and a newly installed merchant. It checks trial histories, statuses and absence of re-stamping. IF NOT EXISTS prevents duplicate objects; it does not repair drifted columns/defaults or incorrect same-name indexes. Catalog inspection is required. DDL and historical updates can take locks; measure against a restored clone, use reviewed lock/timeouts and an ordered migration ledger. 0106 owns BEGIN/COMMIT: do not blindly nest it inside a wrapper transaction. Startup schema patch parity should be checked; startup availability alone is not a privacy-schema gate.

Before any separately authorized production migration: identify the DB provider/backup owner; obtain a successful recoverable backup, timestamp, region, encryption/access controls, retention, and restoration exclusions; restore it into an isolated clone and measure schema checks/lock duration and recovery time. Confirm RPO/RTO with the owner. A backup job being enabled is not evidence of successful restoration. Review pending tasks and accepted alerts using restricted access. Keep Shopify ingestion fenced until readiness is established.

Prefer forward correction of additive columns/indexes/views. Application rollback must retain production authentication fixes and suppression enforcement; preserve trial ledgers, encrypted support records, erasure tasks and accepted email history. Never drop privacy tables or roll back by reintroducing erased data. If older code cannot enforce suppressions, an authorized gateway operator must return retryable failures for affected Shopify ingestion while preserving other channels. After restore, reapply all erasures/suppressions that occurred after the snapshot before enabling ingestion, exports or workers. No production backup/restore evidence was available during this task.

## Secure production privacy setup — owner action only

Yaniv Haramaty is the designated primary privacy owner, backup oversight owner, backup operator and incident escalation owner. The proposed monitored destination is `hello@whachatcrm.com`; mailbox operation and successful delivery are **unverified**. These assignments were provided by the owner in this task. There is currently one accountable person; coverage during unavailability must be arranged operationally. Set these in the restricted operations register before release, including escalation contacts and acknowledgment coverage. Proposed operating targets for owner acceptance: inspect queue/worker health at least every five minutes; acknowledge actionable alerts within one hour; escalate unacknowledged alerts to backup then incident owner; daily review of outstanding provider checks; three-day approach-to-deadline and overdue escalation. The current task deadline defaults to 30 days; legal/operator review must validate applicable deadlines. These targets are proposed procedures, not evidence they are running.

Use the approved password/secret manager to generate independent values: request key = 32 random bytes encoded as 64 hex characters; evidence key = independent >=32 random bytes encoded base64url; alert token = another independent 32 random bytes encoded base64url (implementation accepts 32–256 characters). Never reuse staging or Shopify API secrets. Do not rotate the Shopify API secret casually: suppression hashes depend on it. Do not create/overwrite/rotate these production secrets automatically. If using an offline generator, the **owner** can run the following once in a protected encrypted temporary directory, then import the file into the secret manager without logging it:

```sh
umask 077
node --input-type=module <<'NODE'
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
writeFileSync('privacy-production-secrets.json', JSON.stringify({
  SHOPIFY_PRIVACY_REQUEST_KEY:randomBytes(32).toString('hex'),
  SHOPIFY_PRIVACY_EVIDENCE_KEY:randomBytes(32).toString('base64url'),
  SHOPIFY_PRIVACY_ALERT_TOKEN:randomBytes(32).toString('base64url')
}), {mode:0o600,flag:'wx'});
NODE
```

This task did not run that generator. Import via Railway's production service Variables UI with no screenshots/chat/logs; verify names only. Preserve existing app identity, session and API keys. Owner approval for setting variables/deployment remains separate. Remove the temporary file under the organization's secure storage procedure; ordinary unlink alone is not proof of irreversible deletion. Store request/evidence key versions and access audit records securely. Rotation needs a reviewed payload re-encryption and receipt transition plan.

Validate the production receiver path `/api/internal/shopify/privacy-alerts` after the candidate is separately deployed; use a disposable task and explicit owner approval for a real notification. Configure `SHOPIFY_PRIVACY_ALERT_URL` to the verified HTTPS receiver and independently generated token. Enable email only after verified Resend sender/permissions, receiver readiness and monitored delivery are demonstrated. The receiver's outbox acceptance is not proof a human received or acknowledged an alert. Exercise invalid-token denial, outage/retry, uncertain provider acceptance/reconciliation, accepted-message idempotency and operator escalation. Independently monitor cron/worker last success, pending/blocked/overdue counts and undelivered or reconciliation-required alerts; a broken app cannot reliably alert on itself. Record authentic provider IDs without raw customer payloads or secret tokens.

## Access fulfillment and erasure procedures

Access requests remain blocked support tasks with AES-256-GCM encrypted selectors; they must not invoke deletion. The format is `v1:ivHex:tagHex:ciphertextHex`, with task ID as authenticated additional data (AAD). A restricted operator obtains only the requested task's ciphertext through authorized read-only DB access, decrypts in a restricted offline process using the matching request key and exact task ID, verifies identity and tenant/shop authority, then collects only relevant current CRM/order/notes data and required processor responses. Never log decrypted selectors, paste them into issues, or recover erased identities from backups. Deliver the export through an authenticated expiring encrypted channel; record delivery/verification metadata in the restricted evidence system. Export preparation alone is not fulfillment. There is no demonstrated automatic access-export fulfillment or complete audit trail; operator procedure and rehearsal remain launch blockers. Retain/delete temporary exports under an approved policy and preserve genuine completion evidence.

Customer/store erasure must acquire the same shop privacy fence as ingestion, delete only verified fixture/merchant-owned records, remove workflow snapshots/jobs where applicable, and preserve suppression locks against late re-ingestion. Preserve trial eligibility on ordinary uninstall/user removal; store redaction has its existing explicit ledger deletion semantics. Ambiguous identities stay blocked for review. Never use unrelated merchant fixtures or run destructive live acceptance tests without separate authorization. The existing customer/store erasure and concurrency tests passed locally; no real merchant erasure was performed.

Receipts are HMAC-signed, task/check bound, time-limited and tied to coverage through the task's scope, all historical copies and restoration protection. Retention must be enforced irreversibly with documented duration/start time; wait until expiry. A signed assertion by itself does not prove the asserted provider deletion occurred. The evidence signer must inspect genuine provider tickets/receipts and policy evidence and bind their digest. Fixture receipts in automated tests are test data only. Never populate production evidence JSON with example receipts or mark verified_complete from an API acknowledgment alone.

## Processor inventory, retention and restore controls

All six checks remain mandatory: railway_logs, mail_processor, archives, backups, exports, local_review. Inventory every region, mirror, legal hold and downstream copy. For each record actual policy, accountable owner, purge method, time window, evidence location and restore exclusion; leave unknown items pending.

| Surface | Evidence and controls required |
|---|---|
| Railway logs/drains/traces | Govern actual deletion or irreversible retention across retained history, drains and plan-visible archives. UI visibility limits are insufficient. Restrict access and log bodies/selectors; evidence provider scope and dates. |
| Resend/mail processors | Inventory messages, contacts, events/logs and archives; obtain provider confirmation for historical data. Send/contact-delete acceptance does not prove historical message erasure. Confirm mail retention and downstream recipient copies. |
| HubSpot/other exports | Inventory authorized destinations, contact/deal/property histories, recycle bins, exports and backups. CRM archive is not irreversible deletion. Document recipient deletion and automation/export consent; order ingestion remains side-effect disabled. |
| Object storage/R2/S3 | Inventory bucket/prefix, versions/delete markers, replication, caches and lifecycle policies. Use dedicated least-privilege frozen-prefix scope only after approval; default S3 automatic deletion stays disabled. A delete marker is not version purge. |
| Backups/snapshots | Document encrypted backup retention, legal holds and actual purge/expiry; prevent restored customer data from entering live ingestion/exports. Maintain governed erasure/suppression replay without exposing selectors in ordinary reports. |
| Local/historical/mixed records | Inventory support exports, files, caches, developer copies, archives and workflow snapshots. Perform tenant-bound review; do not remove unrelated CRM/messaging data. |

No genuine provider-erasure receipts, completed historical purge, backup restore test, compliance certification or retention policy enforcement was established. These gates stay blocked until the named operator records real evidence.

## Test evidence and limitations

Initial selected tests lacked a DB URL and failed portal import and PostgreSQL alert preconditions; those were environment failures, not counted as passes. Re-run against a disposable localhost PostgreSQL 16 container: 25 selected security/Contacts/order/privacy tests passed, zero skipped. Encryption test verifies fresh IVs, authenticated task binding, plaintext recovery, tamper rejection and invalid-key rejection. Recovery harness output showed 503 → 200, eight concurrent deliveries, one card/activity/contact, zero outgoing/automation/export calls, unread 1 → 1. Storage hooks and provider APIs are replaced with fixture SQL adapters/forbidden-call spies; these are local implementation checks, not real staging or production proofs.

TypeScript baseline on merge head: 97 main diagnostics, 97 candidate, zero added; the repository-wide check remains failing on existing diagnostics. CI includes build validation. Already-confirmed OAuth, customer/order #1001 and staging browser acceptance were accepted and not repeated. Issue #76's outstanding mobile/filter/notes/existing-thread/no-thread and tenant/privacy acceptance, production active app subscriptions/scopes and provider privacy operations must still be completed by authorized operators.


## Owner-directed monitoring and backup follow-up

All three CI checks on development head `2808bd3ccbb4c75522d0bbd484b7428a20b98f54` passed. PR #59 remains open and mergeable; production main remains `112ea8c61be69640ec5f63430d32ca7f7ce901f4`.

The existing privacy worker already automatically tracks deadlines, retries provider checks with leases/backoff, queues approaching-deadline/overdue/configuration/access alerts and delivers through the authenticated receiver and immutable Resend outbox. Those controls are exercised in local PostgreSQL tests. The focused monitoring PR adds an independent **read-only** aggregate probe for overdue requests, the three-day deadline window, manual intervention, due work stalled for 15 minutes, alert delivery stalled for 15 minutes and uncertain-email reconciliation. It does not process tasks or create receipts. It returns only counts, not task IDs/customer selectors. A quiet queue cannot prove worker liveness, and provider acceptance cannot prove operator acknowledgment; both remain explicitly unverified in probe output.

Owner-approved scheduler setup can run every five minutes:

```sh
node --import tsx scripts/monitor-shopify-privacy.ts
```

Inject `SHOPIFY_PRIVACY_MONITOR_DATABASE_URL` securely with SELECT privileges only on the task/alert tables and no schema/table write privileges. Each probe uses BEGIN READ ONLY with statement/lock timeouts. Exit 0 means no queue intervention signals, 1 means operator intervention required, 2 means configuration/connection/schema/probe failure. Configure an independent scheduler/monitor to notify the verified mailbox on nonzero exit or a missed five-minute run, deduplicate repeated failures, and escalate according to the acknowledged operating targets above. Monitor the scheduler itself, app availability and worker execution separately. No scheduler/service, production DB role, secret, email or escalation integration was provisioned or activated in this task. Thus automated monitoring is implemented and tested locally, but operational monitoring remains unverified.

The proposed recipient is configurable through `SHOPIFY_PRIVACY_ALERT_EMAIL_TO=hello@whachatcrm.com` **after verification and approval**. New outbox snapshots freeze the recipient together with sender/body/idempotency key, preserving the recipient on ambiguous retries even if configuration changes. Existing snapshots without a recipient retain the legacy support mailbox; never rewrite accepted/uncertain snapshots just to reroute them. The global support address is unchanged. Invalid recipients fail schema validation. No email activation flag or production recipient was changed, and no real email was sent.

### Railway backup findings

Read-only project inventory and service inspection found only the production app service in the connected production project, with **no attached volumes or database service**. DATABASE_URL is present but its value/host is withheld by OAuth. This establishes neither the location of the production database nor absence of backups: it may be in another Railway project or another database provider. Owner says Railway is the infrastructure provider, but the actual production DB/volume must be mapped before backup status can be verified. Available connected tools expose service/volume inventory but no backup schedule/list or arbitrary authenticated GraphQL query; no Railway CLI/account token is available. No backup configuration, retention schedule, successful snapshot, PITR window or restore capability was inspected on the actual production database.

Railway documentation supports volume backups and scheduled backup retention. Published defaults are daily/6 days, weekly/1 month, monthly/3 months; these are provider capability descriptions, **not this application's configured policy**. Read official references: https://docs.railway.com/guides/postgres-backups-restores and https://docs.railway.com/integrations/api/manage-volumes . PITR capability is described at https://docs.railway.com/volumes/point-in-time-recovery ; availability/configuration/archive retention are not established here.

After privately mapping the actual production database service and volume instance, an authorized operator can inspect the volume Backups tab and use these documented **read-only** GraphQL queries (authenticated through their existing Railway account; never paste a token into GitHub/chat):

```graphql
query PrivacyBackupInventory($volumeInstanceId: String!) {
  volumeInstanceBackupList(volumeInstanceId: $volumeInstanceId) {
    id name createdAt expiresAt usedMB referencedMB
  }
  volumeInstanceBackupScheduleList(volumeInstanceId: $volumeInstanceId) {
    id name cron kind retentionSeconds createdAt
  }
}
```

Record actual volume/service/environment mapping, configured schedules and retentionSeconds, recent successful backups/expiry, failure monitoring, encrypted access, legal holds and PITR enabled/window if applicable. Independently verify restore into an isolated clone, schema/row-count checks, suppression/erasure replay, measured RPO/RTO and exclusion from all live messaging/exports. A list of backup objects alone cannot close recovery verification.

### Actions requiring separate owner approval

- Set the three independently generated production secrets and verified alert URL/recipient; enable privacy email only after real receiver/mailbox delivery testing.
- Provision the restricted monitoring DB role/connection and independent scheduler/escalation channel; verify notifications and missed-run detection with disposable tasks.
- Deploy/merge production, change Shopify published subscriptions/scopes, or perform live merchant acceptance.
- Change backup schedules/retention/PITR, create a production snapshot, or provision/restore a clone and incur related cost. Never restore over the live database during a rehearsal.
- Run reviewed additive production migrations or rotate encryption/evidence/API keys with an explicit transition plan.

Read-only inspection and local tests are already authorized and continue without a new approval request. No privacy/provider erasure, backup/restore or real alert gate is marked complete until actual evidence exists.
