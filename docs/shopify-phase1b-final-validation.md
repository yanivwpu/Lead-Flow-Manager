# Phase 1B final validation

## Verified baseline and root causes

PR #87 merged at `f840fc7f86652e5bf2a25d97eb0b7ae82a59673f`. Railway production deployment `b44510b6-05cb-4786-8411-88850191b4a4` is successful at that same commit. Investigation used read-only deployment and database inspection; no Shopify product, billing, trial, permission or entitlement records were changed.

The internal store snapshot contains 17 products. Draft, Archived, Hidden and Minimal are recorded as unpublished. The Complete Snowboard is active, published, complete and has five saleable variants. Published does not mean eligible: Out of Stock Snowboard and Gift Card have no saleable variants. An eligible-product count of 11 does not imply every card should say Published.

The old card presented only the first variant's availability as its product label. That conflated publication and availability, including incomplete products mapped to `not_published`, and ignored available variants outside the first 25. Product-page polling also stopped outside `syncing`, while summary polling continued, allowing stale cards after a short sync. Cards now independently show recorded publication and a server summary across all variants: Available at last verification, Out of stock, or Unavailable. Only a healthy, complete, active, published product with a verified saleable variant is marked available. All variants must have fresh, known negative inventory before Out of stock is shown; unknown, unsupported or stale data remains Unavailable. The visible bounded page polls every 15 seconds; this reads stored data and never starts synchronization. English, Spanish and Hebrew labels are included.

The billing resolver called `storage.getUser`, whose deliberately minimal auth-core projection omits Shopify fields. With no surviving URL/localStorage hint, even an installed merchant therefore received `SHOPIFY_SHOP_REQUIRED`. It now loads the canonical session user with the existing schema-drift fallback. Missing users, missing tokens and other-owner hint lookups fail closed. Shop hints cannot override the canonical shop. Resolving pricing is read-only; the old opportunistic installation-field patch is removed. The shared upgrade helper always requests the server's verified Managed Pricing URL instead of constructing an authoritative destination from client hints. Shopify's pricing page, subscription enforcement, billing return processing and one-time trial rules remain unchanged.

## AI validation

Regression fixtures exercise the real Sales Catalog store, Shopify live-data provider and turn-evidence grounding. A product with 51 variants, only the last in stock, yields its actual variant ID/options, exact USD 699.95 price and available snapshot, despite the browse preview containing only out-of-stock variants. Draft, archived, unpublished, incomplete, unsupported, unknown and stale inventory are excluded from recommendations. Recommendation retrieval now also requires a known nonnegative price and the source currency, matching purchasable-price safeguards; missing-price/currency variants are excluded. Missing storefront URLs stay null, and invented product/checkout links fail grounding. No AI messages are sent by these tests.

## Owner testing access — approval required before any grant

Read-only inspection of workspace owner `271c48f9-3515-4682-b391-2fead371593d` (`whachatcrm.myshopify.com`) found `billing_plan=free`, `shopify_subscription_status=pending`, an expired trial, no plan override and no AI Brain override. No grant was performed.

The existing admin-authenticated `PATCH /api/admin/users/:userId/access-overrides` supports `{"planOverride":"pro"}`. Its handler writes only the requested internal override fields and an admin audit event; it does not create a Shopify subscription, grant provider-paid status, reset a trial, or change billing fields. Effective Pro includes Pro feature entitlements, potentially including Growth Engine access; an explicit AI Brain deny override still takes precedence. Use this endpoint, rather than the older `/plan` route with demo-conversion side effects.

If separately approved by the owner:

1. Verify the target workspace ID and ownership above in the admin interface. Snapshot existing plan/AI/Growth Engine override flags and values, billing state and trial dates.
2. Apply the Pro plan override only to that internal owner through the existing admin control/API. Do not call Shopify billing, reinstall or restart a trial. Leave other override modes unchanged.
3. Refresh the session/subscription view and test Chatbot and AI Brain. This is access testing, not validation of a paid Shopify subscription. The override never substitutes for merchant consent or Shopify product scopes.
4. Restore the original override state after testing. For the currently observed disabled override, `{"clearPlanOverride":true}` disables it; restore any preexisting nondefault override instead of blindly clearing it. Verify billing/trial fields and other workspaces remain unchanged.

No owner approval to grant access is implied by this document.

## Review validation

Focused tests cover real managed-pricing HTTP routes, canonical shop resolution without hints, spoofed hints, missing sessions/tokens, expired-trial behavior, server-verified browser navigation, independent localized card labels, >25-variant summaries, price/currency eligibility and grounded recommendations. CI runs the new billing tests in Shopify onboarding validation and the new catalog tests in Sales Catalog validation, including native PostgreSQL fixtures. TypeScript is compared against the exact PR base because main contains existing diagnostics.

After review and deployment, owner browser validation should reopen the app from Shopify Admin, navigate to Chatbot without a `shop` query, and choose Pro. Expect the correct store's Shopify Managed Pricing page. Do not approve a charge unless separately intended. Check published/out-of-stock/unpublished cards after a background refresh, then use an approved internal override only if needed for AI UI testing. This PR does not merge, deploy, change subscriptions or grant access.
