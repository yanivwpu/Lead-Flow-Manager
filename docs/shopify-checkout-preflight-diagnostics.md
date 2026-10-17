# Checkout preflight 503 diagnostics

Baseline: production `1c38675aa5e4fbe41b549bda35a35c728cd9e404` (PR #99).

## Evidence and limits

The deployed access route succeeds, while preflight returns 503 and the journal
remains empty. Railway's bounded logs contain the preflight HTTP status/duration,
but no associated GraphQL exception or failed verification stage. No Admin API
credential is available through the connected Railway OAuth API, and no live
Shopify response was replayed. These facts do not establish which Shopify guard
failed. An empty journal means preflight did not finish recording readiness; it
does not identify a specific check.

The confirmed diagnostic defect is the route's catch-all fallback: installation
exceptions, Admin errors, attestation failures, selection changes and Storefront
errors all became `checkout_test_failed_closed_do_not_retry_cart`. In addition,
`accessScopes?.map(...)` could throw for a malformed non-array value. This change
adds a fixed error vocabulary and explicitly rejects malformed scope grants.
It does not guess that the production shop, permissions or product data are wrong.

## API/schema review

- Admin requests use the existing Shopify SDK pinned to `ApiVersion.January26`
  (`2026-01`) in `server/shopify.ts`. No global version change is made.
- Admin [App](https://shopify.dev/docs/api/admin-graphql/2026-01/objects/App)
  exposes scalar `apiKey`. The [shop query reference](https://shopify.dev/docs/api/admin-graphql/2026-01/queries/shop)
  includes `plan { partnerDevelopment }`. These checks remain mandatory.
- Admin [ProductVariant](https://shopify.dev/docs/api/admin-graphql/2026-01/objects/ProductVariant)
  exposes scalar `price` and `availableForSale`, and object-list `selectedOptions`.
  The existing inventory query correctly selects `selectedOptions { name value }`.
- The tokenless [Storefront API](https://shopify.dev/docs/api/storefront/2026-10)
  uses the separate supported `2026-10` endpoint. Its [ProductVariant](https://shopify.dev/docs/api/storefront/2026-10/objects/ProductVariant)
  has object-valued `price` and `quantityRule`; the outgoing query selects their
  subfields. It continues to omit token-only inventory fields. Some object docs
  redirect to `latest`; documentation review is not a live schema/authorization test.
- Storefront served-version, JSON and GraphQL failures now retain a fixed internal
  detail alongside the existing CheckoutError code. Request documents, API versions,
  acceptance criteria, mutation ambiguity handling and retries are unchanged.

No confirmed outgoing-query incompatibility was found. Do not upgrade versions,
relax guards or request more Shopify privileges merely to make preflight pass.

## Authorized administrator response codes

Responses remain private/no-store and contain only `{ "error": "fixed_code" }`.
The existing owner/admin, exact workspace/operator allowlists and authenticated
session checks run before any detailed verification diagnostics are returned.

| Code/category | Meaning |
| --- | --- |
| `active_development_installation_required` (409) | No owned active installation; unchanged. A null installation alone does not explain a 503. |
| `checkout_test_installation_failed` | Installation lookup threw an exception. |
| `checkout_test_admin_variant_*` | Initial or repeated Admin variant query failed; suffix distinguishes transport, permission/throttle, GraphQL selection/schema error, or malformed response. |
| `checkout_test_admin_metadata_*` | Live development-store/app/grant metadata query failed. |
| `checkout_test_shop_identity_not_verified` | Canonical shop domain does not match. |
| `checkout_test_development_store_not_verified` | Development-plan flag is not exactly true. |
| `checkout_test_app_identity_not_verified` | App identity does not match the fixed production app. |
| `checkout_test_product_inventory_permissions_not_verified` | Required grants missing or malformed. |
| `checkout_test_selection_failed` | Live selection cannot be parsed. |
| `checkout_test_selection_unavailable_or_changed` | Product/variant, publication, price/currency/options or availability guard failed. |
| `checkout_test_inventory_insufficient` | Tracked, non-overselling variant lacks sufficient verified stock. |
| `checkout_test_storefront_api_version_mismatch` | Shopify served a version different from pinned Storefront 2026-10. |
| `checkout_test_storefront_graphql_error` | Storefront returned GraphQL errors; no provider text is exposed. |
| `checkout_test_storefront_invalid_json` | Storefront response could not be decoded. |
| `checkout_test_storefront_setup_required` | Storefront authorization failed. |
| `checkout_test_storefront_unavailable` / `_changed` / `_invalid_response` | Transport, exact selection or response validation failed. |
| `checkout_test_journal_failed` | Verification finished but readiness persistence failed. |

Error messages, Shopify responses, stack traces, credentials, URLs/cart keys,
SQL/database details and operator/customer data are never copied into diagnostics.
Unknown exceptions map to a fixed stage failure. No raw logging is added.

## Validation and follow-up

The existing CI admin step runs the expanded test file. Regressions inject failures
at each stage, including GraphQL errors, malformed grants, unavailable/publication
and inventory states, Storefront version/auth/JSON/transport/selection errors.
They assert fixed private response codes, zero mock cart mutations and empty journals.
Existing approval, session, expiry and durable dispatch claims remain tested.

After separate review and deployment, an authorized administrator should run only
**Verify Shopify Checkout Readiness** and report the single returned error code.
That establishes the actual production failing stage. No automatic deployment,
real cart creation, claim reset, migration, production variable change, customer
message, or customer checkout activation is part of this change. The source rollout
gate remains false. Mutations after a committed claim retain the generic no-retry
failure response and are never redispatched automatically.
