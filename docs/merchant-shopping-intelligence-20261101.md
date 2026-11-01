# Merchant-specific Shopping intelligence — 2026-11-01

## Baseline audit

The implementation starts at `main` commit `6c276ae241e92806dc2a228159c1dca771459884`, which merged PR #253 at 2026-11-01 06:45:28 UTC. PR #249's catalog-first/private preview guard, #251's merchant onboarding document access, and #252's combined #250/#252 routing corrections are incorporated. #250 remains open on GitHub, but its fixes are already included through #252; this work does not reapply that patch. The 12 review threads on #252 and three on #253 were resolved before this task. Their final CI/review evidence is recorded in the previous audit reports.

Reused components: Shopping service/session serialization, shared product/business predicates, owned connected commerce search, indexed catalog and annotations, live Shopify verification, explicit variant selection and confirmation, checkout eligibility/authorization, merchant AI Brain rows and published-fact retrieval, language detection, private Test Chat adapter, existing channel/entitlement/consent/send gates, and #253's separate cheaper threshold/budget and currency safeguards. UCP remains source-disabled and unregistered. No prior one-shot grant was reused.

The audit confirmed missing semantic query interpretation, grounded ranking/comparisons, contextual color/size references, and composed product/policy answers. It also confirmed that product annotations already support bounded merchant tags and guidance; a new settings service or dashboard was unnecessary. Read-only Railway deployment metadata confirmed production is on this same `6c276ae` main revision (successful deployment `d1f6aeb6-7844-41a3-9764-a9c69bda943f`). No production runtime state was changed or used as functional acceptance evidence.

## Implemented behavior

The same Shopping service now accepts a bounded AI Brain reasoning dependency in both private Test Chat and eligible live suggestion paths. It uses the existing provider/model registry and owned merchant knowledge, not another assistant or global catalog.

An interpreter identifies catalog queries, saved ordinals, comparisons, variant requests and customer preferences in English, Spanish and Hebrew. A bounded owned catalog vocabulary supplies real title/category words; translated/generic query words absent from that vocabulary are removed. Initial qualification, weight and policy words do not become required catalog search terms. Context guards prevent a model's mistaken fresh-search action from erasing a relative-size request. Exact selections, quantity changes, retry, confirmation, cancellation and human handoff remain deterministic.

The evidence step ranks actual, freshly verified variants and selects references to exact catalog description/guidance sentences. All generated identities and citations are validated. Customer-facing factual explanations are extractive: model-written specifications, suitability claims, ratings, money, stock and URLs are never rendered. Prices, currency, tracked stock and purchase eligibility stay under the existing verifier. Missing evidence produces a localized honest explanation and a useful clarification/human next step. Comparative prices use decimal-string arithmetic; higher price does not establish better value. Documented, explicitly labeled product weights are compared with unit normalization; missing or incompatible evidence is not inferred from rider weight or product names.

Product diversity is preserved before the eight-variant verification bound. AI rankings identify the strongest supported match; other verified options remain available for explicit comparisons. Comparing never reorders saved ordinals or silently selects a product. Variant questions resolve only within the referenced owned product. Unrequested color/size options remain intact; relative sizes require comparable numeric sizes or the same standard size system. Unknown or truncated variants prompt clarification. Informational alternatives preserve the existing selection; an explicit new choice must still be confirmed and reverified before handoff.

Preferences and qualification are bounded session context. Budget changes and strictly higher-price alternatives reuse the saved product query and original currency; #253's cheaper implementation remains in place with its original separate budget. A higher price is not described as higher quality. Merchant-only policy references are composed with verified product/variant facts. Missing, stale or conflicting policies are not guessed. Pure policy questions still delegate to normal AI Brain without mutating Shopping state; non-Shopify behavior remains intact.

## Merchant rules and release controls

Existing product tags now support two documented reserved values in the existing catalog editor (EN/ES/HE help text):

- `shopping:exclude` is a hard exclusion in candidate SQL and live purchase verification, including previously saved selections. An AI instruction cannot override it.
- `shopping:prefer` is a soft candidate/ranking preference. Relevant documented customer needs take priority.

Existing custom instructions, sales goals, product guidance, collection metadata, language handling and handoff keywords are reused. Private notes are not quoted to customers. AI Brain published-fact freshness/conflict gates remain authoritative; V1 merchant FAQ/website policy declarations remain available where V2 is not enabled. Business evidence cannot substitute for Shopify product stock/price evidence.

Reasoned replies carry `shopping_intelligence_review` through the existing AI Brain confidence gate; a replay retains this marker. They are reviewable suggestions, not newly authorized automatic sends. One successful Shopping model turn uses the existing generation meter. Provider requests have a ten-second timeout, zero retries, bounded input/output, and no provider/cart/messaging tools. Normal reasoning uses interpretation plus evidence selection; one additional owned-vocabulary resolution is allowed when source and customer languages differ. Deterministic turns avoid model calls. No public Shopping enablement, production merchant setting, consent, cart authorization, Shopify store access or deployment was changed.

Hebrew replies that otherwise start with Latin catalog titles receive a Hebrew source label so the existing `dir=auto` bubbles do not take their direction from an English catalog title. Source quotations retain the merchant's original wording; no unchecked factual translation is presented as verified.

## Validation

- Isolated native PostgreSQL 16 fixtures: two unrelated merchants (snowboards and skincare), separate sources, products, variants, prices, inventory, exclusions, preferences and policies.
- Six separate fourteen-message deterministic conversations: initial qualification, comparisons, mixed policy/blue variants, explicit selection, smaller size, policy detour, missing ratings, budget change, cheaper alternatives, changed price and interrupted human handoff.
- Additional native checks: exclusion after a saved selection, strict higher/lower price bounds, budget preservation, unavailable inventory, source/merchant isolation, ambiguous/foreign model IDs/citations, model failure, contextual misclassification, and channel denial.
- Full affected workflow regression files passed locally; directly affected suites were rerun after the model-driven corrections. Latest native rerun: 52 tests passed. Hosted CI/CodeQL results are tracked on PR #254.
- Production build passed. TypeScript comparison against the exact base: 97 existing diagnostics, zero added. The exact final code is checked again by hosted CI.
- Actual model acceptance uses the same AI Brain model registry with synthetic merchants and native PostgreSQL; it is separate from the deterministic stub journeys. No live merchant products, customer records, Shopify requests, carts or messages are involved.

## Practical limits and acceptance

The bounded candidate window and first variant page are intentional. An absent option is not proof it does not exist; the assistant asks rather than broadening to unrelated products. Recommendations cannot establish undocumented fit, missing specifications, ratings or medical benefits. Source quotations are preserved rather than freely translated/paraphrased. These limits protect factual integrity while supporting model-based interpretation, evidence selection and ranking across merchant types.

A real merchant should review recommendation relevance, configured exclusions, actual catalog completeness, source-language quotations and RTL presentation before enabling customer-facing automation. Live Shopify merchant/model acceptance and UCP access acceptance are not represented by the isolated fixture runs. UCP requires separate authorization. No merge or deployment is performed by this task.

## Final verification record

Draft PR: https://github.com/yanivwpu/Lead-Flow-Manager/pull/254.

The first automated review found an incomplete multi-attribute predicate: a blue/size-S request could also offer Blue/M. Fixed in code head `f6096ecee8824d65f51c7a0c7664f8159db03dde`, with six native EN/ES/HE explicit-color/size and color/relative-size service journeys. The first thread is resolved. A second review found that absent XL could be dropped before filtering, creating a partial blue/M match. Explicit unknown size/color constraints are now retained and fail closed; EN/ES/HE regressions cover absent XL and purple, preserving the prior selection. A third review found that relative-size prepositions could become literal option values, and comparison prepositions could overwrite comparison intent. Both are fixed with EN/ES/HE conversation regressions. A fourth review found stale promotional amounts in descriptions could be quoted alongside live prices; currency-bearing/promotional money sentences are now filtered, with native EN/ES/HE currency regressions. Updated automated review is required on the final head.

Local validation: all 41 affected workflow regression files passed; directly affected native rerun passed 52 tests; build passed; TypeScript base=97, PR=97, added=0. Actual model acceptance passed six independent five-turn journeys (30 customer turns, 43 successful model calls, 38.9 seconds), using the existing extraction/reply registries with native PostgreSQL. See `merchant-shopping-model-acceptance-20261101.json` for the synthetic response transcript. This is model-backed evidence, separate from the six fourteen-message deterministic conversations.

The security-extended CodeQL SARIF was inspected, not only the job conclusion: 422 existing repository-wide findings on both base and candidate `7dea581`, with zero added/removed findings using rule/source URI/stable fingerprints. No new Shopping file findings were introduced. These existing findings remain security debt outside this focused change. Final-head CodeQL is compared again after the last fixes. The existing workflow also excludes two pre-existing unrelated Prospect AI artwork/quota layout assertions; those exclusions were not expanded.

Hosted CI and security-extended CodeQL must be green on the final head, with no actionable PR review findings, before a merge recommendation. Exact run IDs/conclusions are recorded in the PR description and final task report. Nothing has been merged, deployed or activated.
