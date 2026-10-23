# WhatsApp staging routing and checkout-consent audit

Evidence collected October 22, 2026 (America/New_York). Related: #151, #154.

## Verified implementation and deployment

- GitHub confirms recovery PRs #137–147 and token replacement #148 merged into
  `codex/shopify-trial-first-onboarding`. The branch head is
  `19159489990ec1f5aa42b7936c16e660eeb167ec`.
- Railway staging app deployment `28421dc3-53cc-4946-af72-20e1418574a0`
  successfully deployed that exact commit. PR #148's final workflow run
  [39633129386](https://github.com/yanivwpu/Lead-Flow-Manager/actions/runs/39633129386)
  passed. Previously completed migration/restore and Shopify access checks recorded
  in #154 were not repeated. Those historical results are not fresh database evidence.
- Eligibility, checkout observations, purchase recheck, durable intent/outbox,
  Meta template sender, signed consent, STOP suppression, receipt processing,
  privacy cleanup, and gated staging worker/auto-preparation already exist.
  This patch does not rebuild those components.
- PR #149 remains draft/unmerged. AI shopping PRs #90–93 and historical Shopify
  order tests are recorded in #154; their deployed merchant acceptance remains separate.

## Findings and limits

**Inbound transport: actual destination remains unverified.** Railway HTTP logs
  for the staging app from `2026-10-22T19:20:00Z` to `2026-10-23T01:45:00Z`
  contain ten `GET /api/webhook/meta` requests returning 403 and zero POSTs.
  An invalid verification probe returning 403 does not establish a signature or
  delivery failure. This bounded staging log result does not establish receipt
  in production or establish that Meta sent a webhook at all.

The app-level production callback and historical WABA app membership are recorded
in #151. Membership alone does not establish the effective WABA override or the
`messages` app subscription. #151 records Meta 190/463 token expiration; this audit
could not perform a fresh authenticated Graph call. Railway OAuth exposes variable
names only, and this execution environment has no staging session, Meta credential
binding, or Railway remote-exec tool. Its shell proxy is also unreachable. No
credential files were inspected and no raw tokens, provider payloads, or recipient
details were printed.

**Consent capture is gated off independently of routing.** The fully rendered
staging app variable-name listing contains neither
`ECOMMERCE_RECOVERY_CONSENT_CAPTURE_ENABLED` nor
`ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY`. Existing code requires the flag
to equal `true`, the exact staging environment/origin, and a secret of at least
32 characters. Therefore delivery alone cannot produce a consent grant under
this observed configuration. No activation or key generation was performed:
the existing merchant-specific notice/disclosure acceptance is still unverified.

**Existing consent safeguards:** the webhook verifies captured raw bytes before
calling capture and before ACK. Mapping requires the phone-number-ID owner,
active Shopify installation, one exact E.164/WhatsApp contact, matching shop and
Shopify customer, and the shop privacy lock. SQL stores a phone HMAC and signed
event evidence. Replayed or older events cannot overwrite newer evidence; STOP
revokes matching tenant/shop/phone-HMAC consent and suppresses pending outbox
rows. Ordinary Shopify marketing permissions cannot create a grant. These are
code-audit findings, not a successful live YES/STOP test. Customer/contact identity
and current HMAC validity still require authenticated runtime verification.

**Read-only diagnostic crash remains unresolved.** Deployment
`9e29411c-3456-48af-aea4-64c40531a89e` was CRASHED and exposes only
`Starting Container`. Its command has silent preflight exits 71–77 before psql.
The earlier October 21 run completed `BEGIN`/aggregate report/`COMMIT`; it found
one merchant but zero matched contacts or signed consents, and no configured Meta
sender at that time. Those old counts must not be treated as today's state.

Temporary guard-code logging and a quoting-independent command transport were
tried on this existing one-shot service only. Redeployments
`c76b4832-8791-421b-a892-13bc55ccebe2` and
`ab5f3f21-f281-49d9-96a7-ffff23832c39` expose no command output. Railway reports
SUCCESS/Online while replica status reports zero running and one crashed.
Neither result proves a successful SQL diagnostic or identifies an exit code.
The original start-command configuration was restored after these attempts;
the latest diagnostic deployment contains the temporary instrumented command,
with restart policy NEVER. No database mutation, migration, service creation,
or production operation occurred. Next: obtain the actual replica exit code,
termination reason and container stderr from Railway runtime events/support.
Do not label this as a database, shell, or configuration root cause without that evidence.

## Targeted diagnostic repair

The existing tenant-authenticated coexistence endpoint now reports `callbackRouting`:

- WABA probe status and numeric Meta error/subcode; exact configured-app membership.
- A reported WABA `override_callback_uri`, categorized staging/production/other/unknown.
- A separate read-only app `/subscriptions` probe for the app callback and `messages` field.
- Timestamp, expected callback path, and explicit `inboundReceipt: not_measured`.

An omitted/null override remains **unknown** even if the app callback is known.
Unknown provider metadata must not be converted into a claim of effective routing.
Reported callback URLs expose only the two known origins and path-match boolean;
query strings, arbitrary hosts and raw provider error text are withheld. The raw
WABA subscription logger/response was removed and its token moved to an Authorization
header. All provider operations added here are GETs. Existing token-only renewal,
webhook verification, tenant routing, consent and delivery behavior are unchanged.

## Validation and remaining acceptance

Five new diagnostic tests pass: destination uncertainty, app-row isolation,
URL/exception redaction, Graph failures/malformed/paginated responses, independent
message fields, and GET/header-only app probing. The helper passes standalone
TypeScript checking; the changed route passes esbuild transformation. Two relevant
existing signed-consent webhook contract tests pass against the exact downloaded
staging source. Full branch type/build validation is delegated to the existing PR
workflow, which now includes the new tests. Local source was retrieved through
the GitHub connector because shell git fetch cannot reach its proxy; the default
local checkout is main and was not mistaken for staging.

Remaining steps, in order:

1. Renew the short-lived test token through staging WhatsApp → Manage → Update
   token. Never paste it into chat or reconnect/reset the existing integration.
2. Deploy this reviewed staging patch and run the existing authenticated diagnostic.
   Supply only its sanitized `callbackRouting` block for the investigation. If the
   override is still not exposed, obtain authoritative routing evidence from Meta;
   do not infer it from app membership or change the production callback.
3. Resolve diagnostic replica termination evidence and verify current merchant,
   contact/customer mapping and schema read-only. Review the merchant disclosure
   before any separately controlled consent-capture activation/HMAC provisioning.
4. Observe one genuinely signed, authorized test-recipient YES in the correct
   Inbox and verify current HMAC-scoped consent; then STOP and replay/duplicate
   behavior. Never synthesize consent or use an unsigned fixture as live evidence.
5. Keep recovery sending/auto-preparation/worker gates off. Exact-template tenant
   sync, controlled recovery send authorization, AI shopping deployed acceptance,
   merchant UX review and production launch gates from #154 remain outstanding.

The reported template approval is user-provided evidence, not freshly verified
Meta/local tenant synchronization. No customer messages, carts, orders, recovery
automation or production deployment were triggered during this audit.
