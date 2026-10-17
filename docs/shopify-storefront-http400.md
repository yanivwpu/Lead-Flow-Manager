# HTTP400: request audit and bounded read-only error classification

Baseline: production 16cfe9dc16cd2f741eb03b4d67a54228e058b778, PR #105.
Operator-attested live result: HTTP400, JSON, no followed redirect, API-version
header present. This establishes a request rejection, not its underlying cause.
No raw live error payload or existing authenticated runtime execution channel is
available in this chat. Do not claim a verified Shopify root cause from status alone.

## Exact existing request

POST https://whachatcrm.myshopify.com/api/2026-10/graphql.json
with Content-Type: application/json and no token/cookie/password header.
The JSON body has query and variables keys; there is only one named operation,
so operationName is not required. Its variable is id, a non-null ID string:

```graphql
query CheckoutVariant($id:ID!) {
  node(id:$id) {
    ... on ProductVariant {
      id availableForSale
      quantityRule { minimum maximum increment }
      requiresComponents
      selectedOptions { name value }
      price { amount currencyCode }
      product { id requiresSellingPlan }
    }
  }
}
```

For the attested selection the variables object is exactly:

```json
{"id":"gid://shopify/ProductVariant/51638768632090"}
```

The variant is supplied by the existing fixed selection/owned Admin verification,
not substituted from a product ID, browser query or raw merchant input. The provider
validates Product and ProductVariant GID types before dispatch and serializes the
query/variables with JSON.stringify. Existing fixtures pin all requested fields,
variable shape, tokenless headers and exact selection checks. The provider, request
contract, version, no-retry policy and all checkout safeguards are unchanged here.

## Official 2026-10 review

Reviewed October 17, 2026; versioned references currently redirect to latest pages
explicitly displaying 2026-10. Generic object scope headings are not live authorization
proof for the selected fields. This reference audit cannot substitute for the exact
installed development store's response.

- [Storefront authentication and endpoint](https://shopify.dev/docs/api/storefront/2026-10):
  documents tokenless product/cart access and the versioned JSON POST endpoint.
- [node](https://shopify.dev/docs/api/storefront/2026-10/queries/node): accepts id: ID!
  and returns Node, allowing a ProductVariant inline fragment.
- [ProductVariant](https://shopify.dev/docs/api/storefront/2026-10/objects/ProductVariant):
  the selected scalars/objects exist; retained fields show no explicit token-only
  marker. quantityAvailable is explicitly token-required and is not requested.
- [QuantityRule](https://shopify.dev/docs/api/storefront/2026-10/objects/QuantityRule),
  [SelectedOption](https://shopify.dev/docs/api/storefront/2026-10/objects/SelectedOption)
  and [Product](https://shopify.dev/docs/api/storefront/2026-10/objects/Product): the
  nested selections and requiresSellingPlan exist with the selected shapes.
- [Response handling](https://shopify.dev/docs/api/usage/response-codes) and
  [Storefront error handling](https://shopify.dev/docs/api/storefront/2026-10#status-and-error-codes):
  status alone does not identify a GraphQL failure. The Storefront reference includes
  HTTP400 errors.query rejection examples; structured errors can carry extensions.code.

No confirmed syntax, variable, field or tokenless authorization defect was found in
this review. A hypothesis about node, quantityRule, store passwords or scope grants
is insufficient reason to remove a guard, change the endpoint/version or add a token.

## Confirmed diagnostic defect and smallest correction

The production provider rejects every non-success HTTP status before JSON parsing.
The existing admin diagnosis captures metadata but discards structured HTTP400
error information. This patch corrects that gap only in the existing diagnose action:

1. Observe the existing Response; do not send an additional request.
2. Only for HTTP400 JSON, compare a present served API version with the fixed pin,
   then consume at most 16 KiB with a 2-second total read deadline.
3. Classify errors through fixed known extensions.code values. A rejected field
   name is included only if it exactly matches the audited request's finite field
   allowlist. Unknown codes/messages, mixed errors, malformed/large/stalled bodies
   remain explicit fixed unknown/limit categories. No message parsing or raw echo.
4. Return the same five keys. Replace only errorCategory with the fixed
   checkout_test_storefront_bad_request_ suffix when the existing provider confirms
   HTTP400 client rejection. Never treat the classified response as verification success.

Examples of suffixes include graphql_undefined_field_quantityRule,
graphql_variable_invalid, graphql_access_denied, graphql_complexity_exceeded,
request_envelope_rejected, api_version_mismatch and graphql_error_unclassified.
An access-denied code does not itself prove that adding a scope is appropriate.
An envelope rejection does not prove whether the query was altered in transit.

The error JSON exists transiently in memory and is never logged, stored or returned.
No arbitrary extensions, paths, IDs, messages, URLs, cookies, Location, credentials
or header values are exposed. Only fixed categories and existing HTTP metadata leave
the diagnostic action. Other statuses and ordinary preflight/create behavior do not
read this diagnostic body. The readiness journal is still skipped on diagnosis.

## Next safe test and limits

After separate review/deployment, use the same authenticated administrator session:
POST {} to /api/sales-catalog/commerce/checkout-test/diagnose. The existing installed
store/app/grant/publication/variant/inventory verification and only tokenless
CheckoutVariant query run. No readiness insert, approval, cart, order or payment.
Return the five fields and fixed category. That live category, not fixture tests,
provides the next evidence for a request correction. If it remains unclassified,
no password/scope/query correction is justified; retain the gate and investigate
only through another explicitly reviewed read-only check or Shopify support.

No production merge/deployment/configuration, secret/scope/password change, Shopify
app release, migration, cart, customer action, message or checkout activation was
performed. The production checkout gate stays OFF.
