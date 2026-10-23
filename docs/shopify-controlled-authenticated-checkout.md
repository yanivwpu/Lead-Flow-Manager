# Controlled Shopify checkout: authenticated development Storefront

The October 18, 2026 one-time Headless diagnostic for `whachatcrm.myshopify.com` returned HTTP 200 and the matching variant for all five read-only queries with a private token. This does **not** authorize cart creation or merchant rollout.

This PR replaces the **controlled development-store checkout harness** hardcoded tokenless credential with a server-only private credential. It does not change the merchant checkout implementation, Shopify permissions, production environment, app version, database, or `CHECKOUT_ROLLOUT_APPROVED=false`.

## Private credential
Supply `SHOPIFY_CHECKOUT_DEV_STOREFRONT_PRIVATE_TOKEN` **only to a separately approved isolated development validation runtime**. Never use the existing `SHOPIFY_STOREFRONT_TEST_TOKEN` as a production variable or copy it to application staging/production. Do not add this credential to GitHub Actions, screenshots, front-end bundles, webhook logs, or a shared Railway variable group. Missing or blank credentials fail closed before Storefront calls; fixture injection is internal to tests. Only the private header is accepted by the controlled harness.

The preflight calls the same authenticated `ProductVariant` verification, including `quantityAvailable`, after owned Admin installation, developer-plan, app, scope, product-publication and inventory checks. A cart mutation still requires the existing exact-selection approval, short expiry and durable one-time dispatch claim; this PR neither supplies that approval nor runs the CLI.

## Test / review checklist
- Run `npx tsx --test tests/shopping-checkout-harness.test.ts` against this branch, and the checkout regression suite and TypeScript checking before merge. All tests use fixtures and dummy tokens.
- Confirm missing/blank token rejects, tokenless rejects, request headers contain only a dummy fixture private token, no request occurs on denied preflight, and existing cart/ambiguous retry fences still pass.
- Review `quantityAvailable` permission for the selected Headless storefront separately; the read-only diagnostic verified **basic** selected fields, but did not request `quantityAvailable`. If scope absent, fail closed; don't silently downgrade inventory checks.
- Do not merge/deploy/perform `cartCreate` without a separate reviewed, explicitly authorized one-cart development-store test. Keep `CHECKOUT_ROLLOUT_APPROVED=false`.

## Cleanup of prior temporary diagnostic
After recording the sanitized five JSON test outcomes, in Railway `WhachatCRM Shopify Staging > staging > Shopify Storefront Diagnostic TEMP`, remove the `SHOPIFY_STOREFRONT_TEST_TOKEN` variable **before** any new deployment. Remove `SHOPIFY_STOREFRONT_TEST_RUN_ONCE`, and delete the temporary diagnostic service when no longer needed. Never paste credential values in chat. Since a portion of the private token appeared in a screenshot, rotate/revoke and reissue that Headless private token before any additional authenticated use. Check any deployment logs for exposure. The existing staging application and production must remain untouched.

## Remaining release blockers
Authenticated inventory-specific query, explicitly approved one-cart validation, checkout URL/price/quantity verification, receipt key, migrations, merchant rollout permissions, production secret provisioning, security review, and activation approval. Merchant checkout remains OFF.

## Railway isolated one-cart operator runner (draft, NOT DEPLOYED)

Dedicated Railway staged resources:
- Service `Shopify One-Cart Test PREP`, id `cd3e14a1-c6a1-4532-8c67-8bc502d5aa07`.
- Persisted volume `shopify-one-cart-claim` mounted at `/checkout-one-cart` **staged, not provisioned**.
- Production and existing staging application are NOT changed.

The standalone CLI `scripts/validate-shopify-checkout.ts` now permits Railway execution only from the exact pinned service ID with `CHECKOUT_TEST_RAILWAY_SERVICE_ID` matching it. For `--preflight`, `CHECKOUT_TEST_PHASE=PREFLIGHT`; for `--create-one-cart`, `CHECKOUT_TEST_PHASE=AUTHORIZED_ONE_CART` and `CHECKOUT_TEST_APPROVED_ONCE=CREATE EXACTLY ONE DEVELOPMENT STORE CART`. A missing exact persistent volume mount fails closed; claims are stored at `/checkout-one-cart/private-claim/cart-dispatch-consumed.json` (exclusive create + fsync, never cleared on errors). The client DB transaction remains `BEGIN READ ONLY`. A new deployment reuses the volume's consumed claim rather than silently allowing another cart.

**Not safe to deploy a cart mode yet.** The script requires a selection JSON file, separate short-lived approval JSON file, a **read-only** DB connection for development installation lookup, and a server-only private Headless credential. These have not been attached to the staged service. Never inject secrets into repository, public logs or shared variables. For first run configure only `--preflight` with no approval file and verify exact fresh Admin product data. If the selection price/options do not match fresh Admin, fail closed and regenerate selection. A Storefront $600 price observed at 01:37 EDT is not sufficient Admin evidence.

**Approval request to be presented only after preflight passes:** create exactly one development-store cart on `whachatcrm.myshopify.com`, product `gid://shopify/Product/10108113912090`, variant `gid://shopify/ProductVariant/51638768632090`, quantity 1, current live Admin-verified USD price and selected options. No order submission, charge, customer message or merchant activation. Operator must authorize that exact selection digest in a time-limited approval (maximum 30 minutes), then explicitly authorize deployment of the mutation-capable runner. Do not use the read-only diagnostic service as cart runner.

Potential operational issue: a one-shot Railway process may exit successfully and Railway may classify it as a non-serving deployment; review logs/receipt privately. Do not redeploy mutation after uncertain outcome. Persistent volume must remain attached and retained until cart result is conclusively recorded.
