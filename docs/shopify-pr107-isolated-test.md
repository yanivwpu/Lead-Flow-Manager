# PR #107 — isolated authenticated Storefront verification (not a checkout release)

## Review findings
- Fixed target: `whachatcrm.myshopify.com`; Storefront API version `2026-10`; fixed development variant `gid://shopify/ProductVariant/51638768632090`.
- Read-only `node` GraphQL queries only: minimal, quantityRule, requiresComponents, requiresSellingPlan and combined.
- Requires a **dedicated private Storefront API token** from the Headless channel, not Shopify Admin OAuth token or the app client secret.
- The script does not create carts, send messages, request customer data, modify merchant settings, or enable the source checkout gate.
- No arbitrary error payload, token or unfiltered response header is printed. The response reader enforces a 16-KiB upper limit; fetch has a 15-second timeout per request. The diagnostic reports a fixed error-code allowlist and a Boolean for the exact locked-channel message.
- Explicit `SHOPIFY_STOREFRONT_TEST_RUN_ONCE=yes` prevents accidental invocations. On completion the process exits; it is **not** a web server or production service.

## Safe Railway staging execution plan
**Do not add the private token to the existing WhachatCRM Staging App service.** It follows `codex/shopify-trial-first-onboarding`, not this PR branch. Also do not put the token in production, GitHub, chat, or browser console.

After reviewing and merging this diagnostic-only PR, create a **separate temporary service in the WhachatCRM Shopify Staging project** linked to `yanivwpu/Lead-Flow-Manager` and a reviewed commit/branch containing this script. Do not connect it to the application's database, volume, domain, webhook, or shared application variables. Configure its start command as `node scripts/diagnose-shopify-storefront-auth.mjs`, with no healthcheck, replicas=1 and no auto-restart. Set only these service-scoped variables directly in Railway Variables (never via GitHub or logs):

- `SHOPIFY_STOREFRONT_TEST_TOKEN` = private token copied from Shopify Headless
- `SHOPIFY_STOREFRONT_TEST_TOKEN_KIND` = `private`
- `SHOPIFY_STOREFRONT_TEST_RUN_ONCE` = `yes`

**Important:** Railway deployments/restarts may rerun start commands. Before applying, ensure one-shot execution is operationally controlled and rollback/redeploy hooks cannot launch another run. Five read-only requests per execution; no writes to Shopify. A successful diagnostic process can exit normally without presenting a web endpoint.

Review the temporary service's deployment output for the five JSON summaries only. A `200` response with `hasData:true` is not sufficient alone: verify the variant is actually returned and matches the intended product before enabling any cart flow. Remove the private token and delete the temporary service after capturing sanitized results. Rotate/revoke test credentials if accidental exposure occurs.

## Test gates
1. `node --check scripts/diagnose-shopify-storefront-auth.mjs`
2. `env -u SHOPIFY_STOREFRONT_TEST_TOKEN node scripts/diagnose-shopify-storefront-auth.mjs` must exit 2 without any network call (POSIX equivalent; Windows: run without token variable).
3. Run with a mocked fetch in a local isolated process and dummy token to verify five POST requests, fixed host/version, no mutation, masked logs, valid JSON, malformed JSON and oversize response classifications before real credentials.
4. Reconfirm the developer product is published to `Whachat Crm Headless` and that token permissions permit product listing; inspect resulting `data.node` during isolated verification without printing product/customer info.
5. Only after an authenticated read-only test passes should we prepare a *separate* checkout-code PR. The live `CHECKOUT_ROLLOUT_APPROVED=false` gate remains unchanged.
