# E-Commerce production foundation — controlled pilot

## Scope and source

This is a selective integration onto `main` at `03850fccae059a92665561b30b2759b5aad61036`, preserving the newer pricing, catalog, contact suppression, billing and salesperson Calendly changes. Source modules were reviewed at `f77e5553932ac49d064f8de3993160b59b91779e` on `codex/shopify-trial-first-onboarding`. The dashboard and private preview include the localized corrections from draft #149 and #164. The divergent staging branch is not merged wholesale.

Already on main: Shopify OAuth/install and managed trials, customer/order synchronization, the unified Inbox commerce pipeline, catalog synchronization, AI Brain shopping/checkout, webhook diagnostics and the original privacy/uninstall fences. This PR retains those implementations.

Added here:

- Authenticated, database-verified workspace pilot gate and capability endpoint; no admin or email-only bypass.
- Private, unindexed English/Spanish/Hebrew RTL dashboard and preview, plus pilot-only navigation.
- Shopify setup deep link, opt-in/pause for internal order-support tasks, Follow-ups integration, exact order deep links, assignment, due dates and in-app reminders.
- Payload-free durable event inbox after existing verified order persistence, duplicate-delivery protection, review metadata and inactive workflow drafts.
- Additive checkout observation/eligibility/preparation modules and schema. Their readers, sync endpoints and workers are deliberately not activated in production.
- Optional-schema privacy erasure and uninstall cleanup, preserving existing catalog erasure and locks.

No sender, recovery outbox, consent endpoint, post-purchase campaign, Meta configuration change or Shopify scope/API-version change is included. In-app reminders do not send notifications. Existing billing entitlements remain authoritative.

## Production identity and backup evidence

Railway project `2adeea49-431c-4ddf-8815-9ce89af66f32`, production environment `fa2e8c30-72ea-4688-877f-4a68e24198bc`, app service `a7b75139-5bf8-4a02-b4ab-b7d12e17e770` serves `app.whachatcrm.com` and `www.whachatcrm.com`. The pre-release successful deployment is `e2bb6ea9-023e-4f88-b371-55ce8c3a9d9f`, commit `03850fccae059a92665561b30b2759b5aad61036`, with rollback available. Railway follows main and does not wait for check suites: merge only after CI passes.

Existing Railway DNS telemetry on that deployment independently identifies `ep-polished-boat-an973ovy-pooler.c-6.us-east-1.aws.neon.tech`. Neon maps that endpoint to project `fancy-truth-71283112`, production branch `br-lucky-salad-anatrtle`; its sole application database is `neondb`. No production database credential was retrieved or supplied to a new service.

The database has exactly one owner matching `marketing@whachatcrm.com`: workspace/account `6868785e-e8af-4152-8e2d-8d031c2e97d0`. No active membership maps that account to another workspace. At preflight it has no Shopify shop, token or active integration. Connecting the pilot owner's store is required to exercise live orders and AI shopping; never attach another merchant's installation or fabricate a token/session.

Backup created: `snap-aged-sea-anluwx2t`, `pre-ecommerce-production-foundation-20261024`, source `br-lucky-salad-anatrtle`, 2026-10-24 16:10:19 UTC, expires 2026-11-07 23:59:59 UTC. It was restored to isolated branch `br-winter-river-anruasjm`, expiring 2026-10-27 16:15 UTC. Production computes/names were not moved. Queries verified 80 users, 38 integrations, 1,529 contacts and the pilot owner. Applying all five migrations twice on the restored branch preserved those counts and the exact users/subscription fingerprint. The verification branch has no app or worker attached.

## Migration and release procedure

Apply only these reviewed files to the independently mapped production database, in one transaction with `lock_timeout='3s'` and `statement_timeout='30s'`:

1. `20261019_ecommerce_growth_event_inbox.sql`
2. `20261019_ecommerce_growth_order_support_tasks.sql`
3. `20261020_ecommerce_task_schedule_staging.sql`
4. `20261020_ecommerce_abandoned_checkout_observations.sql`
5. `20261020_ecommerce_checkout_recovery_intents.sql`

The historical staging filenames/comments document provenance. These create six new tables and indexes; they do not update existing user, subscription, contact or order rows. No migration runner/startup patch was changed. Never run schema push or copy staging data. Capture existing counts/subscription fingerprint and compare them in the same migration transaction. `scripts/verify-ecommerce-production-foundation.sql` provides a read-only identity/schema check.

Before merging: exact current base reviewed, fresh backup verified, native PostgreSQL migration/replay/rollback checks passed, required PR workflows green, and the exact reviewed PR head unchanged. Merge to main then verify Railway commit SHA, health, startup logs and route behavior. Abort activation if any gate fails.

After the deployed schema and code pass checks, set only these rollout variables on the existing production app service:

```text
ECOMMERCE_PILOT_ENABLED=true
ECOMMERCE_PILOT_WORKSPACE_ID=6868785e-e8af-4152-8e2d-8d031c2e97d0
ECOMMERCE_PILOT_OWNER_EMAIL=marketing@whachatcrm.com
ECOMMERCE_EVENT_RECORDING_ENABLED=true
ECOMMERCE_ORDER_SUPPORT_TASKS_ENABLED=true
```

The gate also requires Railway's `RAILWAY_ENVIRONMENT_NAME=production` and existing `APP_URL=https://app.whachatcrm.com`. Do not overwrite APP_URL, credentials, callbacks or unrelated feature flags. Fresh owner verification is performed on every pilot request and recording attempt. Task creation additionally requires the merchant's own opt-in and existing order sync; no historical task backfill occurs. All other merchants' new pilot endpoints are unavailable and the existing Shopify routes remain outside this gate.

## Verification and rollback

CI covers real HTTP authorization/CSRF denial, other-merchant navigation, localized rendered UI, native PostgreSQL tenant and duplicate isolation, opt-in/completion/scheduling/deep links, privacy/OAuth/billing/CRM/catalog regressions and the production build. The repository already has TypeScript errors: compare against the exact base and reject any added diagnostics; do not call the global typecheck clean.

Post-deploy: verify signed-out pilot pages/APIs deny access with no-store/noindex; existing homepage, login, help, integrations and health still work. Verify the owner sees dashboard/setup and a nonpilot account sees no new navigation or data. A real authenticated owner session/store is needed for that live smoke; tests do not establish that it happened. Validate one signed order delivery and replay only after the owner's store is connected, using an approved test fixture and no customer send.

Immediate feature rollback: set `ECOMMERCE_PILOT_ENABLED=false`, `ECOMMERCE_EVENT_RECORDING_ENABLED=false`, and `ECOMMERCE_ORDER_SUPPORT_TASKS_ENABLED=false` on the existing app, then verify denial. Preserve the additive tables and privacy cleanup. If necessary deploy the recorded previous Railway image/commit. Do not drop tables, restore the whole production database, revert privacy deletions or overwrite later customer activity as a routine code rollback. A disaster restore requires a separately reviewed cutover and privacy reconciliation.

## Remaining milestones

1. Connect and verify the pilot owner's Shopify store; run authenticated dashboard/task/order/catalog/AI checkout smoke and check other-workspace isolation.
2. Expose bounded checkout observation to this pilot only after scopes, version, privacy and purchase-suppression checks. No recovery send.
3. Implement verified identity, consent/STOP and an approved Meta marketing template. One recovery message requires separate explicit recipient authorization.
4. Add owned fulfillment/order-status assistance and approved post-purchase workflows without enabling campaigns implicitly.
5. Reuse Shopify checkout/payment/draft-order/invoice APIs where supported; add idempotent payment reconciliation and live price/availability rechecks.
6. Finish the corresponding merchant help articles and approve public launch separately.
