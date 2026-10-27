# Storefront second-cart review milestone

Build on the existing Storefront implementation and unmerged PR #204. UCP/MCP enhancements #205/#206 are on hold and are not dependencies of the Growth Engine launch.

The smallest next step is an independent read-only review of the exact saved private Test Chat selection while **both cart execution source gates remain false**. Previously #204 required its second execution gate before a second-attempt preflight could pass the original consumed fence. The review path now reuses the existing validation without requiring execution activation, a second grant or a receipt key merely to inspect fresh Storefront readiness.

The existing Test Chat checkout panel contains one collapsed review control. It reports preservation of the consumed original/fence, encrypted receipt-key readiness, second-authorization schema and availability, fresh Storefront price/inventory and the still-required explicit execution approval. Missing authorization/storage prerequisites are requirements, never execution permission. A fresh provider proof is only ready **for owner review**, not ready to create a cart. The review response is a distinct type and contains no preparation ID, authorization ID, approval digest, session binding, private receipt or checkout URL; it cannot be used by the existing prepare/execute controls.

The server retains admin/Brain/Shopping entitlement, a fresh pilot-owner database match, the independent private Shopping pin, HTTP-session ownership, strict same-origin JSON, exact Liquid variant/quantity-one selection, tenant/source/installation/credential binding and freshness checks. The only Storefront operation allowed by the reused preflight is the existing variant query. Mutation/claim/receipt callbacks remain unreachable or throw. No preparation, approval, journal, grant, session, inventory or CRM writes occur. A consumed second slot stops even the review's provider calls. Context and original-consumption changes invalidate the result; provider errors never produce approval.

This change creates no migrations, configuration, credentials, carts, orders, payments, checkout navigation or customer messages. PR #204's original consumed row and shop-wide unique index remain unchanged. Its separate immutable second authorization, pre-dispatch claim, encrypted receipt capture, metadata rejection, status verification and no-retry handling remain authoritative.

## Minimum route to a separately approved second cart test

1. Review #204 and this narrow follow-up together. Verify private owner/workspace pins and the existing store-bound Storefront credential; verify the existing encrypted-receipt codec's key setup. Do not weaken the independent grants or retarget another shop.
2. Separately approve any deployment/configuration work and the reviewed empty 0115 schema before applying it. No startup migration or automatic grant provisioning is added here. Preserve the original consumed row and legacy index exactly.
3. Use the read-only review for the current saved selection. Resolve any reported prerequisites privately. Review the separate immutable authorization's binding to the original consumed attempt; provisioning requires its own explicit approval.
4. Obtain explicit owner approval of the specific, fresh exact-scope test. Any subsequent execution release must enable only the separately reviewed second path; the legacy execution gate remains false. Existing at-most-once claiming, receipt encryption, uncertain-result retention and no-retry rules still apply.
5. Inspect the private receipt/status outcome. Cart creation is not checkout/payment acceptance. Checkout navigation, test purchase, customer delivery and public Shopping each remain separate approval/acceptance boundaries.

## Launch acceptance boundaries

| Phase | Reuse already implemented | Still required before launch |
| --- | --- | --- |
| AI Shopping/handoff | Discovery, saved selection, fresh price/inventory, AI Brain, native Storefront verification and #204's guarded cart/receipt work | Approved second test, validated durable receipt/status and separately approved handoff/customer rollout |
| Merchant order support | #203's existing setup component, merchant opt-in/pause, synced orders, internal tasks, assignment/completion, in-app reminders and Follow-ups | Authenticated owner acceptance of activation, a current order event/task and Follow-ups; deployment alone is not acceptance |
| Recovery/post-purchase | Existing observation, purchase recheck, review intent, workflow drafts, order/fulfillment event intake and staging delivery work | Verify real consent, STOP/unsubscribe, purchase suppression at dispatch, WhatsApp routing, approved templates, duplicate/ambiguous outcomes and controlled-recipient receipt acceptance before enabling any sender |
| Merchant launch | Existing Shopify OAuth/billing, integration setup, dashboard and help surfaces | Complete the merchant journey and applicable privacy/help/marketing acceptance; explicit production release approval |

Production deployment evidence and private readiness findings belong in the private review/session, not this public document. Do not equate passing fixture/render tests with authenticated production acceptance. No outbound acceptance gate is relaxed by this cart milestone.
