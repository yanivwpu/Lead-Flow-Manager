# E-commerce Growth Engine: staging merchant review queue

This milestone adds the first **operational, non-sending merchant control** after the verified `orders/create` → inbox event. It is not an outbound workflow or a public Growth Engine activation.

## Behavior
- In staging Integrations > Shopify, an authenticated merchant sees up to 20 pending events **for only their account and canonical connected Shopify shop**.
- Only event ID, topic, journey, received timestamp and aggregate counts are returned. Delivery IDs, customer details, payloads, billing data, Shopify tokens and secrets stay server-side.
- **Mark reviewed** performs one parameterized PostgreSQL `UPDATE` of an owned event from `pending` to `reviewed`. This is an irreversible triage acknowledgment; no action sends messages, creates Shopify carts, modifies Shopify orders, or triggers the legacy automation engine.
- A second/replayed/concurrent review returns 409 and changes nothing. Changing/revoking the installed Shopify integration blocks the review.
- The write requires a signed-in session, matching active Shopify integration, exact staging environment/app origin, same-origin JSON POST, validated action, and a canonical bounded BIGINT event ID.
- No new database migration: the existing manually verified staging inbox schema already accepts `reviewed`.

## Verification
- `npx tsx --test tests/shopify-ecommerce-review-security.test.ts tests/shopify-ecommerce-preview.test.ts`
- A separate isolated local PostgreSQL CI fixture tests cross-account/cross-shop denial and parallel attempts.
- After CI, deploy to **Shopify staging only**, confirm original event remains until merchant explicitly marks reviewed, click once and observe Pending Review 1→0 while Recorded Events remains 1.
- Never mark the owner's existing event reviewed without their explicit click or instruction.
- No production merge, merchant activation, outgoing send, checkout mutation or additional test order is authorized by this milestone.

## Later release gates
- Entitlement-aware per-store engine installation and pause controls
- Contact/order association without exposing personal data through this inbox
- Channel-specific consent, suppression, WhatsApp template rules, 24-hour windows and outbox deduplication
- Order fulfilled/cancelled subscriptions, abandoned-checkout eligibility and verified topic routing
- Durable retries, human handoff, rollback policy, UI settings and launch acceptance
