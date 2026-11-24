# WhachatCRM localization completion tracker

Phase 1 inspected `48f802de`. Foundation work starts at `94f243d1` on `localization/foundation-ai-language`. The audit checkout was 81 commits behind this baseline. [Foundation change set](https://github.com/yanivwpu/Lead-Flow-Manager/compare/main...localization/foundation-ai-language). The open Inbox styling PR [#338](https://github.com/yanivwpu/Lead-Flow-Manager/pull/338) remains an independent branch.

## Coverage

These are route families. A comma-separated row shares the same recorded status, except where noted. **P** means partial, **M** missing for the substantive route body, **?** unverified, and **—** a redirect. English is the source language and has no whole-route completion certification. RTL **P** means some direction support is present. A shared change can improve several routes before their page-body status changes.

| Route | EN | HE | ES | RTL | Remaining work |
|---|---|---|---|---|---|
| `/app/inbox/:contactId?` | ? | P | P | P | Inbox and Copilot/Composer copy, actions, details, activity, saved properties and populated message lanes |
| `/app/chats`, `/app/chats/:id` | — | — | — | — | Inbox redirects |
| `/app/contacts` | P | P | P | P | Foundation keys, relative dates and LTR phone/email checked. Bulk feedback, channel labels, appointment and error coverage pending |
| `/app/contacts/:id` | ? | M | M | ? | Customer detail and purchase history |
| `/app/followups` | ? | M | M | P | Tasks, calendar, deals, orders and scheduling display |
| `/app/search` | ? | M | M | ? | Results, filters and empty/error copy |
| `/app/workflows` | ? | M | M | P | Builder controls, nodes and status |
| `/app/chatbot` | ? | M | M | P | Builder chrome. Existing authored locale variants and field direction are preserved |
| `/app/templates` | P | P | P | P | Foundation preset keys done. Approved library, sync, send and re-engagement UI pending |
| `/app/campaigns/:id?` | ? | M | M | ? | Gates, enrollment and campaign views |
| `/app/widget` | ? | P | P | P | Configuration and preview UI |
| `/app/website-widget` | — | — | — | — | Redirect to widget settings |
| `/app/ai-brain` | ? | P | P | P | Modes, knowledge, tests and qualification |
| `/app/sales-catalog` | ? | P | P | P | Offers, payments, catalog and guidance |
| `/app/templates/realtor-growth-engine`, `/app/templates/realtor-growth-engine/onboarding`, `/app/templates/realtor-growth-engine/status` | ? | P | P | P | Launch, qualification, MLS, agent and neighborhood settings and editor |
| `/app/templates/ecommerce-growth-engine` | — | — | — | — | Redirect to dashboard details |
| `/app/ecommerce-growth-engine` | ? | P | P | P | Setup, overview, catalog, orders, AI Shopping, recovery, readiness, consent and post-purchase |
| `/shopify/start` | ? | P | P | P | Merchant bootstrap, support and callbacks |
| `/post-checkout` | ? | M | M | ? | Return feedback |
| `/app/prospect-ai` | ? | P | P | P | Discover, import, qualify, outreach and activity |
| `/app/settings` | ? | P | P | P | Account, channels, team, notifications and billing |
| `/app/integrations` | ? | P | P | P | Setup and errors for channels and connected apps |
| `/app/help`, `/help` | ? | P | P | P | Feedback and state copy. Reacts directly to language changes |
| `/` | ? | P | P | P | Marketing and accessibility polish |
| `/pricing` | ? | P | P | P | Remaining hardcoded copy and checkout states |
| `/unified-inbox`, `/ai-brain`, `/ai-copilot`, `/automations`, `/chatbot-builder`, `/campaigns`, `/integrations`, `/shared-team-inbox` | ? | P | P | P | Product page CTA, supporting chrome and accessible copy |
| `/real-estate-crm`, `/solutions/ecommerce`, `/solutions/local-service-businesses`, `/solutions/marketing-agencies`, `/solutions/med-spas` | ? | P | P | P | Solution page CTA and metadata review |
| `/realtor-growth-engine`, `/prospect-ai`, `/shopify-growth-engine` | ? | P | P | P | Existing localized landing pages. Verify CTA destinations and runtime states |
| `/auth`, `/check-email`, `/verify-email`, `/team-invitation` | ? | P | P | P | Form/recovery and invitation state parity |
| `/reset-password` | ? | M | M | ? | Recovery UI |
| `/privacy-policy`, `/terms-of-use`, `/data-deletion` | ? | M | M | ? | Reviewed legal translations |
| `/privacy`, `/terms`, `/intent-ai-alternative`, `/WhachatCRM-User-Guide.html` | — | — | — | — | Legacy redirects |
| `/unsubscribe` | ? | M | M | ? | SPA email preferences |
| `/api/marketing/unsubscribe/:token` | ? | P | P | P | Existing localized success/confirmation. Failure copy remains |
| `/wati-alternative`, `/zoko-alternative`, `/manychat-alternative`, `/pabbly-alternative`, `/interakt-alternative`, `/respond-io-alternative`, `/waba360-alternative` | ? | M | M | ? | Competitor comparison pages |
| `/whatsapp-crm`, `/best-whatsapp-crm-2026`, `/crm-for-whatsapp-business` | ? | M | M | ? | Comparison and SEO copy |
| `/crm-with-mls-integration`, `/shopify-crm`, `/whatsapp-business-api`, `/ai-lead-scoring`, `/automation-templates` | ? | M | M | ? | SEO landing models |
| `/contact`, `/demo-scan` | ? | M | M | ? | Form and booking states |
| `/blog`, `/blog/:slug` | ? | M | M | ? | Blog chrome and dates. Editorial translation requires content approval |
| `/partner-program`, `/go-high-level-agencies` | ? | M | M | ? | Referral and agency marketing |
| `/partner-portal`, `/sales-portal` | ? | M | M | ? | Portal and reporting UI |
| `/partner-portal/forgot-password`, `/partner-portal/reset-password`, `/sales-portal/forgot-password`, `/sales-portal/reset-password` | ? | M | M | ? | Portal recovery UI |
| `/sales-admin` | ? | M | M | ? | Admin tools and reporting |
| `/admin/queues` | ? | ? | ? | ? | Role-gated third-party Bull Board locale support |
| `/ecommerce-growth-engine` | ? | P | P | P | Authenticated preview route. The public Shopify landing is `/shopify-growth-engine` |
| `/widget-frame/:widgetId`, `/chat/:widgetId` | ? | P | P | P | Visitor locale is independent. Wrapper and failure states pending |
| `/user-guide` | ? | M | M | ? | Guide body and navigation |
| `/agents/:slug` | ? | M | M | M | Server-rendered agent pages, directory filters and lead states |
| `/agents/:slug/:neighborhood` | ? | M | M | M | Public neighborhood guide, Sale/Rent filters, pagination and loading/errors |
| `/share/listings/:identifier` | ? | M | M | M | Public flyer chrome, share controls and formatted facts |
| Wildcard 404 | ? | M | M | ? | Localize public error page |
| Transactional emails and system notifications | ? | M | M | ? | By recipient locale, with in-memory fixtures |

The audited 92 route families gained `/team-invitation`, `/shopify-growth-engine`, and `/agents/:slug/:neighborhood`, for 95 total under the same counting method. The 18 marketing families each have Hebrew and Spanish URL variants. Including 36 variants and the two slashless locale-root redirects gives 133 patterns. The wildcard 404 and non-route delivery surfaces are excluded from those counts.

## Realtor additions since the audit

- [#339](https://github.com/yanivwpu/Lead-Flow-Manager/pull/339) introduced Neighborhood Pages and the public route under Agent Pages. The authenticated owner interface is embedded in `PublicAgentPageSettingsCard.tsx` via `NeighborhoodPageSettings.tsx`.
- [#354](https://github.com/yanivwpu/Lead-Flow-Manager/pull/354), [#355](https://github.com/yanivwpu/Lead-Flow-Manager/pull/355), [#366](https://github.com/yanivwpu/Lead-Flow-Manager/pull/366), [#367](https://github.com/yanivwpu/Lead-Flow-Manager/pull/367), and [#370](https://github.com/yanivwpu/Lead-Flow-Manager/pull/370) added and developed the neighborhood article editor and embedded images. `NeighborhoodGuideVisualEditor.tsx` is the blog-style editor here. The public marketing blog remains separate.
- [#356](https://github.com/yanivwpu/Lead-Flow-Manager/pull/356) and [#374](https://github.com/yanivwpu/Lead-Flow-Manager/pull/374) added verified Sale/Rent listings, filters and pagination in the public neighborhood page.
- [#359](https://github.com/yanivwpu/Lead-Flow-Manager/pull/359) added the saved buyer shortlist and additional results in `MatchingListingsPanel.tsx` inside Inbox/Copilot. It does not have a dedicated route. These new strings and the neighborhood editor are queued with Realtor localization.

## Foundation and next batches

| Batch | Status and evidence |
|---|---|
| PR 1. Foundation and AI language safety | Shared endpoint now resolves a validated explicit request language, then server-owned conversation language, then inbound history, then the existing English prompt default. Workspace custom instructions still apply. Account UI preferences are excluded. Synthetic tests cover Suggest/Auto routing, four locale/customer combinations, mixed and ambiguous turns, and explicit overrides. |
| PR 1. Dictionaries and shared surfaces | Added 13 Contacts/preset keys in all three dictionaries and removed the unused legacy `pricing.notices`/`pricing.faq` groups. Shared dialog, sheet, pagination, status/loading, toast, calendar controls and error recovery use the existing dictionaries. |
| PR 1. Runtime foundation | Logical alignment for shared controls, direction-aware Radix positioning, and scoped legacy RTL rules. Format dates and numbers using explicit regions, with currency and timezone supplied independently. Serial account saves, trusted explicit cache isolated from URL sync, recoverable bundle failures and preserved in-session selection on failed saves. |
| PR 1. Guardrails | `scripts/localization/check.mjs` checks dictionary and interpolation contracts, plural categories, common literal sources, and direct/constant-built key usages. Typed-map shape checks cover the homepage, marketing nav, pricing, and product/solution models. Unresolved dynamic expressions require an explicit reviewed mapping or a baseline entry. The legacy findings file records per-file counts by fingerprint. Reduce it as existing findings are fixed. |
| PR 2. Core dashboard and Inbox | Implemented shell, Inbox, Copilot and Composer copy, including channel filters and health, message actions, notes, appointments, template preview, and the buyer shortlist. Verified representative mixed-script flows in EN, HE and ES. See Batch 2 evidence below. |
| PR 3. CRM and automation | Pending. Include Contacts, tasks, calendars, builder chrome, widget settings, template UI and search. |
| PR 4. Realtor | Pending. Include the newly discovered Neighborhood Pages, visual editor, verified sale/rent filters and saved shortlist. |
| PR 5. Shopify | Pending. Verify installed merchant states in isolated fixtures. |
| PR 6. Prospect AI | Pending. Cover discovery, qualification, import and outreach editors. |
| PR 7. Settings, integrations and operations | Pending. Include no-send provider-return and role fixtures. |
| PR 8. Public, auth and transactional copy | Pending. Include legal and native-language review. |
| PR 9. Full parity | Pending. Run populated browser, SSR, accessibility and message-language regression passes. |

## Terminology glossary

Product names such as WhachatCRM, AI Brain, AI Copilot, Prospect AI, and Realtor® Growth Engine retain their brand spelling. Use the glossary in interface copy. Customer content and publisher-authored names keep their original text.

| English | Hebrew | Spanish (Latin America) |
|---|---|---|
| Unified Inbox | תיבת שיחות מאוחדת | Bandeja de entrada unificada |
| Contacts | אנשי קשר | Contactos |
| Leads | לידים | Leads |
| Prospects | לקוחות פוטנציאליים | Prospectos |
| Follow-ups | מעקבים | Seguimientos |
| Workflows | תהליכי עבודה | Flujos de trabajo |
| Automations | אוטומציות | Automatizaciones |
| Campaigns | קמפיינים | Campañas |
| Qualification | סינון והתאמה | Calificación |
| Activation | הפעלה | Activación |
| Checkout recovery | שחזור רכישות שלא הושלמו | Recuperación de compras sin finalizar |
| Property matching | התאמת נכסים | Búsqueda de propiedades compatibles |
| Growth Engines | מנועי צמיחה | Motores de crecimiento |

The short Hebrew shell label is **תיבת שיחות**, appropriate for an omnichannel surface. Native review should confirm the distinction between Leads and Prospects, whether Qualification needs a domain-specific term, and checkout versus cart recovery wording.

## Verification and limits

- Chromium exercised all 13 Contacts and preset keys in EN, HE and ES, including filtered empty states, selection, add-contact dialog, preview, and a mocked failed campaign save. Desktop and mobile runs used approximately 1366 px and 390 px.
- Shared component fixtures verified dialog centering, dropdown/select/popover bounds and direction, calendar navigation labels, default sheet edge, and toast placement in all three languages at both widths. Account fixtures covered selected-language restoration, a failed bundle, failed save and retry, marketing URL cache isolation, switching Inbox workspaces, and signing out and in to a different account.
- The selected test run passed 102 checks. The build, localization checker, checker syntax validation and `git diff --check` passed. TypeScript reports the same 97 baseline diagnostics by file and diagnostic code.
- Live provider delivery, authenticated production SSR, active Shopify or MLS, and populated customer reply dispatch remain outside fixture coverage.
- The flyer title assertion reported in Phase 1 passed on both `94f243d1` and this branch using a loopback-only initialization placeholder. No flyer or SEO logic was changed here.
- Keep customer language fixtures synthetic and no-send. Calendar selection, schedules, business hours, currency codes, customer data, and template identifiers must retain their existing semantics.

## Batch 2 evidence

- Batch 1 merged in [#377](https://github.com/yanivwpu/Lead-Flow-Manager/pull/377) at `0614cc0a`. Railway production deployed that revision successfully. The subsequent production revision `fccecc8a` contains the merge and returned successful HTTP responses in Railway logs.
- Batch 2 is based on `fccecc8a` on [localization/core-inbox](https://github.com/yanivwpu/Lead-Flow-Manager/compare/main...localization/core-inbox). The baseline declined from **7,059 → 6,607 findings**, a reduction of **452**. The baseline diff adds zero fingerprints and raises no counts. The two country-field labels introduced on main by #380 were localized so the baseline could stay shrink-only. The ISO example remains a literal code.
- Copilot action display is localized separately from the labels used by click behavior. Composer request payloads, existing Auto dispatch gates, and the reply-language resolver are preserved. Message content uses its own direction. Hebrew mirrors the Inbox columns and message lanes while English and Spanish maintain LTR.
- Synthetic Chromium at 1366 and 390 px exercised empty Inbox, channel filter, a populated mixed-script contact, composer placeholder, conversation actions, and the direction and bounds of inbound/outbound bubbles in all three languages. Targeted tests cover Inbox routing, draft and Auto isolation, permissions, reply-language policy, templates, and navigation. The new locale test covers dashboard, composer and Copilot labels.
- This batch retains the geometry and colors already on main. [#338](https://github.com/yanivwpu/Lead-Flow-Manager/pull/338) is the separate Inbox styling change. A test merge found overlap in the Copilot header, suggestion badge, quick actions, and details panel. At integration, retain the styling classes from #338 and the localized labels and plural handling from this batch.
- Provider-supplied diagnostics, customer-authored text and generated replies keep their source language. Some uncommon provider/CRM payload states and residual legacy findings remain, so the Inbox route still carries partial coverage pending those checks. Real customer delivery and provider mutations were outside the synthetic test scope.
