# Shopify store reassignment — preparation only

**Not approved for production execution.** No production mapping, billing or credential changes have been made. Staging is unchanged. The SQL deliberately refuses every branch except the named isolated rehearsal branch. This PR must remain draft until the open gates are resolved and the owner gives final approval of a production-specific cutover.

## Fixed operation

Store `whachatcrm.myshopify.com` moves from `271c48f9-3515-4682-b391-2fead371593d` (`whachatcrm@shopify.whachatcrm.com`) to `6868785e-e8af-4152-8e2d-8d031c2e97d0` (`marketing@whachatcrm.com`). Keep both account identities and emails.

The proposed operation changes only these existing records:

| Relation | Rows | Proposed change |
|---|---:|---|
| users | 2 | Move the store/token/current installation/Shopify charge and entitlement fields to marketing; detach the original account's live Shopify fields and return its Shopify-derived plan to Free |
| integrations | 1 | Reparent active integration `ec9d963d-f0f8-4f40-af10-166e2392ebba`, keeping its ID and config |
| contacts | 3 | Change tenant only; no identity merge or customer-field overwrite |
| conversations | 2 | Change tenant only |
| messages | 3 | Change tenant only; keep order message/external IDs |
| activity_events | 11 | Change tenant only; preserve orders #1002–#1004 and original actor provenance |
| catalog_sources | 1 | Change tenant only; retain source/integration ID, scopes and sync state |
| catalog_products | 17 | Change tenant only |
| catalog_variants | 26 | Change tenant only |
| catalog_media | 18 | Change tenant only |
| catalog_collections | 3 | Change tenant only |
| catalog_events | 0 | Assert no unreviewed new records |
| shopify_merchant_contacts | 1 | Reparent the store-specific merchant contact record |

Catalog memberships (12 rows) keep their IDs and references and require no tenant field change. Keep the 11 inactive integration records, MLS demo inventory (40 listings), legacy chat, inactive chatbot, usage/test session, consumed trial ledger and account history on the original account. No tables/records are deleted by the forward operation.

Marketing's existing non-Shopify contacts, conversations, messages, channels, knowledge, AI settings, trial history, overrides and subscription metadata outside the listed fields remain intact. The exact changed user columns are `shopify_shop`, `shopify_access_token`, `shopify_charge_id`, `shopify_subscription_status`, `shopify_installed_at`, `shopify_ai_brain_enabled`, `shopify_owner_email`, `billing_plan`, `subscription_plan`, `subscription_status`. Source Shopify status becomes `transferred`; its global subscription status is retained. No new trial is issued. Source/target prior billing values are retained in the private rollback manifest; the historical trial ledger keeps its original owner. This entitlement proposal is **conditional on live Shopify confirmation**; a mismatch requires revising/retesting the proposal, not overriding the evidence.

## Backup and rehearsal

Snapshot `snap-wispy-tooth-anq21lhw`, created October 24, 2026 at 11:13:40 PM America/New_York (October 25 03:13:40 UTC), expires November 8 23:59:59 UTC. Restored without moving production computes/names to `br-empty-truth-anrppwpf`, project `fancy-truth-71283112`, database `neondb`. The branch expires October 28 23:59:59 UTC; it has no application or worker. A fresh snapshot will be required again at actual cutover.

`python3 scripts/shopify-reassignment/build-preparation.py` generates the exact reviewable branch-only forward and inverse SQL. Execute each complete file inside **one transaction** on the isolated branch; do not run statements separately. No credentials are printed or supplied by these scripts.

The initial rehearsal correctly rejected an immediate composite catalog foreign-key constraint. The final operation temporarily makes six catalog tenant constraints DEFERRABLE in the same transaction, moves the graph, forces `SET CONSTRAINTS ALL IMMEDIATE`, then restores all six to NOT DEFERRABLE before commit. No constraint is disabled or dropped. These DDL changes require table locks: actual cutover needs a coordinated maintenance window, bounded lock timeout, and no in-flight catalog lease. Lock contention aborts the transaction; do not relax the timeout to force it through.

Observed isolated-copy results:

- Final forward transaction succeeded with all row counts above and no ID/content changes beyond the declared fields.
- A database guard rejected the old account attempting to reacquire the shop (`SHOPIFY_STORE_ASSIGNED_ELSEWHERE`).
- A simulated contact edit caused rollback to stop with `ROLLBACK_DRIFT_contacts`; that entire test transaction rolled back, including the edit.
- A target contact identity collision and an unapproved branch were both rejected; the collision fixture transaction rolled back without leaving a record.
- Clean inverse transaction succeeded. All 13 touched relations' complete source/target row checksums matched their original values, including user credentials and billing fields. Source token was restored from the target inside the database; it was never exported or saved in the manifest.
- All six composite foreign keys returned to their original non-deferrable state. The new guard/schema and private manifest remain as inert preparation artifacts on the isolated branch; the assignment row is removed by rollback. The inverse is intentionally one-shot and must not be rerun blindly.

## Preventing OAuth/synthetic-email reclaim

The reviewed code adds an explicit store assignment lookup before current shop, synthetic-email or session resolution. An assigned target must exist and must not have a conflicting store. Missing/changed ownership fails closed; it never selects the old synthetic account. This also covers reinstall after uninstall clears the current token/shop association.

The operation creates `shopify_store_assignments` with one source/target binding and a database trigger denying any other account the assigned store. The lookup table and trigger are installed with the approved cutover, not via startup. The code must be deployed and verified before the assignment is committed. Without the new resolver, the trigger prevents reclaim but a reinstall can fail instead of reaching marketing. Rollback leaves no active assignment and restores original resolution.

## Rollback and credential handling

The private manifest schema is revoked from PUBLIC. It stores row keys, changed-column before-values and before/after checksums, **not Shopify tokens or customer message/contact bodies**. The app's database owner can still access it, so it must never be exposed by an API. Owner/support email and charge references in the manifest are still sensitive metadata; retain under the approved operational retention/privacy process. No manifest is attached to the PR or logged.

Immediate rollback uses the same shop advisory fence and both user row locks. It first compares complete source/target scoped row checksums for every touched relation to the recorded post-migration checksums. Any new/deleted/edited row aborts rollback for review, preventing overwriting later activity. It reverses the binding temporarily, moves the credential directly back from marketing, restores only the declared changed columns, and verifies original complete-row checksums before removing the assignment. The normal inverse performs no customer/account deletions. Do not use a whole-database restore over later customer activity.

Before production cutover, coordinate store ingestion, OAuth, billing callbacks and catalog workers so no in-flight work writes mixed tenant ownership. The advisory lock covers existing install/ingestion/privacy fences; catalog workers also require their source lock/lease check. New OAuth code plus database guard must be in place. Stop and reconcile rather than forcing rollback if post-cutover traffic changes any guarded row.

## Shopify billing reconciliation

The owner checked Shopify Admin for the **production app** and confirmed Pro, “Free trial”, five days remaining, $0/year after trial, installed October 14, permissions updated October 15. The owner also confirmed that production and staging are separately installed. The page does not expose the test-charge flag or exact current period end.

Production stores subscription reference `gid://shopify/AppSubscription/58073350426` and Active/Pro. This is compatible with a Shopify subscription that is active while its provider trial is still running; Active is not proof that the trial ended or a payment occurred. The local trial fields refer to the historical May 20–June 3 CRM trial and must not be overwritten with an invented Shopify period. Keep that history and consumed-trial ledger unchanged. The proposed forward operation is now additionally pinned to this exact existing subscription reference; it neither creates nor replaces a charge. A differing provider reference must stop the cutover.

The user-confirmed plan/price/install evidence is accepted as such. The actual provider ID match, test flag and period remain unverified because the connected Railway tools do not expose commands inside the existing container and no Railway CLI credentials are available here. The read-only verifier is prepared but not deployed/executed. A separately authorized diagnostic deployment or operator execution of this secret-free file inside the existing app container is needed; do not move the installation token to another process/service merely to obtain these fields.

## Preflight status and open gates

| Gate | Result |
|---|---|
| Target Shopify installations/catalog | None |
| Target Stripe/Shopify charge and AI subscription conflict | None found; target local plan Free/active |
| Contact collision by Shopify customer ID, normalized email or normalized phone | Zero; forward aborts on any collision |
| Source installation | Exactly one active integration; credential present on source user |
| Backup restore and inverse | Passed on isolated real database copy |
| OAuth fallback/database reclaim protection | Implemented in draft code; branch guard tested; not deployed |
| Live Shopify billing | Owner confirmed Pro/free trial/five days/$0 per year; provider ID match, test flag and exact period remain **pending** |
| Privacy tasks | **Pending scope review**: two store-erasure tasks are blocked with `missing_configuration`, requested October 17 New York time; no plaintext shop selector in task rows. Their applicability must be established through authorized privacy tooling before cutover. Do not mark them complete or bypass them |
| Final production migration approval | **Not requested yet**; required only after all gates pass and production-specific SQL is reviewed |

The read-only provider verifier `scripts/shopify-reassignment/verify-live-billing.mjs` is prepared for an authorized operator to run **inside the existing production service**, using its existing DATABASE_URL. It refuses another service/environment, opens a READ ONLY database transaction, issues only a GraphQL query, binds response to this shop and production app, matches the recorded subscription ID, and checks the test flag and recurring price details. It prints sanitized subscription evidence and never logs the credential. It has not been run; the tools available here expose no existing-container command execution. Do not create a new credential-bearing service or export the token to run it. Shopify Admin can provide the same missing evidence through normal owner access.

Final approval packet must include fresh provider evidence, resolved privacy scope, exact approved entitlement effects, maintenance/worker plan, fresh backup ID, exact production SQL hash, unchanged-head CI and the tested inverse. Until then, production execution remains blocked. Current SQL's explicit branch check cannot be used on production; do not remove it as a shortcut.

## UI/AI acceptance and staging

25 local UI/AI/guard tests passed, including localized private dashboard/preview/setup/tasks, RTL and AI Shopping preference/session handling. A five-test assigned-owner/live-billing-verifier suite also passed (three tests overlap the 25-test run), including wrong app/shop, missing price/test evidence, unknown charge, provider failures and no-binding behavior. Tests use fixtures and create no Shopify checkout/order or customer messages. Eight additional checkout handoff/transport/filesystem-claim fixture tests passed with no Shopify calls or checkout creation. Broader PR CI is recorded separately.

Staging's app `2e424c769c25776a9086c36490ed14fc`, database, credentials, webhooks and callbacks are outside this operation. Production app is `e4585d4da1434c9e5649a2269e716076`. No staging change, uninstall, consent activation, customer send or recovery worker is included. Live authenticated browser acceptance still needs normal owner access and network permission for the production domains.
