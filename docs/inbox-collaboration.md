# Shared Inbox collaboration

This extends PRs #303, #305 and #327. Workspace membership, invitations, role checks,
assignment, reply attribution, channel connections, authenticated WebSockets,
automation guards and AI generation leases remain the existing implementations.

## Send coordination

The Inbox and manual template picker capture an outbound revision when composing
begins. Human send requests require `sendAttemptId` (UUID) and `replyRevision`.
Message reads expose `X-Inbox-Reply-Revision` and `X-Inbox-Ai-Epoch`; the authorized
contact `reply-state` endpoint supports explicit review. Missing context returns
428, stale drafts return 409 `reply_conflict`, and a busy scope returns 409 (or
202 for an identical request already in progress). These responses retain drafts.
Review refreshes the messages and revision; a later reply still causes a conflict.
Draft text stays in the existing in-memory composer store on refusal. Retry keys
survive page reload in actor/scoped session storage; full-page reload does not
persist the existing composer text or file attachments.

A PostgreSQL session advisory lock orders sends, AI lease acquisition and takeover.
A committed send-attempt ledger records the claim before network dispatch. A
partial unique index independently permits only one active claim per scope. Retries
with the same UUID and payload return the original result. Mutated retry payloads
are rejected. Non-email scopes are contact/channel; email scopes are conversation
threads, allowing independent threads to send concurrently. No permanent ownership
lock is introduced.

A timeout or crash after possible provider acceptance becomes `delivery_unknown`.
The same payload is blocked even under a new UUID. After reviewing the uncertainty,
a human may deliberately send a different reply; AI remains blocked by unresolved
uncertainty. There is no automatic replay of an uncertain provider send. Operators
must reconcile such deliveries with the provider before correcting an attempt's
status. This PR does not add a provider reconciliation console or claim exactly-once
external delivery. A request already accepted by a provider cannot be recalled.

Human replies pause conversation AI and invalidate its generation lease/epoch.
The existing Pause Automations setting remains separate. Durable final checks and
monotonic epoch writes prevent a stale worker from restoring an older AI state.
Remote takeover events abort local generation controllers on other instances.
Browser Auto replies retain the revision/AI epoch captured before generation,
including across a later takeover followed by Resume AI.

## Presence and events

The existing signed-session WebSocket accepts only authorized workspace rooms.
Each connection has a separate expiring presence row; snapshots aggregate tabs by
account. Typing expires in five seconds, viewers expire after 45 seconds without a
heartbeat, and old rows are removed. Socket close removes only that connection.
Overlapping frame and broadcast authentication refreshes share one promise per
socket to avoid concurrent Passport request mutation.

PostgreSQL LISTEN/NOTIFY fans existing Inbox events out to web and worker instances.
Only event kinds and resource IDs cross the bus; drafts and message bodies do not.
Reconnect triggers a resync. Notifications are transient, so bounded existing
fallback refresh remains (messages 30 seconds, Inbox 60 seconds while connected;
original faster fallback when the socket is down).

## Schema and operations

`migrations/20261118_inbox_collaboration.sql` adds only `inbox_send_attempts` and
`inbox_presence_sessions` plus indexes. Startup applies the same idempotent DDL
under a transaction advisory lock before HTTP/worker startup. No contacts,
conversations, assignments, channel credentials or AI settings are migrated.

All instances must use the same PostgreSQL database. Coordination uses
`DATABASE_URL_UNPOOLED` when configured. Otherwise Neon `ep-…-pooler.…neon.tech`
hosts are converted to the same endpoint's direct host while preserving the
credential, database and TLS options. Ordinary ORM queries retain pooling. Other
transaction poolers require an explicit session-capable unpooled URL. Reserve connections for four dispatch sessions and one event
listener per process, in addition to existing storage/session pools. Release old
application instances during rollout: an older sender does not participate in the
new dispatch fence. Existing browser tabs must reload for the new send protocol.

### Controlled release after preparation #333

Preparation #333 is already deployed at commit
`1fd891065757818282eacb151438236da7b29a1d`. The verified Railway rollback
deployment is `b9375c03-0514-4864-8ebf-07ab875dc9be` in
luminous-transformation / production / Lead-Flow-Manager. Keep automatic
deployments disabled while reviewing and merging #330. The completed production
Neon and Redis checks need not be repeated for this integration.

Before the approved cutover, read `/tmp/whachat-runtime-drain.json` inside the
running preparation container and verify its deployment/commit identity and
`state: running`. Reading the file is non-disruptive. Do not send a drain signal
as a health test during ordinary production operation.

After final-commit CI passes and the release window is approved:

1. Merge #330 with automatic deployment still held. Record the resulting main
   SHA; the later manual launch must use that exact release.
2. In every existing preparation runtime, run
   `node scripts/request-runtime-drain.cjs`. This intentionally fences new HTTP
   work with retryable 503, stops acquisition and waits for admitted work. Require
   `DRAIN_READY`, matching identity, `draining=true` and `active={}`. On failure or
   timeout, do not force removal or start #330. This real cutover verifies the
   drain without an additional rehearsal outage.
3. Remove the old deployment, not the service. Wait for all old replicas to be
   fully REMOVED. Preserve every waiting/delayed job, future no-reply job and
   pending commerce event. Do not globally pause/purge Redis or bulk-toggle AI
   or automation settings. Uncertain provider outcomes must be reconciled before
   any retry or new dispatch startup.
4. Use Railway's **Deploy latest commit** to start exactly one reviewed #330
   runtime. Do not use Redeploy on the preparation build for this forward release.
   Verify SHA, additive receipt/coordination schema, event listener, workers and
   provider intake recovery before acceptance. Workers can start before HTTP
   health, so replacing traffic alone does not prevent overlap. Public domains
   can remain on 8080: #333's application fence replaces the one-time #332 port
   workaround. If a temporary domain fence is used, restore its saved ports only
   after local startup verification.

Rollback: drain/remove the new runtime fully before redeploying the saved #333
build as one instance. If startup failed before drain readiness, verify its
termination explicitly. Keep additive receipt/coordination schema and all
customer data; do not restore the database, remove indexes/tables or blindly
replay `dispatching`/unknown deliveries. A quiesced preparation instance cannot
be resumed by a documented control; abandoning a successful drain requires
replacement without overlapping dispatchers.

## Verification

CI runs signed-session HTTP/WebSocket and SQL authorization regressions, the
existing Inbox/channel/automation tests, and separate-process PostgreSQL concurrency
and presence tests against PostgreSQL 16. The database test requires an explicit
`TEST_DATABASE_URL`, creates a unique isolated schema and removes only that schema.
Providers remain synthetic; no test sends production customer messages.

Production acceptance uses two real logins in the same existing workspace on the
single reviewed production deployment; cross-instance behavior remains covered
by the existing separate-process PostgreSQL tests. Verify reconnects and
provider-controlled test recipients for WhatsApp, SMS,
Instagram, Messenger, Telegram, Web Chat and Gmail. Check provider delivery receipts,
WhatsApp reply windows/templates, multipart media and delayed webhooks. Verify the
production database connection supports session locks/LISTEN if that evidence
is not already available; that production gate passed before this release. No deployment or
production schema change is performed by this PR's development checks.

Local validation: **169 tests passed** (34 signed-session security/contract tests,
122 existing regressions, and 13 PostgreSQL/connection tests). Headless Chromium
exercised the real React Inbox in English, Spanish and Hebrew RTL at 1366×768 and
390×844 with fixture HTTP/WebSocket boundaries: activity, stale-reply refusal,
retained drafts, explicit review/send, uncertain retries and retry-key retention
after reload. Screenshots were inspected. The production build and diff checks
passed. Dependency manifests/lockfile are unchanged; the production audit retains
27 high, 17 moderate and 21 low findings, with zero critical findings.
