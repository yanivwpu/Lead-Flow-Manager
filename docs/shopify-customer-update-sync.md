# Shopify customer update synchronization

## Cause and implementation

The installed staging app did not subscribe to `customers/update`; there was no
receiving route. Creation also acknowledged before in-memory processing completed,
and matching preferred mutable phone/email hints over stable Shopify customer IDs.

Staging now has six app-level subscriptions. The new customer route and the existing
create route require original raw bytes, the configured app secret's HMAC, a
canonical Shopify domain, the expected topic and an event/delivery ID. They parse
the verified bytes. Installation authorization is rechecked inside the same
shop advisory transaction lock used by orders, uninstall and privacy erasure.
Unknown, inactive or ambiguous merchants and mismatched integration shops fail
closed. Durable redaction tombstones are checked first; suppressed customers are
acknowledged without retaining their payload or creating CRM records.

`syncShopifyCustomer` is the quiet customer branch of the commerce architecture.
It reuses contacts, commerce conversations, activity events and privacy locks;
no new table or migration is required. It deliberately writes through one database
transaction instead of the general storage lifecycle hooks: synchronization invokes
no messaging, automation dispatch, campaign opt-in or external contact exports.
Customer creation now uses this same quiet path, so it also does not invoke the
previous customer-created automation or HubSpot export. Order processing and its
existing automations remain separate. Review this behavioral change before release.

## Identity, durability and fields

A SQL lookup scopes the stable customer ID to the authorized tenant and shop, with
no 2,000-contact cap. Existing legacy contacts without an explicit shop are accepted
only in their owning installation; explicitly different shops are excluded.
Ambiguous existing duplicate IDs return 409 for operator review instead of choosing
a contact. The general commerce matcher also prefers stable IDs before phone/email,
so a later order uses the synchronized contact.

Customer data, quiet conversation, activity and the last successful event ID/source
`updated_at` commit together. Any failure rolls back all four and returns 503;
Shopify's delivery retry is the recovery mechanism. A 200 is sent only after commit
(or a deliberate suppression/disabled/stale outcome). Retries after a lost response
observe the committed watermark and do not add activities. Create and update share
the shop lock, so concurrent instances cannot create two contacts. An update before
create safely creates a quiet contact; the later older create is ignored.

The source version uses Shopify `updated_at`, with `created_at` as the conservative
fallback; an event with neither valid timestamp or a stable customer ID is rejected.
Versions older than or equal to the committed source timestamp are ignored.
Equal timestamps are first-write-wins: Shopify timestamps cannot order conflicting
snapshots within the same timestamp. No local clock is used to invent source order.
A same-ID retry is ignored too. Event identity and ordering metadata are stored in
`customFields.shopifyCustomerSync`; old deliveries need no separate event ledger.

Nonblank valid names, email and phone update the existing contact. Partial names
retain the other component (legacy names are conservatively split where needed).
Null, absent, blank and invalid fields never clear CRM values. Explicit clearing is
intentionally unsupported until trustworthy field ownership/clearing semantics are
available. Customer ID, shop, order count and total spent are retained in Shopify's
namespace. CRM tags, notes, pipeline, assignment, follow-ups, pause flags, other
custom fields, channel identities, conversations and messages are preserved.

Consent remains metadata under `shopifyCustomerSync.consent`. Valid supplied
email/SMS consent and legacy `accepts_marketing` are retained; omitted consent
preserves the prior snapshot. No consent is inferred from an address, and no
Shopify consent changes CRM suppression or grants WhatsApp permission. CRM's
unsubscribe tag and suppression preferences remain unchanged. Aggregate logs expose
topic/outcome or status without customer payloads, shop IDs, credentials or provider
errors. Activity records retain delivery IDs for authorized fixture diagnosis.

## Validation

Run against an explicitly disposable localhost database named `whachat_shopify_test`:

```sh
export SHOPIFY_TEST_DATABASE_URL=postgres://shopify_test:shopify_test@127.0.0.1:5432/whachat_shopify_test
export DATABASE_URL="$SHOPIFY_TEST_DATABASE_URL"
node --import tsx --test tests/shopify-customer-update.test.ts tests/shopify-contact-privacy-postgres.test.ts
python3 tests/shopify-staging-config.test.py
python3 scripts/validate-shopify-staging.py --client-id 2e424c769c25776a9086c36490ed14fc
TYPECHECK_BASE_SHA=<exact-PR-base-SHA> node scripts/check-types-against-base.mjs
npm run build
```

The new suite also runs with an in-memory PGlite database when the explicit native
test URL is absent. The separate-connection privacy race runs on native PostgreSQL.
CI runs the new suite against its existing PostgreSQL service. Existing Shopify
privacy, OAuth, onboarding, billing/trial and CRM contact lifecycle suites must pass.
All test data is disposable; no merchant records or real messages are used.

## Exact staging release and verification (operator actions; not executed)

1. Review and merge the PR into `codex/shopify-trial-first-onboarding` only when
   authorized. Separately approve deploying its backend commit to the existing
   Railway **staging** app/service. Verify its URL is
   `https://whachatcrm-staging-app-staging.up.railway.app`, its key is
   `2e424c769c25776a9086c36490ed14fc`, and its existing app secret belongs to that
   installed app. Do not change production, variables, billing, trial state or
   the duplicate app ending in `b56`.
2. Confirm backend readiness before enabling delivery: both customer routes are
   present and unsigned requests reject with 401. Confirm the development store's
   existing active integration has `new_customers` enabled. Verify protected customer
   data access for name/email/phone on this exact staging app. Do not reinstall.
3. Validate the six exact topic/destination pairs locally. After explicit release
   approval, using Shopify CLI 3 authenticated to the owning organization:

   ```sh
   python3 scripts/validate-shopify-staging.py --client-id 2e424c769c25776a9086c36490ed14fc
   shopify app deploy --config staging --client-id 2e424c769c25776a9086c36490ed14fc --version staging-v5-customer-update-webhooks
   ```

   Keep the interactive identity confirmation; deploy releases by default. To prepare
   without release, append `--no-release` only after preparation is authorized.
   A prepared version is released only after separate approval with
   `shopify app release --config staging --version staging-v5-customer-update-webhooks`.
4. Run `shopify app versions list --config staging`. In the Dev Dashboard for the
   full client ID, confirm this version is active and lists all six destinations:
   the previous five plus `customers/update` at
   `/api/shopify/webhooks/customers-update` on the staging origin. App-level commerce
   subscriptions are authoritative; do not use per-shop registration as a substitute.
5. With separately authorized disposable development-store fixtures, create a new
   Shopify customer, then add/change email, name and phone. Match Shopify Monitoring
   delivery topic, destination, ID, timestamp and successful response with aggregate
   staging sync logs and the fixture's activity. Verify one CRM contact ID survives,
   supported fields change, notes/tags/stage/assignment/messages survive, and no
   outbound messages or workflow executions appear. Use disposable addresses such
   as `three@example.invalid`, not real customer data.
6. Retry an authorized fixture delivery and send an older signed fixture through local
   tests; confirm no additional activity or regression. Verify a transient processing
   failure returns 503 and retry succeeds. Do not manually replay real customer or
   privacy webhooks. Configuration presence alone is not proof of delivery.

## Production readiness

Both production TOMLs are unchanged. Neither currently configures this new topic.
Enabling production requires separate approval, production protected-data review,
backend rollout and an app-level `customers/update` subscription pointing at that
production app's own `/api/shopify/webhooks/customers-update` URL. Review any existing
per-shop ownership before release; this PR does not register production updates.
The read-only webhook health UI's existing required-topic list is unchanged, so
operators must verify the new app-level topic in the active version and delivery logs.

Releasing this feature does not backfill missed historical updates. The reported
existing customer will update on a subsequent authorized customer change/delivery;
no live customer data was read or changed here. Existing duplicate IDs require
operator remediation. Equal-time conflicting snapshots and true clearing semantics
remain conservative limitations. The shop-wide privacy lock serializes customer
writes behind existing order/erasure work; monitor latency and Shopify retry delivery.
Transient recovery depends on Shopify's bounded retries; exhausted deliveries need
an authorized operator replay. Existing order acknowledgments and order automation
behavior are outside this customer-only change. No new marketing capability is enabled.
