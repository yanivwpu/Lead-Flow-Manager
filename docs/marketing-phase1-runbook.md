# Prospect AI Phase 1: release hold and staging acceptance

Related: #120, presentation draft #119. #121 discovery and #122 new outbound
channel orchestration remain later phases. No new social collection or outbound
SMS/WhatsApp capability is enabled by this change.

## Current hold

Marketing is off by default. Production runtime (`NODE_ENV=production`) is
unconditionally blocked by the new marketing boundary, even if the staging flag
is set. Existing campaign/broadcast automation guard sources are held as well.
Legacy workflow, delayed-job and follow-up email sends lack a trustworthy purpose
classifier and are also held. Transactional workflow exemptions require a
separately reviewed server-side purpose classification before release.
No merge, deployment, production setting change, real message, campaign activation,
or production migration is authorized by this work. Do not clear this hold as a
routine environment setup change.

No live staging sender or recipient is approved. Before requesting send permission,
independently verify that the staging environment, database, Gmail mailbox and
campaign settings are isolated from production. A production-built staging runtime
remains blocked by the hard production hold; adapting the hold for a verified
staging runtime requires a separately reviewed change and explicit approval.

## Configuration (never put values in source, PRs or logs)

- `MARKETING_OPTOUT_SECRET`: independently generated secret, at least 32 bytes.
  AES-256-GCM authenticates/encrypts the tenant + normalized recipient with a
  dedicated purpose string. Tokens deliberately do not expire: old email opt-out
  links must keep working. Retain this key; rotation needs a reviewed old-key
  verification strategy before rollout.
- `MARKETING_PUBLIC_ORIGIN`: owned HTTPS origin, without path/query/credentials.
  Never derive it from an incoming Host header or redirect parameter.
- `MARKETING_SENDS_ENABLED`: absent/disabled ordinarily. `staging-only` is the
  sole test mode, combined with `APP_ENV=staging`, non-production runtime and
  exactly one `MARKETING_TEST_RECIPIENT`. Do not configure these on production.
- Each workspace owner must select their connected sender, enter its business
  name and physical mailing address, and attest verification. No platform address
  is used as an independent sender fallback. Address changes require re-attestation.

Review `migrations/0114_prospect_link_rendering_snapshot.sql` (immutable per-draft link rendering metadata) and `migrations/0113_marketing_compliance.sql` in an isolated database before
any separately approved application. It contains additive profile/ledger tables
and historical opt-out backfill. The ledger deliberately has no contact foreign
key and cannot be deleted by contact reimport/deletion. Phone keys are namespaced
and require explicit international formatting; country codes are never guessed.
Do not use `db:push` or apply the migration against production as part of this PR.

## Automated verification

Use mocked providers and an isolated in-memory PostgreSQL fixture:

```
node --import tsx tests/marketing-compliance.test.ts
node --import tsx tests/marketing-compliance-db.test.ts
node --import tsx tests/marketing-send-boundary.test.ts
node --import tsx tests/prospect-email-suppression.test.ts
node --import tsx tests/prospect-outreach-email-html.test.ts
node --import tsx tests/prospect-outreach-writing-standard.test.ts
node --import tsx tests/prospect-campaign-readiness-batch-db.test.ts
```

The database suite executes production ledger/route/boundary code and the migration;
it covers tenant isolation, GET without mutation, bearer-token POST/idempotence,
duplicate contacts, deletion/reimport, historical flags, global DNC vs email scope,
queue/jobs/enrollment cancellation (including legacy WhatsApp drips), direct
Twilio/Meta global-DNC boundaries, missing address, footer generation and the
last provider boundary. PGlite stubs the PostgreSQL advisory-lock function.

`tests/marketing-postgres-concurrency.test.ts` separately exercises actual
PostgreSQL locks with a three-connection worker pool, delayed fake provider,
waiting opt-out, waiting worker and ten retries. It requires an explicit loopback
`MARKETING_TEST_DATABASE_URL` pointing to the dedicated `marketing_phase1_test`
database and creates/drops only a unique fixture schema. It passed on a temporary
local PostgreSQL 18 instance; CI provisions PostgreSQL 16 for the same test. No
staging/production database or real provider is involved. A provider request
already in flight cannot be recalled; a committed opt-out blocks every later
marketing dispatch in this test.

The Gmail provider signals dispatch only after local MIME/header validation.
Local validation failures are definite; transport or commit failures after dispatch
remain ambiguous and require reconciliation before retry.

Run `npm run check` and the wider prospect/email/automation/campaign suites. Record
baseline failures separately; do not label CI green if required checks fail.

## Eventual staging acceptance, after environment verification and permission

1. Apply the reviewed migration only to the approved isolated database. Load
   test-only fixtures. Keep every campaign stopped and all customer send paths off.
2. Configure the verified sender and inspect the persisted queued draft's HTML
   and text recipient preview, including the actual sender address/footer. Review
   all three message strategies. Exact template wording must remain intact.
3. Inspect raw MIME with a mocked provider first. Once separately approved, use
   only the authorized staging sender and single authorized recipient. Confirm
   real Gmail preserves multipart text/plain + text/html and both RFC 8058 headers;
   inspect DKIM coverage and provider requirements. No real-provider success is
   asserted by the automated tests.
4. Exercise GET (no mutation), confirmation POST, RFC 8058 form POST and repeat
   POST; tampering/tenant overrides must fail or affect only the token tenant.
   Confirm no automatic opt-out acknowledgement.
5. Inject an inbound explicit Stop and opt-out signal through the existing
   authenticated provider webhook fixture. Confirm durable ledger, duplicate
   contact flags, pending-send cancellation and refusal on retry/reimport. Normal
   prose/quoted thread text must not trigger STOP. Explicit global DNC stops all
   promotional channels; email-only opt-out leaves unrelated channel identities
   available. New cold SMS/WhatsApp remains unsupported in Phase 1.
6. Run concurrent real PostgreSQL workers, opt-out and retry under a delayed fake
   provider. Verify that a committed suppression wins and no worker dispatches
   afterward. Examine audit state, not PII-bearing logs.
7. Verify manual one-to-one/transactional messages have no unsolicited commercial
   headers/footer. Email-only opt-outs do not block that path; existing global DNC
   and bounce protections remain. Legacy workflow jobs lack a trustworthy purpose
   classifier: global DNC conservatively cancels those jobs. Review transactional
   workflow exceptions explicitly before release.
8. Identify the actual production Stop sender using authorized read-only access.
   Do not guess from screenshots. Production confirmation/remediation remains
   outstanding and requires its own verified, approved operational action.

## Rollback and release decision

Keep sending disabled; pause workers before any rollback. Retain suppression
ledger data and the public opt-out handler, including previously issued token keys.
Never drop suppressions or reset contact opt-outs to roll back UI/presentation.
Require independent review, required CI, real-provider/manual acceptance and
explicit release approval before any merge or production rollout. These controls
are engineering safeguards, not a blanket statement of legal compliance.
