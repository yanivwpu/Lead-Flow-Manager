# Shopify privacy operations

This extends PR #60 on the combined Shopify onboarding branch. It does not deploy, merge, connect to production customer data, or certify that historical provider copies have been erased.

## Audit and workflow

The original `shopify_privacy_erasure_tasks` table had a time window, pending status and no lease or schedule. Its processor accepted a bare `verified: true` and deleted tasks. The store handler already used a PostgreSQL transaction and the shop advisory fence; reuse those. The existing one-minute scheduler in `server/cron.ts` now drives privacy processing across replicas using PostgreSQL claims. No Redis or new queue service is required.

Additive migration/startup patch **0105**, after 0104, adds request kinds, dedupe keys, original 30-day deadlines, retry scheduling, token-fenced five-minute leases, verification checkpoints, exception outbox and customer suppression locks. Claims use `FOR UPDATE SKIP LOCKED`; checkpoints/lease renewal/completion require the current unexpired token. Each adapter call is bounded by a two-minute task timeout and cancellation; leases renew every 30 seconds. Destructive operations must remain idempotent if a network call outlives cancellation. A crash resumes from committed checks. API failures retry from one minute exponentially to one day; eight failed processing attempts block the request for intervention. Configuration failures poll hourly without exhausting retries. Retention checks wait until the evidenced expiration, polling at most daily. Completed tasks retain minimal verification digests and dates, rather than being silently deleted.

Mandatory checks are `railway_logs`, `mail_processor`, `archives`, `backups`, `exports`, and `local_review`. Configuration cannot remove these checks. These represent the **entire** approved inventory for that category, including connected processors, drains, mirrors and restores. All checks require explicit evidence; a missing adapter is blocked, never skipped. An operator may attest that a category is not applicable only after inventory review, using a signed task-bound receipt. A generic boolean acknowledgment is rejected. Provider acknowledgments do not satisfy other categories.

Customer deletion replaces the old phone/chat-only handler. The signed header and body domains must match; raw-body HMAC validation remains mandatory. A transaction under the existing shop lock matches Shopify customer IDs, then attributable phone/email copies if IDs are absent, within the owning tenant. Explicit conflicting customer IDs win over phone/email. Matching contacts, associated conversations/messages, legacy chats, activities, delayed jobs, workflow snapshots and webhook payloads are removed through existing cascades/orphan cleanup. Suppression HMACs are scoped to shop plus customer identity; signed late customer/order events check them inside the same ingestion fence. Rollback leaves neither a task nor a suppression lock. Deleted identities are never recovered from backups to construct provider selectors.

`customers/data_request` uses a distinct **access_request** path. It queues encrypted, restricted support selectors and a fulfilment alert. It never enters the erasure worker, deletes records, or marks a customer erased. Access fulfilment remains a verified support procedure; fulfil the export before setting the request completed. Missing encryption configuration returns 503 so Shopify can retry rather than losing the request. Ambiguous deletion requests similarly preserve a restricted encrypted review record; they remain blocked until scoped review confirms local erasure. Unknown historical/mixed records require `local_review` evidence even when automatic matching finds no records. Access and erasure dedupe keys are distinct. Signed store webhook deliveries deduplicate by payload plus Shopify webhook ID; customer requests deduplicate by the signed request payload. Legacy tasks lacking a dedupe key are preserved individually.

## Railway configuration (before any release)

- Apply 0104 then 0105, or verify the corresponding repeat-safe startup patches succeed. Do not enable processing against a partially migrated schema. Scheduler schema readiness is checked before a tick; webhook transaction failure is retryable.
- Keep the normal app instance running for the one-minute scheduler. Alternatively, a Railway cron service can run `npx tsx scripts/process-shopify-privacy.ts` from the same reviewed source with the same database and configuration; do not use that command in the production `dist` image without packaging tsx/source. Multiple workers share leases. This PR does not create or configure any Railway service.
- `SHOPIFY_PRIVACY_REQUEST_KEY`: independent 32-byte AES-256-GCM key, supplied as 64 hex characters. Required for access/ambiguous-request encrypted payloads. Maintain securely with the restricted support operator; do not rotate without re-encrypting pending payloads. AAD binds ciphertext to the task ID. These payloads must not be sent to ordinary Admin endpoints/logs, and must be removed after verified fulfilment/review under the privacy policy.
- Keep `SHOPIFY_API_SECRET` stable while suppression hashes exist. Rotate it only with a reviewed suppression-hash migration or a conservative ingestion suspension; hashes cannot be rebuilt from erased identifiers. Losing or changing it without this procedure invalidates replay suppression.
- `SHOPIFY_PRIVACY_ALERT_URL`: dedicated HTTPS operator webhook; `SHOPIFY_PRIVACY_ALERT_TOKEN`: at least 32 characters. The receiver must durably deduplicate **Idempotency-Key**, including when the sender times out after receipt. Requests use a ten-second timeout and no redirects. No merchant address, domain, user ID, customer ID, selectors or provider error bodies are sent. Only random operation ID, status, reason, deadline and bounded action text. When unavailable, retry delivery with capped backoff; the durable alert is still visible in Admin. Missing outbound configuration is clearly shown in Admin.
- `SHOPIFY_PRIVACY_EVIDENCE_KEY`: independent HMAC key at least 32 characters, restricted to the privacy operator and worker. It authenticates evidence, not a provider credential. Keep it separate from Shopify, session and alert secrets.
- `SHOPIFY_PRIVACY_EVIDENCE_JSON`: array of signed receipts as described below, supplied through secret configuration. Operator inventory and evidence are required: do not fabricate receipts merely to clear a queue. No live credentials or production evidence were available or configured in this PR.

Admin → Privacy displays pending, retrying, blocked, overdue and verified complete counts plus at most 50 exception alerts. A random task ID identifies an operation, never a merchant. The endpoint uses the existing Sales Admin gate and `Cache-Control: no-store`. Access work is blocked support work, not verified erasure. There are no delete/complete buttons.

Alerts are persisted once per task/reason for missing/invalid configuration, permanent provider failures, access fulfilment, deadlines within three days and overdue requests. Overdue alerts are independent of approaching-deadline alerts. Only unresolved requests are delivered/displayed. The webhook must be configured and actively monitored; the in-app outbox alone is not an external pager.

## Evidence format and retention verification

Receipts use `receiptSignature` from `server/shopifyPrivacyVerification.ts` (HMAC-SHA256 over recursively sorted JSON keys, excluding signature). Required fields:

```json
{
  "version": 1,
  "taskId": "random-operation-uuid",
  "check": "backups",
  "method": "retention",
  "evidenceDigest": "64-lowercase-hex-sha256-of-restricted-retention-evidence",
  "policyUrl": "https://provider.example/documented-policy",
  "reviewedAt": "2026-10-11T12:00:00Z",
  "expiresAt": "2026-11-15T12:00:00Z",
  "coverageThrough": "2026-10-11T12:00:00Z",
  "allHistoricalCopies": true,
  "restorationProtected": true,
  "irreversible": true,
  "retentionDays": 30,
  "retentionEnforcedSince": "2020-01-01T00:00:00Z",
  "signature": "64-lowercase-hex-hmac"
}
```

The example is a format template, **not provider policy or evidence**. Actual evidence must confirm exhaustive processor/region/stream coverage, stopped writes containing erased data, irreversible removal, enforcement history, replicated/archive copies, backup expiration and restore exclusion/reapplication. `coverageThrough` must include the task's cutoff. Retention enforcement must predate the task's earliest source data; a null start means all history (enforcement since epoch or a confirmed purge is needed). No configured retention duration is assumed. Completion waits until coverageThrough + evidenced retentionDays; plan upgrades, retention extensions and legal holds must be assessed before signing. Expired/malformed/mismatched or unsigned receipts stay blocked. `deletion` requires confirmed irreversible purge evidence. `not_applicable` requires inventory evidence, coverage and restoration controls. Digests point to restricted evidence retained by the operator; neither URLs nor raw evidence enter Admin or alerts.

Configuration supplies new valid evidence for blocked tasks; they recheck within an hour. After a permanent failure, an authorized operator must inspect the provider/configuration, then resume the random task without resetting its deadline or completed checkpoints (reviewed SQL updating status to retrying, attempts to zero and next_attempt_at to NOW(), only with no live lease). Never set completed_at to bypass checks. Access fulfilment requires verified delivery evidence and removal of its encrypted support payload; use the separate restricted support procedure, never an erasure receipt.

## Provider limitations and deletion adapter

| Category/provider | Automatic capability and required evidence |
| --- | --- |
| Railway historical logs | No individual log-delete adapter is assumed. [Railway log retention](https://docs.railway.com/observability/logs) says plan upgrades can restore previously out-of-view logs. A visibility period is not irreversible retention. Obtain provider confirmation for actual removal; separately inventory log drains, traces and archives. |
| Resend | Existing app records do not retain a complete list of historical message IDs for the erased window. Sending-email APIs or deleting a contact/audience entry do not prove message/log deletion. Obtain processor confirmation/contractual retention enforcement evidence. No guessed retention period or destructive Resend API call is enabled. |
| HubSpot and other CRM exports | Current HubSpot sync records last-sync/fingerprint metadata, not a complete verified portal/object-ID manifest. Archive/delete acknowledgments alone do not prove GDPR erasure, backups or exported copies. No automatic destructive CRM call can safely reconstruct selectors after SQL deletion; obtain scoped provider purge confirmation or verified retention. Salesforce, Google Sheets, Zoho, manual exports and workflow destinations require the same exhaustive inventory review. |
| AWS S3 dedicated privacy archive stream | A tested S3 version-deletion adapter is available only for a **dedicated frozen prefix** identified by a signed `s3_delete` receipt for `archives`. It enumerates all versions and delete markers, deletes exact versions, then requires two empty version inventories. This is an API-level object deletion verification; replication, exports and backups still require their independent checks. Object Lock/MFA/permissions failures remain blocked or retrying. |
| R2/legacy object storage and media | Current app media uses R2/legacy storage and does not provide an exhaustive Shopify-origin object inventory. Do not point the AWS adapter at arbitrary media or infer scope from time alone. R2 version/API differences and legacy disks require separate scoped confirmation or verified retention. |
| Archives/backups | No blanket wipe, backup reconstruction or fixed expiration is enabled. Require retention/purge evidence plus restoration controls. Backup retention may exceed the Shopify deadline, which raises an intervention alert rather than false completion. |
| Local historical/mixed records | Typed matches are erased automatically; untagged snapshots, copied notes, raw third-party output or ambiguous installations require scoped operator review. The local_review check prevents unsupported claims. |

To opt into the S3 adapter, **after tests and scope review**, set `SHOPIFY_PRIVACY_S3_DELETE_ENABLED=1`, `SHOPIFY_PRIVACY_S3_ACCESS_KEY_ID`, `SHOPIFY_PRIVACY_S3_SECRET_ACCESS_KEY` and optionally `SHOPIFY_PRIVACY_S3_SESSION_TOKEN`. These must be a separate least-privilege credential restricted to the exact approved bucket/prefix, with ListBucketVersions, DeleteObjectVersion and necessary unversioned deletion permissions. The signed receipt must include `s3: { bucket, prefix, region, scopedCredentialsVerified: true, writesStopped: true }`. Prefixes must match `privacy-streams/<approved-stream>/`; inventory must confirm the entire frozen prefix is the task's governed stream, including historical copies. This intentionally deletes all versions in that dedicated prefix, **not arbitrary objects matched by LastModified**. The operator must verify IAM scope; the worker cannot infer credential scope from a successful API call. Never reuse broad app storage credentials. Destructive actions are disabled by default, and no production destructive action was enabled or tested against real records.

## Validation and release blockers

Disposable localhost PostgreSQL tests exercise concurrent claims, expired leases/stale writes, partial checkpoints, retries/backoff/exhaustion, retention evidence, bare acknowledgment rejection, permanent/configuration alerts, approaching/overdue deadlines, parallel delivery deduplication, transaction rollback, tenant isolation, customer access separation, encrypted support records and late-event suppression. Provider tests simulate S3 versions, permission failures, foreign keys, unverified remaining copies and opt-in gating. CI also runs existing Shopify/contact/onboarding regressions, startup/bootstrap compatibility, exact-base TypeScript comparison and production build. The type comparison requests untruncated compiler diagnostics so reordering fields in large inferred types cannot hide different members behind an ellipsis. API tests are mocked; they do not establish live IAM permissions or provider retention.

Before release: assign the privacy operator, supply encrypted-request and evidence keys, configure/verify the idempotent alert receiver, inventory every processor and restoration path, secure provider confirmations or retention evidence, test a disposable dedicated S3 prefix if used, and validate signed webhooks/access fulfilment in staging. Missing evidence and absent provider selectors remain **operational blockers**, with requests pending/blocked and operator alerts. This PR does not claim historical Railway logs, Resend messages, archives, backups or third-party exports were deleted.

Shopify deadline reference: https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance
