# E-commerce Growth Engine — minimal preview and launch gates

The preview is **not** a public feature launch. It is accessible on the Shopify staging branch at `/ecommerce-growth-engine`, intentionally unlinked from marketing navigation and `noindex,nofollow` while only internal order support has passed staging acceptance.

## Visitor experience
- One promise: connect Shopify and find order follow-up work in the CRM.
- A clear three-step diagram: connected store → new recorded order → internal support task.
- One primary CTA to the existing authenticated Shopify manager. Visitors without a session use the established authentication redirect; no direct Shopify Admin deep links or public signup claims about ready-made messaging.
- Lightweight customer/order follow-up value statements, with explicit notice that automatic messaging, abandoned-cart recovery, fulfillment and cancellation journeys are not active.
- Responsive layout. No setup wizard, webhook jargon, operator feature gates or manual event review on the marketing page.

## Verification before promoting the page
1. Complete merchant first-install tests for trial and paid paths, including `/shopify/start` → `/app/integrations?setup=shopify`.
2. Validate staging owner opt-in on a clean *test account* without replaying existing Shopify orders.
3. Confirm Shopify customer and order records, tasks and completed history are usable on desktop and mobile. Task completion must not change payment or fulfillment status.
4. Perform privacy, plan eligibility, protected customer data, error states, OAuth and webhook review.
5. Independently test outbound messaging consent/opt-out, approved templates, delivery de-duplication, operator gates and disabled-by-default production release **before** copy about customer messaging can be promoted.
6. Remove noindex and add marketing-nav and Growth Engines catalog links only once the production rollout and merchant signup path are accepted.

Staging preview and backend feature gates are independent. Visiting the landing page does not activate a workflow or create a Shopify order.
