# Inventory-only Shopify 2026-01 query contract failure

## Evidence and root cause

The supplied read-only production evidence for whachatcrm.myshopify.com is a ready catalog with 17 imported products, 13 published, zero verified available products, 13 with unverified inventory, and `checkpoint.inventory.errorCode=invalid_response`, `failures=6` with durable backoff active. No production response body or credentials were available in this workspace; this investigation does not claim a live production API replay or production recovery. The invalid query is independently reproducible from the deployed code and official schema.

`server/shopify.ts` pins the Admin API to `ApiVersion.January26`. Both background inventory renewal and AI `verifyForPurchase` reach `refreshInventoryBatch` → `shopifyCatalogRequest` → `createCatalogRequest` → the bounded Shopify SDK GraphQL request. The `VerifyInventoryBatch` operation originally selected:

```graphql
... on ProductVariant { id title sku selectedOptions price ... }
```

In [Shopify Admin API 2026-01 ProductVariant](https://shopify.dev/docs/api/admin-graphql/2026-01/objects/ProductVariant), `selectedOptions` is `[SelectedOption!]!`, an object list, not a scalar. Its selected objects require a selection set; the existing full-product sync already correctly requests `selectedOptions { name value }`. The inventory-only operation omitted that set. GraphQL rejects it during query validation, before executing variant, inventory or shop resolvers. This defect is independent of this store's product data and does not require a permission change to repair.

The SDK can expose GraphQL errors under `errors.graphQLErrors` (or throw an error with `response.errors.graphQLErrors`); an HTTP response may also contain an `errors` array. `createCatalogRequest` rejects errors before unwrapping `response.data`. A selection mismatch is therefore classified as `invalid_response` without reaching inventory `nodes`/shop identity checks. The exact historical production body is unavailable, so the supplied generic error code alone cannot prove which individual guard fired on every past attempt. The missing object selection is nevertheless a deterministic validation error in every request made with the original query.

The correction is `selectedOptions { name value }`. Price remains the Admin API `Money` scalar (a decimal string), not a Storefront `MoneyV2` object. Variant/product/inventory IDs, option objects, booleans, shop currency and canonical `myshopifyDomain` continue to use the Admin contract. No Storefront/cart API is involved.

## Safe diagnostics and safety boundaries

`CatalogApiError.detail` and `checkpoint.inventory.errorDetail` now contain only bounded internal categories: GraphQL selection mismatch/other GraphQL error, inventory nodes shape, canonical shop identity, currency, or variant shape/identity. Raw provider messages, node names, request variables, shop/customer payloads and tokens are never copied into these diagnostics or logged. Existing `errorCode` values and backoff behavior are preserved. A successful owned verification clears the diagnostic alongside the error/failure count.

A valid response with a null/deleted node is distinct: its previous snapshot is invalidated; it is not newly available and does not generate this GraphQL-validation error. Wrong shop/currency/variant identities or malformed option name/value objects reject the response before timestamps can advance. OAuth installation/token fences, source leases, publication/subscription-product checks, bundle exclusions, 15-minute freshness, background batch limits, the shared two-second minimum quota cooldown and exponential durable backoff remain authoritative.

## Recovery and validation

The regression uses an isolated PostgreSQL-compatible fixture with 17 imported/13 published products and expired snapshots. A synthetic Shopify-shaped selection error reproduces the pre-data-validation failure and persists only the safe diagnostic. Active usage does not bypass the existing deadline, including six real failed fixture requests (30 seconds × 2⁵ = 16 minutes for this error; the shared maximum remains 30 minutes for longer retry bases). After the disposable fixture's deadline is advanced to model natural expiry, the existing demand-driven worker renews the published variants with the fixed inventory-only query, clears the error and restores eligible snapshots without changing full-sync timestamps/request intent. No production deadline or checkpoint is reset by this change.

The existing shared inventory fixture now checks that the options object fields are requested, so malformed query text cannot silently receive a successful fake response again. This is a focused contract guard, not a claim to validate the complete Shopify schema. Wrapper regressions cover returned and thrown SDK error shapes, raw GraphQL errors and partial data with errors. Additional cases distinguish null nodes, malformed nodes/options, currency and shop identity, and existing tests retain quotas/backoff, tenant/token fences, idle suppression, publication and 1,001-product bounded renewal. AI discovery/variant-selection integration uses the same guarded fixture.

After review and authorized deployment, active catalog/Web Chat use will extend demand as before. An already persisted backoff remains in force until its deadline (up to 30 minutes at the cap); the next successful worker/live verification can then renew snapshots. If there is no active demand, idle suppression remains intentional. Production recovery still needs a separate read-only check after deployment: safe error categories, advancing verification timestamps/eligible counts, and unchanged full-sync timestamps. No permissions, subscriptions, messages or checkout changes are included.
