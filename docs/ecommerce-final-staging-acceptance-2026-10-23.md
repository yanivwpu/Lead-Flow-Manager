# E-Commerce staging acceptance — October 23, 2026

Production is not ready. No outbound recovery automation was enabled, no orders
or customer/merchant records were created or changed, and no production service,
callback, database or credential was modified by this task. PR #149 remains
draft/unmerged.

## Fresh read-only evidence

The existing Node staging probe ran `BEGIN READ ONLY` with a bounded statement
timeout and `ROLLBACK`, on the guarded private Railway staging database.
Deployment `b35e335b-2d12-4d81-91c4-32ae55d91003` emitted:

- One active `whachatcrm.myshopify.com` merchant, one active Shopify integration,
  one connected/subscribed Meta sender owner, one test contact in one workspace.
- Zero exact Shopify-customer/WhatsApp-contact matches. The authorized internal
  test recipient is not independently mapped to a Shopify customer. Zero active
  signed recovery consents and zero pending outbox rows. Duplicate-customer
  count is not meaningful until an exact qualified identity exists.
- The saved Meta token expiry is past. No live Meta template status was queried;
  OAuth connector access exposes variable names, not a usable authenticated
  app session/decrypted provider credential. Expiry metadata alone is not a
  provider-side token validation response.
- All four recovery tables, the customer privacy locks, erasure tasks and
  encrypted request-payload tables exist; both ordered inbound-evidence columns
  exist. No schema migration or privacy-lock mutation was performed.
- Zero local `shopify_checkout_reminder` records. Live approval, exact English
  language code, WABA association, category and provider/local shape match remain
  unverified. No template was submitted or resubmitted.

The older confirmed abandoned-checkout API probe and recovery backup/migration
evidence were accepted without creating another checkout or replaying migrations.

## Reported real-estate bubble: inbound, older than the recalled date

The owner supplied the exact phrase and recalled October 22 at 8:03 PM Eastern.
Read-only trace deployment `264a04ac-3c13-4883-bb06-bb260a89d112` found one exact
matching current message record, in the intended merchant/test-contact thread:

- Internal message ID `5e455973-b231-4e60-b4f9-b050b11f5085`.
- Created **2026-10-22 00:03:18.779426 UTC**, which is **October 21, 2026,
  8:03:18 PM America/New_York**. It predates the recalled date by one day.
- Direction `inbound`, channel `whatsapp`, generated_by NULL, provider message ID
  present. Status `delivered`; sent_at, delivered_at and read_at are NULL. This
  status is inbound ingestion metadata, not proof of an outbound phone delivery.
- A matching legacy chat copy marks the sender as `them`.
- Staging logs at the same UTC event show the Meta inbound message and signature
  verification PASSED. This is existing live evidence, not a replayed fixture.
- For this merchant: zero workflows, workflow executions, no-reply jobs,
  automation timers, AI message logs and outbound messages. There is no RGE
  installation, entitlement, AI settings or business-knowledge row. The global
  template seed exists separately.

The phrase matches `followup_24h` in `server/seedRealtorTemplate.ts`, with the
executor's default city substitution. That establishes a content match, not an
RGE execution. The verified event arrived inbound; how the text originated
before that Meta event is not established. No unrelated automation settings were
changed and no outgoing delivery is claimed.

## Independent runtime activation defect

An isolated executable regression reproduced an entitled RGE workflow changing a
conversation with no workspace installation. This is separate from the inbound
bubble. The focused repair requires the same workspace's completed RGE install
at workflow execution, legacy RGE template lookup and W2 delayed-timer execution.
Plan/admin eligibility alone cannot activate it. Ordinary entitled workflows
continue to execute; incomplete/foreign installations and stale timers fail
closed. No workflow/install records are rewritten or deleted.

## Consent, UI and remaining live gates

PR #163 added the scoped internal disclosure and was deployed successfully as
`d71599bb-e7a4-43eb-b6b2-3d4c1a4bc6ee` from staging merge
`6e8ccf21af46765b0e8af531b740beb7117c5041`. Both CI workflows passed. The owner
must still confirm viewing it. This is not a Shopify checkout extension.

Consent capture and its HMAC key remain absent while exact identity mapping is
unverified. No secret was generated or rotated. Genuine YES/STOP, duplicate
replay and suppression evidence remain pending. Consent tests/CI are not live
consent acceptance. Refresh the Meta token securely through the existing UI,
use an independently verified existing Shopify test customer identity, verify
the local/live template, then coordinate the owner's explicit inbound opt-in.
Outbound recovery still requires separate approval for one isolated test.

PR #164 fixes the notices, invalid nested anchors, unavailable connection state
and paused-sync labels in draft #149. Its two CI workflows passed. Six targeted
tests, build and exact-base TypeScript comparison passed (97 existing / 97
candidate / zero added). Twelve local fixture browser cases (preview/dashboard,
390px/1366px, en/es/he) had no overflow or nested anchors; Hebrew RTL and mobile
screenshots were inspected. This is not a deployed authenticated merchant smoke
test. Do not merge #149 or advertise customer recovery as live.

Deployed AI Shopping acceptance remains blocked: staging logs contain provider
authentication failures (401) and throttled suggestion requests (429). A valid
staging AI credential and a genuine merchant test are required before claiming
variant/price/handoff acceptance. No checkout was created.

Production review confirmed separate app identities/origins and read_customers,
read_orders scopes, existing trial-ledger/uninstall/privacy code and rollback
documentation. Current production variable names include privacy request,
evidence and alert configuration, unlike old documentation. Names alone do not
verify key validity, alert delivery, operator monitoring, installed provider
grants, production migration state or restore readiness. Those operational and
live acceptance gates remain open. Production was inspected read-only only.

Temporary diagnostic start-command configuration was restored on both existing
helpers. The successful SQL output, not Railway's SUCCESS/Online label alone,
is the audit evidence: one-shot replicas can be stopped/crashed despite that
label. The application itself was verified with one running, zero crashed
replicas. No new diagnostic service or messaging system was created.
