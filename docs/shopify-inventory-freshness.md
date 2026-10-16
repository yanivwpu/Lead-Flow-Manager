# Shopify inventory freshness and purchase verification

## Root cause

The 15-minute variant `verified_at` safety window previously advanced only during catalog hydration. Full reconciliation is intentionally daily or slower for large stores, while webhook updates happen only when inventory changes. A quiet but healthy store therefore lost every eligible snapshot after 15 minutes. The old readiness summary also used `last_sync_at` as an inventory clock, and AI recommendations trusted snapshots rather than verifying the selected variants live.

This change leaves the 15-minute window and full-reconciliation cadence intact. It uses existing `catalog_sources`, `catalog_variants`, `catalog_products`, `catalog_events`, source leases, installation fencing and webhook registration. There are no new tables, schema migrations, permissions, subscriptions, billing/trial changes or outbound messaging paths.

## Independent inventory renewal

- Opening Shopify Products or making an AI product query extends a 30-minute activity window in the source's existing JSON checkpoint. Writes are coalesced to at most once per 15 minutes per source. Activity never changes variant verification timestamps or requests a full import.
- The existing worker selects at most 50 supported, priced variants of active published complete products, ordered by oldest verification time and stable ID. It renews snapshots older than ten minutes and schedules the next bounded check in two minutes. Fresh working sets make no inventory API calls. Idle stores stop inventory polling when activity expires; existing daily catalog reconciliation and webhook registration audits remain unchanged.
- A single GraphQL `nodes(ids:)` call verifies those exact variants, including price/currency, inventory policy, tracked state, aggregate stock, availability and publication. It does not list all products, fetch media/collections or prune catalog generations. Successful reads update only the affected cache rows. Missing/deleted nodes invalidate their old snapshots.
- Known inventory webhook mappings are serviced through the same lightweight batch path, even when the merchant is idle. Unknown mappings still use the existing bounded targeted-product discovery. Product/collection changes retain existing targeted hydration. The existing signed, deduplicated webhook handlers and registration ownership rules remain authoritative. Pending events are acknowledged only after successful processing; arrivals during a batch stay queued.
- Inventory work never updates `last_sync_at`, `requested_at`, generation/checkpoint hydration cursors or manual full-recovery intent. Periodic oldest-first renewal recovers lost inventory webhooks on active catalogs. Daily full reconciliation remains the recovery path for unknown publication/catalog changes.

## Quotas, retries and ownership

Background work and AI verification share the existing source lease, installation ownership/token/deletion fence and a durable inventory `apiAfter` deadline. A worker or foreground caller cannot bypass the other channel's cooldown. There are no inline SDK retries. Successful live requests impose a minimum two-second cooldown; low Shopify quota extends it using the observed restore rate and a 300-point reserve. Regular background checks are at least two minutes apart. Foreground and webhook reads do not slide the periodic sweep deadline; an overdue sweep gets one bounded turn before additional queued events, preventing continuous traffic from starving the rest of the working set.

Failures retain stale timestamps and fail closed. Six exponential backoff steps are capped at 30 minutes; there is no immediate retry loop. A retry only runs for active demand, a pending event or normal reconciliation. Quota/backoff deadlines survive worker restarts and are preserved by activity touches. A successful actual product/inventory read clears the inventory error; a metadata-only response cannot mark inventory verified. Inventory errors are separate from catalog readiness and visible in `inventoryRefresh` diagnostics.

The cache update and source checkpoint are committed only while both the installation and source lease still belong to the original owner/token. Uninstall, deletion, token rotation, lease loss, mismatched variant/product identities and another tenant's IDs cannot renew inventory.

## AI and shared service contract

The reusable commerce service now exposes:

```ts
markInventoryActivity(userId: string, sourceId: string): Promise<void>
purchaseCandidates(userId: string, input: ConnectedCommerceSearchRequest): Promise<readonly CommerceProduct[]>
verifyForPurchase(userId: string, sourceId: string, variantIds: string[]): Promise<VerifiedInventoryVariant[]>
inventorySummary(userId: string, sourceId: string): Promise<InventorySummary>
```

`purchaseCandidates` is bounded discovery, **not purchase authorization**. It may discover stale formerly-available variants so expired inventory does not permanently hide products. The AI provider checks at most eight exact variant IDs in one live request before recommending or making an availability claim. Unavailable, unknown, unsupported, unpublished, missing-price, wrong-currency, quota-blocked or unverifiable variants are excluded; there is no cached fallback for a purchase recommendation. Live price increases are checked against the requested budget using exact decimal comparison. Stored/verified storefront URLs remain authoritative and nullable; no checkout URLs are fabricated.

Successful records carry `purchaseVerified=true` and provider-verified prices/options/currency. Informational snapshot facts remain usable for existing pricing/data retrieval, but do not authorize a purchase or current stock claim. AI Brain's grounding guard checks that flag and rejects unverified stock/purchase recommendations. Existing manual offer ranking and payment-link approval are untouched.

The existing single-variant verifier remains available for its existing callers. AI's batch verifier adds shared quota control and persisted renewal while reusing the same publication and availability rules.

## Merchant meaning and capacity

The Sales Catalog displays published products, products with verified available snapshots and published products with unverified inventory separately. Published cards with expired/unknown inventory show unavailable/unverified, not out of stock. Out of stock requires fresh tracked negative inventory with DENY policy across all variants. A provider-unavailable variant with positive or untracked inventory remains unknown/unavailable; availability=false alone is not proof of zero stock. Readiness uses variant verification rather than the full-sync clock. A verified available snapshot is still not a reservation or guarantee of current purchasability; purchase recommendations require the separate live check.

A small active store can retain useful verified counts throughout the day without full imports. A large store is deliberately not promised a complete fresh snapshot within 15 minutes: at 50 variants per two-minute batch, only a bounded working set stays verified. The remaining published products remain visible and counted as unverified, and matching purchase candidates can be checked live. Idle stores may legitimately show zero verified available snapshots while still showing their published catalog; opening the view wakes bounded renewal.

## Validation and review

Regression fixtures run against native PostgreSQL in Sales Catalog CI (and local isolated PGlite). They cover expiry and recovery, activity without verification, idle suppression, 50-variant limits, 1,001-product rotation/restarts, signed webhook compatibility and targeted inventory event processing, webhook-loss stock recovery, quotas and retry persistence, live unavailability, exact-price changes, null URLs, cross-tenant IDs, identity mismatch, token rotation and AI grounding. Existing catalog, offer, optional-consent, registration and AI Brain tests remain in CI. English, Spanish and Hebrew summary labels stay aligned.

After review/deployment, validate the production store by opening Shopify Products, observing published/unverified counts, and checking that the worker renews inventory without changing the full-sync timestamp. Recheck after more than 15 minutes of active use and after the activity window expires. No production refresh, configuration, billing, permission or entitlement mutation was performed during development. Do not merge or deploy without review.
