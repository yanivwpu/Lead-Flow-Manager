# RGE matches on unrelated Inbox contacts

Investigation: 2026-11-16. Local review only; no production writes, messages, global setting changes, push or deployment.

## Confirmed production evidence

Railway read-only logs for project `2adeea49-431c-4ddf-8815-9ce89af66f32`, production environment `fa2e8c30-72ea-4688-877f-4a68e24198bc`, service `a7b75139-5bf8-4a02-b4ab-b7d12e17e770` link America’s Best Car Rental to contact `8f9ed904-8a58-4058-aa40-5960f01f8a12`, workspace user `51f64011-eb3a-48a4-bb10-031abd3c0cdc`, conversation `f3a63e97-1a35-43e5-acd7-8dce94a8a41b`.

At 2026-11-16 15:47:18 UTC (10:47:18 EST), `inventory-match-funnel` records 88 matches and 10 returned for that contact; the HTTP inventory-matches request succeeded. Criteria were Fort Lauderdale/Pompano, bedsMin=11, unknown transaction intent, no price cap or property type. All 88 candidates passed; the bed gate permits unknown bed counts. This proves matching execution for this contact, rather than merely a screenshot or another contact’s placeholder data. It does not prove the original source of the stored criteria.

Inbound logs on November 10–15 show Hebrew payment, vehicle oil-service, mileage/sticker photo requests, and greetings. The November 15 21:48:41 UTC sampled inbound turn reports no active chatbot flows, flowMatched=false, bookingIntent=false, no_flow_match, and auto-reply disabled. These observations establish no flow/auto-reply for that sampled turn only. Retarget eligibility evaluation logs and GET campaign-enrollments requests are not evidence of enrollment or sending. Historical workflow runs, no-reply jobs, opportunities and outbound-message attribution remain unverified without database access.

Production runtime logs and deployment metadata are accessible. OAuth redacts all Railway variable values, including DATABASE_URL; no local production database credentials are configured. Stored profile source/confidence/message references, raw lead classification, workflow execution tables, timers and full message history could not be inspected. Desktop capability is advertised, but no desktop/browser interaction tool is exposed in this session; actual Inbox UI verification was unavailable.

## Code path and root cause

Existing fixes reviewed include shared AI domain routing (`2ccb7136`, `df68e3db`, `e331fee0`) and contact-scoped inventory refetch/placeholder protection (`3f673b08`, `1bf9a1dd`). Existing matching, search, domain, email, no-reply and tenant tests were reviewed and reused.

* Classification: W2 previously used broad buyer keywords (`buy`, `purchase`, `looking for`) and wrote buyer custom fields. Preference extraction admitted all contacts when RGE was installed or the industry was real estate. Fast-path parsing also needed a contact-intent guard. Production logs do not establish which path created this profile.
* Matching API: tenant ownership and workspace connector gates existed, but no buyer/property intent gate preceded criteria scoring. Unsupported saved criteria were sufficient. Opportunity generation after sync similarly admitted every contact with criteria. This is the confirmed mechanism behind the 88-match result.
* Copilot: Buyer Preferences used the domain resolver, while inventory visibility accepted a buyer label OR criteria. This inconsistency exposed matches when the conversation was unrelated. Inventory AI summaries call the matching service; contact-aware drafts also needed the same guard.
* Contact switching: inventory keys and placeholders were already scoped by contact, Inbox messages avoid previous-contact placeholders, and the Copilot panel is keyed by contact. These protections were preserved. A separate listing-dialog draft key was effect-driven, allowing one render with the previous key and new contact arguments. It is now synchronous. Inventory requests consume React Query’s cancellation signal.
* Automation: RGE-tagged workflows, W2 qualification/routing and delayed W2 sends previously lacked the same contact-intent boundary. The patch gates RGE workflow execution, no-reply scheduling, qualification/routing, timer scheduling and delayed sending. Existing tenant/send/entitlement/stage policies remain in place. Seller intent uses the existing seller classifier with a property-language guard; seller workflows do not enable buyer inventory matching.

## Local fix

Shared eligibility requires property-intent evidence or authenticated agent confirmation. Installation, industry, leadType, inferred criteria and saved evidence strings cannot independently authorize matching. Vehicle rental plus budget/location does not establish property intent. Historical buyer evidence survives greetings and small talk. For older buyer evidence outside the recent 100-message window per conversation, saved message IDs are resolved to real inbound messages, and conversation/contact/workspace ownership is verified before trusting their contents.

The existing authenticated manual preference-edit path now stamps `agentConfirmedAt` in the JSON profile. This metadata is excluded from extraction patches so automatic extraction cannot confer agent confirmation. Automatic paths never stamp it. Existing saved profiles are not bulk upgraded. The buyer-preferences endpoint’s contact-scoped eligibility is used by Copilot and AI context alongside the shared decision.

No contact data repair was executed or is required to block matching and automation under these gates. Unsupported existing preferences are retained but cannot independently confer eligibility. Any later cleanup needs inspection of the raw profile and provenance before an exact repair is proposed for approval.

## Validation

New regressions exercise the production Hebrew text, English/Spanish unrelated contacts, car/property rental, stale inferred and purported explicit evidence, agent confirmation, genuine buyer continuity, old referenced buyer messages, foreign-tenant references, server matching/AI/opportunity/background rejection, W2/workflow/timer blocking, late query responses and abort propagation.

The selected suite has 22 test files: 21 pass; `buyer-preference-fastpath.test.ts` fails on `Pompano area extracted`, identically reproduced on unchanged HEAD. Existing RGE no-reply fixtures now explicitly identify legitimate agent-confirmed contacts. The production build passes. Full TypeScript checking has existing baseline failures; comparison against an isolated unchanged HEAD found no additional diagnostic messages. Build-generated hero image changes are excluded.
