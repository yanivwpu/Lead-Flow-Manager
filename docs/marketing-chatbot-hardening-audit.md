# Marketing public chatbot investigation — 2026-11-13

Status: local hardening and configuration proposal only. No deployment, production settings writes, or AI Auto activation.

## Identity and trace

Scope is exclusively marketing@whachatcrm.com. Repository installation uses public widget ID `wgt_3c14a2d2a3f30565406e0a2a395c7dcc0903e0f4fba9d188`, app origin https://app.whachatcrm.com, marketing hosts apex/www. This is source evidence, not live database ownership verification.

`MarketingWebsiteChatWidget` calls the existing idempotent official script injector on SPA location changes. `server/webchatPublicScript.ts` fetches public settings, ranks matching page rules, creates the iframe, and sends trusted parent URL/locale messages on navigation. Exact path outranks prefix, which outranks contains; aliases apply to exact matching. A homepage rule using contains `/` would match every URL; live matchType must be checked. Existing test fixtures use exact path `/` with `/es` and `/he` aliases.

`WidgetFrame` resolves live settings using parent URL and locale. Visitor identity is a UUID v4 stored under `wchat_visitor_<public widget ID>` on the iframe origin. GET `/api/webchat/:userId/:visitorId/messages` resolves the widget owner, finds that owner's visitor contact/conversation, and returns up to 50 messages. Inbound messages render as visitor bubbles. Greeting and page-rule cards are presentation only, not persisted visitor messages. Suggestions call POST only on click; prefill changes composer text only. Public history GET does not create an inbound message.

## Root cause status

The reported production `Features & pricing` bubble is NOT proven to be restored history, an automatic submission, or incorrect rule matching. Current source supports restored inbound history as a candidate and contains no suggestion autosubmit in the traced component. Distinguish using the affected browser's visitor UUID, the history response containing that exact message/ID/timestamp, and a fresh browser trace proving whether any POST occurs before interaction. Verify production build parity and live homepage matchType. Do not delete visitor IDs/history to hide the symptom.

The heading matching the supplied workspace configuration is corroborating information from the user; heading alone cannot establish widget ownership.

## Confirmed code gaps and fixes

1. Visitor initialization accessed localStorage without guards. Storage exceptions prevented assigning visitor identity. Guard reads/writes and retain an ephemeral UUID when storage is unavailable. Persistence across reloads requires browser storage access.
2. Settings and history load independently. Prefill could populate a returning visitor's composer while history was still empty. Wait for successful history and settings before applying prefill; wait for history before displaying the empty-thread greeting.
3. Installation-time URL prefill took precedence over live page-rule settings. With page context, prefer the fetched page-specific prefill. No automatic submission added.

These are independently demonstrated hardening gaps, not claimed causes of the production bubble.

## Page coverage proposal

`shared/marketingChatPageCoverage.ts` exports a pure proposal function requiring the marketing email and expected public widget ID. It copies settings, preserves existing rules/localizations and custom exact aliases, appends missing exact rules, and is idempotent. It performs no database writes. Call only after verifying an authenticated live export belongs to the dedicated marketing owner. A caller-supplied email is a guard, not authentication.

Audited App.tsx routes: Unified Inbox, AI Copilot, Realtor Growth Engine, Shopify Growth Engine at `/ecommerce-growth-engine`, AI Brain, Automations, Chatbot Builder, Campaigns, Integrations, Shared Team Inbox, Real Estate CRM, Ecommerce solution, Local Service Businesses, Marketing Agencies, Med Spas, Shopify CRM. Localized aliases are added only where localeRoutes exists. The ecommerce preview and Shopify CRM routes are unprefixed. All rules include EN/ES/HE copy without assertions about capabilities, prices, trial duration, or confirmed bookings. Existing homepage, Pricing and Prospect AI rules remain intact. Unknown routes match none of these additions and use the tenant default.

The actual production rule inventory and gaps remain unverified; the user confirmed only homepage, Pricing and Prospect AI configurations.

## AI routing and quality

The server inbound dispatcher awaits the AI path; browser Inbox opening is not inherently required by the code. Public history polling is not an AI generation trigger. Actual useful unattended replies depend on workspace flow ownership, AI entitlements, response mode, knowledge and rollout configuration.

Server AI policy requires widget enabled, AI Brain access, entitled plan/access, tenant `auto`/`full_auto`, and either global rollout or workspace allowlisting. `suggest`/`suggest_only` does not send automatically; off/manual does not send. Chatbot, booking, CRM fallback, human handoff, AI pause, automation pause, opt-out and rate limits can own/block the turn. Generation leases guard late/duplicate sends. AI loads business knowledge and verified booking configuration; grounding gates can withhold unsupported claims.

Do not enable WEBCHAT_SERVER_AI_AUTO globally. If activation is later approved, verify live marketing ownership and prerequisites and use the workspace-specific allowlist, preserving all existing entries. Confirm chatbot AI nodes and their response modes independently. Do not treat a demo request as a completed booking without server confirmation.

Local tests cover grounded homepage/pricing answers, Prospect AI action routing, later-turn demo intent, unsupported numeric claims, booking URL/confirmation gates, multilingual rules, navigation context protocol, and unattended inbound dispatch. These do NOT establish the quality of actual production model responses or knowledge freshness. Real product, pricing/trial, channels/integrations, follow-up, demos, unknown/handoff and EN/ES/HE answer tests remain blocked pending live access. No live test messages were submitted.

## Validation and remaining access

- Focused automated runs: 57 and 19 test-runner cases pass, including existing assertion-based suites.
- Chromium: fresh isolated contexts, desktop/mobile, EN/ES/HE, empty and seeded-returning histories, reload, trusted parent navigation to an unknown page with default-greeting fallback and retained history, no unsolicited POST, RTL/LTR, and widget storage denial: 13 scenarios pass with mocked API responses. Returning histories are fixture data, not live conversations.
- Full TypeScript check: 97 reported errors elsewhere; no diagnostics in the changed component or new coverage module. Not a clean repository-wide typecheck.
- git diff --check passes.
- Production HTTP probe to www.whachatcrm.com/unified-inbox: proxy CONNECT 403. Environment enforced allowlist excludes marketing/app domains. Production/incognito and real AI checks cannot be claimed.
- No production database or authenticated marketing session is configured. The supplied local dev environment is disposable and is not evidence of production configuration.
- Local gh authentication reports invalid GH_TOKEN. The connected GitHub app has repository write access and is used for a draft PR.

To finish: allow the marketing apex/www and app hosts in environment settings, supply approved authenticated marketing access or a verified configuration export without secrets, Then capture fresh and affected persisted-session network traces; verify widget ownership, deployed code and exact rule matching; audit published flow/AI Brain sources and routing; review/apply the additive proposal; execute the full real visitor quality matrix. Deployment remains excluded.
