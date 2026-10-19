# E-commerce Growth Engine — internal task merchant controls (STAGING)

Adds a separate task opt-in/PAUSE and a bounded internal task list to the existing
staging Shopify integration panel. **Not a customer messaging or complete Growth Engine activation.**

## Release fences

- No new Shopify permissions, subscriptions, checkout mutations or outbound sends.
- Server route runs only when both Railway environment name and APP_URL match the
  fixed staging app. Authenticated session, same-origin JSON and a unique active
  Shopify integration matching the server-resolved account/shop are mandatory.
- Merchant task opt-in initially OFF; a prepared *orderSupport* draft and order
  synchronization must already be enabled for the merchant to opt in.
- Merchant setting does not override operator gates: recording and task execution
  must also be explicitly enabled in staging by separate release approval.
- Existing pending event remains untouched. There is no historic backfill.
- UI shows 'database setup pending' until migration is applied; never silently
  creates tables or returns a false 'active' state.
- Task completion changes only an owned internal task to completed and remains
  independent from the original event's Mark reviewed action.
- Uninstall drops merchant opt-in so reinstall cannot silently re-arm tasks.
  Signed shop/redact removes shop-level task/inbox/opt-in data. Customer erasure
  removes linked internal tasks even if contact is anonymized rather than deleted.
  Missing optional task tables do not block legacy production cleanup.

## Deployment sequence

1. Validate PR on isolated local PostgreSQL fixture (native concurrency tests).
2. Verify staging database identity and snapshot/rollback before *any* DDL.
3. Apply reviewed additive task migration to staging ONLY; production untouched.
4. Deploy safely with `ECOMMERCE_ORDER_SUPPORT_TASKS_ENABLED` absent/OFF.
5. Verify event preview, Shopify trial/onboarding, uninstall/redaction and
   manual review queue still work. Internal tasks must remain non-operational
   until separately authorized merchant opt-in and operator release.
6. In a later explicitly approved controlled test, enable recording and
   operator task gate with merchant opt-in, using a new verified order event;
   no old event replay, no automatic messaging, no cart creation.

The new task queue is **internal staging infrastructure**. The normal CRM
Follow-Ups calendar remains separate pending its own reviewed integration.
