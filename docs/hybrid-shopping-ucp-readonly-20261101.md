# Hybrid Shopping: read-only UCP preparation — November 1, 2026

This is an incremental provider-preparation and contextual-discovery change, not activation of a public intelligent shopping assistant. Main `12678e68` already includes merged #252 and #250's routing fixes. Those paths and the existing checkout gates are retained.

## Audit and reuse

| Existing work | Reuse / decision |
| --- | --- |
| #205 (`14a024a9`), open | Reuse the bounded, credential-free, fixed-merchant JSON-RPC transport pattern, response correlation, ownership checks and live-verifier separation. Do not merge its old route/UI/runtime changes. Its fixed five-result `search_catalog` probe is a compatibility diagnostic, not a replacement shopping engine. |
| #206 (`0a2c9d0f`), open | Preserve the separately gated, durable single-use authorization design: claim once before IO, recheck on each request, never reset/retry a consumed grant. Its migration/grants/runtime are not copied, provisioned, read or activated. The old hard-coded shop pin must not be silently reused for a new merchant. |
| #249–#252 | Reuse private Test Chat, merchant knowledge routing, shared product intent, live catalog verification, session/tenant fences and independently gated checkout. #252 is merged in current main. |
| Existing Admin/Storefront integration | Remains the runtime provider and the authority for prices, stock and purchase checks. New UCP code is unregistered and source-disabled. |

No production settings or deployment were inspected or changed. Historical password protection is a known unresolved access concern, not a newly reproduced live failure. No live Shopify read was attempted in this task.

## Current protocol evidence

Documentation was reviewed on November 1, 2026. Consumed request/response boundaries are pinned to `2026-08-25`; unknown versions fail closed rather than being guessed compatible.

- [Storefront Catalog MCP](https://shopify.dev/docs/agents/catalog/storefront-catalog): merchant-scoped `/api/ucp/mcp`; profile metadata on every request; `search_catalog` takes `catalog.query`, context and pagination; `lookup_catalog` accepts up to ten IDs; `get_product` uses a singular ID and selected options with `name`/`label`. Search/lookup return `structuredContent.products`; product detail returns `structuredContent.product`. Money uses integer minor units; these values do not replace our live verifier. This implementation validates only the consumed identity/money/availability/selected-option subset and negotiated version/capability, not every optional UCP field.
- [Agent profiles](https://shopify.dev/docs/agents/profiles): Shopify fetches a hosted HTTPS platform profile and negotiates compatible capabilities. Supplying a syntactically valid URL is not evidence that a profile exists or can negotiate. A future read needs an existing public profile declaring the relevant version, catalog search/lookup capabilities and any requested Shopify extension.
- [Storefront Catalog extension](https://shopify.dev/docs/agents/catalog/storefront-catalog-extension): `dev.shopify.catalog` adds merchant-specific fields such as collections, selling-plan requirements and checkout URLs. This preparation never surfaces provider checkout URLs, never executes cart tools, and rejects non-`each` sale units or a required selling plan in the consumed variant boundary. Those cases need separate compatibility work.
- [Ask MCP](https://shopify.dev/docs/agents/ask): `ask_business` remains a draft capability requiring a draft profile and `dev.ucp.common.ask`. It can supplement merchant policy knowledge in a later reviewed integration. It is not implemented or called here; AI Brain's existing workspace knowledge remains the policy source.
- [Storefront MCP migration](https://shopify.dev/docs/apps/build/storefront-mcp): the old `/api/mcp` catalog/cart tools have been removed. The new code only constructs the merchant's UCP path and never tries the removed endpoint or a global catalog.

## Small integration improvement

`ucpCatalog.ts` prepares exactly three fixed read tools. It derives the destination from a server-owned canonical Shopify binding, uses a configured profile, rechecks authorization before and after each read, and bounds time, response bytes and result counts. Redirects, password barriers, denied access, unsupported schema/version, duplicate/unrequested identities and throttles stop the operation without retry. Tool listings are metadata; arbitrary names, advertised URLs, Ask and mutation tools cannot execute. Response errors are sanitized.

`ucpProvider.ts` implements the existing `CommerceShoppingProvider` interface for discovery. UCP ranking is mapped to products and variants in the same workspace, source and installation. No UCP description, title, price, stock claim, policy or checkout URL is returned to Shopping. Existing owned catalog fields are used; the Shopping service still invokes `verifyForPurchase`. Mapping, provider and access failures fall back to the existing tenant-scoped catalog. Installation/source/currency continuity is checked again before returning candidates. There is no migration, new merchant configuration system, runtime registration or public/private endpoint.

Both factories default to a false source constant. Injected activation/authorization/fetch seams are for isolated verification; no runtime caller supplies them. The future authorization bridge must reuse separately reviewed #206-style durable authorization and assert-active checks. This code does not authorize or retry an old one-shot read.

## Contextual recommendation improvement available without UCP

The existing Shopping state machine now recognizes a bounded EN/ES/HE cheaper-alternative request. It reuses the owned session's query, currency and budget, and keeps its original budget separate from an exclusive threshold below the selected price (or cheapest offered price). It only displays options passing fresh existing verification. The threshold persists through a provider-error/retry cycle and is cleared by a subsequent explicit search/reset. Currency continuity is checked on retries too; a changed store currency requires fresh search/budget context. The exclusive bound is applied in the existing catalog SQL before bounded candidate selection and checked again against live prices, so equal-priced variants cannot crowd out a cheaper match. Missing/expired context asks for a new search rather than searching an unrelated phrase.

This is an explicit new discovery, following existing new-search semantics: it clears the old selection and requires a new choice. Policy turns still preserve the selected variant; named selection, quantity, cancellation/restart and handoff regressions from #252 remain covered. No existing selection is silently reused as purchase authorization. Unaccented Spanish discovery and cheaper requests now retain Spanish language detection; existing Hebrew transcript `dir="auto"` behavior is unchanged.

## Merchant rules already available

| Need | Existing source and remaining boundary |
| --- | --- |
| Business policies and sales style | AI Brain business knowledge, website/published facts, custom instructions and tone. Reuse workspace-scoped retrieval; missing knowledge must not become an invented policy. |
| Preferred products / collections | Catalog `aiGuidance`, notes, merchant tags and collection membership already exist. These can ground a later bounded reasoning/ranking step; they are not hard enforcement rules today. |
| Upsell / complements | Use existing catalog attributes, collections and merchant guidance. Reliable relevance/ranking still needs a grounded comparison/recommendation layer. |
| Restricted products | Existing publication, status, tenant/source and inventory filters remain enforced. A structured merchant exclusion/preference rule is a confirmed future capability gap; prose instructions alone are not a security control. |
| Human handoff | Existing Brain handoff keywords, session handoff/pause controls and Shopping failure settings remain authoritative. |

## Verification and exact remaining prerequisite

Isolated tests use two independent catalogs (snowboards versus helmets), different prices/inventory and separate merchant policy objects. They verify fixed-tool request envelopes, agent metadata, disabled/denied authorization with zero IO, revocation, password/access failures, schema/version/ID rejection, bounded responses, tenant/product/variant ownership, fallback parity, and live Admin facts overriding adversarial UCP price claims. EN/ES/HE discovery and policy detours preserve the owned session. Policy answer tests stub the AI boundary to verify workspace/history forwarding; they are not a live LLM-quality evaluation.

Native PostgreSQL, affected #252 regressions, TypeScript baseline comparison, production build, hosted CI and exact-head Codex review are required for the draft PR. Final results are recorded in the PR description so the evidence refers to the pushed SHA.

**Live UCP acceptance remains blocked:** this request provides no fresh scoped live-read authorization, no verified deployed platform profile, and no current evidence that the development-store UCP endpoint is accessible under Shopify-supported protection/authentication. A separately approved read must bind the actual merchant/source/installation/session, use an existing compatible public profile, and use a fresh unconsumed authorization. A consumed #206 grant must never be reset or reused. If protection blocks the endpoint, stop and obtain Shopify-supported access confirmation; do not submit a password, forward browser cookies/Shopify credentials, follow redirects around protection, fabricate buyer IP or change store security. Existing Admin/Storefront fallback remains in place meanwhile.

Provider compatibility is separate from intelligence: semantic feature comparisons, beginner/lightweight suitability, intelligent complementary/upsell ranking, “second one in blue” resolution, complete mixed product/policy answers and general preference reasoning remain future capabilities. AI reasoning should select only from bounded owned catalog evidence and cannot supply new factual claims or product IDs. This PR does not claim those capabilities are delivered.


## Review follow-up

The first Codex review identified three contextual-discovery defects: currency continuity was not checked on retry, the temporary cheaper bound overwrote the saved budget, and an inclusive candidate filter could hide cheaper variants beyond the verification cap. All three have targeted corrections and regressions. Native coverage includes eight equal-priced variants followed by a cheaper variant. UCP option responses now must match requested selected options; lookup cannot return an unrequested sibling variant, and ownership mapping uses a single bounded variant query. Final exact-head CI/review status is recorded on draft PR #253.
