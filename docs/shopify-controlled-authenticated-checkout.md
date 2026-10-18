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
