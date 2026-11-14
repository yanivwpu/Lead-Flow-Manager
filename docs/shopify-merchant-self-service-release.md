# Shopify merchant self-service activation — issue #298

This change promotes the existing Shopify activation page and guarded automation
workers to merchant self-service. It does not merge #301, migrate tokens from #281,
activate the internal pilot, change deployment variables, or deploy an application.

## Reused / Code-Verified

- Shopify OAuth/installation, Pro/trial entitlement and installation-bound workspace activation.
- Merchant-owned WhatsApp connection, AI Brain knowledge and AI Shopping settings.
- Existing consent enrollment editor, signed Shopify storefront proxy/theme setup,
  and signed Meta inbound capture with purpose-specific commands.
- Approved English template package, per-WABA approval reconciliation, tenant-owned
  template library, existing shape/category validation and manual customization.
- Existing order/fulfillment/cancellation webhooks, checkout observations and fresh
  Shopify rechecks, consent/DNC/privacy checks, durable outboxes/provider-attempt
  fences and signed delivery receipts. Unknown acceptance is never retried.

These code classifications use the existing accepted audits plus focused regressions
for the changed release boundaries. They do not claim real customer delivery.

## What changes

Public merchants authorize setup using the existing **Set up my messages** action.
The server persists a versioned authorization against the exact account, Shopify
installation/time, WABA and WhatsApp phone connection in protected integration
JSONB. Authorizing setup does not enable sending or create customer consent.

The existing journey switches persist explicit enable/pause preferences and the
current connection fingerprint. Activation requires current entitlement, engine
activation, consent collection configuration, matching local/live approved templates
and the existing ordered schema/fences. A bounded worker rotates through enrolled
merchants and reuses the existing preparation, delivery and receipt paths. It does
not read a pilot operator's account/checkout/recipient scopes for public merchants.

The internal pilot workspace and `whachatcrm-live-test.myshopify.com` are excluded
from the new path. Their existing operator gates and paused configuration remain
in force. Legacy operator flags are not general-merchant switches.

Reconnect, uninstall, deletion, downgrade, expired credentials or ambiguous ownership
fail closed. A new connection requires fresh setup/activation; grants from an older
connection do not authorize it. Orders before activation cannot be sent; recovery
requires observations after activation and the existing 60-minute eligibility delay.
Signed STOP and matching delivery receipts remain effective after merchant pause.

The page now exposes compatible message selection/body previews, AI Shopping settings
without private test tools, actual journey status and aggregate messaging counters.
No customer identities or message payloads are added to counters or worker logs.
Matched Shopify phones are formatted as E.164 during inbound processing without
changing the number; the reviewed same-number formatting safeguard from #301 is
reused on sync. Ambiguous normalized phone/WhatsApp identities remain blocked.

## Merchant steps (existing activation page)

1. Install/connect Shopify and activate the engine with an eligible plan/trial.
2. Connect the merchant's own WhatsApp Business number through Channels.
3. Choose **Set up my messages**. Existing approved templates are reused; missing
   English templates await Meta review. Customize in the existing WhatsApp Library,
   then select a compatible approved message in its journey card.
4. Save consent collection for each desired purpose. Use the existing Shopify theme
   setup or the provided enrollment links/notices. A link click or merchant setting
   is not consent: the customer must send the exact purpose command, and the signed
   inbound must match one unambiguous, privacy-eligible Shopify/WhatsApp contact.
5. Select order confirmation/shipping purposes and enable the selected journeys.
   Enable checkout reminders separately. Missing customer consent suppresses that
   recipient even when the merchant has activated a journey.
6. Review AI Brain business knowledge; enable AI Shopping and intended channels in
   the existing settings. Existing AI entitlement/channel protections still apply.
7. Refresh/revisit the page to see committed preferences and actual Meta approval /
   queued / accepted / delivered-read / failed / uncertain counts. Accepted is not
   delivered. Pause before changing a live journey's message selection.

## Pilot Validation Pending / external dependencies

- A merchant's successful Shopify installation/scopes and Meta number/management
  permissions, current credentials, template approval and applicable provider limits.
- Publishing/saving the existing consent theme block in that merchant's active theme,
  or placing the supplied consent notice/link through Shopify's existing editor.
- Genuine purpose-specific customer opt-in, one eligible order/shipping event and
  one eligible checkout recovery with real signed receipt reconciliation.
- Real-world AI Shopping conversations against that merchant's catalog/settings.

No live customer test is performed by this PR. No historical contact-pair repair is
required. Shopify token migration #281 remains a separate continuity milestone.
Custom cart/checkout creation remains independently gated and is not enabled here.

## Release / rollback

Review the PR and its focused checks before merging; normal main auto-deployment
means merge is a deployment decision and requires owner approval. No new secrets,
variables, tables, migrations, credentials or infrastructure are introduced. Missing
existing signing/schema bindings fail closed. Existing merchants have no new
self-service authorization until they explicitly authorize setup.

For a merchant pause, use the existing journey switch; it remains available even if
activation prerequisites lapse. Stop/receipt capture remains separate from sending.
For application rollback, deploy the reviewed pre-change main image. Retain all
consent, outbox, provider-attempt and integration state; never reset/requeue uncertain
attempts or remove erasure/suppression evidence. The old operator-bound workers do
not execute public merchants' self-service activations.
