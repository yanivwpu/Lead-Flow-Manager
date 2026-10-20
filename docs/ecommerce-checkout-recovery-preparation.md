# Shopify abandoned-checkout recovery — staged intent preparation

Milestone: **review-safe preparation, not customer messaging**.

Verified Shopify Admin API 2026-10:
- abandonedCheckouts(first:2,query:"id:<numeric checkout id>") + exact checkout GID check
- abandonmentByAbandonedCheckoutId to check for any order since abandonment
- shop.primaryDomain.url to validate Shopify's custom storefront recovery URL
- read_orders scope and manage_abandoned_checkouts permission are needed.

After the staging-only checkout observation import from #138, an authorized merchant
may explicitly POST /api/shopify/ecommerce/checkout-recovery-prepare with exactly
{"action":"prepare_review"}. Both
ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED=true and
ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED=true must be set on the exact staging
environment. This is disabled by default and cannot run in production.

Up to five tenant-owned due checkouts per call are freshly checked through the
Shopify Admin API. If Shopify cannot confirm the checkout, later order status,
valid purchase-free state, timestamp, or the shop's primary domain, the preview
fails closed. Recheck happens before every internal intent preparation. An
active uniquely owned installation and shop privacy/uninstall advisory lock
are revalidated before persistence.

The migration migrations/20261020_ecommerce_checkout_recovery_intents.sql
creates a unique (account,shop,checkout GID) record with ready/suppressed
states. No customer data, credentials, URLs, message bodies or tokens are
persisted. Concurrent retries cannot duplicate, completed checkouts are
suppressed, and a stale replay cannot resurrect a suppressed checkout.
The prior checkout observation import also suppresses completed intents.

Do NOT enable either staging flag until the migration is applied by a
reviewed operator with safe backup/restore and privacy erasure hooks assessed.
This is an additive staged migration, not auto-run and not deployed to main.
There is no cron, worker, messaging provider, recipient match or WhatsApp send
in this PR.

**Next work before customer messaging**: verified contact-to-Shopify identity
and WhatsApp opt-in, suppression/privacy/opt-out lookup, approved template,
channel-window checks, purchase recheck immediately at dispatch, a durable
provider idempotency/unknown-acceptance ledger, send retry safety,
multi-domain checkout confirmation, scheduled workers and staged E2E tests.
In particular a prepared intent is NOT a send authorization; it may be days
old and its Shopify state can change.

Known limitations: Shopify may fail the combined recheck due to per-store API
permissions or unavailable abandonment resource, in which case no intent is
prepared. Validate with the real staging development store before activation.
