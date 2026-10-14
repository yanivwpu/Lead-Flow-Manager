# Shared Sales Catalog — Phase 1A

Sales Catalog is a read-only query facade over `workspace_offers`. The page at
`/app/sales-catalog` uses the existing Offers & Payment Links editor and CRUD API;
Settings remains compatible. No schema migration or record backfill is required.
Existing Free/Pro gates, AI source precedence and payment approval remain unchanged.

## Reusable interface

`createSalesCatalogService(database)` creates an injectable read-only service;
`server/salesCatalog/index.ts` exports the application singleton `salesCatalog`.
Callers must pass a trusted workspace owner ID resolved by their own authorization.
Never pass a tenant ID selected by a public client.

- `search(userId, { query?, category?, tag?, availability?, status?, limit?, offset? })`
  returns `{ items, nextOffset }`. Default size 25, maximum 100, offset 0–100000.
  Literal case-insensitive substring search covers display/internal names and description.
  Category/tag are exact matches. Status is `all`, `active`, `inactive`, `archived`, or
  `purchasable`. All excludes archived; archived is an explicit management view.
- `lookup(userId, itemId, { purchasableOnly? })` returns an existing item or null.
  Archived items are excluded; cross-tenant IDs return null.
- `recommend(userId, { message, hint?, limit? })` returns at most five items using
  existing global offer matching and sibling comparison rules. Inactive, archived,
  unavailable and waitlisted items are excluded. Available/limited are eligible.

Every result retains the original offer ID, display price and exact stored URLs.
Queries never write, enqueue jobs, send messages, execute workflows, or call Shopify.
HTTP reads use existing offer administration authorization and session tenancy:
`GET /api/sales-catalog` and `GET /api/sales-catalog/:id`. CRUD remains on
`/api/workspace-offers`; there are no catalog write endpoints.

## Compatibility and scale

The AI provider retains `businessPackages` and `recordType: offer`, existing package
payload shape, amount/source precedence and exact-link human approval. Intent routing
is unchanged in this PR. Recommendation reads are batched, with bounded retained
ranking candidates; legacy manual matching still scans eligible offers. Offset pages
are deterministic by sort order, creation timestamp and ID, but concurrent edits can
shift them. Use provider-scale indexed ranking and stable cursors in the next phase.
Catalog-mode reordering is disabled because partial-page IDs must not reset the whole
catalog's ordering; the existing Settings editor retains full-list reorder.

New catalog shell/filter/navigation copy uses existing English/Spanish/Hebrew locale
resources, with RTL layout for Hebrew. The reused legacy editor retains its existing
copy and behavior; completing its localization is separate work.

## Next phase boundary

Shopify exposes separate `catalogReadiness.connection` and `catalogReadiness.catalog`.
A connected shop currently has `catalog: not_implemented`; queries return no products.
Do not use connection status as product readiness.

Add provider-owned fields, variants, inventory, collections, synchronization metadata,
source identity and source-of-truth rules through this service in the next phase.
Do not duplicate manual offers or index whole commerce catalogs as AI knowledge.
Plan exact monetary fields, idempotent incremental sync, freshness and checkout
verification. OAuth permissions and protected data approval require separate review.

## Validation baseline

The catalog/offer/AI/navigation/grounding/entitlement suite passes on disposable
fixtures. Existing `growth-engine-prospect-ai-routing` has two unrelated Prospect AI
artwork/quota layout assertions failing identically on main; the focused workflow
runs its three relevant routing cases. Repository-wide TypeScript is already failing
on main; CI uses the existing exact-base diagnostic comparison and rejects regressions.
