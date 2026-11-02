# Live Shopping reasoning and qualification fixes

Base: `b1cddc4d0a57747c88f75a99d3eb5ec538d72748`, merged PR #255. This builds on its catalog-readiness, verification and source-grounding work without recreating those features.

## Investigation

The reported first-turn wording uniquely identifies `createShoppingIntelligence.answer`'s catch block. That block previously swallowed the exception, so the historical live exception cannot be retrospectively classified as a provider, JSON, schema, citation or rendering failure from that reply alone. No merchant product records, customer transcripts or credentials were fetched, and no production logging was activated. Read-only Railway metadata confirmed deployment `0fee3ec6-56db-4459-89d3-70e611bba6b0` on this #255 base; a bounded provider-error log query returned zero matching entries, which does not prove a historical exception category. Exact historical attribution remains unverified; the new structured diagnostics make a future private acceptance run diagnosable after an approved deployment.

The confirmed decision defect is that #255 bypassed answer-model ranking only when **all** product facts were absent. A result set with even one generic description still sent a plain “what options do you have?” listing request through recommendation ranking. A malformed answer or citation rejected the entire response. The prior sparse fixture had just two entirely empty products and could not catch this mixed-data path. Native tests now recreate the exact English questions, three named products (Multi-location, Multi-managed, Hydrogen), the reported comparison prices 729.95/600, and a synthetic generic description on the third record. That generic sentence is fixture data, not a claimed copy of a production description. A deliberately failing answer model demonstrates that the original unnecessary model call is eliminated, rather than merely changing its catch wording.

The second-turn qualification problem was deterministic: #255's no-facts answer selected a budget/use question and the renderer substituted a default priority question. None can supply missing merchant specifications. These questions have been removed from product-information-gap replies. Existing verified prices/options remain visible, missing attributes are specific to the current request, and beginner suitability leads to merchant confirmation. The same missing-attribute warning is not repeated from the previous reply. No handoff or outbound message is silently activated.

Additional acceptance exposed labeled numeric references: the shared parser recognized “first/third” but dropped digits in “option 1/option 3,” including Hebrew conjunctions. Exact labeled references now pass the same ownership/bounds checks as ordinals, with no interpretation of budgets or rider weights as choices. A comparison plus policy clause stays catalog guarded; pure policy questions still delegate to AI Brain.

## Targeted implementation

- Plain catalog discovery does not invoke the answer-ranking model, including partly documented results. It displays existing verified choices and bounded source details without a suitability or processing-failure disclaimer.
- A requested beginner recommendation with no usable compared product facts takes the insufficient-evidence path; it does not ask the customer for intended use or repeat a known budget.
- Explicit beginner qualification is retained when a model omits it on contextual follow-ups. An explicit change to experienced/advanced qualification can replace it. Budget and original option numbering remain in the existing Shopping session.
- Documented comparisons may recommend a supported ranked option, with choice-owned citations and a beginner-evidence guard. Source text remains extractive; no new product specifications or policies are synthesized.
- Actual answer failures retain their distinct guarded fallback. They are not labeled as absent merchant records. Known merchant policy evidence still survives those failures.

## Sanitized observability

`[ShoppingAnswer]` events contain only fixed outcome/stage/action/locale values and numeric counts. Outcomes: `catalog_only`, `insufficient_evidence`, `grounded`, `failure`. Stages: provider, JSON, schema, evidence, render, input/output limits, and knowledge retrieval. Events omit customer text, user/store/conversation identifiers, merchant knowledge, citations, provider credentials, raw model responses and exception messages. Observer failures cannot break a Shopping turn. Shopping requests suppress the generic provider's error-message logging and propagate typed, fixed-category errors instead. A JSON null is a schema failure, not the internal bypass signal.

## Acceptance

Disposable native PostgreSQL 16 fixtures reuse existing commerce search, mocked live inventory transport, AI Brain model registry, Shopping services and session logic. They do not access real Shopify stores, send customer messages or create real carts/checkouts.

The new actual provider run covers 24 customer turns: sparse three-product conversations, two documented snowboards, and an independent skincare merchant, each in EN/ES/HE. It checks exact numeric references, prices, stock-backed choices, beginner/budget retention, documented comparison attributes, merchant-specific 14-day versus 7-day policies, absence of generic qualification questions, and diagnostic outcomes without hidden reasoning failures. The transcript and allowlisted diagnostics are in `shopping-live-reasoning-model-acceptance-20261101.json`. Provider/schema/evidence/rendering failures are tested separately with deterministic fault injection, including diagnostic privacy and suppressed provider-message logging.

Local affected native acceptance passed 60 checks. The actual provider run passed 24 customer turns / 35 provider calls, with zero failure diagnostics. Local TypeScript comparison: base=97, candidate=97, added=0. Production build passed. Final-head hosted CodeQL/CI and Codex review results are recorded on the draft PR.

The first requested GitHub Codex review found three P2 issues, all corrected with regression coverage: preserve evidence ranking for preference refinements instead of treating them as plain listings; preserve affirmative beginner statements containing negated experience words in EN/ES/HE; and resolve coordinated numeric references under a shared option label. The bypass is now limited to a search without recommendation intent or a saved/new feature preference. Known missing requested attributes are detected before answer-model selection. An actual JSON null remains a schema failure, not a bypass signal. The second Codex review found a fourth P2: non-keyword suitability descriptions must reach semantic ranking rather than being treated as absent. The vocabulary-based preflight was removed, with a regression proving an entry-level description can rank first before a one-product display limit. The final review is requested again on that correction. UCP stays disabled. No merge, deployment, production product change, checkout enablement or customer messaging activation occurs.

## Remaining limits

The historical production exception category is unrecoverable without prior diagnostics. This change prevents the unnecessary answer-model call on the reported listing request and makes remaining failures observable; it does not claim a newly signed-in live Test Chat run. Merchant confirmation is a suggested next action, not an automatically dispatched handoff. Source-language facts, bounded catalog windows and existing merchant-data completeness limits remain. Actual missing suitability data must still be supplied or confirmed by the merchant.
