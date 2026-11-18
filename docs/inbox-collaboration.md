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

## Verification

CI runs signed-session HTTP/WebSocket and SQL authorization regressions, the
existing Inbox/channel/automation tests, and separate-process PostgreSQL concurrency
and presence tests against PostgreSQL 16. The database test requires an explicit
`TEST_DATABASE_URL`, creates a unique isolated schema and removes only that schema.
Providers remain synthetic; no test sends production customer messages.

Production verification still requires two real logins across two application
instances, reconnects, and provider-controlled test recipients for WhatsApp, SMS,
Instagram, Messenger, Telegram, Web Chat and Gmail. Check provider delivery receipts,
WhatsApp reply windows/templates, multipart media and delayed webhooks. Verify the
production database connection supports session locks/LISTEN. No deployment or
production schema change is performed by this PR's development checks.

Local validation: **169 tests passed** (34 signed-session security/contract tests,
122 existing regressions, and 13 PostgreSQL/connection tests). Headless Chromium
exercised the real React Inbox in English, Spanish and Hebrew RTL at 1366×768 and
390×844 with fixture HTTP/WebSocket boundaries: activity, stale-reply refusal,
retained drafts, explicit review/send, uncertain retries and retry-key retention
after reload. Screenshots were inspected. The production build and diff checks
passed. Dependency manifests/lockfile are unchanged; the production audit retains
27 high, 17 moderate and 21 low findings, with zero critical findings.
