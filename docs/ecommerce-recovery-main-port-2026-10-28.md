# Abandoned checkout recovery: selective main integration

Status: implementation for review; recovery is **not live or production ready**.
Tracks #154 (October 28 handoff), #136 and #151. No deployment, installed-schema
change, credentials change, checkout creation or customer messaging was performed.

## Exact source inventory

- Target main: `68c1217483e1d9c3f8099cc09aca74258efc0047`.
- Source staging: `f77e5553932ac49d064f8de3993160b59b91779e`.
- GitHub comparison: 176 ahead / 165 behind. This is a selective file port,
  not a staging merge. PRs #137–147 were reviewed; #143 is unrelated logout work.
- Main already has abandonedCheckoutSource, checkoutFreshRecheck,
  checkoutObservationQueries/SyncGate, checkoutRecoveryEligibility/Intents/
  PreparationGate/PrivacyQueries and the first two recovery migrations.
  The overlapping recovery modules are identical to staging; retained unchanged.
- Ported missing modules: checkoutRecoveryAutoPreparation/AutoPreparationRuntime,
  DeliveryWorker, InboundConsentCapture/InboundConsentGate/InboundConsentQueries,
  MessagingEligibility, MetaReceiptGate/MetaReceiptHandler/MetaReceipts,
  MetaSender/MetaTemplate, Outbox, WorkerRuntime/WorkerScheduler.
- Ported missing migrations: 20261020_ecommerce_whatsapp_recovery_delivery,
  20261020_ecommerce_recovery_signed_inbound_consent,
  20261020_ecommerce_recovery_meta_receipts. No duplicate migration of the
  observation or intent tables. Added review-only
  20261028_ecommerce_recovery_provider_attempt for a durable send-attempt fence.
- Ported associated recovery tests and the original October 23 acceptance report.
  Existing Shopify, Meta, billing, AI Shopping, privacy and merchant UI code
  was retained. Existing privacy hooks cover the new consent/outbox records.

## Runtime and safety

Bootstrap calls the existing bounded staging auto-preparation and worker only
behind their independent flags. Exact staging origin/environment and one account
allowlist remain mandatory. Production activation is deliberately unsupported.
All observation/preparation/auto-preparation/worker/send/consent/receipt flags
remain unset or unchanged; this PR sets none of them.

The chain observes checkout snapshots, waits, freshly checks Shopify purchase
state/customer/recovery URL, matches tenant-owned Shopify/WhatsApp identity and
signed consent HMAC, enqueues a unique durable intent, claims once, rechecks
current consent/installation/purchase and local+live approved MARKETING template,
then calls the existing Meta sender. Only a body-only one-variable template is
supported. Consent and receipts require real signature verification over raw
bytes, even where ordinary development webhooks allow a bypass. Both persist
before ACK. STOP suppresses unsent work. No browser consent setter was added.

Additional integration corrections:

- A committed provider-attempt fence prevents duplicate adapter invocations
  with the same claimed token, including after provider transaction rollback.
- Provider acceptance is committed under the same shop privacy lock as receipt
  capture; worker settlement is idempotent only for the exact provider ID.
- Fresh activity within the 60-minute delay suppresses a previously queued send.
- STOP wins over YES sharing the same provider timestamp.
- Runtime schema readiness requires all four tables and all five consent,
  receipt and provider-attempt columns before preparation or claiming.
- Runtime failures log fixed markers without raw provider error payloads.

At-most-once delivery intentionally sacrifices delivery after a crash or unknown
acknowledgement. Claimed/uncertain entries require operator reconciliation;
never reset them to pending. The scan remains one page (25 observations), at most
three due reviews and one claimed send per 90-second tick. This is bounded test
merchant infrastructure, not a high-volume production rollout.

## Validation and preserved evidence

Existing October 22 Shopify read-only access and backup/restore migration proof,
October 23 tenant/consent/template findings, existing signed inbound proof and
AI Shopping unit/build evidence were read and accepted without replaying live
provider tests or migrations. Historical results are not current token or
template approval evidence. See the unchanged October 23 acceptance report.

The ported recovery suite passed 33 tests on disposable local PostgreSQL 16,
with mocked delivery: tenant boundaries, concurrent unique claims, consent/STOP,
privacy/uninstall/erasure, purchase suppression, approved templates and signed
receipt ordering. New safety fixes have targeted PostgreSQL regressions for
provider fencing, partial schema rejection and settlement idempotence. Build
passed. Exact-base TypeScript comparison: 97 baseline diagnostics, 97 candidate,
zero added. Full typecheck is therefore not globally green.

## Release blockers and minimum next action

1. Review this focused PR and applicable GitHub checks. No merge or deployment
   is authorized by its creation.
2. Resolve #151 read-only using a fresh staging Meta token: effective WABA
   callback, actual signed inbound delivery and unique merchant workspace mapping.
   This session has not validated current Railway/provider state.
3. Establish the exact existing test Shopify customer/CRM WhatsApp identity,
   merchant-specific disclosure, genuine signed YES and STOP evidence, correct
   HMAC configuration, and matching locally synced/live approved template.
   Do not synthesize consent or infer WhatsApp permission from Shopify SMS/email.
4. Separately authorize staging deployment/migration of the reviewed additive
   schema (including the new attempt column), backup/restore plan and rollback.
   Reuse the historical migration evidence; do not blindly replay it.
5. Only after explicit owner authorization: one controlled test checkout recovery,
   signed receipt, purchase/STOP suppression and duplicate/timeout acceptance.
   No new checkout, live send, flag activation or production rollout is included.

Minimum next action: review the PR; the first provider-side prerequisite is a
fresh staging Meta token through the existing secure connection UI for #151.
Keep merchant marketing/UI automation claims gated until live acceptance exists.
