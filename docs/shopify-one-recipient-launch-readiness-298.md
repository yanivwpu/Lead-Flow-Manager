# Shopify one-recipient launch readiness — #298

Audit date: November 12, 2026. Main audited: `165a22b5` (#297).
**Decision: prepare the existing pilot; no new application functionality is needed for this scope. Production delivery and public rollout remain NO-GO.** This document changes no runtime configuration or data and authorizes no external action.

Pilot: account `51f64011-eb3a-48a4-bb10-031abd3c0cdc`, shop `whachatcrm-live-test.myshopify.com`. Recipient, customer/contact, intent, checkout, HMAC and provider identifiers belong only in the private approval/evidence record. None has been selected by this audit.

## Done — reuse without retesting

| Accepted implementation/evidence | Source and current interpretation |
| --- | --- |
| OAuth/catalog, AI Shopping, order ingestion, checkout observation/recovery URL and Shopify checkout email | [#154](https://github.com/yanivwpu/Lead-Flow-Manager/issues/154), including its Nov 9 audit; existing acceptance retained. Shopify email is not WhatsApp acceptance. |
| Signed consent ordering, STOP/re-opt-in, privacy/DNC/purchase suppression, claims and uncertainty fences | #234/#235 and [guarded delivery procedure](ecommerce-guarded-delivery-release.md); staging acceptance is retained, never copied into production consent. |
| Four current-WABA templates approved and bound: order confirmation, shipping, cancellation (Utility), checkout reminders (Marketing) | Latest read-only production evidence in [#298](https://github.com/yanivwpu/Lead-Flow-Manager/issues/298). This supersedes the older pending-Marketing statement in [template launch readiness](shopify-growth-template-launch-readiness.md). Do not recreate, submit, or rebind them. Three post-purchase plans are saved/selected; recovery selection is independent. |
| Saved merchant notice, four exact-purpose proxy links, enabled/customer-visible compact embed | #298 and merged #284/#286/#287/#289/#290/#291/#294/#296/#297; [enrollment](shopify-consent-enrollment-readiness.md), [capture scope](ecommerce-consent-capture-pilot-288.md), [rendering](shopify-consent-rendering-295.md), [compact UI](shopify-consent-compact.md). Do not repeat theme/password/proxy/render tests or release another app version for this task. |
| Merchant workspace activation, separate journey activation/pause, current-connection binding | [workspace procedure](ecommerce-merchant-activation-release.md), `postPurchaseActivation.ts`, `shopifyTemplateProvisioning.ts`. Workspace availability, merchant preference, customer consent and operator release are four separate decisions. |
| Exact one-intent post-purchase and later exact one-checkout production recovery | `postPurchaseControlledScope.ts`, `postPurchaseDelivery.ts`, `checkoutRecoveryProductionRelease.ts`, existing worker/sender. Neither releases an account/cohort. |
| Receipt schema, raw-signature routing and monotonic reconciliation implemented | `postPurchaseDeliveryReadiness.ts`, `postPurchaseReceipt.ts`, `checkoutRecoverySchema.ts`, `checkoutRecoveryMetaReceiptGate.ts`; verified Meta route in `server/routes.ts`. Receipt ingestion does not enqueue a send. |

Evidence boundaries: #298 records **zero production post-purchase and recovery consent rows**, merchant delivery preferences absent/false, and healthy production service. Railway exposes variable names only; names do not establish values. This audit read repository source, issue acceptance and PR/CI metadata, not live database credentials, Railway values or provider customer records. Current schema completeness, recipient identity, eligible intent and receipt readiness must therefore be verified read-only at the release checkpoint below; they are not claimed PASS here. An enabled embed proves neither consent nor delivery.

## Missing real production evidence — first genuine opt-in

1. **Owner chooses and explicitly approves privately** one willing existing Shopify customer, one exact post-purchase purpose and the intended later automation. Record the current installation/WABA/receiving phone and approval owner. Do not choose a recipient automatically, send an unsolicited opt-in request, create an order for testing, or import staging grants.
2. Before the customer acts, inspect the existing consent-enrollment readiness for this account/shop. The saved draft must match the current connection, its selected purpose must be capture-ready, and the existing HMAC key and evidence schema must be ready. If blocked, stop with its reason; capture approval is separate from delivery approval. The four capture-only variables and connection fingerprint procedure are already specified in [#288's runbook](ecommerce-consent-capture-pilot-288.md). Do not set them here, infer their values from their names, or turn on preparation/delivery to permit capture.
3. Privately verify one existing unambiguous tenant-owned contact with the current Shopify customer ID and shop metadata. Its E.164 phone must equal `+` plus its WhatsApp ID and the customer's sending WhatsApp number. Conflicting custom/source metadata, duplicate customer contacts/shared phones, stale installation, DNC, paused contact, deletion or privacy lock are blockers. A storefront password/session, signed proxy customer field, email, checkbox or phone alone does not establish this identity. Use legitimate Shopify/CRM correction through existing supported flows if needed; never edit consent or spoof identity to make acceptance pass.
4. The customer freely uses the **existing storefront notice** for the chosen purpose, reviews the notice, opens its WhatsApp link and personally sends that exact displayed command to the connected merchant business. Examples: `YES WHATSAPP ORDER CONFIRMATIONS`, `YES WHATSAPP SHIPPING UPDATES`, or `YES WHATSAPP CANCELLATION NOTICES`. Choose one; these are separate grants. Selection/review/link opening alone grants nothing. Translated UI retains the exact English command.
5. Verify the actual Meta inbound passed raw-body `X-Hub-Signature-256` validation, correct receiving account/phone routing and existing freshness/installation checks (15-minute age limit, at most two minutes future skew). The existing writer must record the matching purpose, customer/contact, recipient HMAC, grant time and ordered inbound WAMID/time, with no revocation. Inspect only the approved recipient privately and retain a sanitized pass/fail attestation externally. No direct SQL grant, webhook replay, synthetic event or administrative grant endpoint is permitted.
6. PASS means **one real current purpose-specific production grant**; it does not authorize a send or the other three purposes. If no matching Shopify customer/contact/phone exists, record `identity not established`, the specific missing/conflicting field category and legitimate remediation owner; do not ask the customer to repeatedly send commands against an unresolved identity. No actual recipient identity was supplied or verified in this audit.

Keep post-purchase and recovery delivery OFF throughout consent collection. Reuse prior STOP tests; the customer retains the right to send STOP at any time. Do not solicit another STOP/re-opt-in cycle merely to repeat accepted tests.

## Release approval — one post-purchase intent, then stop

### Read-only checkpoint

- Reuse the accepted migration rehearsal, but distinguish its five-file isolated-copy result from production application and the sixth delivery-fence migration. Run the existing `node --import tsx scripts/ecommerce-delivery-migration-preflight.ts` only with the explicitly approved `ECOMMERCE_MIGRATION_PREFLIGHT_DATABASE_URL` target. It opens a read-only transaction and has no apply mode. Review its six-file hashes, outbox columns and enabled `ecommerce_postpurchase_preserve_attempt` trigger. Also inspect `consentCaptureSchemaQuery`, recovery schema readiness, constraints/indexes and current privacy/uninstall cascades. Missing schema/drift requires separate DDL review; never reapply completed migrations or use `db:push`.
- Reuse accepted Shopify app-version/subscription evidence (`postpurchase-webhooks-2` in #288/#298). Confirm the required topic for the chosen purpose is covered by the current release record: create, fulfilled or cancelled. Set no webhook attestation from TOML alone; no repeat synthetic order/webhook is necessary.
- Read existing plans/bindings and recipient-specific grant. Require an existing legitimate, due, `preview_ready`, unattempted intent in the exact installation, correct journey/customer, fresh Shopify order eligibility, current local **and live** matching Meta template/category/language/body, supported country and no STOP/DNC/privacy/purchase suppression. Template readiness is not recipient eligibility.
- The Nov 9 #154 snapshot had two intents (blocked and suppressed), zero outbox; #298 does not establish a newly eligible intent. A later real grant may allow normal reevaluation of blocked work, but suppressed work must not be revived. If no existing intent qualifies, **NO-GO: await an ordinary eligible merchant event**; do not create/replay an order, insert an intent or reset a fence to obtain a test.
- Verify the existing signed Meta status callback routes to this receiving phone/account and the receipt columns are present. Reuse accepted webhook/fixture evidence; the one missing live receipt is obtained only during the separately approved attempt below.

### Reviewable future configuration — not applied

Only after the owner approves the exact recipient, purpose, intent, template, production service/target and maximum **one provider opportunity**, prepare a private config diff. Preserve the existing strong `ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY` (never print or rotate it). Production uses `RAILWAY_ENVIRONMENT_NAME=production`, `APP_URL=https://app.whachatcrm.com` and the existing exact owner pin:

| Existing operator control | Required approved value |
| --- | --- |
| `ECOMMERCE_PILOT_ENABLED`, `ECOMMERCE_PILOT_WORKSPACE_ID`, `ECOMMERCE_PILOT_OWNER_EMAIL` | Enabled exact pilot and matching database owner; owner email stays private |
| `ECOMMERCE_POST_PURCHASE_PRODUCTION_RELEASE_APPROVED` | `true` after independent release approval |
| `ECOMMERCE_POST_PURCHASE_PREP_ENABLED`, `ECOMMERCE_POST_PURCHASE_ACCOUNT_ID` | `true`, exact pilot account |
| `ECOMMERCE_POST_PURCHASE_RECEIPTS_ENABLED`, `ECOMMERCE_POST_PURCHASE_WEBHOOKS_VERIFIED` | `true` only with receipt/schema and real subscription evidence |
| `ECOMMERCE_POST_PURCHASE_DELIVERY_MODE` | `controlled-one-intent` |
| `ECOMMERCE_POST_PURCHASE_CONTROLLED_INTENT_ID` | Exact approved existing intent; never merchant JSON |
| `ECOMMERCE_POST_PURCHASE_CONTROLLED_RECIPIENT_HMAC` | Exact approved recipient digest under the existing key; private |
| `ECOMMERCE_POST_PURCHASE_CONTROLLED_EXPIRES_AT` | Explicit UTC deadline; approve a 15-minute window |
| `ECOMMERCE_POST_PURCHASE_DELIVERY_ACCOUNT_ID`, `ECOMMERCE_POST_PURCHASE_DELIVERY_ENABLED` | Exact pilot, `true` only in separately approved delivery step |

Preparation is account-scoped and may reevaluate other existing plans; enqueue/claim/attempt are constrained to the one intent. Do not present preparation as recipient-scoped. Production activation requires **exactly one selected journey matching the controlled intent**; the currently saved three selections must be narrowed by the merchant for this acceptance, with their original settings recorded. Keep recovery delivery OFF. The provisioning authorization must match the current connection and selected binding must have a Ready verification no older than 30 minutes; stale verification blocks activation and uses the existing reconciliation path, not template resubmission. Merchant then explicitly enables Customer journeys through the existing UI **last**, after operator/schema/template readiness; saving a notice or plan is not activation. Do not write managed integration fields directly.

At dispatch the existing sender rechecks installation/owner, fresh Shopify order/customer, unique phone, exact purpose consent/HMAC, pause/DNC/privacy, template and scope/expiry; the autocommitted attempt fence is retained across crashes. Do not bypass a failed check. Meta acceptance/WAMID alone is **not delivery**: require a matching authentic signed `delivered` or `read` status reconciled to the same owner/shop/recipient HMAC/provider message ID. A `sent` status shows progress only; `failed` is not acceptance success.

After the single opportunity or window, disable delivery/preparation and pause merchant journeys using the approved operating procedure. Keep receipt ingestion and evidence available for late reconciliation. Timeout, missing response/receipt, crash, blocked claim or settlement error means consumed/uncertain, **no automatic or manual retry/reset**. A success record contains the private approval reference, eligibility/consent attestation, one attempt, provider acceptance and matching signed delivery receipt, plus pause confirmation. Public records contain no recipient IDs, phone, HMAC, WAMID or payload.

## Separate later checkout-recovery pilot

Do not activate concurrently with the first post-purchase acceptance. Owner must separately approve one current eligible existing checkout and recipient. Checkout needs its own genuine `YES WHATSAPP CHECKOUT REMINDERS` grant (stored purpose `checkout_recovery`), Marketing eligibility and current bound Marketing template; a Utility-purpose grant cannot substitute.

Use the existing independent stages, not a new worker:

1. **No-send preparation, only after its own approval:** exact account/shop, `ECOMMERCE_RECOVERY_PRODUCTION_PREP_APPROVED=true`, `ECOMMERCE_RECOVERY_AUTOPREP_ENABLED=true`, `ECOMMERCE_RECOVERY_WORKER_MODE=production-pilot-no-send`, `ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED=true`, `ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED=true`, bound `ECOMMERCE_RECOVERY_TEMPLATE_NAME`, `ECOMMERCE_RECOVERY_OBSERVATION_ONLY` unset/false and `ECOMMERCE_RECOVERY_SEND_ENABLED=false`. This phase can inspect/prepare other due checkouts within that exact store; it is not a one-checkout preparation budget. Preserve existing observation acceptance, do not recreate the old checkout. Inspect the selected existing eligible unattempted outbox privately.
2. **Distinct sending config review:** the prep mode above cannot dispatch. Set `ECOMMERCE_RECOVERY_AUTOPREP_ENABLED=false` to stop preparation and switch only under separate approval to `production-controlled-one-checkout`. Keep post-purchase delivery OFF. The exact required operator controls are:

| Control | Required approved value |
| --- | --- |
| `ECOMMERCE_RECOVERY_PRODUCTION_DELIVERY_APPROVED` | `true` |
| `ECOMMERCE_RECOVERY_WORKER_MODE` | `production-controlled-one-checkout` |
| `ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID`, `ECOMMERCE_RECOVERY_WORKER_ALLOWED_SHOP` | Exact pilot account/shop |
| `ECOMMERCE_RECOVERY_ONE_SHOT_CHECKOUT_GID` | Exact existing approved abandoned-checkout GID |
| `ECOMMERCE_RECOVERY_CONTROLLED_RECIPIENT_HMAC` | Exact privately approved recipient digest |
| `ECOMMERCE_RECOVERY_CONTROLLED_EXPIRES_AT` | Explicit UTC deadline, future and no more than one hour ahead; prefer 15 minutes |
| `ECOMMERCE_RECOVERY_WORKER_ENABLED`, `ECOMMERCE_RECOVERY_SEND_ENABLED` | `true` only for the approved window |
| `ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED`, `ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED` | `true` as required by the independent delivery gate |
| `ECOMMERCE_RECOVERY_WEBHOOKS_VERIFIED`, `ECOMMERCE_RECOVERY_RECEIPTS_ENABLED`, `ECOMMERCE_RECOVERY_PRODUCTION_RECEIPTS_APPROVED` | `true` with current verified evidence |
| `ECOMMERCE_RECOVERY_CONSENT_CAPTURE_ENABLED`, `ECOMMERCE_RECOVERY_PRODUCTION_CONSENT_APPROVED` | `true`; these legacy exact-scope evidence gates remain required by delivery even when opt-in was collected via the independent capture-only route |

3. Merchant explicitly enables checkout reminders last through existing controls. Activation requires current connection authorization and the matching bound Marketing template Ready/checked within 30 minutes. The worker/sender still requires current connection-bound merchant preference, one exact checkout/account/shop/recipient, fresh Shopify completion recheck, delay/eligibility, valid grant, local/live template, STOP/DNC/deletion suppression and durable at-most-once attempt. No claim reset or replay of the historically uncertain checkout. A completed, expired, suppressed, consumed or identity-ambiguous checkout stays NO-GO.
4. Verify one matching signed delivery receipt, then stop the recovery worker/send/preparation and merchant preference. Retain receipt approval plus exact evidence scope (account/shop/checkout/HMAC) for late receipts: removing those scope bindings would disable production recovery receipt capture. STOP continues through the signed inbound path after sending pauses. Do not remove the key or evidence.

## Merchant pause and rollback readiness

Merchant: E-Commerce → Post-Purchase/template setup exposes independent Customer journeys and Checkout reminders enable/pause controls. Pause the relevant preference and confirm committed readback; disconnect does not require a new consent grant or erase the pause. Workspace activation only opens navigation and tools.

Operator: turn off the affected delivery gate/worker first, then preparation; pause the merchant preference. Keep signed receipt routing, required evidence scope and STOP capture available. Preserve consent/revocation tombstones, outbox uniqueness, claims, provider attempts, uncertainty, template bindings and queued event history. Do not truncate tables, restore a database to reset an attempt, requeue consumed rows, replace the HMAC key, delete templates or force reconnect. An in-flight provider request may finish; reconcile it instead of replaying it. Record pause timing and any in-flight outcome privately. Code rollback needs its own approved release procedure and a compatible image; no deployment is included here.

## Public rollout — remaining gates, not more pilot code

| Remaining item | Owner / completion evidence |
| --- | --- |
| One genuine production customer-purpose grant | Customer action; operator verifies exact signed persisted identity-bound evidence |
| Existing eligible intent and fresh schema/subscription/receipt preflight | Operator; read-only evidence, no DDL or fabricated event |
| One controlled post-purchase delivery | Separate owner send/config/deploy approval, merchant activation, one attempt and signed delivered/read receipt, confirmed pause |
| Later independent checkout recovery acceptance | Separate customer-purpose grant, eligible existing checkout and separate owner scope; one signed receipt and pause |
| Offline-token migration #269 / PR #281 | Reconcile existing PR as below, separate schema/key/code approval and exact-store invalidation/refresh acceptance |
| Dependency/security baseline | Existing audit recorded 31 findings (1 critical, 12 high, 13 moderate, 5 low); historical count, not a fresh audit. Triage/remediation or explicit risk decision remains required; no dependency churn added here |
| Limited outbound cohort | Separate bounded merchant/installation/purpose/country/budget/expiry/monitoring review after pilot acceptance. Current production gates intentionally do not support unrestricted cohort sending; template-management cohort approval does not release delivery |
| Public sign-off | Approved migration/refresh continuity, delivery/receipt evidence, privacy/STOP operations, rollback owner and limited-cohort results; keep launch tracking open until evidence exists |

## PR #281 against current main — reuse, reconcile separately

Reviewed head `eb8e6854b9d710aca4087b8916723a9074d99fdf` against main `165a22b5`. GitHub reports open/unmerged/non-mergeable. Local **non-mutating** `git merge-tree --write-tree origin/main origin/pr-281` confirms one conflicted file: `.env.example`. Both branches appended independent configuration documentation. Preserve **both** main's storefront extension release/ID comments and PR #281's independent `SHOPIFY_OFFLINE_TOKEN_KEY` entry. `server/shopify.ts` auto-merges; no other textual conflicts. A textual merge is not full runtime/CI acceptance.

The prior P2 catalog-auth issue is **already fixed**: sanitized 401/403 status and token-error classification survive to `access_denied`/`permission_required`; SDK/HTTP/catalog regressions and no-leak/no-replay coverage are present. GitHub review thread `PRRT_kwDOQ6ITws61yNdZ` is resolved. All six PR-head workflows are completed/success (E-commerce foundation, Shopify privacy, Marketing, staging bootstrap, Shopify onboarding, Sales Catalog). This is accepted head evidence, **not** evidence for a future reconciled head. No token tests or builds were repeated in this documentation-only audit.

Safest path: update/reconcile the **existing PR branch** with current main in a later authorized change, resolve only the additive environment-documentation overlap, review the integrated diff and rerun existing token/catalog/onboarding/privacy regressions plus required CI on that new head. Do not recreate the implementation, open an alternative token PR, force-push/force-merge, rotate keys or reconnect stores. This audit does not modify PR #281.

Its existing [migration runbook on the PR branch](https://github.com/yanivwpu/Lead-Flow-Manager/blob/codex/shopify-offline-token-migration/docs/shopify-offline-token-migration.md) remains authoritative: reviewed additive migration 0119 and stable separate encryption key before code use; all workers resolver-capable; separate exact-store approval before legacy-token invalidation; observe two real consecutive pilot refreshes before wider migration. Preserve billing/trial/catalog/order/webhook and customer-send fences. After conversion, never roll back to code treating the opaque reference as a legacy access token, remove the key/schema, or restore an invalidated legacy token. #269 remains open until production acceptance. No migration/rebase/rotation/merge/deployment was performed here.

## Validation of this deliverable

Documentation only. Audited latest-main source and migration manifest, prior accepted implementation/fixture/live records, current PR metadata, resolved review thread and six successful PR-head workflows. Verified merge conflict with `git merge-tree`; inspected the existing auth fix rather than rebuilding it. No application code, dependency, schema, test or CI workflow changes; no redundant tests or CI dispatch. Check local Markdown links and `git diff --check` before accepting this report. All live recipient-specific acceptance above remains pending, not simulated or reported as passed.
