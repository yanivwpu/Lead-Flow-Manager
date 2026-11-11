# Shopify consent enrollment: implementation and release gates (#282)

This PR implements merchant configuration and readiness only. It does not approve production sending or consent capture, publish a storefront, submit templates, change Shopify scopes/tokens, release an app version, merge or deploy. It builds on main including #279 and #283; the separate template refresh work is retained.

## Gap audit and chosen collection route

The existing merchant workspace already has template provisioning, journey plans and separate enable/pause controls. The missing part was a discoverable, merchant-owned notice and enrollment path. Existing six post-purchase commands and the checkout reminder command already pass through signed Meta inbound verification, customer/contact/shop/phone binding, freshness, HMAC, STOP tombstones, privacy locks and recipient/order suppression. Those systems remain the consent authority.

The new **Customer WhatsApp consent** panel is beside template setup in E-Commerce → Post-Purchase and the activated onboarding setup. Merchants enter their business name, select each of seven purposes independently, choose EN/ES/HE notices, add their own notice text, and declare an HTTPS placement page on their connected `myshopify.com` store. Required business/store identification, channel, purpose, voluntary choice and STOP language remain visible. The name must truthfully identify the business; additional merchant copy must preserve the meaning of the notice.

After saving and readback, authorized purposes expose a copyable notice and `wa.me` link to the connected business's display phone. The notice and link must be placed together, separately for each purpose, through **Shopify → Online Store → Pages**; the UI links to that editor. There is no theme/checkout injection or new Shopify permission. Custom storefront domains and automated theme/app-block installation are not implemented in this PR; use the connected store's `myshopify.com` page. The merchant remains responsible for its notices, published privacy policy and appropriate collection placement.

The customer chooses a purpose, opens WhatsApp and sends the displayed exact English command. Interface and notice text are translated; commands deliberately retain the existing parser contract. Opening/copying a link, saving settings, generic YES/OK, an admin switch or a Shopify email/SMS preference does not grant consent. Nothing sends an unsolicited consent request or a grant confirmation. Signed reply processing remains blocked for unknown, ambiguous, stale, wrong-phone or wrong-Shopify identities. The existing production capture scopes are not broadened. Where capture is unavailable, links remain unavailable and the UI explains the blocked gate.

The current notice configuration records owner, time, revision hash, declared placement and the installation/WABA/phone connection fingerprint in the existing integration config. It records merchant configuration provenance, **not** customer page-view evidence, and does not claim to correlate a customer's reply to a specific page or notice revision. Customer consent provenance remains the existing signed inbound evidence (WAMID/time/HMAC/customer binding). A new connection requires reviewing and saving enrollment again. Generic integration edits cannot overwrite this managed configuration. No customer-facing public grant endpoint or customer identifiers are added.

The route follows the [WhatsApp Business Messaging Policy](https://business.whatsapp.com/policy): permission before business contact, accurate business identity, honoring opt-outs, and approved templates for business-initiated conversations. Our channel/purpose-specific command requirement intentionally preserves this application's stricter accepted consent contract. Shopify's [page/link editor](https://help.shopify.com/en/manual/online-store/add-edit-pages) supports the manual placement without requesting theme-write or checkout permissions. These sources were reviewed for this implementation; no live merchant action was performed.

## Distinct readiness gates

`GET /api/shopify/merchant-engine/consent-enrollment` returns each purpose's independent template status, journey selection, merchant preference, capture scope, operator release and blocking reason codes. It never returns customer identities, tokens, HMAC keys, recipient digests or provider leases. `POST` accepts only notice configuration, through the existing session, same-origin JSON, rate limit and owner/privacy/installation locks. Saving cannot write consent, outbox, merchant activation or credential fields.

| Gate | Ready condition | Blocking condition / remaining action |
| --- | --- | --- |
| Template setup | Fresh matching approved template bound to this connection and purpose | Missing/stale/unapproved template or changed connection; review existing setup. Template approval alone is never delivery readiness. |
| Merchant preference | Relevant selected journey explicitly enabled | Paused/unselected; activation still requires existing independent release/schema/template gates. Pause continues to work on Meta disconnect. Enrollment selection only offers consent collection; it does not select or enable delivery. |
| Consent collection | Saved current notice, connected business phone, existing authorized capture scope | Missing notice/phone, old connection or capture release unavailable. Merchant must place the notice/link appropriately; saving is not storefront publication. |
| Recipient consent eligibility | Checked separately by the existing sender for each exact customer and purpose | Always conditional in this administrative UI. Real current signed consent, correct identity/HMAC, and STOP/DNC/privacy/purchase checks are required; no global “customers eligible” claim. |
| Operator delivery release | Existing exact authorized operator scope | No release, missing schema/receipts/webhook verification, expired or mismatched scope. A production post-purchase release is displayed only for the journey of the exact existing tenant/installation intent. Checkout release remains one exact checkout/recipient, never an entire cohort. |

## Ready for code review and remaining acceptance

- Ready: merchant notice configuration/provenance, separately selected purposes, genuine customer-initiated WhatsApp opt-in route, safe unknown/blocked states, four distinct readiness stages, EN/ES/HE with RTL, focused fixture/API/UI tests and CI wiring. Previously accepted tests are unchanged. No dependency changes or schema migration.
- Owner-only: review/approve this PR; later authorize the precise pilot recipient and journey before any external acceptance send. Review and place the merchant notice in the appropriate storefront surface. The initial implementation does not collect any actual customer consent.
- Customer-only: freely send a legitimate purpose-specific opt-in from the same verified Shopify customer/WhatsApp phone. Neither historical staging tests nor merchant configuration substitute for that evidence.
- Provider-only: checkout Marketing template approval in the current WABA, as recorded by #282. Existing approved Utility templates and pending template submission remain accepted; do not resubmit.
- Operator-only after separate authorization: validate the exact scoped release, strong consent HMAC, schemas, verified webhook and receipts, current customer/purpose evidence, country eligibility, suppression and current purchase/order state. Keep production delivery flags OFF until that authorization.
- Next controlled acceptance: use one existing approved opted-in recipient and journey, without creating another order/checkout solely for testing; check provider receipt, STOP/purchase/DNC/privacy suppression, at-most-once and uncertain outcomes. This PR does not run that acceptance or replay accepted live/staging tests.
- Separate launch blockers: #269 offline-token P0, #154/#136 launch tracking and dependency baseline audit. No token migration, rotation or app version release here.

## Subsequent cohort design (separate review)

After accepted pilot evidence, replace the one-intent/one-checkout delivery release with a reviewed, bounded merchant/account + shop + installation/WABA/phone + purpose scope, explicit expiry and country eligibility. Require independent per-purpose consent and current suppression at dispatch, durable attempt fences, tenant and recipient rate budgets, provider quality/rate-limit monitoring, receipt/uncertainty alerts and an audited rollout record. A template-management cohort must never implicitly authorize delivery. Roll back using merchant pause and independent operator kill switches while retaining STOP, late receipts and uncertain-attempt fences. Do not implement a global production sending boolean or silently widen the existing release in this PR.

## Validation

Focused automated tests: `node --import tsx --test tests/ecommerce-consent-enrollment*.test.ts`. They exercise parser eligibility of generated links, configuration-only persistence, immutable purpose/channel/STOP notice elements, tenant and installation isolation, same-origin authenticated API writes, blocked activation, disconnect pause, current-connection invalidation, production intent-specific release reporting and EN/ES/HE rendering.

Local browser acceptance uses fixture data and mocked HTTP only: save failure/retry, committed readback, clipboard notice/link, unsaved-edit link hiding, unavailable capture and all three languages/RTL. It sends no Meta requests. Production build and the existing exact-base TypeScript regression check are also run. The existing e-commerce CI glob includes the new test files; previously accepted test files and staging/live acceptance evidence are preserved.
