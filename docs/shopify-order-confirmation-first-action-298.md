# Order Confirmation pilot: first action for WhachatCRM Live Test

November 13, 2026 follow-up to the [accepted November 12 audit](shopify-one-recipient-launch-readiness-298.md), issue [#298](https://github.com/yanivwpu/Lead-Flow-Manager/issues/298). Documentation and read-only inspection only. Checkout recovery and token-migration PR #281 remain separate subsequent milestones.

**Current decision: NO-GO for an Order Confirmation send.** No existing eligible customer/intent pair has been verified. There is one Shopify-linked CRM contact for `whachatcrm-live-test.myshopify.com`; it lacks both phone and WhatsApp ID. Its existing Order Confirmation intent is suppressed with `order_status_changed`, and the recorded order is fulfilled. Do not call this contact an eligible recipient, unsuppress the intent, or change the journey to shipping to bypass the requested scope.

## Exact first action — inspect the existing customer privately

1. Open **Shopify Admin → WhachatCRM Live Test** and confirm the store domain is `whachatcrm-live-test.myshopify.com`. Open the existing fulfilled pilot order already represented in WhachatCRM's Post-Purchase history, then open its attached customer. Do not create an order or alter its status. If the history does not expose a direct customer link, the authorized operator can resolve the existing Order Confirmation intent's `customer_gid` against the merchant's Shopify Customers page privately. Do not paste that identifier into this PR, chat or logs.
2. In the same WhachatCRM pilot workspace, open **Contacts** and locate the one existing contact whose Shopify customer/shop metadata matches that customer and store. Compare its Shopify customer ID privately; a similar name or email is insufficient. The database inspection returned only aggregate counts and boolean checks, not the customer's name, phone, email, IDs or message payloads.
3. The owner must explicitly designate this willing existing customer (or another existing customer after equivalent verification) and the single purpose **Order Confirmation** in a private approval record. No recipient has been selected or approved by this document. Confirm which actual WhatsApp number the customer controls through an authorized private process. Do not send an unsolicited opt-in request.
4. **Stop at the current identity blocker:** the existing CRM contact has no phone and no WhatsApp ID. Inspect whether the Shopify customer profile has a legitimate current phone; that live Shopify fact was not retrieved by this database-only check. Any correction must use existing supported merchant/customer data flows and real verified information, with separate authorization for writes. Do not seed a number, manufacture a WhatsApp ID, create a duplicate contact, or write consent directly. This task performs no correction.

This uniquely locates the existing Shopify-linked customer without publishing personal data. It identifies a candidate for identity review, not a send-eligible customer. The database does not inventory every customer in live Shopify, so no claim is made that Shopify has no other existing customers.

## Identity and consent gate — before the customer acts

The existing writer requires all of these facts, loaded under the current tenant/shop/privacy locks:

- Exactly one active Shopify integration/current installation, current connected WABA and receiving business phone, and a saved consent draft matching that connection.
- One unambiguous tenant-owned Shopify customer/contact mapping. `custom_fields.shopifyCustomerId` / `source_details.shopifyCustomerId` and `custom_fields.shopifyShop` / `source_details.shop` must not conflict. Customer ID and store must match the actual Shopify profile.
- Valid E.164 contact phone, with `contact.phone = '+' + contact.whatsapp_id`, matching the customer's actual inbound WhatsApp sender. No duplicate customer mapping or shared/duplicate phone identity.
- No contact pause, STOP/DNC/opt-out, deletion or Shopify privacy lock. An unpaused contact alone does not establish eligibility. Do not override suppression to pass the pilot.
- Existing **capture-only** permission and current connection fingerprint, strong existing HMAC key and ordered-consent schema readiness. Use the existing Customer WhatsApp consent panel/readiness response; a saved draft, visible embed or Railway variable name does not establish that all gates are ready. Follow the accepted runbook's capture-only procedure if blocked, subject to separate approval; do not change flags here.

Only after identity and capture readiness are verified and the owner approves the chosen participant/purpose, the willing customer can use the **existing storefront Order confirmations notice/link** and personally send exactly:

`YES WHATSAPP ORDER CONFIRMATIONS`

That is a future customer action, not an action authorized or performed by this documentation task. Checkbox selection, link opening, merchant activation, Shopify email/SMS marketing consent and another WhatsApp purpose do not grant this permission. The existing verified raw-body Meta webhook must bind the correct receiving phone/account and fresh sender, then record purpose `orderConfirmation`, customer/contact, recipient HMAC, grant time and ordered inbound WAMID/time with no revocation. Verify that record privately; never insert/replay it. Retain STOP handling and do not repeat accepted STOP/re-opt-in tests.

## Order Confirmation delivery gate — independently still blocked

The existing fulfilled order cannot qualify for Order Confirmation, even after a genuine grant. Its suppressed intent stays closed. Source policy requires a genuine verified `orders/create` event and a freshly checked order whose status is **open**, with the same customer, current installation and valid consent. No new orders, synthetic events or replay are authorized. If no other existing legitimate open-order intent qualifies, wait for ordinary merchant activity under a later approved scope; do not create test activity to satisfy acceptance.

Before any later send approval, require:

1. Existing due `preview_ready` Order Confirmation intent, correct customer/installation, no prior consumed claim/attempt, no suppression and fresh Shopify identity/order recheck. The current database has no such intent.
2. Exact existing bound **Utility** Order Confirmation template, matching current-WABA Meta approval, category, language and body. Reuse the four-template acceptance; do not submit/rebind templates or repeat provider approval tests. Activation's Ready verification must be within 30 minutes and tied to the current connection.
3. Read-only schema/receipt readiness: ordered consent columns, outbox columns/constraints, enabled attempt-preservation trigger and privacy/erasure behavior; accepted `orders/create` subscription/callback evidence and signed Meta receipt routing. Schema presence does not prove the callback's live delivery. No migration is performed here.
4. Private approval for one recipient, purpose, existing intent, template, production target, one provider opportunity and a 15-minute UTC scope. Use the accepted runbook's `controlled-one-intent` controls only after separate approval; never stage true sending flags in this task.
5. Merchant selects **only Order Confirmation** for this production acceptance (the saved three selections are not sufficient), preserving original selections for review, and explicitly enables Customer journeys **last**, only after operator gates pass. Do not alter plans or activate now. Checkout recovery stays off and independent.
6. One provider acceptance plus a matching authentic signed **delivered/read** receipt; `sent` or API acceptance alone is insufficient. Then pause delivery/preparation and merchant preference while retaining late receipts, STOP and all consumed/uncertain attempt fences. No retry/reset after timeout or uncertain outcome.

## Read-only evidence from this follow-up

Production Neon project/branch were explicitly scoped to the existing production target. SQL consisted solely of SELECTs against schema metadata and this pilot's records; no provider calls, key retrieval or writes were made.

| Observation | Result |
| --- | --- |
| Active Shopify integrations for pilot | 1 |
| Shopify-linked CRM contacts for this store | 1 |
| Structural customer/shop metadata consistency for that contact | Matches; phone unique, but phone and WhatsApp ID both absent |
| Complete matching unpaused WhatsApp identities | 0 |
| Order Confirmation intents | 1, suppressed: `order_status_changed`; recorded order fulfilled; no outbox |
| Other existing post-purchase intent | 1 shipping intent blocked on identity and purpose consent; not a substitute for Order Confirmation |
| Production post-purchase consent rows / outbox rows | 0 / 0 |
| Merchant post-purchase delivery preference | False/absent |
| Outbox attempt-preservation trigger | Present and enabled |

This is a current readiness inspection, not repetition of accepted live tests. Current live Shopify phone/order state, runtime flag values, full constraint validation, customer approval, genuine production grant and recipient-specific delivery receipt remain unverified/pending. No personal identifiers appear in this report. The November 12 audit is preserved as its original snapshot; its historical PR #281 status has not been re-audited or changed here.
