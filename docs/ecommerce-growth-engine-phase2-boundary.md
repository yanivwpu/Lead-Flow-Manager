# E-commerce Growth Engine — Phase 2 implementation boundary

Status: **draft / not connected to runtime**. PR #109 is a pure planning foundation.

## What exists
- Tenant-scoped event candidates for `orders/create`, `orders/fulfilled`, `orders/cancelled`.
- Reject unverified, unsupported and malformed event identities.
- Preview-only gate requiring engine opt-in, active installation, exact tenant match, known consent, and no opt-out.
- No Shopify API requests, messages, automations, database writes or checkout operations.

## Required before runtime integration
1. Confirm the exact webhook topics registered in staging and Shopify's topic semantics. No event is assumed subscribed simply because it appears in this planner.
2. Reuse existing Shopify HMAC validation **before** classification; never trust caller-supplied `verified` from network JSON.
3. Resolve the account and active installation from persisted server state. Check Shopify shop association and reinstall/revocation status at processing time.
4. Persist Shopify webhook delivery IDs with a tenant/shop/topic-scoped uniqueness guarantee, and make processing idempotent across retries and concurrent workers.
5. Build documented event-to-CRM contact matching with data-minimization and tenant isolation. No automatically fabricated contact.
6. Separate transactional support from marketing. Verify customer consent and opt-out under the applicable channel/provider rules, including WhatsApp 24-hour window and approved templates; preview consent is not blanket permission to send.
7. Build a **disabled-by-default** per-store engine configuration, editable workflow review, dry-run previews, bounded metrics and an emergency disable control.
8. Test duplicate/out-of-order deliveries, missing customer details, webhooks from uninstalled shops, revoked scopes, delivery failure and rate limits.
9. Staging review and explicit production rollout approval.

## Explicit exclusion
Checkout one-cart test remains unresolved and guarded separately in PR #108. Never reset or remove its consumed volume claim as part of E-commerce Growth Engine work.
