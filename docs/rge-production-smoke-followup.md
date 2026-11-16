# PR #318 production smoke failure: date and payment contamination

Investigation date: 2026-11-16. This follow-up is not deployed. Production inspection used SELECT queries and read-only Railway logs. No contacts, preferences, classifications, automation settings or messages were changed.

## Verified production behavior

The authenticated response supplied by the user for contact `8f9ed904-8a58-4058-aa40-5960f01f8a12` is fresh and reports `eligibilityVersion: 2`, `eligible: true`, `reason: rge_installed`. `agentConfirmedAt` is absent. The stored contact has no buyer lead classification. Saved preferences include explicit-labelled Fort Lauderdale/Pompano and inferred bedsMin=11/bathsMin=21. Saved labels are model/parser output, not independent confirmation.

Railway deployment `b75317da-89e0-4df5-a29c-72de09fbcfe3` succeeded with backend SHA `422595ec5d60e65568082ebe31bcf2b0a64a8013`. Startup logs identify that SHA. Fresh requests around 17:19 UTC on November 16 returned HTTP 200 for buyer preferences and inventory matches, and the matching funnel records 88 matches / 10 returned for this contact. This establishes actual matching execution after PR #318, not a screenshot-only or cache-only issue.

Its build logs identify `bootstrap-B261qioI.js` and `UnifiedInbox-CsMdTy4Q.js`. Public HTML requests to `https://app.whachatcrm.com/app/inbox` fail with proxy HTTP 403 here. No authenticated browser interaction capability is available. The assets loaded in the user's particular tab therefore remain unverified; deployment build output is not proof of the tab's asset identity.

## Confirmed false eligibility and numeric extraction

Of all 79 actual inbound messages replayed against the deployed classifier, only message `40d1c592-fc4d-40fb-8e54-8db4c087a963` independently authorizes property intent. It states in Hebrew that the debt is $1,061, including renewal until `11/21` and a ticket/report. The classifier treats the currency as a budget and the date as structured room criteria. A bare slash pair also supplies its property anchor. The shared server history gate thus accepts this message; the new gate is called, but its classifier is wrong. API reason `rge_installed` describes the workspace capability after intent acceptance, not the actual authorizing intent source.

Inbound message `d17b8d91-5755-485f-92a1-42d29868c2fc`, at November 3 16:16:06.173 UTC, says the renewal is on `11/21`. The persisted numeric fields were updated at 16:16:14.251 UTC, eight seconds later. Replaying the old heuristic on either renewal message produces bedsMin=11 and bathsMin=21 with confidence .86 and evidence strings `beds in message` / `baths in message`, exactly matching stored provenance. This confirms the date-to-room extraction mechanism. Historical extractor call logs are not available to attribute the exact invocation or establish whether a particular extraction was fast-path or empty-LLM fallback.

The areas' stored evidence says the customer is closer to Pompano; timeline evidence refers to doing maintenance tomorrow to avoid engine damage. These are contaminated property interpretations of unrelated content, not customer confirmation of real-estate intent.

The listing-feedback hypothesis is not established. A tenant-scoped query found no inventory row with both 11 beds and 21 baths. Listing-card mapping uses the listing's own bed/bath fields, not buyer criteria. Without the exact first displayed listing ID we cannot identify that particular card or prove its historical contents. Independently, the date parser reproduces the saved numbers and provenance.

## Provenance and automation

All inspected inbound messages are stored without generated-by attribution; their actual text concerns vehicles/payments/maintenance. Outbound property content was not needed for the confirmed false-positive decision. However, code review found a separate contamination path: the asynchronous preference extractor supplied both assistant/outbound turns and the existing saved profile to the LLM, and its empty-result fallback parsed the same mixed transcript. This could recycle listing or profile content. That path is closed here; it is not claimed as the historical cause of this contact's numeric values.

Read-only workflow records now establish historical successful RGE executions: W1 `intro_fast_reply` on August 21 and W4 `followup_24h` on August 22, with message-template actions recorded. Later inspected attempts were blocked by paused automation or the messaging window. Corresponding outbound introduction and follow-up rows are present at those times with stored status `read`. Together these are evidence that historical RGE outreach occurred. Message rows lack generator attribution, and no independent messaging-provider lookup was performed; attribution of every historical outbound remains unresolved. No automation_timer_jobs rows currently reference this contact; that does not prove no historical timer ever existed.

## Fix scope

* Share date-aware, context-dependent compact bed/bath parsing between property-intent classification, structured search signals and preference extraction. Currency plus a calendar date cannot establish property intent. Legitimate compact searches and explicit large room counts remain supported.
* Ignore conventional quoted reply/forward blocks when evaluating property intent and extraction. Exclude generated inbound artifacts and outbound turns from server evidence. Strip quotes before combining adjacent inbound turns.
* Give the LLM and deterministic fallback the same customer-authored inbound transcript. Do not supply the saved profile as extraction evidence; it remains available to the existing merge/command layer.
* Retain the existing optional manual `Save and enable matching` action and its authenticated `agentConfirmedAt` writer. No new enrollment requirement or schema change; no database migration. Established buyer history still authorizes matching after neutral replies without that field.

Matching/API, AI summaries, extraction, background opportunities and existing property-workflow/timer execution checks already use this shared eligibility path. Correcting its false-positive decision blocks these paths even while contaminated preferences and old match records remain stored. This is verified locally, not yet by a new production deployment. No workflow/timer scope changes are introduced in this follow-up; seller/referral and non-property rules remain covered by the existing focused regression.

## Validation and limits

The new `rge-production-date-contamination.test.ts` covers the production Hebrew renewal wording (payment amount anonymized), the contaminated profile, English/Spanish dates/payments, extraction provenance, quoted/outbound/generated content, manual confirmation and established buyer continuity. The existing server-gate regression now uses the actual false-positive wording and verifies matching, AI summary, extraction, opportunities, workflow/timer enrollment and tenant denial before DB access.

On exact pre-change SHA `422595ec5d60e65568082ebe31bcf2b0a64a8013`, the production date/payment assertion fails (`true !== false`). The corrected code passes it, and replaying the entire production inbound history through the paginated server gate returns false.

Production build: `npm run build` passed. Generated hero asset changes were excluded.

17 relevant selected suites passed: production date contamination; review search evidence; inventory contact eligibility; inventory contact server gate; focused release review; AI domain eligibility; buyer search command matrix (36 phrases); buyer search scenario matrix; buyer search replacement reset; buyer preference replacement soft clear; email LLM skip; inventory matching hard gates; inventory matches refetch; Copilot inventory connected; RGE W4 no-reply enrollment; RGE no-reply Meta safety; RGE no-reply repair rules.

`buyer-preference-fastpath.test.ts` still fails at `Pompano area extracted` (line 134), identically reproduced on the exact pre-change base. `buyer-search-replacement-e2e.test.ts` cannot run without a designated writable test database; its DB-test guard refuses execution identically on the base. No production DB-write override was enabled. These are not counted as passing tests.

Full TypeScript checking fails with 97 diagnostics on both the follow-up and exact pre-change base. File/error-code counts are identical, and none refers to a changed source/test file. Rendered messages differ in inferred type ordering and checkout paths; this is not claimed as a clean repository-wide typecheck. A dedicated PR workflow now runs the six core eligibility/provenance/workflow-boundary suites; its exact command passed locally.

Actual Inbox visual checks remain unavailable here. After an approved deployment, verify the car-rental contact's fresh version-2 response is ineligible and that cards, AI property context and property actions disappear without deleting data. Verify a genuine buyer through neutral replies/contact switching; test manual confirmation only on a designated QA contact; verify seller/referral and ordinary non-RGE workflows under their own rules. Do not send customer test messages or repair production data as part of this review.
