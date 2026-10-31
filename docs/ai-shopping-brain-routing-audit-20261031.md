# AI Shopping + AI Brain routing audit — October 31, 2026

**Verdict: the requested natural-conversation public-launch standard is not yet met.** Catalog verification and durable selection are implemented; routing remains predominantly deterministic keyword matching. This change fixes merchant-policy delegation without replacing the existing architecture. It does not enable sending or checkout.

## 1. Already implemented and verified

- [PR #249](https://github.com/yanivwpu/Lead-Flow-Manager/pull/249): private activated-merchant catalog preview, compound-title normalization, verified price/inventory display, and product-failure guards in private/live suggestions. Its Sales Catalog workflow [41245769870](https://github.com/yanivwpu/Lead-Flow-Manager/actions/runs/41245769870) succeeded. Do not rebuild this.
- [PR #250](https://github.com/yanivwpu/Lead-Flow-Manager/pull/250): reviewed fixes for non-Shopify delegation, overly broad Shopify/checkout interception, plural Spanish availability/prices, and add-to-cart questions. Final head `ae593e7` has successful Sales Catalog [41247870223](https://github.com/yanivwpu/Lead-Flow-Manager/actions/runs/41247870223) and a clean final review. These fixes are existing work, not new findings to reimplement.
- [PR #251](https://github.com/yanivwpu/Lead-Flow-Manager/pull/251): authenticated onboarding-document access before activation; operational pages remain gated. Production-foundation workflow [41247846895](https://github.com/yanivwpu/Lead-Flow-Manager/actions/runs/41247846895) succeeded.
- Existing `shopping/service.ts` rechecks exact variants, price, currency, inventory freshness and quantity; preserves recoverable pending selections; rejects unknown/stale proofs; requires confirmation. `shopping/sessions.ts` fences workspace, contact, channel, inbound event, lease, pause and handoff state. Catalog source/product/variant SQL includes workspace/source ownership.
- AI Brain already reads merchant business knowledge by workspace. Published-fact storage and the retrieval cache are workspace scoped (`websiteKnowledge/factStore.ts`, `factContext.ts`). Canonical WhachatCRM pricing is restricted by trusted page context in `aiService.ts`; it is not a universal merchant knowledge source.
- Historical private Liquid acceptance, including reload persistence and live verification, is recorded in `docs/ecommerce-shopping-checkout-acceptance-20261025.md`. This is historical evidence, not today's stock or a new live acceptance.

**Revision caveat:** the connector reports #250 merged, but the inspected `main` commit `31745a9` still has the #249 versions of `shopperProductGuard.ts` and private interception. The #250 merge/test ref `cf8c2ac` contains its final fixes. Do not assume deployment/integration from PR metadata. Verify the actual release SHA includes #250. The local checkout began at `ad18ce7`; reviewed #248/#249/#251 patches reconstructed the inspected main baseline. All six modified existing source/test blobs were checked against pinned `31745a9`. Command-line Git fetch failed at the environment proxy; the GitHub connector supplied evidence and source.

## 2. Confirmed flows and scenario results

| Scenario | Evidence and result |
| --- | --- |
| A: discovery under $750 | Real isolated catalog lookup finds the Liquid fixture for the exact requested snowboard sentence. Existing catalog normalization removes conversational filler. A suspected search-term gap was disproved; no fix added. |
| A: best features / second available | Service probe returns a selection prompt for “Which one has the best features?” and repeats the list for “Is the second one available?”. It does not provide an intelligent feature comparison or target that ordinal availability question. |
| B: interested in snowboard + return policy | This is a policy-only factual request despite its product reference. The new shared delegation keeps merchant knowledge enabled and preserves Shopping state. A request for both actual price/stock and policy remains a separate unresolved mixed-answer case. |
| C: nonexistent product | Real catalog fixture query returns zero candidates for “unicorn”; existing service returns an unverified/unavailable response, not an invented product or price. |
| D: delivery + returns | Before correction, active Shopping intercepted this turn; Hebrew shipping/returns could trigger order handoff. New regressions delegate EN/ES/HE policy questions with no catalog call or shopping-state mutation. |
| E: memory | New ten-turn service regression covers discovery, ordinal choice, four policy detours, price recheck, quantity change, another choice and confirmation. Variant/budget/quantity survive. This validates deterministic state, not unrestricted conversational reasoning. |
| F: failures and isolation | Affected existing suites pass for provider errors, stale/unknown/out-of-stock inventory, cooldown/retry, disabled channels/settings, entitlement, ownership, superseded inbound, pauses, handoff and uninstall. Local DB fixtures use PGlite; native PostgreSQL concurrency is CI evidence, not newly executed locally. |

Private policy-delegation tests use two distinct merchant knowledge rows and a stub AI boundary. They establish correct workspace/history forwarding, not model answer quality. No fresh live Shopify or multilingual LLM acceptance is claimed. Missing-policy answer quality remains unverified.

## 3. Confirmed defects and targeted corrections

**P1 — Shopping captures business questions after discovery/selection.** Reproduce: search → select option 2 → “What is your return policy?” The original `other` branch returns a shopping clarification; Hebrew shipping/returns match the `order` branch, which clears choices and selection and enters handoff. Fixed by delegating recognized business-only questions before entering the Shopping state machine. Exact state is retained for the next product turn.

**P1 — Product-referencing policies disable merchant grounding.** “What is your return policy for this product?” matches the product fallback guard. If it reaches Live Business Data, `wantsShopify` forces `needsKnowledge=false`; `aiService.ts` also suppresses website context for product turns. Fixed by reusing the same business-only decision in the product guard and source-layer router. EN/ES/HE regressions cover this path. Actual product facts, mixed price/stock requests, human requests and order cancellation retain their guarded paths.

The new helper is deliberately bounded and deterministic. It is not a semantic intent classifier and does not claim complete language coverage.

## 4. Missing capabilities versus disabled functionality

- **Missing contextual reasoning (P1):** Shopping `compare` redisplays verified choices; it does not rank feature suitability. Choices carry titles/options/price, not a feature-comparison evidence package. “What about a cheaper one?” is `other`, so it prompts instead of updating preferences. Color and ordinal availability questions are not reliably resolved against saved options.
- **Incomplete mixed answers (P1):** Shopping returns before AI Brain. An actual product-fact question combined with return/shipping policy does not compose verified catalog facts with merchant knowledge. The targeted policy-only fix does not solve this.
- **Language gap (P2):** `detectConversationLanguage("Busco una tabla de snowboard")` confidently returns English because the Spanish heuristic misses this unaccented phrase. Hebrew script detection and transcript `dir="auto"` exist; browser visual RTL acceptance was not repeated.
- **Missing-knowledge assurance (P1 acceptance gap):** unknown policies must produce clarification/handoff. The existing model prompt and grounding infrastructure are present, but this audit does not establish reliable multilingual policy non-invention. `buildSystemPrompt` also supplies generic location/hour defaults when absent; these are not merchant-verified facts.
- **Implemented but gated:** Shopping settings, allowed channels, Brain entitlement, private merchant preview and independent checkout rollout/authorization already exist. Disabled sending/checkout is not a missing implementation. No activation is appropriate during this audit.

## 5. Preview/live parity and deployment evidence

Both paths reuse `createShoppingService`, catalog verification and `AIService.suggestReply`. Private Test Chat substitutes owned private history/state and may enable no-send preview independently of saved live settings. It additionally supports exact bare-title discovery; live runtime does not opt into that flag. Live sessions require actual current CRM inbound, channel eligibility, leases and pause/handoff checks. Preview therefore represents verified Shopping actions, not live activation readiness.

Pure business questions now reach the existing merchant knowledge route in both paths. The #250 non-Shopify/checkout fixes must be present in the actual release revision. No tenant leak was reproduced in the inspected ownership paths or affected isolation tests; this is not a proof covering every channel.

Read-only Railway inspection: staging app deployment `afb62392-b35d-4e21-b520-7362da9597bf` is SUCCESS at commit `21a47c5`, older than these routing PRs. Production deployment SHA and current merchant configuration were not established. No runtime configuration or deployment was changed.

## 6. Launch blockers, priorities and validation

1. Review the focused policy-routing correction and require affected CI/review to pass. Confirm the release includes #250 as well as #249/#251.
2. Extend the existing Shopping decision layer with context-aware, evidence-constrained handling of comparisons, cheaper alternatives, colors and ordinal questions. Reuse catalog facts and saved choices; models must not invent IDs, inventory or prices.
3. Compose actual mixed product/business answers using the same workspace's merchant grounding while preserving fresh product proof and saved state.
4. Validate missing-policy fallback and natural EN/ES/HE conversations using isolated fixtures, then private deployed no-send acceptance. Establish actual production release/eligibility evidence before launch approval.

Local validation: **99 Node tests plus 49 legacy grounding checks passed** across affected Shopping, Test Chat, UI, catalog retrieval/provider/AI, Live Business Data, checkout and entitlement suites. Production client/server/worker build passed using `node --import tsx script/build.ts` (the npm `tsx` CLI entry hit sandbox IPC restrictions). TypeScript reports **97 baseline and 97 candidate diagnostics, zero added**, with location/path normalization; repository-wide typecheck is not clean. That comparison used the reconstructed #249/#251 baseline before the unrelated #248 onboarding patch was added. Changed source/test blobs were independently matched to pinned main. Full native PostgreSQL and hosted CI remain release gates.

No merge, deployment, customer send, Shopify cart/order creation, consent/settings change or production mutation occurred. Tests use isolated fixtures and fake provider mutations only.
