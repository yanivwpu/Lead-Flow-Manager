# Checkout recovery consent/outbox Shopify privacy lifecycle — staging only

This patch extends existing **HMAC-authenticated Shopify privacy handlers** under
the current per-shop advisory lock. It has no new route and enables no send.

- **app/uninstalled:** suppress pending checkout recovery outbox entries and
  revoke stored WhatsApp recovery consent evidence, scoped to current merchant
  account and canonical shop. Never treat a reinstall as renewed consent.
- **customers/redact:** delete recovery outbox rows for the proven tenant-owned
  contacts or exact authenticated Shopify customer ID, then delete matching
  consent rows (including phone HMAC). No guess based on Shopify email marketing
  preference. Existing deletion locks and customer record erase remain intact.
- **shop/redact:** remove recovery outbox, consent evidence, intents and
  checkout observations for the verified shop in child-to-parent order. New
  pseudonymous identifiers are not retained after shop redaction.
- Missing optional staging schema remains a no-op for legacy deployments.
- A claimed provider call may be in-flight. Privacy cleanup cannot retract
  already accepted Meta messages; a later live worker must recheck
  installation, purchase and opt-out immediately before dispatch and reconcile
  uncertain acceptance manually.

CI uses PostgreSQL 16 fixtures with 3 checkouts across two shop/tenant scopes,
verifying exact customer deletion, uninstall revocation and shop erasure.

**Remaining release blockers**: real verified opt-in capture, audited Meta
send adapter, worker scheduling/reconciliation, live Shopify and Meta staging
acceptance, backup/restore and reviewed migration application. No production
deployment or messaging activation is included.
