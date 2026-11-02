# Real-store Shopping acceptance fixes

Base: `ba7f487eb4f1fd1ee1053502f8449b2a74ff7b40` (deployed PR #254). This work does not modify production products, enable messaging, create carts/checkouts, merge or deploy. UCP remains disabled.

## Findings, separated by cause

### Information genuinely missing

The task's verified production inspection reports 26 published products, 22 without descriptions or AI Guidance, and zero with AI Guidance. Hydrogen and Multi-location have neither. Their beginner suitability, construction, dimensions and product weights cannot be established from those records. Prices, catalog connection and private preview were already working. Those production counts are supplied acceptance findings, not a new production query performed by this change.

### Available information not being retrieved or presented

- Line breaks were erased before evidence segmentation. Newline-separated attributes could become one oversized sentence and disappear.
- Descriptions consumed the shared evidence allowance before AI Guidance. Guidance now has its own bounded allowance.
- Comparisons ignored model relevance citations and dumped all facts. Conversely, actual provider acceptance showed that the model can omit available ingredient citations. Explicit attribute questions now retrieve matching source facts for each compared product, including EN/ES/HE question vocabulary and original-language factual labels. General comparisons still use validated model citations.
- Mixed contextual questions such as “Which is lighter, and can I return it?” could delegate the entire turn to business knowledge. Attribute clauses now keep those turns within catalog verification. Contextual “lighter” follow-ups retain the saved compared options even if model interpretation says clarify.
- Shopify descriptions, product type, vendor, provider tags, options and collections are already synced. Product type/title support vocabulary discovery; collections and approved annotations support existing model context. Vendor/provider tags are not treated as proof of suitability.
- The existing Shopify query does **not** request structured product metafields/metaobjects, product taxonomy attributes or variant inventory-item measurements such as weight. No evidence establishes that these fields are populated for the real snowboard products. This PR does not blindly import arbitrary metafields as approved recommendation evidence: merchant selection, provenance, pagination and value normalization require a separate supported mapping. Descriptions and existing AI Guidance remain the immediate actionable path.

### Reasoning and rendering weaknesses

- The old renderer appended a generic suitability disclaimer whenever it could not endorse a best match, even if the requested comparison was answered.
- Price alone triggered an unnecessary quality/value warning. Equal prices incorrectly singled out one product as cheaper.
- Sparse products were still sent to an evidence-selection model with no evidence to select. Malformed output could suppress available merchant policies and return duplicate variants of one product.
- A reasoning failure could be presented as missing merchant information. The fallback now distinguishes inability to evaluate from absent product records and still shows bounded documented facts.

The updated flow uses the same AI Brain provider/interpreter, Shopping verification, source ownership, sessions and channel adapters. Sparse replies compare verified prices/options, name missing requested attributes, and ask at most one bounded customer question. Asked information questions persist in the existing session and reset on a new product query. A repeated question is replaced with a store-team next step. Empty evidence cannot create a suitability recommendation. Documented comparisons use relevant attributes and normalized product weights without inventing new characteristics. Informational comparisons never select a product or change saved ordinals.

Recommendations and comparison facts remain composed from validated source sentences and deterministic verified prices/options. Free-form model specifications or translations are not rendered. This is intentionally bounded composition, not unconstrained model prose; source-language facts can still appear inside localized EN/ES/HE replies.

### Merchant onboarding/readiness gaps

Catalog connection/readiness previously described sync and stock, not recommendation information. Existing catalog cards now flag missing descriptions and missing AI selling guidance. Selecting a card opens the existing editor with a short localized explanation: add specifications/intended use to Shopify descriptions, sync, and use AI Guidance for approved selling points and suitability limits. Private notes remain private. Presence of a description is not represented as proof that every comparison can be answered. Badges apply to the visible paginated results; they are not an invented whole-store readiness score.

## Isolation and release controls

Product evidence is filtered by both merchant and source; citations must belong to the nominated choice. Merchant business knowledge continues to use the owned AI Brain row and published, fresh, non-conflicting facts or existing explicit merchant FAQ/policy sources. No platform/company knowledge fallback is added. Business evidence cannot become product inventory or price evidence. Existing exclusion tags, live stock/price verification, channel gates, explicit selection and confirmation, handoff and checkout authorization remain authoritative.

## Acceptance and validation

Native PostgreSQL 16 runs use a disposable loopback-only database, synthetic merchants and mocked provider inventory transport. The sparse fixture recreates the real-store *shape* with named Hydrogen and Multi-location and absent descriptions/guidance; its prices and stock are fixture values, not asserted production values. The documented snowboard/skincare fixtures contain explicit attributes and selling guidance and unrelated merchant return policies. This is not a newly signed-in production Test Chat session.

Deterministic coverage includes saved references, preferences, explicit/relative variants, missing attributes, relevant comparison evidence, long-description guidance retrieval, model failure with product diversity, rejected cross-choice citations, exclusions, inventory/price changes, channel denial, tenant/source isolation and untouched checkout safety. The previous skincare deterministic journey accidentally asked about weight while expecting ingredient quotations; it now asks about ingredients. Model acceptance permits either equally documented suitable fixture product instead of requiring one arbitrary product ID, and checks the weights of the actual compared choices.

Actual model acceptance uses the existing extraction/reply model registry with the isolated native database. The expanded sparse EN/ES/HE conversations include qualification/budget, comparison, contextual weight and merchant-policy follow-ups. Provider failures and failed acceptance iterations were used to identify and fix the issues above; final results and transcripts are recorded separately.

Local validation passed: 86 broad catalog/channel checks; 72 checkout-safety regressions; 57 focused native/catalog/channel checks, including 13 Shopping intelligence tests. After final review tightened mixed price/attribute handling, all 13 intelligence tests passed again. The production build passed. TypeScript comparison against the exact base has 97 baseline and 97 candidate diagnostics, zero added.

Actual provider acceptance passed 39 customer turns (30 documented + 9 sparse) in EN/ES/HE, with 53 successful provider calls through the existing model registry (43 documented + 10 sparse). See `shopping-real-store-model-acceptance-20261101.json` and `shopping-real-store-model-acceptance-sparse-20261101.json` for the final transcripts. Sparse turns avoid an unnecessary evidence-selection call when no facts exist.

Final review also fixed price-plus-attribute requests so missing attributes are not suppressed by the price-only shortcut. Regression coverage confirms distinct fallback products, known merchant policies surviving model failure, no repeated clarification after intervening turns, and price-only replies without suitability boilerplate.

Draft PR: https://github.com/yanivwpu/Lead-Flow-Manager/pull/255. Final-head hosted CI and security-extended CodeQL results are recorded in the PR description after completion. Production catalog completeness remains a merchant-data task; this change does not manufacture the missing specifications.
