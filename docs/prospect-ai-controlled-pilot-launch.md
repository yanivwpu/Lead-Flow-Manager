# Prospect AI controlled pilot → public launch checklist

Updated 2026-10-23. **Pilot release is off by default.** Applies to Prospect AI email outreach only, not WhatsApp/social cold messaging. Public messaging must not claim Facebook discovery, multi-channel outbound or Click-to-WhatsApp attribution (#121, #122, #127).

## Current production preflight
- Verified HTML/text Gmail formatting, RFC2047 subject encoding, clickable approved CTA, and working signed POST unsubscribe including durable email-only suppression. Mobile recipient confirmed link opens intended Realtor Growth Engine page.
- The original opt-out contact (not the user's own Gmail acceptance) remains an evidence gap; resolve or explicitly block it before real sends.
- Production (Oct 23 read-only): 2 connected Gmail mailboxes, 1 verified postal sender, 0 active outreach items; 2 workspaces' queue_running flags remain true despite empty queue. 135 approved/not-contacted records, just 16 with emails (includes internal QA fixtures). Historical suppression entries 470. Never start by rearming existing campaigns.
- Distinguish customer marketing-purpose email from transactional/manual workflow email; legacy unclassified workflow campaigns must remain held. Review reported high/critical runtime dependency vulnerabilities separately before general availability.

## Human sign-off before enabling *any* external recipients
1. Owner manually selects **at most five** real business contacts. Independently validate identity/email source/provenance, applicability, correct business fit, no prior outreach, bounce and suppression eligibility, no opt-out/STOP, acceptable regional outreach rules and truthful relevant copy.
2. Inspect each recipient's **final** HTML and plain-text draft in Campaigns, including sender identity/address, subject, CTA, source email and signed unsubscribe. Require manual explicit approval for every destination. No discovery email is inherently a permission to message on WhatsApp/social networks.
3. Confirm sender (verified physical address, domain authentication SPF/DKIM/DMARC if applicable), consistent reply-to handling and compliance.
4. Check there are zero unrelated ready/paused/sending queue items, no old campaigns will be resumed, and final Railway production instance is healthy.
5. Add server-only env vars (not in Git or browser): `MARKETING_PILOT_WORKSPACE_ID`, `MARKETING_PILOT_MAILBOX_ID`, `MARKETING_PILOT_EXPIRES_AT` (UTC ISO string strictly in the future, within 7 days), `MARKETING_PILOT_CONTACTS_JSON` e.g. `[{"contactId":"REVIEWED_ID_1","email":"reviewed@example.com"}]`. Entries must be exact pairs, 1–5, no duplicates. Release is still held with `MARKETING_SENDS_ENABLED=disabled`.
6. Only after approval of list and specific first-wave send, temporarily set `MARKETING_SENDS_ENABLED=production-pilot`, deploy/restart and watch queue continuously. Pilot code validates signed environment, exact workspace/mailbox/contact+email pair at provider boundary, one recipient/message and no prior successful contact send. Disabled and expired modes reject all marketing sends. No blanket `production`/enabled mode exists.
7. After approved pilot deliveries, switch `MARKETING_SENDS_ENABLED=disabled`, verify healthy production restart, zero active queue, provider receipts, real inbox presentation, unsubscribes, replies, complaints and bounces. Reconcile ambiguous provider deliveries before any retry. Do not automatically escalate or refill a pilot allowlist.

## Success criteria and announcement gate
- Pilot has no sends outside allowlist, no duplicate sends, expected HTML/text/plain & exact approved CTAs, 0 suppressed recipients contacted, no abnormal bounce/complaint, correct return/inbox + unsubscribe headers and reply handling.
- One real reply can be answered appropriately and reflected in CRM; suppressions and follow-up tasks behave as designed.
- Feature truth on landing pages, pricing/plan access and self-serve activation is verified. Do not claim full automatic generalized email campaigns until global marketing release controls have been separately reviewed, tested and approved.
- **Public launch**: prepare content and demo, but publish/announce only after owner checks pilot and explicitly authorizes public release. Separate launch consent/activation gate and public announcement gate.

## Rollback
Set `MARKETING_SENDS_ENABLED=disabled` before disabling queue or rolling code back; pause queue, stop worker from claiming, inspect in-flight ambiguous receipts, then verify disabled deployment. Never delete suppressions, drop ledger, or change old DNC to enable sending.
