# Staging webhook restoration

## Evidence and release blocker

The operator verified `staging-v2-oauth-fix` has webhook API version 2026-10 but
no subscriptions, while merchant grants include read_customers and read_orders.
The repository base ddcff43775e5ec967885e8d1bfb72f2b43dc4af4 has only production
Shopify TOMLs. No reproducible staging subscription configuration exists there.
A version's API version setting alone does not register callbacks. This explains
missing app-level subscriptions; the exact commerce registration rejection is
unknown until the live audit or registration failure evidence is examined.
OAuth success and scope grants do not prove webhook registration.

`shopify.app.staging.toml` declares the three compliance topics and two commerce
topics at the exact staging Railway URLs, preserving non-embedded mode, callback,
scopes, API version, and non-legacy install flow. Its client_id is intentionally
empty: the repository contains no verified staging identity and Railway OAuth
returns variable names only. **This configuration cannot be released yet.**
Obtain the public client ID/API key from the **WhachatCRM Staging** Dev Dashboard
and compare it with the existing staging Railway SHOPIFY_API_KEY using the
operator's secure access. Do not send or replace SHOPIFY_API_SECRET. Populate
only staging TOML's client_id, then validate against the independently verified
ID. The validator rejects both production IDs, an empty ID, and mismatches.
Configuration tests check the blocked template; passing them does not establish
that staging identity has been verified.

## Ownership and backend

Compliance and staging commerce belong to the app version. Do not add uninstall
to staging TOML: the base registers APP_UNINSTALLED per shop at
`/api/shopify/webhooks/app-uninstalled`, and the operator reports it verified.
The reported active version has no app subscriptions, consistent with that
per-shop ownership. No live subscription audit was performed in this change.

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

Use Shopify CLI 3 with access to the organization owning WhachatCRM Staging.
If authentication is needed, use `shopify auth login`. Select the existing
staging app, never create or link the production app. If app linking is needed,
`shopify app config link --config staging --client-id "$SHOPIFY_STAGING_CLIENT_ID"`
may rewrite the local TOML; review the diff and retain every required subscription
and the exact settings from this PR. Re-run validation afterwards.

After securely obtaining the public staging client ID and writing it to TOML:

```sh
python3 scripts/validate-shopify-staging.py --client-id "$SHOPIFY_STAGING_CLIENT_ID"
# Optional preparation only; this creates a version but does NOT release it:
shopify app deploy --config staging --version staging-v3-webhooks --no-release
```

Only after explicit approval, release that prepared staging version:

```sh
python3 scripts/validate-shopify-staging.py --client-id "$SHOPIFY_STAGING_CLIENT_ID" &&
shopify app release --config staging --version staging-v3-webhooks
```

Alternatively, the one-step staging deployment AND release command, also requiring
explicit approval, is:

```sh
python3 scripts/validate-shopify-staging.py --client-id "$SHOPIFY_STAGING_CLIENT_ID" &&
shopify app deploy --config staging --version staging-v3-webhooks
```

These commands resolve shopify.app.staging.toml; they must never use the default
or whachatcrm configuration. None was executed for this PR. Do not uninstall or
reinstall whachatcrm.myshopify.com. No production deployment is authorized.

## Separate completion gates

1. GitHub PR reviewed and merged into codex/shopify-trial-first-onboarding.
2. Railway staging code deployment verified separately, if desired; a merge may
   trigger its existing deployment automation. Neither step releases a Shopify version.
3. Staging Shopify identity verified and app version explicitly approved/released.
4. In Shopify Dev Dashboard, inspect the active version for all three compliance
   topics and both commerce topics with exact staging URLs. Local TOML is intent.
5. Use the existing authenticated read-only /api/shopify/webhooks/health audit for
   whachatcrm.myshopify.com (or the existing Sales Admin gated audit). Confirm actual
   read_customers/read_orders grants and the uninstall callback. Inspect actual
   commerce registrations and duplicates; distinguish app-scoped configuration
   evidence from the per-shop API. Unknown checks must remain unverified.
6. Test delivery separately with Shopify CLI/Dashboard test facilities or existing
   event evidence and staging logs; verify signatures, response, and processing.
   Registration does not prove delivery. Under the current no-data-change mandate,
   use only invalid-signature negative probes and existing delivery evidence.
   Valid customer/order or privacy events can write or erase data: obtain separate
   authorization and disposable fixtures before sending them. Do not create real
   customers/orders, invoke uninstall, or send live redaction events for this task.

No merge, Railway deployment, Shopify version preparation/release, live webhook
registration change, merchant-data change, or store reinstall was performed.
