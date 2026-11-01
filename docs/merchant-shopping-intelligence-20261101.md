# Merchant-specific Shopping intelligence — 2026-11-01

## Baseline audit

The implementation starts at `main` commit `6c276ae241e92806dc2a228159c1dca771459884`, which merged PR #253 at 2026-11-01 06:45:28 UTC. PR #249's catalog-first/private preview guard, #251's merchant onboarding document access, and #252's combined #250/#252 routing corrections are incorporated. #250 remains open on GitHub, but its fixes are already included through #252; this work does not reapply that patch. The 12 review threads on #252 and three on #253 were resolved before this task. Their final CI/review evidence is recorded in the previous audit reports.

Reused components: Shopping service/session serialization, shared product/business predicates, owned connected commerce search, indexed catalog and annotations, live Shopify verification, explicit variant selection and confirmation, checkout eligibility/authorization, merchant AI Brain rows and published-fact retrieval, language detection, private Test Chat adapter, existing channel/entitlement/consent/send gates, and #253's separate cheaper threshold/budget and currency safeguards. UCP remains source-disabled and unregistered. No prior one-shot grant was reused.

The audit confirmed missing semantic query interpretation, grounded ranking/comparisons, contextual color/size references, and composed product/policy answers. It also confirmed that product annotations already support bounded merchant tags and guidance; a new settings service or dashboard was unnecessary. Actual production runtime/deployment state was not changed or used as acceptance evidence.

## Implemented behavior

The same Shopping service now accepts a bounded AI Brain reasoning dependency in both private Test Chat and eligible live suggestion paths. It uses the existing provider/model registry and owned merchant knowledge, not another assistant or global catalog.

An interpreter identifies catalog queries, saved ordinals, comparisons, variant requests and customer preferences in English, Spanish and Hebrew. A bounded owned catalog vocabulary supplies real title/category words; translated/generic query words absent from that vocabulary are removed. Initial qualification, weight and policy words do not become required catalog search terms. Context guards prevent a model's mistaken fresh-search action from erasing a relative-size request. Exact selections, quantity changes, retry, confirmation, cancellation and human handoff remain deterministic.

The evidence step ranks actual, freshly verified variants and selects references to exact catalog description/guidance sentences. All generated identities and citations are validated. Customer-facing factual explanations are extractive: model-written specifications, suitability claims, ratings, money, stock and URLs are never rendered. Prices, currency, tracked stock and purchase eligibility stay under the existing verifier. Missing evidence produces a localized honest explanation and a useful clarification/human next step. Comparative prices use decimal-string arithmetic; higher price does not establish better value.

Product diversity is preserved before the eight-variant verification bound. AI rankings identify the strongest supported match; other verified options remain available for explicit comparisons. Comparing never reorders saved ordinals or silently selects a product. Variant questions resolve only within the referenced owned product. Unrequested color/size options remain intact; relative sizes require comparable numeric sizes or the same standard size system. Unknown or truncated variants prompt clarification. Informational alternatives preserve the existing selection; an explicit new choice must still be confirmed and reverified before handoff.

Preferences and qualification are bounded session context. Budget changes and strictly higher-price alternatives reuse the saved product query and original currency; #253's cheaper implementation remains in place with its original separate budget. A higher price is not described as higher quality. Merchant-only policy references are composed with verified product/variant facts. Missing, stale or conflicting policies are not guessed. Pure policy questions still delegate to normal AI Brain without mutating Shopping state; non-Shopify behavior remains intact.

## Merchant rules and release controls

Existing product tags now support two documented reserved values in the existing catalog editor (EN/ES/HE help text):

- `shopping:exclude` is a hard exclusion in candidate SQL and live purchase verification, including previously saved selections. An AI instruction cannot override it.
- `shopping:prefer` is a soft candidate/ranking preference. Relevant documented customer needs take priority.

Existing custom instructions, sales goals, product guidance, collection metadata, language handling and handoff keywords are reused. Private notes are not quoted to customers. AI Brain published-fact freshness/conflict gates remain authoritative; V1 merchant FAQ/website policy declarations remain available where V2 is not enabled. Business evidence cannot substitute for Shopify product stock/price evidence.

Reasoned replies carry `shopping_intelligence_review` through the existing AI Brain confidence gate; a replay retains this marker. They are reviewable suggestions, not newly authorized automatic sends. One successful Shopping model turn uses the existing generation meter. Provider requests have a ten-second timeout, zero retries, bounded input/output, and no provider/cart/messaging tools. Deterministic turns avoid model calls. No public Shopping enablement, production merchant setting, consent, cart authorization, Shopify store access or deployment was changed.

Hebrew reasoned replies start with Hebrew text so the existing `dir=auto` bubbles do not take their direction from an English catalog title. Source quotations retain the merchant's original wording; no unchecked factual translation is presented as verified.

## Validation

- Isolated native PostgreSQL 16 fixtures: two unrelated merchants (snowboards and skincare), separate sources, products, variants, prices, inventory, exclusions, preferences and policies.
- Six separate fourteen-message deterministic conversations: initial qualification, comparisons, mixed policy/blue variants, explicit selection, smaller size, policy detour, missing ratings, budget change, cheaper alternatives, changed price and interrupted human handoff.
- Additional native checks: exclusion after a saved selection, strict higher/lower price bounds, budget preservation, unavailable inventory, source/merchant isolation, ambiguous/foreign model IDs/citations, model failure, contextual misclassification, and channel denial.
- Full affected workflow regression files passed locally; directly affected suites were rerun after the model-driven corrections. Exact final counts/hosted results are recorded below before completion.
- Production build passed. TypeScript comparison against the exact base: 97 existing diagnostics, zero added (final verification pending final head).
- Actual model acceptance uses the same AI Brain model registry with synthetic merchants and native PostgreSQL; it is separate from the deterministic stub journeys. No live merchant products, customer records, Shopify requests, carts or messages are involved.

## Practical limits and acceptance

The bounded candidate window and first variant page are intentional. An absent option is not proof it does not exist; the assistant asks rather than broadening to unrelated products. Recommendations cannot establish undocumented fit, missing specifications, ratings or medical benefits. Source quotations are preserved rather than freely translated/paraphrased. These limits protect factual integrity while supporting model-based interpretation, evidence selection and ranking across merchant types.

A real merchant should review recommendation relevance, configured exclusions, actual catalog completeness, source-language quotations and RTL presentation before enabling customer-facing automation. Live Shopify merchant/model acceptance and UCP access acceptance are not represented by the isolated fixture runs. UCP requires separate authorization. No merge or deployment is performed by this task.

## Final verification record

Pending final PR head CI, CodeQL and automated Codex review. This draft is not a merge recommendation until those checks and all actionable findings are resolved.
