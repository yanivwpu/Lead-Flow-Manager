# Shopify merchant contact privacy

## Findings and scope

The OAuth callback already queries Admin GraphQL shop.email and stores users.shopify_owner_email separately from the synthetic login identity. The inspected shop/redact handler did not clear that field, onboarding email timestamps, or Shopify integration configuration. Shopify commerce ingestion also retains customer/order copies in contacts, conversations/messages, activity events and workflow snapshots. Raw provider/database error logging could echo addresses.

This change is independent of the trial-first onboarding PR. It targets main without changing eligibility policy, trial dates, Managed Pricing, or paid plans. Optional support contact appears on first-install Pricing and first app use, with editing in the connected Shopify panel.

The production PostgreSQL database, Railway runtime/retained logs and the October 9 deployment were inaccessible. Whether the named merchant has an appropriately retained owner email is UNKNOWN, not absent. No production data, deleted records, backups or revoked Shopify authorization were accessed.

## Capture and support-contact storage

- Existing shop.email capture and synthetic users.email identity remain separate.
- Success, missing, invalid and fetch-failed results are classified without retaining raw responses/errors.
- The capture transaction locks/rechecks the current installation and token before persisting. It preserves an existing valid owner email on failure, and does not recreate data after uninstall/redact.
- shopify_merchant_contacts stores outcome/source/timestamp and an optional support contact. Aggregate logs contain only bounded outcome, source and UTC timestamp; no shop/user identifier or contact address.
- The optional confirmation accepts a merchant-selected business contact, is skippable, and can be removed in Shopify settings. The confirmed address is for setup/support only; no marketing flag is set and no marketing email is sent by confirmation. This confirms the merchant's choice, not independent ownership verification.
- Contact reads are session-scoped, no-store and unavailable after uninstall/deletion requests. Writes require same-origin JSON; arbitrary user/shop/marketing fields are discarded.
- The support field is not copied to users.email or into Shopify onboarding email recipients. Existing onboarding email behavior is preserved.

## Erasure map

A signed shop/redact runs one transaction. Failure returns a retryable error rather than false completion.

- users: owner email, Shopify link/token/charge/status, installation timestamp, AI flag and Shopify email milestones.
- Shopify-created synthetic identities: replace the shop-derived identity/name with an unlinked neutral identity whose local part cannot map to a Shopify domain. SQL backfill/reconciliation cannot reconstruct a shop from it. Independently linked account identity and billing/trial fields are preserved.
- shopify_merchant_contacts: captured-contact metadata and confirmed support address are deleted.
- integrations: Shopify configurations, tokens and metadata for the store are deleted, including legacy partial-redaction mappings. Other integrations remain.
- shopify_shop_trials: retained on uninstall, erased only by the existing signed shop/redact policy. This change does not reset eligibility.
- Shopify-origin contacts without another channel are deleted through existing orphan cleanup/FK cascades. Mixed contacts retain independent channels while Shopify metadata and attributable imported contact fields are scrubbed.
- Shopify conversations/messages, activity events, workflow execution snapshots, delayed flow jobs, webhook delivery payloads and legacy chat mirrors are erased where identifiable.
- A shared advisory fence serializes Shopify ingestion/workflow snapshots with uninstall/redact; late ingests and contact writes cannot repopulate an erased mapping.
- Late requests for an old store do not clear a different current installation.

Legacy mixed records do not have complete field-level provenance. Unknown Shopify-derived copies, hand-copied notes, workflow-generated output and independent third-party exports may need a scoped privacy review; the code does not claim every cross-channel copy can be inferred automatically.

## Governed logs and external processors: required release work

Database deletion is not deletion of Railway stdout, log drains/archives, mail provider records, backups, HubSpot exports, or processor copies. New Shopify mail logging omits recipient/domain/subject/provider detail, and capture/cleanup errors omit arbitrary exception content. Existing HTTP logging already omits bodies.

shop/redact creates a durable shopify_privacy_erasure_tasks entry with only a time window and pending_external status, never contact addresses, shop domains, tokens, user IDs or shop hashes. The response explicitly states externalErasurePending. A null start means all retained history. Redelivery may create another safe task for the same window.

The governed processor operator must wire processShopifyExternalErasureTasks to a verified erasure adapter or complete the documented operational purge. Its acknowledgment is valid only after every applicable stream/processor/archive has been erased or verified past its approved retention. Failure/unverified results keep the task pending. Completed tasks are deleted. No provider adapter is assumed or enabled by this PR.

Before release:
1. Assign the privacy/logging operator and inventory Railway logs, drains, archives, Resend retention and external sync destinations.
2. Purge the affected streams/processor records for the pending time window without copying addresses into tickets, logs or audit notes. If selective identifiers are unavailable, purge the applicable stream window; do not recover deleted contact data to construct selectors.
3. Verify processor/backups retention and restoration controls, including reapplying completed erasures after restore. No fixed production retention setting was verifiable in this session.
4. Monitor pending count and oldest requested_at; complete requests within Shopify's required deadline (currently 30 days, subject to applicable lawful retention exceptions). Do not call requests fully erased while external tasks remain pending.
5. Test signed webhook verification, session isolation, first-install skip/save, settings remove, and live Shopify OAuth in staging. Apply additive migration 0104 before release; startup also provides the idempotent table patch.

Historical production logs have NOT been erased by this code-only task. External completion and whole-system privacy compliance remain operational release requirements.

Reference: https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance

## Tests

The PR workflow exercises successful/missing/invalid/failed capture, private reporting, support-contact validation and real HTTP session/CSRF behavior, optional UI copy in English/Spanish/Hebrew, and actual PostgreSQL persistence/uninstall/reinstall/redaction/races/rollback. Existing Shopify trial/billing/OAuth regressions, exact-base TypeScript comparison, and build also run. PostgreSQL fixtures accept only an explicitly named localhost disposable test database, never production credentials. Fixture addresses are generated in memory and never printed or used as assertion diagnostics.
