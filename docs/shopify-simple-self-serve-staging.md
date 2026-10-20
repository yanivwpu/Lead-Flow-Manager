# Shopify E-commerce Growth Engine — simple self-serve (staging)

## Merchant experience
**Connect Shopify → Turn on order support → View tasks.**

- Connected: compact store identity; no separate large syncing explanation.
- Not started: one supported option (Order support) and one **Turn on order support** action.
- Started: short **On — new orders create tasks** status, task counts, **View tasks** and **Pause**.
- All current workflow draft cards, webhook internals, event-review queue, Shopify sync controls, support contact and disconnect option remain in a collapsed **Settings & advanced → Technical details** area.
- Mobile friendly: no multi-step wizard, no full-screen explanation, and no unsupported feature promoted as active.
- Other journeys (fulfillment, cancellation, abandoned cart, messaging/checkout recovery) stay unlisted on the main surface because they have not yet been verified end-to-end.

## Backend invariant
`POST /api/shopify/ecommerce/order-support-quick-start` accepts exactly one field:
`{ "action": "start_order_support" }`.

Inside **one transaction** and the existing Shopify uninstall advisory lock, it checks the authenticated shop owner, a single active matching installation, existing order sync, reviewed tables and both independent operator gates. It then prepares the orderSupport draft and saves merchant internal-task opt-in in the same transaction. No customer send, cart, payment, fulfillment action, replay, or cross-shop input. Repeated clicks are idempotent.

**This is not a production launch.** The endpoint and simple activation card are staging-only until merchant release, compliance and cross-account acceptance pass. If staging task execution or recording is off, Start is disabled with a short plain-language message; the UI cannot override operator gates.

## Acceptance checks
- A connected, not-yet-activated staging merchant sees one Start action (not a draft-and-opt-in wizard).
- A running merchant sees one active summary and View tasks; pausing keeps existing tasks.
- The old #1003/#1004 events are not replayed or acknowledged; no new order is needed for this UI test.
- An interrupted combined save rolls back fully (native PostgreSQL).
- Disconnect, redaction, Shopify sync and existing technical diagnostics remain available under Advanced, with backend guards unchanged.
- Production does not show an unverified Order support activation surface.
- No customer messages or checkout actions are enabled.
