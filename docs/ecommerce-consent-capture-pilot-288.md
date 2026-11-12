# Consent-only production pilot (#288)

This PR prepares source and offline validation. It does not enable production capture,
change Railway variables/credentials, release a Shopify version, deploy, merge, or
send customer messages. The existing production HMAC signing key must be preserved.

## Accepted evidence reused

| Evidence | Source | Treatment |
| --- | --- | --- |
| Released `postpurchase-webhooks-2`, registered extension UID, deployed #287, approved `write_app_proxy`, saved merchant draft, 4/4 approved templates | [#288](https://github.com/yanivwpu/Lead-Flow-Manager/issues/288), [#287](https://github.com/yanivwpu/Lead-Flow-Manager/pull/287) | Accepted; no provider calls or repeat live tests |
| Zero production consent rows at the issue audit; new signing key staged with `skipDeploys:true` | #288 | Accepted audit snapshot, not a new live claim; key never read, logged, rotated or overwritten |
| Signed recovery YES/STOP/re-opt-in, checkout/receipt and catalog acceptance | [guarded release procedure](ecommerce-guarded-delivery-release.md), #234/#235 | Reused; no orders, checkouts, customer messages, consent seeding or uncertain-attempt replay |
| Existing migration rehearsal | [production-copy preflight](ecommerce-delivery-migration-preflight-20261030.md) | Reused historical evidence; no reapplication or new production-copy test |
| JSONB draft readback, signature/freshness, exact phrases, tenant isolation, published theme states, staging consent, post-purchase STOP/privacy/delivery fences | Existing enrollment, storefront, signed-consent, and post-purchase tests | Reused and run as local/CI regressions with disposable fixtures |

## Permission and evidence

The independent permission admits exactly one production account/shop/connection at
`https://app.whachatcrm.com`. It uses no checkout, recipient, order, intent, receipt,
preparation, or sending release. Existing staging and previously reviewed controlled
paths remain separately gated. The new permission is not consumed by a sender.

The current connection is SHA-256 over the existing canonical fingerprint inputs:
`accountId|shop|installationId|wabaId|phoneId|installedAtMilliseconds`. The capture
writers reload these facts under the existing shop/privacy and row locks. Any changed
account, shop, integration, WABA, phone or install timestamp fails closed. The merchant
setup service applies the same fingerprint and checks ordered evidence schema. A
signing key or saved business name alone cannot make capture ready.

Only the existing verified raw-body Meta webhook can provide evidence. A fresh exact
purpose phrase must join the receiving merchant phone to one existing, unambiguous
Shopify customer/contact with the same WhatsApp number. Unknown customers, conflicting
metadata, duplicates, paused/DNC contacts and privacy locks cannot grant. Purpose,
HMAC, timestamp ordering and WAMID semantics remain intact. Signed STOP still revokes
after capture permission is removed, without preparing/sending messages. A page view,
link click, merchant save or theme-editor action never grants consent.

Schema readiness is read-only and requires the fields used by the two evidence
writers, including `last_inbound_at`/`last_wamid` and
`last_verified_inbound_at`/`last_verified_wamid`. Existing post-purchase tables are
also required by its current handler. No migration or startup bootstrap is added.
Missing schema blocks notices/capture; do not fix it by turning on delivery.

## Exact future configuration (not set by this task)

Scope these variables only to the production **Lead-Flow-Manager application service**:

| Variable | Pilot value |
| --- | --- |
| `ECOMMERCE_CONSENT_CAPTURE_PRODUCTION_APPROVED` | `true`, only after separate review |
| `ECOMMERCE_CONSENT_CAPTURE_ACCOUNT_ID` | `51f64011-eb3a-48a4-bb10-031abd3c0cdc` |
| `ECOMMERCE_CONSENT_CAPTURE_SHOP` | `whachatcrm-live-test.myshopify.com` |
| `ECOMMERCE_CONSENT_CAPTURE_CONNECTION_SHA256` | Exact lowercase 64-hex fingerprint of the current approved connection, computed with `commerceConnectionFingerprint` |

Keep `RAILWAY_ENVIRONMENT_NAME=production` and `APP_URL=https://app.whachatcrm.com`.
Use the already staged `ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY`; never replace it
as part of rollout or rollback. Its value is not an input to the connection fingerprint.
The fingerprint is an operator binding, not a credential. Do not use a placeholder,
wildcard, guessed digest or the draft's saved digest without comparing it to the
current database connection. This PR deliberately does not claim an unobserved live
connection digest.

For a read-only scope review, select only `users.id`, `users.shopify_shop`,
`users.shopify_installed_at`, `users.meta_business_account_id`,
`users.meta_phone_number_id` and the single active Shopify `integrations.id` for that
account/shop. Reject missing/ambiguous installations. Pass those values to the existing
`commerceConnectionFingerprint` helper using its named inputs above, and compare with
the saved enrollment's `connection`. No access tokens, signing keys or customer data
are needed. A reconnect requires new scope review and a fresh merchant draft save.

Do not change `ECOMMERCE_POST_PURCHASE_PRODUCTION_RELEASE_APPROVED`,
`ECOMMERCE_POST_PURCHASE_PREP_ENABLED`, `ECOMMERCE_POST_PURCHASE_DELIVERY_ENABLED`,
`ECOMMERCE_RECOVERY_SEND_ENABLED`, `ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED`, global
customer-send switches, worker modes or merchant delivery activation to authorize
capture. Outbound sending and its controlled-recipient release remain OFF. The old
`ECOMMERCE_RECOVERY_PRODUCTION_CONSENT_APPROVED` one-checkout permission is unnecessary
for this new route.

## Owner rollout after review

1. Review this PR, CI, CodeQL and the exact scope above. Merge/deploy requires the
   owner's separate action; neither is performed here.
2. Reuse accepted schema/provider evidence. If current schema metadata is missing,
   use the existing read-only migration preflight under its explicit approved binding;
   stop for schema drift review rather than reapplying completed migrations. No DDL
   is part of this PR.
3. After approval, stage only the four scoped variables on the application service
   with deploys skipped. Review the diff, preserve the already staged signing key,
   and confirm all customer sends remain OFF. The owner can then explicitly deploy
   the reviewed application/configuration together. No Shopify app release is needed.
4. Reload merchant consent setup. With a current saved draft and valid capture/schema
   readiness, the existing Add consent action can open Shopify's editor. The merchant
   previews and saves the theme. Editor opening, merchant confirmation and verified
   published activation remain distinct states. No published-state success is claimed
   by this PR.
5. Do not repeat accepted live YES/STOP/re-opt-in, checkout/order or delivery tests.
   Any future live acceptance beyond the missing storefront setup needs its own scope.
   Broader merchant onboarding/capture requires separate review; this is one store.

Pause capture by removing/setting `ECOMMERCE_CONSENT_CAPTURE_PRODUCTION_APPROVED=false`
and explicitly deploying that approved configuration change. Keep the key and evidence;
late verified STOP remains available. Never delete consent, reset delivery attempts,
requeue uncertain work or enable sending as a rollback technique.

## Validation

New focused CI exercises default-OFF and exact connection scope, signed purpose capture,
unknown/conflicting customer rejection, WABA/phone/tenant changes, freshness/signature,
DNC/privacy, late STOP and zero outbound/preparation work. Existing CI also runs native
PostgreSQL migrations/ordering/concurrency and all e-commerce regressions, production
build, Liquid validation, and security-extended CodeQL (SARIF artifact, upload disabled
because repository default setup owns scanning uploads).

Local validation uses disposable PGlite databases with the real migrations and writers,
the real asynchronous JSONB save tests, localized render tests, and Chromium fixtures
with the actual components/CSS for EN/ES/HE, desktop/mobile, keyboard submission, sticky
save visibility, loading, saved/error states and the disabled storefront explanation.
No local browser fixture calls Shopify, Meta, Railway or production APIs.
