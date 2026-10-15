# Shopify shared Sales Catalog — Phase 1B

PR #82 is merged in base `40792c96517b5e0bf5b12c8bdccc3be34b135075`. This implementation extends its shared service; `workspace_offers`, manual ranking, offer identities and payment-link approval are unchanged. No deployment, merchant reauthorization, published app configuration, production data or outreach was performed.

## Implemented architecture

- Seven normalized tables in the existing database hold sources, products, variants, images, collections, memberships and deduplicated event receipts. Customer/order data stays in the existing tables. No product knowledge-document copies are created.
- Installation resolution checks the workspace, canonical shop, active integration and existing offline token. Writes reuse the Shopify shop advisory lock and recheck the installation/token inside the transaction. Composite foreign keys enforce source/product/installation ownership.
- The existing flow-job worker tick launches a separate asynchronous catalog drain. It does not execute flows or block their processing. The drain stops starting chunks after 20 seconds, uses database leases across processes, and resumes persisted checkpoints on the next existing tick. Each chunk performs at most six import/mapping pages plus one metadata call; each call has the existing 10-second timeout and no inline retries. Products, variants, images and collections use independent 50-record cursors. A source lease expires after two minutes.
- Durable backoff handles throttling and outages. Low GraphQL quota delays continuation using the reported restore rate. Initial readiness requires a complete successful pass. Full reconciliation defaults to a 24-hour gap after the previous completed full pass. The configurable interval is raised by catalog size and the previous full-pass duration, so large or quota-limited stores do not continuously re-import. It never resets freshness without reading data. A partial failure retains the checkpoint and never prunes the unseen remainder. Only a successful full pass tombstones missing products.
- Events retain only source, event/topic/resource identifiers and timestamps, never full payloads or customers. Signed raw bodies, canonical shop ownership, route/topic matching and source/event deduplication are mandatory. Acknowledgement follows durable commit. Product/inventory events refresh current GraphQL state instead of trusting payload prices; unknown inventory mappings use one exact inventory-item-to-product lookup; collection changes page through affected provider and previously linked products, without forcing a global reconciliation. Older product versions cannot overwrite newer records or cause erroneous pruning.
- Shopify fields are read-only; shared runtime validation allows only merchant `aiGuidance`, `notes` and `merchantTags`. Upserts preserve those annotations. Uninstall cancels leases and stops catalog access; the existing shop-erasure transaction cascades catalog records and event receipts. No sync/read path imports campaign or message execution APIs.

## Reconciliation policy (focused PR review correction)

Signed product and inventory events enqueue targeted product refreshes. Known inventory mappings use the existing index; unknown mappings use an exact read-only `inventoryItem` lookup inside the same chunk budget. Collection changes have independent durable 50-ID provider/local membership cursors, including removed memberships. None of these events starts a global import. Event backlogs continue in bounded chunks; when idle, the source sleeps until its next recovery deadline instead of polling the catalog every minute.

| Setting | Default | Valid range |
| --- | --- | --- |
| `SHOPIFY_CATALOG_RECONCILE_INTERVAL_HOURS` | 24 hours | 1–720 hours |
| `SHOPIFY_CATALOG_RECONCILE_PRODUCTS_PER_DAY` | 10,000 | 100–100,000 products/day |

Malformed/out-of-range settings fall back to defaults. The actual **gap after successful completion** is the maximum of the configured base interval, `catalogSize / productsPerDay * 24 hours`, and four times the previous full-pass duration. For example, 50,000 products with default settings receive at least a five-day gap; a slow eight-hour pass receives at least a 32-hour gap even with a one-hour base. Observed duration includes quota delays/retries, providing a conservative duty-cycle limit. These settings govern recovery usage, not a guarantee that inventory is fresh: the existing 15-minute per-variant verification threshold remains unchanged.

A full pass keeps its original generation/checkpoints across worker restarts, retries and merchant requests. Only successful completion prunes unseen records. Merchant-requested full recovery can run before the automatic deadline, but requests remain limited to one per minute and coalesce into any already-running full pass. Neither signed events nor manual requests shorten an existing API-error backoff or low-quota continuation delay. No new schema, scheduler, permissions or external subscriptions are introduced by this correction; authorization remains gated off.

Focused tests cover default/configured/invalid intervals, size and quota-duration floors, no repeated claims for a 10,000-product source, automatic eligibility at the daily boundary, known and unknown inventory targeting, 50-ID collection checkpoints, manual coalescing during retry, preservation of server-side quota/backoff delays, and unchanged generation-safe pruning/ownership.

## Reusable service interfaces

The existing `salesCatalog.search`, `lookup` and `recommend` retain their manual-offer behavior. Commerce lives on the same singleton:

```ts
salesCatalog.commerce.source(userId, sourceId?)
salesCatalog.commerce.searchCandidates(userId, {
  sourceId, query, hint?, limit?,
  filters?: { minPrice?, maxPrice?, currency?, category?, collectionId?, variantId?, availability? }
}) // Promise<CommerceProduct[]>; default 25, maximum 100
salesCatalog.commerce.browse(userId, sourceId, { query?, cursor?, limit?, status?, category? })
// { items: CommerceProduct[], nextCursor: string | null }; bounded keyset pages
salesCatalog.commerce.lookup(userId, sourceId, productId)
salesCatalog.commerce.lookupVariant(userId, sourceId, productId, variantId)
salesCatalog.commerce.variantPage(userId, sourceId, productId, cursor?) // 25 variants
salesCatalog.commerce.annotate(userId, sourceId, productId, { aiGuidance?, notes?, merchantTags? })
catalogReadiness(db, salesCatalog.commerce, userId)
verifyCatalogVariant(db, salesCatalog.commerce, userId, productId, variantId)
```

Callers must derive `userId` from trusted workspace/session context. Connected search uses the Phase 1A adapter validation, one indexed candidate query and bounded hydration: at most 25 variants, 50 images and 50 collections per candidate. Explicit variant selection remains exact even outside the first variant page. Indexed SQL numeric filters and SQL price-range aggregates preserve decimal strings; no floating-point conversion occurs. Ranking uses full-text relevance then canonical ID, or title then ID when browsing. Search includes description, SKU, options, provider tags and collection names. There is no manual-adapter fallback or recommendation pagination loop.

Merchant endpoints under `/api/sales-catalog/commerce` reuse existing offer-admin/session authorization and ignore client tenant IDs. No public visitor catalog endpoint exists. AI Brain uses trusted workspace context and returns at most eight variant records. Future Inbox, Builder, Campaign and Growth Engine callers can reuse these interfaces without inventing a sync framework.

## API version, permissions and authorization gate

The existing Admin GraphQL **2026-01** version is retained. No API version change is required.

| Capability | Minimum access in this implementation |
| --- | --- |
| Products, variants, images, collections, price/publication | `read_products` |
| Aggregate tracking/quantity/availableForSale via variants and inventoryItem | `read_products` (InventoryItem supports this scope) |
| Inventory-level webhook subscriptions | `read_inventory` |
| Per-location inventory | Not implemented; no `read_locations` requested |

The existing `read_customers,read_orders` declarations, original OAuth callback, onboarding and Managed Pricing remain unchanged. Metadata verifies the actual installation grants; a legacy installation is never assumed product-authorized. Product reads can operate with `read_products`; readiness explicitly reports aggregate polling until inventory scope is granted.

**Requires a separately reviewed Shopify app release:** declare optional `read_products,read_inventory` scopes in the appropriate staging/production app version, preserving required existing scopes. This PR deliberately changes no Shopify TOML or published settings. After release verification, an operator may enable `SHOPIFY_CATALOG_AUTH_ENABLED=true`. Until then the UI explains that an approved app version is needed and the authorization endpoint returns 409. When enabled, the existing merchant can explicitly choose **Approve Product Access**, using Shopify's supported optional-scope installation URL:

```
https://admin.shopify.com/store/{store}/oauth/install?client_id={existingClientId}&optional_scopes=read_products,read_inventory
```

This grants only those read scopes and does not replace the original OAuth/billing handler. The action creates/wakes a catalog source; the worker verifies grants again. Merchants can use rate-limited Retry Sync after approval. No real reauthorization was performed during development.

References: [ProductVariant 2026-01](https://shopify.dev/docs/api/admin-graphql/2026-01/objects/ProductVariant), [InventoryItem 2026-01](https://shopify.dev/docs/api/admin-graphql/2026-01/objects/InventoryItem), [scope management](https://shopify.dev/docs/apps/build/authentication-authorization/app-installation/manage-access-scopes), [webhook topics](https://shopify.dev/docs/api/admin-graphql/2026-01/enums/WebhookSubscriptionTopic).

## Webhook configuration required after review

Catalog handlers exist at `/api/shopify/catalog-webhooks/{topic-with-slashes-replaced-by-hyphens}`. Shopify rejected the ten scope-dependent app-managed declarations from PR #84 while catalog scopes are optional. The correction uses the existing verified per-shop registration infrastructure after actual merchant consent, through bounded leased catalog worker chunks. No external subscription is created during development or tests; existing customer/order/privacy/uninstall callbacks retain their ownership. See the [corrected activation runbook](shopify-catalog-activation.md).

| Topics | Scope |
| --- | --- |
| `products/create`, `products/update`, `products/delete` | `read_products` |
| `collections/create`, `collections/update`, `collections/delete` | `read_products` |
| `inventory_items/update` | `read_products` |
| `inventory_levels/update`, `inventory_levels/connect`, `inventory_levels/disconnect` | `read_inventory` |
| `app/scopes_update` | Existing app installation |

Example callback: `products/update` → `/api/shopify/catalog-webhooks/products-update`. Only `app/scopes_update` stays app-managed in the production TOML. The ten scope-dependent topics are created shop-specifically with the installed token after grant verification, using API 2026-01 and the same reviewed origin/signing secret. Registration checks existing callbacks before create and reads them back, preserves installation/tenant fences and quota delays, and rechecks daily. Keep existing privacy, uninstall, customer and order subscriptions. Readiness reports registration status separately; verify actual delivery before claiming event latency. Daily/size-aware polling reconciliation remains the recovery path.

## Availability and AI authority

`availableForSale`, active Online Store publication and verified shop-owned HTTPS URLs determine recommendation eligibility. Positive aggregate quantity alone cannot establish purchasability. Tracked `CONTINUE` variants may be available at zero quantity; untracked inventory is shown separately. Bundles requiring components and unsupported selling-plan products cannot yield confirmed purchasability. Inventory older than 15 minutes or affected by source failures is unverified/stale. Product pages can be shown as informational records with explicit unavailable/stale status; unpublished/deleted/incomplete products cannot be shopping candidates.

`verifyCatalogVariant` makes an exact read-only provider request, validates the parent and variant identities, currency and URL, then rechecks installation ownership. It returns current price, currency, availability and verification time. It creates no carts or checkout links and must be called again by any future purchase flow.

Product intent takes precedence over generic pricing and generic calendar availability. Explicit package/plan questions preserve manual routing. Connected product turns exclude website/profile product prices from prompt/evidence; canonical structured price fields ground amounts independently from product description prose. Stale evidence cannot support Auto; post-generation guards require review for invented URLs, stock promises on unverified inventory, numerical stock promises and checkout/payment claims. Existing payment-link approval, AI mode settings and channel entitlements remain intact. No outbound AI mode is activated.

## Merchant interface and UI evidence

The existing `/app/sales-catalog` has Manual Offers / Shopify Products tabs. Shopify cards display thumbnails, localized status, exact variant price range, total variant count, category, availability and freshness. Search, status/category filters and product pagination remain bounded. Details show product descriptions, collections, images, separately paginated variants/options/SKU/prices, stock snapshot times and the verified Shopify browsing link. Only guidance, notes and merchant tags are editable. English, Spanish and Hebrew labels are included, with Hebrew RTL and LTR currency/SKU cells.

Screenshots below are rendered **disposable UI fixtures**, not a production merchant or proof of live Shopify authorization:

- [English desktop fixture](screenshots/shopify-catalog-en-desktop.png)
- [Hebrew mobile fixture](screenshots/shopify-catalog-he-mobile.png)
- [Spanish authorization gate fixture](screenshots/shopify-catalog-es-authorization.png)

## Migration and rollback

`0107_shared_commerce_catalog.sql` is additive and repeat-safe. Its identical SQL is registered in the existing startup patch framework. It creates seven commerce tables plus query/uniqueness indexes and ownership constraints. It adds only a unique `(id,user_id)` index to existing `integrations`; the primary key already guarantees this uniqueness. It does not update manual offers, user entitlements, billing, customer or order records. CI applies the migration twice in each disposable PostgreSQL schema and exercises composite ownership rejection.

Rollback should first revert the application and keep additive tables/annotations intact. Old code does not consume them. Disable the authorization flag and, if separately configured after review, remove only catalog-specific external subscriptions. Do not drop `workspace_offers`, integrations or existing privacy/order tables. Physically dropping the seven new tables would discard imported catalog and merchant annotations; defer that destructive step to a separately approved backup/retention plan. No down migration is automatically executed.

## Validation and live prerequisites

Automated fixture tests cover independent child pagination, 51 variants, resume/restart after mid-pass failures, throttling/backoff, exact prices, inventory policies, delete/unpublish/out-of-order updates, annotation preservation, raw signed event dedupe, concurrent source leases, ownership/HTTP protection, source erasure, strict read-only fields, retry rate limits, exact future variant verification, AI grounding, localization and 10,000-product indexed stable search. Existing manual-offer, AI grounding, navigation, Free/Pro, Shopify billing/OAuth/customer/order/privacy suites are retained in CI.

The native 10,000-product fixture returned 100 filtered hydrated candidates in approximately **264 ms** in the development container; the SKU query plan uses the catalog GIN index. This is a fixture observation, not a production SLA. Initial synchronization uses one product hydration request per product plus 50-record child pages; large-store completion depends on actual Shopify quotas. It remains bounded/resumable and does not load the whole catalog into memory. Real synchronization latency and channel eligibility must be verified on an explicitly authorized test shop after configuration review.

Before live operation: review/deploy this PR and additive migration separately; release optional read scopes and the app-managed scope-change subscription in the correct app version; verify signing/origin/API configuration; enable the authorization flag only after that release; obtain explicit merchant approval; request initial sync and inspect readiness and event delivery. These steps were not performed in this PR. Phase 2 shopping/chatbot flows, checkout and Growth Engine installation remain outside scope.
