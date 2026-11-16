# Meta session accounting: reconciliation and release review

## Audited behavior

The old `incrementConversationUsage` call sites charged thread creation in inbound processing, outbound/fallback sends, template sends, campaigns, CSV imports and legacy chat creation. They counted excluded channels and never counted another session on an existing thread. Incrementing before message persistence could charge failed inbound events. `getUserLimits` also performed a read-time reset with a separate write.

Existing `conversation_windows` is WhatsApp-only, requires a legacy `chats.id`, and has no active writers. It cannot represent Facebook/Instagram sessions without changing legacy chat relationships. Existing `conversations.windowExpiresAt` is a sliding Meta reply window. Both are retained untouched. The additive quota ledger reuses message persistence and provider webhook uniqueness, subscription entitlements, canonical period resolution and existing admin connection/readiness logic.

## Implemented semantics

- Free 50 / Pro 2,000 sessions per monthly period; plan and trial resolution stay in the subscription service.
- Only persisted inbound WhatsApp, Messenger and Instagram messages qualify. Failed message status and outbound sends never enter the ledger.
- Each accepted session lasts exactly 24 hours. Repeats never extend it. The same normalized WhatsApp customer shares one quota session across the workspace's business numbers; thread routing remains number-specific. Different channels and workspaces have separate sessions.
- Session creation and event receipts are in the message INSERT transaction. A per-workspace advisory transaction lock serializes competing first messages. A unique provider receipt survives message deletion. Rollbacks undo message and usage together.
- A session is attributed once to its opening monthly period. Crossing midnight, renewal or trial expiry does not split it. After expiry, a new inbound opens a session in the then-current period. Acceptance time is trusted database time, not provider-supplied time.
- Monthly periods use the existing active billing anchor, subdividing annual subscriptions monthly and clamping the original day at month-end. Otherwise use UTC calendar months. Endpoints are half-open. SQL and application calculations are tested for parity.
- No migration or reconciliation updates existing usage counters, messages or threads. Removed thread-charge calls cannot charge templates. Legacy counters remain historical; the new ledger is the new usage source only after explicit adoption.

## Reconciliation results

**Disposable PostgreSQL 16 fixture, not production:** 68 durable inbound receipts reconcile to 5 quota sessions after repeats, separate channels/workspaces and expiration. Concurrent first messages and concurrent post-expiry messages each produce one session. Outbound templates, website AI replies and all excluded channels add zero. Duplicate events, including replay after message deletion, add zero. Failed transactions and failed inbound status add zero. The seeded legacy counter remains 19 and the twelve fixture CRM threads remain intact.

Production session totals cannot be inferred from old thread counters. No live production database was reconciled or changed in this task; the available workspace database is a local development target. No historical counters are reset or retroactively corrected by this release.

Run `META_QUOTA_REPORT_DATABASE_URL=<explicit-target> npx tsx scripts/reconcile-meta-quota.ts` with an approved read-only database connection. The script opens a READ ONLY transaction with a 30-second timeout and reports aggregate legacy counters, channel/direction traffic, ledger receipts, missing receipts and overlapping sessions. It never repairs, backfills or changes usage. Keep its report restricted to operators. Before adoption require zero overlapping sessions and zero missing qualifying receipts, and investigate every ledger error. Differences from legacy counters are expected and are not grounds to overwrite them.

## Safe transition

1. Review this PR and its migration. Apply the additive SQL migration through the normal migration process before enabling accounting. Do not use `db:push`: schema definitions alone do not install the trigger/function. No migration has been applied outside the disposable test database.
2. Ship the reviewed code with `META_QUOTA_ENFORCEMENT` unset/false. Ledger collection is shadow accounting. Sales Admin explicitly labels partial shadow coverage and keeps historical threads, legacy period usage and qualifying sessions distinct. Existing legacy counters stop gaining incorrect thread/template charges. Read-time counter resets have been removed.
3. Observe at least 24 hours and a representative traffic cycle; reconcile receipt coverage, duplicate behavior, timing and database contention. Check webhook retry handling if ledger writes fail. Do not turn partial-period shadow totals into a merchant's quota usage.
4. After a complete reconciliation, an operator may set a workspace's `reviewed_at` and `enforce_from` to a future canonical period boundary. The database requires at least 24 hours of tracking before that boundary. Separately enable `META_QUOTA_ENFORCEMENT=true` through reviewed configuration. Both controls are necessary; neither is set by this PR. Existing sessions carry across the boundary without a second charge. Existing customers receive the complete new monthly allowance; no guessed backfill/debit is applied.
5. Compare Sales Admin and subscription totals after the boundary. To revert display/source selection, unset the flag; leave the additive ledger collecting and preserve all history. This does not reset counters or erase receipts.

Quota status remains advisory for reply permission: accepted inbound messages are retained even at the allowance, and quota counters do not block customer replies or template sends. Meta service-window, consent, provider, paid-feature and workflow safeguards still apply. This PR intentionally does not enable a hard stop at 50/2,000; a future reviewed admission policy must preserve customer replies and cannot infer chargeable sessions from outbound actions.

## Verification and remaining risks

Native PostgreSQL concurrency/rollback/duplicate/boundary suite passes. Existing Admin usage semantics, trial downgrade, webchat AI race/generation, Prospect AI usage and public-product-facts regressions pass. On a separate disposable database bootstrapped from the base schema and then migrated, the existing inbound-processing contract passes and all 8 protected multi-number WhatsApp integration checks pass. Build passes. Two existing pricing source-layout assertions fail on both base and candidate (`md:grid-cols-2` expectation). TypeScript: tested base `8183ab98` has 97 errors and candidate has 95, with no added file/error-code diagnostics. The two removed errors belonged to deleted legacy quota blocks. Existing unrelated compiler errors remain.

Production shadow collection, live receipt reconciliation, database latency/lock contention and final hosted CI remain release gates. Database trigger errors roll back inbound inserts and rely on provider retries; monitor them rather than swallowing accounting failures. Account-wide serialization prioritizes correctness and needs live throughput validation. Provider identity must be present; a malformed identity fails the insert rather than inventing a customer key. Ledger receipts intentionally survive message deletion; confirm normal privacy/retention processing covers these billing records before production adoption. No hard quota blocking is authorized by this PR.

**Recommendation:** review and deploy only in shadow mode after migration review. Do not switch production usage accounting until the full-coverage reconciliation passes. Do not merge or deploy automatically.
