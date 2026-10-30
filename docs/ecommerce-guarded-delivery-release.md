# E-Commerce delivery release procedure

This is a source review and isolated-test procedure. It does not authorize a production migration, customer message, Shopify app deployment or public rollout. Production delivery remains source-disabled. Keep all existing send switches off and preserve the owner-only pilot guard.

## Evidence to reuse

Reuse the acceptance recorded in #234/#235, the signed recovery YES/STOP/re-opt-in acceptance, the existing checkout attempt/receipt infrastructure, catalog acceptance, and the five-migration production-copy rehearsal in `ecommerce-delivery-migration-preflight-20261030.md`. Do not create another checkout/order, repeat consent acceptance, replay the uncertain checkout or reapply completed migrations to manufacture evidence. #239 prepares only the missing app-managed fulfillment/cancellation subscription declarations; TOML declarations do not prove live delivery.

## Read-only preflight

Run `node --import tsx scripts/ecommerce-delivery-migration-preflight.ts` using the explicit `ECOMMERCE_MIGRATION_PREFLIGHT_DATABASE_URL` binding from the approved secret store. It never uses the application database implicitly. It opens `BEGIN READ ONLY`, reads only schema metadata, records ordered SHA-256 migration hashes, and rolls back. It has no apply mode and prints no credentials, customers or connection identifiers. Keep the output in the private acceptance record.

The sixth migration is new and review-only. It adds the post-purchase outbox, exact intent scope, semantic uniqueness, durable claim and provider-attempt timestamps, recipient HMAC, receipt fields and an update trigger that prevents requeue/reset. It is absent from startup/bootstrap paths. Native PostgreSQL CI must rehearse it with the existing intent migration and prove concurrent claims, STOP serialization, restart-safe uncertainty, receipt ordering and privacy cascades. A successful earlier five-file rehearsal does not cover this sixth file.

## Separately authorized production change

1. Confirm the exact project/branch/database and owner in the private change record. Capture a fresh backup or isolated recovery branch and verify restore access. Record current app version and migration hashes. Obtain separate production DDL approval for that exact target and additive diff.
2. With customer sends still off, compare the preflight against the expected schema. Apply only missing reviewed migrations in manifest order in a bounded maintenance transaction. Existing incompatible columns, types, constraints, triggers or indexes are drift: stop for review. `IF NOT EXISTS` is not evidence that an existing object matches. Never drop/recreate, reset claims, backfill consent or replay uncertain work.
3. Repeat the read-only preflight and constraint/index/trigger inspection. Confirm existing privacy, uninstall and STOP locks cover the exact installation. Validate counts privately and retain backup/restore evidence. Do not enable preparation or delivery as part of migration.
4. Through the existing Shopify app release process, separately approve the appropriate app identity/configuration and verify actual fulfillment/cancellation subscriptions and callbacks. Preserve existing compliance subscriptions, scopes and app ownership. Do not create duplicate per-shop registrations when app-managed evidence is unknown. No synthetic live order is required by this procedure.
5. Obtain separate release approval before any production-source gate change or runtime switch. The independent owner pin, preparation gate, delivery gate, verified-webhook attestation, signed-receipt capture, HMAC key readiness and explicit merchant opt-in must all agree. Private self-service activation cannot override these prerequisites. Every send still freshly checks Shopify order/customer/purchase state, installation, exact unique CRM/WhatsApp identity, HMAC purpose consent, pause/DNC/privacy and local/live approved template.
6. Future controlled-send acceptance needs its own approved recipient, purpose, template and maximum attempt count. Record provider acceptance separately from signed sent/delivered/read receipts. A timeout, lost response, crash, blocked claim or settlement error consumes the opportunity and never automatically retries. This task does not authorize that live test.

## Rollback and reconciliation

Turn off delivery/preparation gates and pause merchant journeys, then roll back the application if necessary. Receipt capture stays available independently of sending. Retain accepted/uncertain evidence, consumed claims and consent/STOP tombstones; do not requeue attempted rows or restore a database copy to reset an attempt. Signed receipts reconcile only the receiving owner, shop, recipient HMAC and provider ID, with monotonic status progression. Customer/store erasure uses the existing privacy locks and cascades; do not preserve customer payload to retain a delivery fence.

## Current operational limits

The production-only pilot UI and staging-only delivery runtime intentionally cannot activate production sends. General merchant rollout, production DDL, live subscription verification, migration restore acceptance and provider receipt acceptance remain separate release gates. A green source PR or isolated provider fixture is not production delivery acceptance.
