# Shopify checkout recovery — Meta template adapter milestone

## Implemented, not yet activated

The existing WhatsApp Cloud API sender is reused. No new or parallel Meta sender.
The adapter in \`server/ecommerce/checkoutRecoveryMetaSender.ts\` is **not called
from routes, webhooks, cron, queues, or any live worker**. It is only
available to a future reviewed worker after a legitimate outbox claim.

The adapter requires all of the following before calling Meta:
1. Exact staging environment and three independent flags (all off by default).
2. Claimed, unique, tenant-owned recovery outbox row with matching claim token,
   contact, template, checkout GID, ready intent and incomplete/due observation.
   Row stays locked through the provider attempt; no concurrent second call.
3. Current Shopify merchant/integration token, current tenant-owned contact and
   template, exact Shopify customer ID and verified shop mapping.
4. Explicit WhatsApp-specific opt-in evidence for this checkout purpose,
   HMAC tied to current E.164 recipient, with no revocation/opt-out/automations
   pause, and current tenant/shop ownership. It is NOT inferred from the Shopify
   customer's SMS/email marketing settings. Evidence table is not populated yet.
5. A fresh live Shopify purchase recheck that matches the checkout, shopper and
   exact recovery link produced by the earlier review.
6. Live Meta approved MARKETING template identical to the local synced template.
   **Only text-only template with exactly one {{1}} body parameter is supported.**
   The single body variable is the complete Shopify-verified HTTPS recovery URL.
   Reject dynamic buttons/media/carousels/headers or changed Meta bodies.
7. One at-most-once call to existing Meta template sender. Any missing Meta
   acceptance ID or uncertain network/transaction result is not retried by
   this adapter; external orchestrator must leave claim terminal uncertain.

## Launch blockers

- Wire an independently verified WhatsApp opt-in capture AND revocation source
  to the existing protected consent table. DO NOT create a merchant toggle that
  marks an imported Shopify phone number as opted in.
- Complete reviewed Shopify/Meta provider end-to-end staging acceptance, with
  approved template copy and the customer's recovery link in the first body
  variable. Meta pre-approval and template category must remain current.
- Add scheduling and at-most-once claim executor, careful no-retry handling
  of provider uncertainty, status receipt reconciliation and operations alerts.
- Review and apply migrations to staging only after backup/restore, privacy
  approvals, uninstall/erasure tests and consent HMAC key provision.
- Staging deploy, test shop recovery and purchase-before-send, then approve
  customer sends separately. Marketing pages must remain prelaunch until
  those checks pass.

**No migrations, flags, sends or production deployments were changed here.**
