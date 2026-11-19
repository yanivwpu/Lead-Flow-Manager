# Preparation release before Unified Inbox PR #330

This PR targets main #332 independently of #330. It does not enable #330 coordination or deploy anything. Deploy the preparation changes first, verify that the running preparation version exposes its drain status, then perform #330's stop-before-start cutover. Keep the preparation changes in the updated #330 branch and rollback image.

## Corrections

- WhatsApp/Instagram/Messenger, Telegram and Twilio handlers reject failed/incomplete persistence instead of acknowledging it. Messenger propagates swallowed failures. Existing unsupported/irrelevant/authentication handling remains provider-specific. Twilio legacy writes are serialized under the same inbound receipt; repeated legacy chat entries and inbound usage rows are avoided. Replayed Meta events do not re-run post-ACK legacy automation.
- Gmail Pub/Sub waits for the existing durable pending-sync handoff before ACK. Existing history cursors, mailbox leases, watch renewal and polling remain the recovery mechanism.
- Web Chat writes text, media and its original page context to a visitor/widget-scoped IndexedDB outbox before dispatch. Stable IDs survive reload, network loss, multiple tabs and repeated acknowledgments. Retryable failures back off (including Retry-After); permanent 4xx failures remain available for manual retry. Successful sends remove only the matching visitor's entry. No customer content is altered. Storage denial/quota failure prevents dispatch and retains the visible composer; no claim of durability is made when the browser denies storage. Delivery requires an open/reopened browser; clearing site data removes browser-local drafts. Existing widget tabs must load the preparation version before the planned outage.
- A per-process drain fence rejects new requests with 503/Retry-After, prevents scheduled claims, stops local BullMQ acquisition and awaits admitted work. HTTP promises remain tracked even after response ACK. AI/model work, delayed automatic reply timers, provider calls, database loops, cron, optional commerce and other embedded workers participate. Admitted in-memory automatic replies finish their existing delay and send before readiness; the drain does not cancel or replay them. No queue purge, global Redis pause, cancellation of future jobs or automatic replay of uncertain sends occurs. SIGUSR2 quiesces without exiting; SIGTERM/SIGINT use the same coordinator and exit only after success. A failed stop hook or unsettled work never produces DRAIN_READY.

## Additive migration and historical duplicate

Read-only investigation found two Facebook inbound rows for the same provider ID, same workspace/contact/conversation, created June 14, 2026, approximately 24 minutes apart. Neither row, its content, relationships or IDs is edited or removed.

`0113_inbound_receipt_keys.sql` creates a receipt table keyed by workspace/channel/provider ID and a nonunique message lookup index. A receipt claim uses a short PostgreSQL transaction, expiring token and heartbeat; persistence and receipt linkage commit atomically under a row lock. A recovered token fences the former owner. Contenders retry before persistence; retries after persistence return the existing message without repeating downstream sends. No database connection is held for the duration of model/provider work. Different workspaces/channels remain independent.

A historical retry selects the oldest existing matching message deterministically and links the receipt to it. Historical duplicates remain intact. The unapplied old `0028` unique-index migration is changed to a nonunique lookup index so bootstrap does not fail on legacy duplicates. An already-installed old unique index is left intact. No destructive cleanup is included. Applying 0113 repeatedly is tested against actual PostgreSQL with legacy duplicates present. Startup awaits schema readiness before starting the embedded Inbox worker; errors fail closed.

Telegram message IDs are scoped to their chat before receipt claiming. Historical unprefixed IDs are matched only to that same owner's Telegram contact. This avoids treating another customer's same numeric message ID as a duplicate.

## Provider requirements — operator verification, no automatic configuration changes

- WhatsApp Cloud: keep webhook subscriptions active; Meta retries unsuccessful delivery up to seven days. Do not assume that policy applies to Twilio WhatsApp or Messenger/Instagram. Check Messenger/Instagram delivery errors and subscription health and keep the outage short.
- Twilio SMS/WhatsApp: verify actual phone-number retry/fallback settings cover connection failure, timeouts and Railway 5xx for the entire maintenance window. A 503 fix cannot supply missing provider retries. If coverage is absent, configure a reviewed retry/fallback policy or establish a provider-history reconciliation procedure before stopping intake. Do not point fallback at an endpoint that ACKs without storage.
- Telegram: retain pending updates; never use drop_pending_updates. Failed deliveries retry, but pending updates are retained no longer than 24 hours.
- Gmail: verify Pub/Sub subscription retry/retention and healthy OAuth/watch state. Three mailboxes already required reconnect at the audit; do not represent those as healthy. Existing polling catches up healthy mailboxes; expired-history fallback is bounded and requires reconciliation if the interruption is long.
- Shopify: keep endpoint subscriptions unchanged and check failed deliveries after restoration. Failed HTTPS deliveries retry eight times over four hours. Existing catalog/event/privacy storage is reused; no second webhook system is introduced.

Official references: [WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview/), [Telegram](https://core.telegram.org/bots/api), [Twilio](https://www.twilio.com/docs/usage/webhooks/webhook-settings), [Shopify](https://shopify.dev/docs/apps/build/webhooks/troubleshoot), [Pub/Sub](https://docs.cloud.google.com/pubsub/docs/subscription-message-retention).

## Read-only Redis inventory ZIP

The CI run for this PR publishes **WhachatCRM-Queue-Inventory-Windows** as a normal downloadable ZIP artifact. Open the successful `Inbox release preparation` run, click the artifact, Extract All, then double-click `Run-Probe.cmd`. No CLI installation or administrative Windows change is needed. The script uses existing authorized Railway SSH only and cannot register a key.

The reviewed probe pins project/environment/service, verifies an attested Railway deployment/commit and reports its SHA, obtains two atomic count snapshots (10 seconds apart), and issues only EXISTS, LLEN, ZCARD and HGET inside MULTI/EXEC. It does not construct BullMQ Queue/Worker, execute Lua, pause/resume, retry or purge. It reads only counts/metadata, never job bodies or customer messages. Credentials stay in Railway. READ_COMPLETE is inventory success, not drain approval. The same package can inspect #332, the preparation version and #330 without changing a production setting or becoming unusable because of an obsolete commit pin. The operator must match the reported deployment/SHA to the intended running version. Missing runtime identity fails before connecting.

Portable Railway CLI v5.75.0 pins were rechecked against the official release asset digests:

- x64: `1f468573a544587a2c22e6262abc393dafaaf8627ae9f45a5ef2e7d96423c8b6`
- ARM64: `e733d050060ac069f1e37b6ae55bf1565878ee82241c5934820d90ffe47544e6`
- x86: `5458648ebd0cfe47f2da81eb3461d46e150d3f5ffbfa9179bb6d03869ace970e`

[Official release](https://github.com/railwayapp/cli/releases/tag/v5.75.0). The local packaging script only creates a ZIP; it never executes the probe or contacts production. Actual production Redis counts still require the runtime probe result.

## Short controlled sequence (operator only)

1. Review/merge this preparation PR only after CI. Install it before #330; verify its SHA and running drain status. The current #332 process cannot gain new shutdown handlers without replacement: the initial preparation rollout still requires a separately approved quiet maintenance window, provider retry coverage and reconciliation of interrupted work. Do not claim the new drain retroactively protects #332's own replacement. Prebuild/review the release before the window; do not activate a second #330 dispatcher during preparation.
2. Hold Railway GitHub automatic deployments before merging #330. Update #330 to current main including preparation; resolve/test its startup and send-method integration, and require final checks on that commit. Save the successfully deployed preparation image as the rollback baseline.
3. In each OLD application's actual Railway runtime, explicitly run:

   `node scripts/request-runtime-drain.cjs`

   This is a separate, intentional process-control action, **not the read-only probe**. It verifies exact production identity/current deployment/PID, sends SIGUSR2 to the existing main Node process, and waits up to ten minutes for DRAIN_READY. It never removes a deployment. A timeout leaves it quiesced and reports NOT_READY; do not proceed or force-kill. Inspect/reconcile the blocked work. To abandon the window, remove the drained instance before starting its replacement; do not resume old/new sends concurrently.

4. Preserve waiting/delayed/failed Redis jobs, future no-reply jobs and pending commerce events. Require zero admitted operations and DRAIN_READY for every old replica. Railway > luminous-transformation > production > Lead-Flow-Manager > Deployments > old deployment menu > Remove deployment. Do not delete the service. Wait for **every** old deployment/replica fully REMOVED before activating #330, whose workers can start before HTTP health.
5. Start exactly one reviewed #330 image. Its startup applies the additive coordination schema under the existing schema advisory transaction lock. Confirm SHA, receipt/coordination schema, direct connection, realtime listener and workers. Confirm provider intake recovery and Gmail history catch-up, retained browser sends, pending commerce events and no-reply jobs before normal use resumes.

Rollback: drain and remove the new instance completely before starting the saved **preparation** image. Keep receipt and #330 tables/indexes/sequences; older compatible code ignores #330-only schema. Do not restore the database, drop additive schema, purge queues, delete history or blanket retry unknown/dispatching sends. Reconcile ambiguous provider outcomes by original provider IDs first. Never roll back to #329/#331/#332 if doing so removes required preparation safeguards.

These instructions do not authorize an automatic merge, deployment, signal, configuration change or service stop.
