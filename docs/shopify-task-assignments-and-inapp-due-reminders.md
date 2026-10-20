# Shopify internal tasks — assignment and in-app due reminders (staging only)

## Goal
Manage the single existing Shopify internal task from WhachatCRM Tasks without copying it into contact.followUp or triggering a separate automation.

### Feature scope
- Account owner may assign an OPEN order-support task to themselves or an **active** member of their own team. Server-side SQL re-checks membership atomically; pending, inactive and foreign user IDs are rejected. A member is not auto-enrolled or notified.
- Account owner may set/clear an absolute due date (UTC in SQL; browser shows local time), within 30 days in the past through 366 days ahead.
- Optional **on-screen reminders** can become due 1 day, 1 hour, 15 minutes, or at due time. The Tasks UI shows due/overdue indicators on refresh; reminders are not emails, push, SMS, WhatsApp, cron jobs or customer messages.
- Mutations are same-origin, JSON-only, owner-authenticated, active-Shopify-installation-scoped, staging-only and open-task-only.
- Scheduled metadata lives in a new optional FK-linked table; no existing task/event/contact is backfilled or overwritten.
- All list queries are bounded to tenant and canonical Shopify shop and additionally join the contact owner. No order payload exposed.

### Limits before merchant production release
- **Task assignment is an owner-visible organizational field**, not yet a team member's personal task inbox. A member's view/permissions and true reminders require a separate tested feature.
- Existing task completion stays the single canonical update. Completed tasks never trigger reminders.
- No schema changes or frontend actions are enabled in production.
- In staging, UI displays a safe "schema activation pending" notice until the optional table exists; current Follow-Ups continues working without it.

### Migration prerequisites
Before applying `migrations/20261020_ecommerce_task_schedule_staging.sql`:
1. Verify exact Railway staging app + attached `Postgres-JSIn` database identity and current commit.
2. Create a NEW independent `pg_dump --format=custom` backup on the separate dedicated backup volume, verify checksum and restore into a disposable separate database. Previous backup predates Shopify order #1004 and is not an acceptable migration-point backup.
3. Review/additive-only SQL; run isolated PostgreSQL 16 tests. Do NOT include DDL on normal app startup.
4. Apply migration as a one-time transaction to the verified staging database only; verify new table exists and task count, event count and original #1004 task state remain unchanged.
5. Restore backup service to read-only status. Verify no new task schedule rows and owner task editor appears.
6. Test on isolated SQL fixture first. Do not invent another Shopify order or modify #1004 merely to test assignment.

### Later
Separate reviewed member-permissions screen, internal notification scheduler with opt-in and send-once markers, and a fully merchant-ready onboarding journey. No channel sends until consent and templates are verified.
