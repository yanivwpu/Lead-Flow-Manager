# Shopify automatic template setup: launch readiness

**Decision:** code is prepared for review and disabled deployment. Public outbound merchant rollout is not approved. New functionality is verified with fixtures; no live template was submitted, no customer message was sent, no production configuration or data was changed, and no Shopify app version was released by this work.

## Audit and reused evidence

Base: `561aa479cb29f0126ed76afaa34ab0b2bc568720` on `main`. Reviewed issues [#136](https://github.com/yanivwpu/Lead-Flow-Manager/issues/136), [#154](https://github.com/yanivwpu/Lead-Flow-Manager/issues/154), [#269](https://github.com/yanivwpu/Lead-Flow-Manager/issues/269), merged PRs #268/#273/#275/#277, their recorded CI, existing recovery/post-purchase workers, migrations, privacy paths, onboarding and deployment configuration.

Retained accepted evidence: Shopify OAuth/catalog sync; AI Shopping including Hydrogen color and return-policy acceptance; abandoned-checkout observation/recovery URL and email delivery; previous staging signed consent/STOP; order ingestion and recovery safeguards. These manual tests were not repeated.

Fresh read-only production checks:

- Railway app deployment `c779ea31-189c-467d-b04f-fc06fa50ccae` is SUCCESS at the base commit above (PR #277).
- The pilot library has exactly the three approved English Utility package messages. Their exact bodies were reused; their existing three journey bindings remain saved. All three plans are selected with zero delay. The merchant delivery preference is false.
- The pilot has zero unrevoked recovery or post-purchase purpose-consent grants. Historical staging acceptance is not a production grant. The current pilot library has no checkout-reminder template; the historical Marketing approval belonged to another WABA.
- Railway OAuth exposes variable names, not values. Required receipt/controlled-scope delivery variables and all new template/prod-recovery release variables are absent. Existing production recovery code is staging-gated. This independently prevents new sending without inferring redacted values.
- Shopify's `postpurchase-webhooks-1` version was recorded as **released Active**, with real production `orders/fulfilled` endpoint acceptance on Nov 7 and pilot order/fulfillment processing on Nov 8 ([#154 evidence](https://github.com/yanivwpu/Lead-Flow-Manager/issues/154#issuecomment-6703630546)). Production TOML includes create/fulfilled/cancelled topics. The #270 workflow remains explicitly stage-only/no-release. This is retained live release evidence, not a new Shopify Dashboard read or a claim that staging a version released it.

## Implementation and state

| Area | State |
| --- | --- |
| Merchant-owned four-template EN package | Implemented; exact three approved Utility bodies reused; Marketing reminder uses the existing single full recovery-URL parameter contract. Package content itself grants no approval. |
| Provisioning and reconciliation | Implemented; current merchant credentials/WABA, complete bounded inventory, compatible approved reuse (including merchant-named equivalents), one new submission per merchant/tick, review reconciliation, sanitized errors and category/shape/language verification. |
| Persistence and concurrency | Existing `integrations.config` stores per-WABA authorization, committed attempt fences, leases and progress. Crash/rollback after provider acceptance never permits automatic resubmission. No new migration. |
| Library and binding | Existing Meta parser, library IDs and binding queries reused. Current selections persist; a deliberately cleared selection stays paused. No Meta template edit/delete. |
| Merchant experience | Setup/Post-Purchase integration, automatic progress, EN/ES/HE RTL, saved journey choices, separately gated activation/pause. No automatic recipient consent or customer sending. |
| Existing journeys | Existing AI, checkout preparation/suppression, six post-purchase purpose checks, Meta sender, outbox, receipt and privacy infrastructure reused. Configured review/repeat/win-back messages are checked but never auto-created or selected. |
| New production recovery entry | Separate default-off exact merchant/shop/checkout/recipient release with ≤1 hour expiry; reuses the existing claim/fence/worker/sender. Consent/receipt approvals are independent. Late receipts and signed STOP remain effective after sending is paused. |
| Broad outbound availability | Not enabled. The new recovery release is one controlled checkout, and post-purchase retains its existing independently controlled intent/account scope. Cohort-wide automatic outbound release requires a separately reviewed expansion after pilot acceptance. |

All new provisioning writes use the existing Shopify uninstall/privacy lock, live installation and owner checks. New delivery authorization also binds the current WABA/phone/installation fingerprint. Token renewal in the same connection preserves setup; changed connections cannot inherit a new production delivery authorization. No credential, recovery URL or recipient data is stored in provisioning state or returned in setup progress.

## Automated validation

Nineteen new fixture tests cover empty WABA submission, compatible approved reuse, pending approval, rejection/pause/disable/category/content changes, durable reconnect bindings, concurrency and committed crash fences, tenant/WABA isolation, permission/expiry failures, supported variables, merchant-cleared selections, fair bounded account selection, authenticated same-origin routes and shared per-account write rate limits, explicit activation persistence, localized RTL setup and disabled-by-default production scopes. Production-entry tests also preserve purchase-completion and missing/revoked consent suppression. Existing native PostgreSQL outbox/privacy/receipt tests supply the historical no-duplicate-send regression coverage; they are not relabeled as new live acceptance.

Local evidence before hosted CI:

- E-Commerce + PostgreSQL + UI suite: 188 passed, zero skipped. The additional manual-sync/provisioning concurrency and explicit activation persistence tests also passed against native PostgreSQL; the PR head is verified again by hosted CI.
- Shopify automated suite: 240 passed, zero skipped.
- Sales Catalog/shopping/session compatibility: 195 passed, three optional model tests skipped; separate admin checkout/diagnostic fixture suite: 62 passed. These used the repository's isolated local/native/PGlite settings. Initial local fixture-role mistakes were corrected; no application change was made for those failures.
- Security/credential/DNC tests: 18 passed. Production/staging Shopify configuration tests passed.
- Production build passed. TypeScript regression comparison: base 97 diagnostics, candidate 97, zero added. The repository-wide absolute typecheck is already failing on main.
- Chromium fixture browser: EN/ES/HE authorization → pending → approved/bound → plan save → explicit enable/pause; disabled release controls, desktop/mobile layout, Hebrew RTL, no horizontal overflow and no browser errors. This is fixture UI evidence, not live Meta/Shopify acceptance.
- `npm audit --omit=dev`: 31 existing findings (1 critical, 12 high, 13 moderate, 5 low). `package.json` and lockfile are unchanged from main. Dependency remediation/security triage remains a broader public-rollout gate; this PR does not claim a clean dependency audit.
- Hosted E-Commerce, Shopify onboarding/privacy, build/TypeScript and Sales Catalog security-extended CodeQL results must be green on the PR head before merge. CodeQL is run in GitHub Actions; its SARIF is compared with the accepted PR #277 artifact. Its initial added setup-route rate-limit warning was addressed using the existing shared counter service. Repository-wide historical findings are not represented as a clean security baseline.

## Operator rollout checklist

1. **Review / disabled deployment:** review PR, green CI and CodeQL; verify existing production migrations/backup/rollback evidence. There is no new DDL to apply. Keep all new controls unset. Do not run the Shopify stage/release workflow as part of deployment.
2. **Internal template pilot:** set `ECOMMERCE_TEMPLATE_PROVISIONING_ENABLED=true`, stage `internal_pilot`, and `ECOMMERCE_TEMPLATE_PROVISIONING_ACCOUNT_IDS` to the exact reviewed account UUID(s). Merchant explicitly authorizes **Set up my messages**. The worker scans at most three eligible due merchants/minute and submits at most one missing English message per merchant/tick. It checks up to five pages/500 Meta templates; incomplete inventory blocks creation. Pending/ready states reconcile periodically, including after restart.
3. **Provider approval:** verify newly submitted Marketing approval in the pilot's current WABA, actual category/body/language, durable local ID and binding. Reuse the three accepted Utility bindings. No repeated staging consent, checkout/email, order or AI tests; no fabricated consent and no real-customer development sends.
4. **Controlled delivery pilot:** separately review legitimate production recipient/purpose evidence, current Shopify state, STOP/deletion/DNC guards, receipt routing and schema. New production recovery requires every control below, plus the merchant's explicit checkout-reminder activation. Post-purchase keeps its separate existing `postPurchaseOperatorReady`/controlled-one-intent gates and purpose consent. No approval in template setup changes either path.
5. **Limited template cohort:** change management stage to `limited_cohort` with an explicit bounded UUID list (max 100, no wildcard). Monitor approvals, API rate limits, permission failures, worker leases and binding outcomes. Expand outbound only after its separate pilot/release review; adding a template cohort does not release messaging.
6. **Broader management availability:** stage `general` additionally requires `ECOMMERCE_TEMPLATE_PUBLIC_RELEASE_APPROVED=true`. Before broad outbound availability: resolve #269 using its safe offline-token migration path; triage dependency findings; verify provider/purpose eligibility and country restrictions, controlled pilot receipts, current app release/subscriptions and customer privacy operations. No forced reconnect/token rotation is bundled.

Production recovery's independent controls (server/operator only):

```
ECOMMERCE_RECOVERY_PRODUCTION_DELIVERY_APPROVED=true
ECOMMERCE_RECOVERY_WORKER_MODE=production-controlled-one-checkout
ECOMMERCE_RECOVERY_WORKER_ENABLED=true
ECOMMERCE_RECOVERY_SEND_ENABLED=true
ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED=true
ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED=true
ECOMMERCE_RECOVERY_WEBHOOKS_VERIFIED=true
ECOMMERCE_RECOVERY_RECEIPTS_ENABLED=true
ECOMMERCE_RECOVERY_PRODUCTION_RECEIPTS_APPROVED=true
ECOMMERCE_RECOVERY_CONSENT_CAPTURE_ENABLED=true
ECOMMERCE_RECOVERY_PRODUCTION_CONSENT_APPROVED=true
```

Also required: exact account UUID, shop, checkout GID, recipient HMAC, a UTC expiry within the next hour, and the existing strong consent HMAC key. Supply these through operator secrets/configuration; never accept them from merchant JSON or put secret values in documentation. The production path consumes an already prepared eligible outbox; it does not turn the observation/no-send preparation mode into a send worker. Legacy staging worker gates stay staging-only.

**Pause / rollback:** disable the relevant sending/worker release first; merchant can pause its delivery preferences. Disable management independently to stop further management calls. Preserve attempt fences, local IDs, consent revocations and provider uncertainty for reconciliation. Keep approved receipt ingestion available for late receipts; signed STOP can still revoke production evidence while delivery is off. Do not clear fences, resubmit uncertain templates, requeue uncertain messages or delete merchant-owned Meta templates to roll back.

## Remaining release gates

- **Pending provider approval:** current pilot WABA Marketing reminder; valid management permission in a fresh merchant WABA. No new live provider management acceptance is claimed.
- **Pending controlled pilot:** real current production purpose opt-in/identity, one explicitly reviewed recipient/checkout or post-purchase intent, provider receipt and production STOP/purchase suppression evidence. Existing staging acceptance remains accepted and is not a production consent migration.
- **Ready for merchant rollout:** automatic setup can roll out only through its reviewed default-off stages after pilot approval. Broad automatic customer delivery is not yet approved or implemented as an unrestricted cohort sender.
- **Public launch blockers:** Shopify offline-token P0 #269, controlled delivery acceptance, expanded merchant-scoped delivery review, dependency security triage and operator release sign-off.

Management API reference: [Meta's official WhatsApp Business Platform collection](https://www.postman.com/meta/whatsapp-business-platform/request/ep5w4rc/create-template-w-document-header-text-body-a-phone-number-button-and-a-url-button). The implementation uses the existing configured Graph version and text BODY example contract, without dynamic buttons, media or unsupported Shopify data.
