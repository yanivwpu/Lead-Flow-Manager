# Private pilot Shopping acceptance and checkout preparation — 2026-10-25

## Accepted Shopping milestone

The verified production owner of `marketing@whachatcrm.com` reported successful authenticated discovery, explicit variant selection, reload persistence, and live price/inventory recheck after PR #186 (`491f69818cff0f46f6c82e8af9e58fa64912100a`). Production deployment `258fa611-ae38-4ffc-9de8-73fdb2291da2` succeeded at 17:05:12 UTC.

Read-only inspection corroborated this report in private session `2c974eda-2263-45af-8665-ff4de9ec721b`, owned and acted on by workspace `6868785e-e8af-4152-8e2d-8d031c2e97d0`:

- Product: **The Collection Snowboard: Liquid / Default Title**.
- Saved verified price: **USD 749.95**; tracked inventory: **50**.
- Last provider verification: **2026-10-25 17:17:11.568 UTC**.
- Internal product/variant: `3eaa0880-bb5e-4a51-b434-d8a0ec68b2b2` / `19a6e867-bddb-440e-8121-d5c966f0d8b5`.
- Shopify product/variant: `gid://shopify/Product/10108114174234` / `gid://shopify/ProductVariant/51638769221914`.
- Persisted state: `confirming`, displayed as **Awaiting confirmation**; selected variant retained. Eight transcript messages; their contents were not exported.
- Sanitized server events show discovery (`selecting`, 17:11:54 UTC), explicit selection (`confirming`, 17:13:05), and follow-ups remaining `confirming` at 17:16:15 and 17:17:11. The last event carries the new provider-proof timestamp above.

Refresh behavior is the owner's authenticated UI evidence; the persisted state and sanitized logs independently corroborate the selection and fresh proof. These are historical observations, not a guarantee of current stock or a checkout acceptance. The session expires normally; it is not extended for checkout.

## Small non-mutating language improvement

The phrase “Please verify the selected snowboard's current price and available inventory against Shopify” previously failed the generic follow-up word allowlist. Recognize `selected <noun>'s` (including curly apostrophes) only when that noun occurs in the saved selected product title. Reuse the existing verification path. With no selected product or an unrelated noun, do not infer a selection. No new provider action, setting, or checkout permission is introduced.

Regression coverage extends the authenticated HTTP sequence through reload and the exact phrase: same variant, fresh inventory read, no rediscovery or selection prompt. Unit coverage rejects unrelated product references and references without a selection.

## Checkout implementation already available

| Component | Existing behavior | Readiness / limitation |
| --- | --- | --- |
| `server/shopping/checkout/shopify.ts` | Native Storefront Cart API; verify exact variant, price/currency/options, availability and quantity rules; reverify before `cartCreate`; validate returned lines and Shopify-hosted URL; no buyer identity | Reuse. A cart is a provider mutation and needs separate approval. Cart status does not prove payment; payment status remains unknown. |
| `eligibility.ts`, `handoff.ts`, `authorization.ts` | Tenant/actor/conversation checks, confirmed intent, event/lease guards, installation continuity, current Admin inventory proof (at most 60 seconds), quantity 1–99, source/settings/entitlement checks | General rollout source constant remains false. Eligibility expects a real CRM conversation, not a private Test Chat session. Do not fabricate one. |
| `attempts.ts` | Durable unique request claim, encrypted private receipt, replay protection, ambiguous-outcome handling; inventory timestamp excluded from logical request identity | Full runtime tables `checkout_preparation_attempts` and `checkout_provider_gates` are absent in production. Receipt-key variable is not listed. Those are future runtime prerequisites, not required just to inspect checkout. |
| `controlledValidation.ts` | Live development-store/app/grant attestation, exact Admin read and Storefront verification; approval absent returns before claim, mutation or receipt | Reuse for read-only preflight. Approval/consume/save callbacks must remain unreachable in this phase. |
| `adminTest.ts` and existing Shopify checkout-test UI | Authenticated owner/admin and HTTP-session binding; configured workspace/operator allowlists; explicit expiring one-cart approval; existing shop-wide durable dispatch fence before mutation | Production `shopify_checkout_admin_tests` table/index exists; zero recorded rows/approvals/claims at audit. Hard-coded **Hydrogen**, not accepted Liquid. Test access variable names exist; values/target after workspace reassignment were not inspected. Do not enable or retarget its mutation actions during preparation. |
| Workspace Offers | Existing merchant-supplied HTTPS payment/checkout links and human-approval requirement | Appropriate for approved manual offers. A generic stored link is not evidence of this exact Shopify variant, quantity, price or inventory. |
| Draft orders / invoices | No Shopify draft-order creation or invoice adapter found on main | Not implemented. No reason yet to add one or request broader Shopify permissions. |

The private Test Chat adapter still forces checkout disabled and exposes no checkout execution capability. Its Shopping allowance does not grant checkout or public channel access. No configuration, migration, credentials, cart, order, subscription, or charge was created during this audit.

## Earlier test work and unresolved provider gate

PRs #95–#97 introduced the guarded checkout foundation, native handoff and isolated validation harness. #99 introduced the admin-only development-store one-cart journal. #102–#106 added bounded, sanitized provider diagnostics.

PR #107 is still an **unmerged draft**. Its recorded tokenless Storefront probes failed with HTTP 400 / `BAD_REQUEST`: **“Online Store channel is locked.”** No evidence from this preparation establishes that this Storefront restriction has been resolved. Successful Admin product/inventory reads do not establish Storefront channel publication or checkout eligibility. Earlier checkout-test selection was Hydrogen; it is not Liquid acceptance.

Do not reuse the old proposed extra-service credential probe. Use the existing authorized application path and existing read-only diagnostic components. No new service, token export, app reinstall, permission expansion, password/channel change, or fallback cart URL is authorized by this preparation.

## Safe end-to-end acceptance plan

1. **Private read-only preflight.** Add the smallest reviewed adapter from an authenticated authorized operator to an owned, unexpired private Test Chat session in the exact verified marketing workspace. Require the selected Liquid variant in `confirming`, explicit quantity (initially one), and unchanged installation/source. Selection must come from server-owned state, never client product IDs or an LLM. Reuse the existing Admin verification and `runValidation` with approval omitted. Return sanitized readiness/failure fields only. Check existing workspace/operator allowlist targets without exposing credentials. Keep public settings and checkout gates unchanged.
2. **Establish live Storefront eligibility.** Freshly attest the production app, development-store status and existing grants. Read exact variant, price/currency/options, quantity rules, Storefront availability and the attested checkout host. Compare against fresh owned Admin inventory and selected price. Price changes require acknowledgement; insufficient quantity, unpublished variants, installation changes and throttles fail closed. The historical 50-unit snapshot cannot authorize a cart. A locked Storefront channel is a failed preflight; resolve through a separately reviewed Shopify-supported channel/authentication path, not an invented payment URL or draft-order workaround.
3. **Test without provider mutation.** Cover wrong actor/workspace/session, expired or superseded selection, refresh, altered client IDs/quantity, stale proof, price/stock changes, currency/options mismatch, replacement installation, cooldown, public Web Chat/WhatsApp/workflow exclusion, and no cart/order/email dispatch. Existing tests cover much of the provider/journal behavior; the private-session adapter still needs its own coverage before it is enabled.
4. **Separate explicit approval for exactly one development-store cart and hosted handoff.** Only after the read-only gate passes, present the exact selected variant, quantity, freshly verified price/currency and inventory, workspace/shop/session/install binding, and irreversible dispatch fence for approval. Reuse the existing `0112` shop-wide journal rather than installing the general customer-checkout schema solely for a private test. Adapt the fixed Hydrogen selection to the server-owned selected private session, bind that private session into the approval digest, and retain the operator/HTTP-session guards. Claim durably before `cartCreate`; no automatic retry/reset on ambiguous outcomes, crash or lost response. Review and test this adapter before deployment.
5. **Actual Shopify handoff acceptance, only within that approval's scope.** Confirm returned native checkout URL and exact cart line/quantity/unit price/currency; reject unexpected host/redirect or changed/partial line. Keep URL/cart credentials out of transcript, logs and analytics. If approved to navigate, verify Shopify renders the exact item/quantity and distinguishes taxes/shipping/discounts. Stop before buyer/payment submission or order creation. Record password/channel restrictions as failures, not success. A cart URL is not a paid order.
6. **Any payment/order test needs another explicit approval.** Specify Shopify development/test-payment conditions and the exact order/charge scope first. Do not send checkout/invoice URLs to customers, invoke recovery workflows, or infer payment success from cart status. Customer rollout remains a later separately reviewed milestone.

Duplicate acceptance must include double-clicks, concurrent processes, refreshed private sessions, changed inventory-proof timestamps, lost responses, cancellation, and an ambiguous provider outcome: at most one mutation, with consumed claims preserved. A safe rollback disables the private adapter and stops further dispatch; it must not reset claims or automatically delete provider carts/orders.

## Native payment-link and draft-order choice

The preferred current milestone is the existing native Cart API and its Shopify-returned `checkoutUrl`. It already preserves exact variant and quantity and requires no new payment service. Shopify documents [cartCreate](https://shopify.dev/docs/api/storefront/2026-10/mutations/cartCreate) and [Storefront authentication](https://shopify.dev/docs/api/storefront/2026-10).

If a later merchant workflow specifically requires a manually prepared invoice/custom pricing, Shopify [draftOrderCreate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/draftOrderCreate) and its native `invoiceUrl` are candidates, subject to separately approved write permissions and exact installed API-version review. They create real provider records. [draftOrderInvoiceSend](https://shopify.dev/docs/api/admin-graphql/latest/mutations/draftOrderInvoiceSend) sends customer email and is outside the present authorization. The catalog's recorded scopes show read-only product/inventory/customer/order access, not draft-order write permission. Do not add this second checkout path solely to bypass an unresolved Storefront restriction.

## Status at preparation

Shopping acceptance is recorded. Natural selected-product verification is covered by focused regression tests. Native checkout/provider, freshness, duplicate-prevention and private administrative test components exist. Missing pieces are the private selected-session adapter, verified allowlist targeting, and a successful live read-only Storefront preflight for Liquid. Full customer runtime additionally requires separately reviewed schema/key readiness and activation. No live checkout/handoff acceptance is claimed, and checkout mutations, public Shopping, recovery and outbound messaging remain disabled.
