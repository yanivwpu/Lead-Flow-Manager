# Marketing public chatbot investigation — 2026-11-13

Status: local hardening and configuration proposal only. No deployment, production settings writes, or AI Auto activation.

## Identity and trace

Scope is exclusively marketing@whachatcrm.com. Repository installation uses public widget ID `wgt_3c14a2d2a3f30565406e0a2a395c7dcc0903e0f4fba9d188`, app origin https://app.whachatcrm.com, marketing hosts apex/www. This is source evidence, not live database ownership verification.

`MarketingWebsiteChatWidget` calls the existing idempotent official script injector on SPA location changes. `server/webchatPublicScript.ts` fetches public settings, ranks matching page rules, creates the iframe, and sends trusted parent URL/locale messages on navigation. Exact path outranks prefix, which outranks contains; aliases apply to exact matching. A homepage rule using contains `/` would match every URL; live matchType must be checked. Existing test fixtures use exact path `/` with `/es` and `/he` aliases.

`WidgetFrame` resolves live settings using parent URL and locale. Visitor identity is a UUID v4 stored under `wchat_visitor_<public widget ID>` on the iframe origin. GET `/api/webchat/:userId/:visitorId/messages` resolves the widget owner, finds that owner's visitor contact/conversation, and returns up to 50 messages. Inbound messages render as visitor bubbles. Greeting and page-rule cards are presentation only, not persisted visitor messages. Suggestions call POST only on click; prefill changes composer text only. Public history GET does not create an inbound message.

## Root cause status

The reported production `Features & pricing` bubble is NOT proven to be restored history, an automatic submission, or incorrect rule matching. Current source supports restored inbound history as a candidate and contains no suggestion autosubmit in the traced component. Distinguish using the affected browser's visitor UUID, the history response containing that exact message/ID/timestamp, and a fresh browser trace proving whether any POST occurs before interaction. Verify production build parity and live homepage matchType. Do not delete visitor IDs/history to hide the symptom.

A local Chromium test now reproduces the exact visible mechanism through the real official loader and iframe: deliberately click the homepage “Features & pricing” suggestion once, navigate with history.pushState to /unified-inbox, then reload and reopen. The same visitor UUID retrieves the saved inbound message, which renders with justify-end. POST count stays at one through navigation and reload. This proves how genuine saved history can produce the symptom; it does not identify the origin of the user's production message. A wrong page-rule match alone does not manufacture a right-aligned inbound message.

The heading matching the supplied workspace configuration is corroborating information from the user; heading alone cannot establish widget ownership.

## Confirmed code gaps and fixes

1. Visitor initialization accessed localStorage without guards. Storage exceptions prevented assigning visitor identity. Guard reads/writes and retain an ephemeral UUID when storage is unavailable. Persistence across reloads requires browser storage access.
2. Settings and history load independently. Prefill could populate a returning visitor's composer while history was still empty. Wait for successful history and settings before applying prefill; wait for history before displaying the empty-thread greeting.
3. Installation-time URL prefill took precedence over live page-rule settings. With page context, prefer the fetched page-specific prefill. No automatic submission added.
4. On navigation, previous-page actions could remain clickable until the replacement settings response arrived. Tie prompt readiness to widget ID, parent URL and display locale; suppress page prompts until current settings and history are ready. Do not clear the transcript or visitor draft. Ignore a cancelled settings response after JSON parsing too.
5. An omitted title in a parent context update retained the previous title. Clear that stale title instead of sending it with the next visitor message. When parent context exists without a title, omit the title rather than substituting the iframe document title. Apply the same parent-title rule to media messages.

These are independently demonstrated hardening gaps, not claimed causes of the production bubble.

## Page coverage proposal

`shared/marketingChatPageCoverage.ts` exports a pure proposal function requiring the marketing email and expected public widget ID. It copies settings, preserves existing rules/localizations and custom exact aliases, appends missing exact rules, and is idempotent. It validates the resulting rules against the existing rule validator, rejecting duplicate/oversized exports without deleting existing settings. It performs no database writes. Call only after verifying an authenticated live export belongs to the dedicated marketing owner. A caller-supplied email is a guard, not authentication.

Audited App.tsx routes: Unified Inbox, AI Copilot, Realtor Growth Engine, Shopify Growth Engine at `/ecommerce-growth-engine`, AI Brain, Automations, Chatbot Builder, Campaigns, Integrations, Shared Team Inbox, Real Estate CRM, Ecommerce solution, Local Service Businesses, Marketing Agencies, Med Spas, Shopify CRM. Localized aliases are added only where localeRoutes exists. The ecommerce preview and Shopify CRM routes are unprefixed. Demo suggestions use the existing recognized EN/ES/HE intent labels so routing survives settings API normalization without adding a new intent system. All rules include EN/ES/HE copy without assertions about capabilities, prices, trial duration, or confirmed bookings. Existing homepage, Pricing and Prospect AI rules remain intact. Unknown routes match none of these additions and use the tenant default.

The actual production rule inventory and gaps remain unverified; the user confirmed only homepage, Pricing and Prospect AI configurations.

## AI routing and quality

The server inbound dispatcher awaits the AI path; browser Inbox opening is not inherently required by the code. Public history polling is not an AI generation trigger. Actual useful unattended replies depend on workspace flow ownership, AI entitlements, response mode, knowledge and rollout configuration.

Server AI policy requires widget enabled, AI Brain access, entitled plan/access, tenant `auto`/`full_auto`, and either global rollout or workspace allowlisting. `suggest`/`suggest_only` does not send automatically; off/manual does not send. Chatbot, booking, CRM fallback, human handoff, AI pause, automation pause, opt-out and rate limits can own/block the turn. Generation leases guard late/duplicate sends. AI loads business knowledge and verified booking configuration; grounding gates can withhold unsupported claims.

Do not enable WEBCHAT_SERVER_AI_AUTO globally. If activation is later approved, verify live marketing ownership and prerequisites and use the workspace-specific allowlist, preserving all existing entries. Confirm chatbot AI nodes and their response modes independently. Do not treat a demo request as a completed booking without server confirmation.

Local tests cover grounded homepage/pricing answers, Prospect AI action routing, later-turn demo intent, unsupported numeric claims, booking URL/confirmation gates, multilingual rules, navigation context protocol, and unattended inbound dispatch. These do NOT establish the quality of actual production model responses or knowledge freshness. Real product, pricing/trial, channels/integrations, follow-up, demos, unknown/handoff and EN/ES/HE answer tests remain blocked pending live access. No live test messages were submitted.

## Completed local validation

- Combined automated regression run: **108 test-runner cases passed, zero failures**, plus the assertion-based suites included by those files. This covers page rules and origins, localized action semantics, configuration preservation and size validation, AI response modes and rollout scope, real inbound server dispatch, no Inbox-triggered reprocessing, idempotency, handoff/pause ownership, grounded answers and unsafe claim holds, and typed/structured demo flows.
- Browser matrix: **13 Chromium scenarios passed** with mocked API responses: desktop/mobile emulation, EN/ES/HE, fresh and seeded-returning histories, reload, navigation to unknown-page fallback, no automatic POST, RTL/LTR, and denied widget storage. Mobile uses mobile/touch emulation as well as a narrow viewport.
- Actual installation integration: **2 Chromium scenarios passed**, desktop and mobile, executing the generated official /widget.js and real React iframe. Tests cover delayed history, no premature greeting/actions, an explicit suggestion click, right-aligned inbound history on /unified-inbox, stable visitor UUID after reload, no navigation/reload submissions, EN/ES/HE URL navigation, draft preservation, a slow obsolete settings response, and follow-up POST with the current URL/title/locale, including omitted titles after a page with an empty title. Transport acknowledgements are mock fixtures, not AI answers.
- npm run build passed for client, server and worker. The build regenerated four AVIF assets; those incidental generated changes were restored and are excluded from the PR.
- TypeScript baseline comparison: **97 diagnostics on the original checkout and 97 on the changed code, with zero new diagnostics**. The comparison substitutes the original WidgetFrame source and excludes the added coverage module for the baseline; no source files are overwritten. The repository-wide typecheck is still not clean.
- git diff --check passes.

Reproduce with dependencies installed and Vite running on localhost:5000:

```sh
node tests/marketing-chat-browser.cjs
node tests/marketing-chat-installation-browser.cjs
```

Playwright and Chromium are required. CHROMIUM_PATH can override /usr/bin/chromium. Run TypeScript test files with `npx --no-install tsx --test`; tests that import server database modules need the disposable local DATABASE_URL, not production access. No production credentials or database were used. No tests turn on a production automation flag.

## Local AI quality evidence and limits

| Requested area | Locally verified | Still unverified in production |
| --- | --- | --- |
| Product questions | Homepage/Prospect AI action routing, product page context and product-specific suggestions | Actual published marketing knowledge and model answers for every product |
| Pricing and free trial | Pricing intent routing, grounded pricing gates, rejection of invented numeric claims | Current commercial terms, trial availability/duration and real answers |
| Channels and integrations | Generic knowledge/grounding paths; integrations page context | Actual supported marketing claims and knowledge-source completeness |
| Follow-ups | Stable session, retained history/draft, current URL/title/locale in explicit follow-up; completion-context tests | Real multi-turn model answer usefulness |
| Demo requests | Typed/structured booking intent, verified-link gates, no unsupported booking success | Live booking configuration and confirmed booking execution |
| EN/ES/HE | URL/locale resolution, localized suggestions, stable semantics, RTL/LTR, history preservation | Actual model fluency and factual response quality in all three languages |
| Unknown questions and handoff | Unknown page fallback, low-confidence/ungrounded holds, human takeover and pause controls | Real unknown-question wording, delivery and human availability |
| Unattended answers | Server inbound dispatch, Auto vs Suggest/Manual policy, scoped rollout, idempotency | Marketing tenant's actual modes, entitlement, flow ownership and activation |

## Production checks intentionally unverified

Local work is complete without requesting production access. The earlier HTTP probe received a proxy CONNECT 403, and no live marketing session or production database was used. These remain unverified:

- Public widget ownership resolves to the dedicated marketing account, deployed build matches the reviewed source, and the supplied heading comes from that configuration.
- The affected browser's visitor UUID, inbound message ID/timestamp, initial history response and absence/presence of a pre-interaction POST.
- Actual homepage matchType, exact live Page Rules inventory, existing localized defaults and published flow selection.
- AI Brain entitlement, response mode, live knowledge sources/freshness, routing ownership, server rollout/allowlist and human handoff state.
- Real public incognito desktop/mobile behavior, browser third-party storage policies, public CSP/origin configuration, real product/pricing/integration answers and all EN/ES/HE model quality checks.

The additive configuration is a proposal, not an applied marketing settings change. No production workspace was modified. No globally unattended automation was enabled. PR #300 remains unmerged and undeployed.

## Review finalization

The six changed files were reviewed for storage/session behavior, stale async responses, page matching and localization, configuration isolation, and test side effects. The 16 marketing page rules remain a pure, unapplied proposal: no runtime imports activate it, and applying rules is a separate configuration step.

GitHub reported four medium CodeQL annotations for unrestricted iframe-to-parent postMessage origins. Remove the wildcard defaults and exception retries from both branding-ready and teaser-gate effects. Send only to a known HTTP(S) parent origin, skip standalone windows, and do not retry an inaccessible parent with `*`. The actual-installation browser test records both message types and forces a parent exception to verify that no unrestricted retry occurs.

The repository's public main-branch metadata reports protection disabled and an empty required-status-check list; its ruleset collection is empty. All available final-head checks must be green before Ready for Review. Production incident attribution, live AI quality and activation prerequisites remain unverified as listed above; this PR does not perform the separate configuration rollout.
