# Staging webhook restoration

## Confirmed staging identity

The owner and Shopify Support confirmed that the app installed on
`whachatcrm.myshopify.com` is **WhachatCRM Staging**, client ID
`2e424c769c25776a9086c36490ed14fc`. The owner confirmed Railway staging's
existing `SHOPIFY_API_KEY` matches this ID. Its reported active version is
`staging-v1`; these are supplied confirmations, not a live dashboard audit.

A second app has the same name but client ID
`71a0de963ce2fb0c2e970c904eabbc56` and reported version
`staging-v3-webhooks`. The previous staging TOML targeted that duplicate,
so releasing its webhooks did not configure the installed app. Do not use,
modify, or delete the duplicate. Identify apps by full client ID, never name.

The corrected TOML retains all five destinations listed below, API version
`2026-10`, `embedded = false`, `read_customers,read_orders`, the staging
application URL and `/api/shopify/callback`. The validator pins the installed
app ID and rejects the duplicate, both production identities, empty IDs,
identity mismatches, production URLs, unexpected credentials, and missing or
duplicate subscriptions. An independently supplied verified ID is still required.

| Topic | Destination |
| --- | --- |
| `customers/create` | `https://whachatcrm-staging-app-staging.up.railway.app/api/shopify/webhooks/customers-create` |
| `orders/create` | `https://whachatcrm-staging-app-staging.up.railway.app/api/shopify/webhooks/orders-create` |
| `customers/data_request` | `https://whachatcrm-staging-app-staging.up.railway.app/api/shopify/webhooks/customers/data_request` |
| `customers/redact` | `https://whachatcrm-staging-app-staging.up.railway.app/api/shopify/webhooks/customers/redact` |
| `shop/redact` | `https://whachatcrm-staging-app-staging.up.railway.app/api/shopify/webhooks/shop/redact` |

## Protected customer-data gate

Authorization on the installed app remains **unverified**: this task has no
authenticated Shopify dashboard reader. Selections saved on the duplicate do
not establish access for the installed app. OAuth scopes alone do not prove it.
Before any Shopify version preparation or release, the owner must:

1. Open Shopify Partner Dashboard → Apps → WhachatCRM Staging. Cross-check its
   client ID in Dev Dashboard → Settings before proceeding: it must be
   `2e424c769c25776a9086c36490ed14fc`.
2. Open **API access requests** → **Protected customer data access** →
   **Request access** (or the existing access details).
3. Check that **Protected customer data** and the fields actually used by this
   staging integration have saved selections and accurate use reasons. If missing,
   select the needed data and fields, enter truthful reasons, and **Save**.
4. Record the saved selections/status for this client ID. Do not copy declarations
   about safeguards without verifying them. If the section is absent or access is
   denied, stop and ask Shopify Support about this exact client ID; do not bypass it
   or change the app's distribution as part of this task.

Shopify's [protected customer-data guide](https://shopify.dev/docs/apps/launch/protected-customer-data)
requires a distribution method before requesting access and explains that
apps installed only on development stores can use selected data after saving
step 5, without review submission. This does not establish this app's current
status or production approval. Missing access can block commerce subscriptions.
Do not query customer records to test authorization.

## Ownership and backend

Compliance and staging commerce belong to the app version. Do not add uninstall
to staging TOML: the base registers APP_UNINSTALLED per shop at
`/api/shopify/webhooks/app-uninstalled`, and the operator reports it verified.
Uninstall retains its existing per-shop ownership. No live subscription audit
was performed in this change.

Per-shop registration first verifies grants and a complete subscription lookup.
A single matching callback is reused. Conflicts or duplicates fail without
creation or deletion. Lookup failure blocks mutation, and “already taken” or a
created ID alone cannot report success without a callback read-back. Staging
commerce never creates parallel per-shop registrations: missing per-shop
entries return skipped_verification and direct the operator to the app version.
The audit from PR #66 is unchanged and remains read-only and fail-closed. An
app-scoped commerce subscription may not appear in the per-shop query; in that
case confirm it in the active version and record the limitation separately,
rather than clicking Re-register to create another subscription. No optimistic
health override is introduced.

All five backend routes exist. Customer privacy and store-redaction handlers
require raw bodies and Shopify HMAC verification before processing. Commerce
and uninstall also call verifyWebhookHmac, which uses SHA-256 with the existing
secret and a timing-safe comparison; malformed lengths reject. The server's
Shopify webhook body parser captures the original bytes. Signature handling,
trial ledger, billing, OAuth routes, and production TOMLs are unchanged.

## Operator preparation and explicitly approved release

Use Shopify CLI 3 authenticated to the organization owning the installed app.
Do not relink or regenerate the TOML. Check the client ID, protected-data gate,
and existing active version first. Never use the default or `whachatcrm` config.
Use a new version label, `staging-v4-identity-webhooks`, to distinguish this
release from the version on the duplicate app.

Only after owner approval, the exact one-step deployment and release command is:

```sh
python3 scripts/validate-shopify-staging.py --client-id 2e424c769c25776a9086c36490ed14fc &&
shopify app deploy --config staging --client-id 2e424c769c25776a9086c36490ed14fc --version staging-v4-identity-webhooks
```

Keep the interactive confirmation and verify that it names the correct app ID.
Do not add force or automatic deletion flags. An optional owner-approved
preparation command adds `--no-release` to that same deploy command; this still
writes a Shopify version and was not executed in this task. Release a prepared
version only with a separate owner-approved
`shopify app release --config staging --version staging-v4-identity-webhooks`
after revalidating the TOML. Shopify's [deploy command reference](https://shopify.dev/docs/api/shopify-cli/app/app-deploy)
documents that deploy releases by default, `--client-id` explicitly selects the
app, and `--no-release` prepares a version without activating it.

None of these commands was executed. No Railway variables need changing.
Do not uninstall or reinstall `whachatcrm.myshopify.com`.

## Separate completion gates

1. GitHub PR reviewed and merged into codex/shopify-trial-first-onboarding.
2. Railway staging code deployment verified separately, if desired; a merge may
   trigger its existing deployment automation. Neither step releases a Shopify version.
3. Installed staging identity and protected-data selections verified, then app version explicitly approved/released.
4. Run `shopify app versions list --config staging` and, in Dev Dashboard for
   client ID `2e424c769c25776a9086c36490ed14fc`, confirm Versions marks
   `staging-v4-identity-webhooks` active. Inspect that version for all three compliance
   topics and both commerce topics with exact staging URLs. Local TOML is intent.
5. Use the existing authenticated read-only /api/shopify/webhooks/health audit for
   whachatcrm.myshopify.com (or the existing Sales Admin gated audit). Confirm actual
   read_customers/read_orders grants and the uninstall callback. Inspect actual
   commerce registrations and duplicates; distinguish app-scoped configuration
   evidence from the per-shop API. Unknown checks must remain unverified.
6. After release, inspect existing Dev Dashboard **Monitoring / Logs** delivery
   entries for this app and development store. Match each topic and exact URL,
   delivery time, response status, and webhook ID with staging application logs.
   Check for verified signatures, successful responses, and processing evidence
   without exposing customer payloads. Configuration alone does not prove delivery;
   no existing event means delivery remains unverified. Do not send test webhooks,
   replay events, create customers/orders, or trigger privacy erasure during this
   task. Any later fixture-based delivery test needs separate owner authorization.

No merge, Railway deployment, Shopify version preparation/release, live webhook
registration change, merchant-data change, or store reinstall was performed.
