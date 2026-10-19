# Shopify E-commerce Growth Engine — staging recording gate

As of 2026-10-19: PR #109 is draft, not merged. Its four CI workflows passed at `23d65ef`. Staging has **not** been changed for this feature.

## Verified staging topology
- Project `WhachatCRM Shopify Staging`, environment `staging`.
- Service `WhachatCRM Staging App` is connected to `codex/shopify-trial-first-onboarding`, not PR #109.
- Persistent database service `Postgres-JSIn` exists; this is not proof that it is the application's effective DATABASE_URL. Resolve deployment database identity before migration.
- Never touch `Shopify One-Cart Test PREP` or its consumed claim volume. Production checkout stays OFF.

## Required ordered gates
1. Build a **separate staging candidate** from PR #109 and confirm it contains the complete current staging-onboarding fixes. Do not blindly repoint the running staging app from its onboarding branch.
2. Before changing database schema, read-only verify database identity (endpoint/database/schema), role, and backup/rollback plan. No production connection strings.
3. Run `ECOMMERCE_PREFLIGHT_ACK=staging-read-only ECOMMERCE_PREFLIGHT_DATABASE_URL=<staging-only-URL> npx tsx scripts/inspect-ecommerce-inbox.ts --read-only` on a properly isolated staging runtime, with `ECOMMERCE_EVENT_RECORDING_ENABLED` unset.
4. Review migration DDL against the actual staging DB. Apply it only to confirmed staging database with explicit operator approval and documented deployment route; rerun read-only preflight.
5. Deploy candidate while `ECOMMERCE_EVENT_RECORDING_ENABLED` remains **unset**. Verify existing Shopify order/customer intake, uninstall and privacy paths.
6. For recording-only test, temporarily set `ECOMMERCE_EVENT_RECORDING_ENABLED=true` on staging app ONLY after migration passes. Send a signed order webhook fixture to the existing `/api/shopify/webhooks/orders-create` route, verify one unique row after duplicates and no extra messages. Do not place a real order or use `cartCreate`.
7. Revert flag to unset after test, review logs and schema. Never enable message-sending journeys as part of this plan.

## Operational limitation
The existing verified webhook handler performs the current commerce contact/order ingestion before optional event recording. Recording-only describes the **new Growth Engine inbox**, not a global suppression of existing commerce persistence. If the Growth Engine recorder fails while the flag is true, the existing route may ask Shopify to retry; verify both journal consistency and current behavior before shipping.
