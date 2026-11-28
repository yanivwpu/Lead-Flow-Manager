# WhachatCRM localization completion tracker

Phase 1 inspected `48f802de`. Foundation work starts at `94f243d1` on `localization/foundation-ai-language`. The audit checkout was 81 commits behind this baseline. [Foundation change set](https://github.com/yanivwpu/Lead-Flow-Manager/compare/main...localization/foundation-ai-language). The open Inbox styling PR [#338](https://github.com/yanivwpu/Lead-Flow-Manager/pull/338) remains an independent branch.

## Coverage

These are route families. A comma-separated row shares the same recorded status, except where noted. **P** means partial, **M** missing for the substantive route body, **?** unverified, and **—** a redirect. English is the source language and has no whole-route completion certification. RTL **P** means some direction support is present. A shared change can improve several routes before their page-body status changes.

| Route | EN | HE | ES | RTL | Remaining work |
|---|---|---|---|---|---|
| `/app/inbox/:contactId?` | ? | P | P | P | Rare provider and CRM payload states remain unverified. Representative Inbox, Copilot and Composer flows were checked in all three languages. |
| `/app/chats`, `/app/chats/:id` | — | — | — | — | Inbox redirects |
| `/app/contacts` | P | P | P | P | Batch 3A covers listing, creation, filters, bulk deletion, notes, and snapshot states. Rare error and provider payloads remain unverified. |
| `/app/contacts/:id` | P | P | P | P | Batch 3A covers profile, editing, notes, appointments, and purchase-history chrome. Live store and uncommon permissions states remain unverified. |
| `/app/followups` | P | P | P | P | Batch 3A covers standard tasks, reminders, calendar, and deals. Shopify order-support tasks remain in the Shopify batch. |
| `/app/search` | P | P | P | P | Search copy and result layout verified with synthetic data at two widths. Error and provider-specific payloads remain unverified. |
| `/app/workflows` | P | P | P | P | Batch 3B covers workflow and sequence editors, trigger and action catalogs, and execution-history states. Live execution and uncommon provider failures remain unverified. |
| `/app/chatbot` | P | P | P | P | Batch 3B covers builder controls, node and form editors, branching, and publishing feedback. Live sends and integration-specific states remain unverified. |
| `/app/templates` | P | P | P | P | Batch 3C covers preset filters, Meta library and previews, sync, and re-engagement/send controls. Live provider behavior and uncommon send errors remain unverified. |
| `/app/campaigns/:id?` | P | P | P | P | Batch 3C covers the dashboard, draft editor, reporting, and enrollment controls. Live scheduling and recipient actions remain unverified. |
| `/app/widget` | P | P | P | P | Batch 3C covers widget settings, branding, page rules, preview, validation, and install. External embeds and uncommon upload failures remain unverified. |
| `/app/website-widget` | — | — | — | — | Redirect to widget settings |
| `/app/ai-brain` | P | P | P | P | Batch 3D covers modes, personas, knowledge, qualification, marketing materials and preview labels. Provider diagnostics and uncommon error states remain. |
| `/app/sales-catalog` | P | P | P | P | Batch 3D covers manual offers, pricing display, payment links, guidance and archive feedback. Shopify merchant functionality remains in Batch 5. |
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
| PR 3. CRM, automation and AI tools | Integrated. See Batches 3A–3E below for route coverage, verification and open items. |
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
- Batch 2 is based on `fccecc8a` on [localization/core-inbox](https://github.com/yanivwpu/Lead-Flow-Manager/compare/main...localization/core-inbox). The baseline declined from **7,059 → 6,606 findings**, a reduction of **453**. The baseline diff adds zero fingerprints and raises no counts. The two country-field labels introduced on main by #380 were localized so the baseline could stay shrink-only. The ISO example remains a literal code.
- Copilot action display is localized separately from the labels used by click behavior. Composer request payloads, existing Auto dispatch gates, and the reply-language resolver are preserved. Message content uses its own direction. Hebrew mirrors the Inbox columns and message lanes while English and Spanish maintain LTR.
- Synthetic Chromium at 1366 and 390 px exercised empty Inbox, channel filter, a populated mixed-script contact, composer placeholder, Manual mode, desktop Copilot, mobile contact details, conversation actions, and the direction and bounds of inbound/outbound bubbles in all three languages. Targeted tests cover Inbox routing, draft and Auto isolation, permissions, reply-language policy, templates, and navigation. The new locale test covers dashboard, composer and Copilot labels.
- This batch retains the geometry and colors already on main. [#338](https://github.com/yanivwpu/Lead-Flow-Manager/pull/338) is the separate Inbox styling change. A test merge found overlap in the Copilot header, suggestion badge, quick actions, and details panel. At integration, retain the styling classes from #338 and the localized labels and plural handling from this batch.
- Provider-supplied diagnostics, customer-authored text and generated replies keep their source language. Some uncommon provider/CRM payload states and residual legacy findings remain, so the Inbox route still carries partial coverage pending those checks. Real customer delivery and provider mutations were outside the synthetic test scope.

## Batch 3 progress

- Batch 2 merged in [#383](https://github.com/yanivwpu/Lead-Flow-Manager/pull/383) at `0bf176ce`. Railway production reported a successful deployment of that commit. Batch 3 started there. The next main revision, `105a7f7e` ([#386](https://github.com/yanivwpu/Lead-Flow-Manager/pull/386)), changes the Neighborhood Pages editor and has no overlapping files with this change. The open Inbox styling work in #338 remains separate.
- The localization baseline started at **6,606 findings across 184 files**. This pass reduces it without adding fingerprints or increasing any existing counts. The localization workflow runs the new CRM control and contact-profile tests alongside the established safeguards.
- Search includes translated shortcuts, search feedback and result counts, plus locale-aware timestamps. Synthetic Chromium at 1366 px and 390 px verified the displayed shortcuts, identical API query tokens, preserved Inbox links, mixed-script snippets, and literal bracket matching in EN, HE and ES.
- Contacts and Contact Details include translated profile, actions, deletion warnings, notes and activity states. The profile uses locale-aware dates, logical layout and left-to-right contact identifiers. An all-language render fixture verifies translated text and preserved contact identity, note content and conversation navigation. Follow-ups includes task view and reminder controls.
- Workflows and Chatbot Builder include translated trigger and configuration controls and delay options. Workflow hours and days, chatbot delay units and widget placement options retain their existing stored values. No saved workflow, chatbot text, campaign message, provider template, or catalog offer content is translated by the interface.
- Templates includes library and sync controls. Campaigns includes table headings, common statuses, counts and row actions. Widget settings includes launcher and visual controls. AI Brain includes business-profile labels and workspace states. Sales Catalog includes the manual offer editor and billing/availability controls. Shopify merchant-specific UI remains queued for Batch 5.
- This pass leaves the affected routes partial. The CRM follow-on is documented in Batch 3A below. Remaining non-CRM work includes workflow history and builder configuration, chatbot node catalogs and validation, template send and resync dialogs, campaign editor and enrollment, widget page rules and installation, AI modes and qualification/testing, and the remaining catalog dialogs and product guidance. Browser verification for these routes and native-language review remain open.

## Batch 3A CRM verification

- Continued [draft PR #387](https://github.com/yanivwpu/Lead-Flow-Manager/pull/387) from `e8371666`. The legacy localization count declined from **6,287 to 6,228** across 182 and 180 files respectively. It gained no fingerprints or count increases.
- Localized Contacts filters and sorting, creation and validation, selected-contact actions, deletion warnings and feedback, and notes and AI snapshot states. Contact Details covers editing, pipeline stages, appointment status, notes, activity history, and purchase-history chrome.
- Localized task counts, views, replies, completion and error feedback, the scheduling dialog, calendar events, and pipeline stages. Built-in tags, stages, and statuses use localized display labels. Custom tags and stages, contact data, authored content, provider-supplied text and unset values keep their existing semantics.
- Chromium ran the same synthetic CRM flows in EN, HE and ES at 1366 and 390 px. It checked translated filters and canonical URL values, the bulk-delete confirmation and contact IDs, creation and validation, editing with canonical stage and date, notes, reminder scheduling, task completion, calendar navigation, and desktop deal moves. All six locale and viewport combinations passed, including Hebrew RTL and Spanish LTR. No fixture used live contacts or providers.
- The focused automated run passed 48 tests. Unverified cases include uncommon permission and provider responses, live purchase and booking feeds, and Shopify order-support tasks deferred to the Shopify batch.

## Batch 3B Automation Builder and Chatbot Builder

- Continued [draft PR #387](https://github.com/yanivwpu/Lead-Flow-Manager/pull/387). Batch 3A's e-commerce foundation job failed because a source assertion expected a hardcoded Needs Reply label. Commit `d15adf3d` updated the assertion to verify both the canonical filter and the English translation. Every check on that commit passed.
- Reduced the legacy localization baseline from **6,228 to 5,947** with zero new or increased fingerprints. Added EN, HE and ES copy for the workflow and sequence editors, trigger and action catalogs, condition and timing controls, permission and validation states, and read-only execution history fed by the existing owner-checked endpoint.
- Localized the chatbot navigation, message and question editors, delay controls, quick replies and next-step controls, action selection, form editor and preview controls, and save and activation feedback. Catalog labels translate on display. Persisted defaults, trigger identifiers, authored messages, localized variants, and connections retain their original values.
- The focused automated runs passed 35 tests. Synthetic Chromium covered the workflow editor and chatbot editor at 1366 and 390 px in all three languages. Equivalent configurations produced identical values. The fixtures intercepted every write and never executed a live workflow or sent a message.
- Live runs, provider-specific errors, and uncommon legacy node and integration states remain unverified. Platform-native controls and provider or user-authored data retain their original source. The later Batch 3 modules remain separate.

## Batch 3C templates, campaigns, and widget settings

- Continued [draft PR #387](https://github.com/yanivwpu/Lead-Flow-Manager/pull/387) from `06ab97da`. The legacy count declined from **5,947 to 5,621** with no new fingerprints or increased counts.
- Localized the approved library and its statuses and categories, sync and re-engagement feedback, previews, recipient and variable controls, and media and carousel requirements. Preset language filters start at All languages and stay independent of dashboard language. Meta continues to own approved template creation and approval.
- Localized the campaign dashboard and editor, statuses, schedules, enrollment controls, reporting, previews, and confirmation dialogs. Template content, recipient language, delay values, and audience and activation gates retain their existing behavior.
- Localized widget branding, settings, page-rule controls and validation, save feedback, preview controls, and installation and embed instructions. Visitor strings, locale precedence, aliases, matching modes, and physical positions keep their stored values.
- All 48 targeted automated tests passed. Six synthetic Chromium runs at 1366 and 390 px verified EN, Hebrew RTL and Spanish LTR. The runs exercised a Meta template preview, preset draft creation, campaign editing and a widget-position save. Switching languages mid-edit produced no writes. Equivalent actions produced the same campaign and widget payloads. The Meta body, template language and saved widget visitor variants remained intact.
- Live provider synchronization and sends, campaign execution and recipient enrollment, production embeds and clipboard integration on third-party sites remain unverified. Provider-supplied diagnostic text and authored values retain their source language. Later batches remain separate.

## Batch 3D AI Brain and manual Sales Catalog

- Continued [draft PR #387](https://github.com/yanivwpu/Lead-Flow-Manager/pull/387) from `62d1d66c`. The legacy count declined from **5,621 to 5,357** with no new fingerprints or increased counts.
- AI Brain covers reply modes and personas, tier and plan copy, business-profile controls, knowledge sources and review, live data fallback labels, qualification question controls, marketing materials and test-chat display labels. Dashboard translations leave saved instructions, question text, keywords and reply-language policy independent of the dashboard locale.
- Manual Sales Catalog covers offer statuses and cadence labels, forms and guidance, archive confirmation, payment link instructions, and load and save feedback. Counts use regional formatting. Authored price strings, URLs, offer identifiers and cadence values are preserved.
- Focused regressions covered RTL/LTR layout, reply-language isolation and catalog tenant and record behavior. The broader knowledge scan suite reached a pricing-page fixture assertion unrelated to the changed routes. All 26 focused automated tests passed. Six synthetic Chromium runs at 375 and 1280 px passed in EN, Hebrew RTL and Spanish LTR. Language switches produced no writes. Explicit persona edits produced the same settings payload, and offer saves preserved the same ID, price and cadence in all three locales.
- Provider-supplied diagnostics and uncommon subscription or upload failures remain outstanding. Knowledge freshness, review counts, publish feedback and source-removal summaries use localized copy. Live AI dispatch, customer messaging, checkout and production catalog writes were outside verification.
- Batch 3E handoff should use the accumulated draft PR, the shrink-only baseline, and the verified synthetic fixtures to review integration across Batch 3. Shopify merchant functionality is tracked for Batch 5.

## Batch 3E integration

- Integrated main `0f72353a` into [PR #387](https://github.com/yanivwpu/Lead-Flow-Manager/pull/387). Follow-ups retains the redesigned task list, calendar, draggable desktop pipeline, mobile stage control, workspace column labels and ordering, reply actions, lead qualification and passive-email exclusion. Built-in stage, channel and tag labels are localized. Workspace labels and canonical values stay as saved.
- Integrated coverage includes Search, Contacts and contact details, Follow-ups and the pipeline, Workflows, Chatbot Builder, Templates, Campaigns, Website Widget, AI Brain and the manual Sales Catalog. The route matrix records remaining UI gaps. Provider diagnostics, uncommon provider failures, live automation and campaign execution, customer sends, and external widget embeds remain outside synthetic verification. Shopify-specific localization remains in Batch 5.
- Legacy findings declined from **5,357 to 5,353**. The baseline has no new fingerprints or increased counts. The 42 focused integration tests and the localization guard passed, covering both parents' Follow-ups assertions and the existing CRM, builder, outreach and reply-language contracts.
- Six synthetic Chromium runs passed at 390 and 1366 px in English, Hebrew RTL and Spanish LTR. Desktop drag events and the mobile stage selector sent the same canonical stage. Calendar navigation, task completion and reminder saves preserved the scheduled ISO timestamp and authored title.
- The pricing assertion for `Realtor Growth Engine: $199 one-time` also fails in an isolated checkout of main `0f72353a`, as it did at the Batch 3C starting commit. Pricing and knowledge behavior and the assertion remain unchanged.
- Required GitHub workflows and CodeQL results for the integrated branch are tracked on the [PR checks page](https://github.com/yanivwpu/Lead-Flow-Manager/pull/387/checks).

## Unified Inbox production follow-up

- Added a focused EN, HE and ES correction for lead stage and conversation status, system tag and activity labels, email source labels, composer keyboard instructions and regional time display. Canonical status, stage and tag values, authored labels, and scheduling payloads stay independent of dashboard language.
- The former modal Select applied a document scroll lock, scrollbar compensation and selected-option scrolling on open. A scrolled synthetic desktop fixture reproduced a 60 px composer and panel shift when the document scroll offset reset to zero. Both controls now use anchored non-modal radio menus with keyboard dismissal and normal RTL placement.
- Conversation rows retain the English layout dimensions. Logical spacing mirrors the avatar group, badges and timestamps in Hebrew. Email identities keep LTR text and truncate at the address end.
- The localization baseline declined from **5,353 to 5,349** with no new fingerprints. Verification uses synthetic contacts and intercepted mutations. Live messaging and native-device viewport behavior remain outside this verification.

## Batch 4A Realtor Growth Engine

- Started from main `6722997d` after Batch 3 and the Inbox RTL correction merged. The localization baseline fell from **5,349 to 4,919** with no new or increased fingerprints.
- Localized the RGE detail, guided onboarding and status/dashboard surfaces, W1–W8 descriptions and configuration, agent settings, inventory connection controls, entitlement copy, feedback, and validation. EN, HE and ES use logical spacing and native pickers for the RGE wizard and workflow options. The walkthrough retains its existing localized samples and canonical route IDs.
- The setup now explains that Agent Pages, Neighborhood Pages, custom map areas, publishing and lead capture are available without MLS. Eligible MLS inventory, search and matching use a connected MLS feed. The existing Pro gate, provider checks, public page values and customer-facing workflow defaults remain in effect.
- Six synthetic Chromium runs at 390 and 1366 px checked the installed dashboard, localized W2 configuration, authored question preservation, equal preference payloads, onboarding progress, Pro-restricted detail, and locale switching without writes. Connected and non-MLS status fixtures used intercepted API data.
- The concierge fallback currently lists only US time zones. Provider-supplied diagnostics, some illustrative labels and secondary inventory publication feedback remain in the source language. Live MLS sync, concierge booking, active automation and public publishing were outside synthetic verification.
- Batch 4B handoff covers Neighborhood Pages and the visual editor, including publishing, SEO, maps and imagery. Reconcile with concurrent Neighborhood work in #378 and #392 before editing those surfaces. Keep public URLs, authored copy and saved geography intact.
- The 27 focused checks passed, including Pro entitlement, guided-launch readiness, walkthrough playback, inventory eligibility and AI reply-language isolation. The local production build passed. The draft's [GitHub checks](https://github.com/yanivwpu/Lead-Flow-Manager/pull/403/checks) track localization, CodeQL and the TypeScript comparison.
- Railway production logs show successful HTTP traffic for the Batch 3 merge deployment, which is recorded as removed after replacement. The Inbox correction merge deployment reached SUCCESS.

## Batch 4B Agent Pages and Neighborhood Pages

- Integrated main `8f35fe3b`, including the authentication and multilingual pipeline changes in #405 and the cross-origin login fix in #406. Railway reports the newer revision live. #378 and #392 are open drafts and overlap the neighborhood management and publishing files. Batch 4B retains the editor and publishing rules on main.
- Localized Neighborhood Page management, draft recovery, preview and publishing, editor formatting and image controls, cover photo and media library, map lookup feedback, and validation in EN, HE and ES. Completed Agent Page profile and URL validation, market-area fields, embed copy feedback, listing publication status, provider connection and background sync feedback, and selected illustrative labels.
- The existing international publication path still supports country codes and custom boundaries with no MLS inventory. Geocoding and listing eligibility keep the existing provider and geographic rules. Public URLs, metadata and authored copy are independent of dashboard localization.
- The concierge fallback exposes IANA zones supported by the browser and retains the existing value if it is missing from the available options. The submitted timezone and existing appointment data retain their original semantics.
- The legacy baseline moved from **4,919 to 4,800** with zero new or increased fingerprints. Focused tests passed, and Chromium verified the editor, image insertion and resizing, and international map lookup in all three languages. The existing synthetic publishing and branding tests cover draft mutations, desktop and mobile layouts and preservation of map state.
- Public-page renderer labels continue to follow the existing public renderer, which has no independent locale preference for all listing filters. Provider-supplied diagnostic text outside the Agent and Neighborhood Page operations, live MLS sync, live geocoding and concierge booking remain outside synthetic verification. No production records were changed.

## Batch 4C Buyer qualification, property matching and MLS

- Synchronized with main `8f35fe3b`, including #405 and #406. GitHub showed no additional merged logout-language PR. #378 and #392 remain open and the public page renderers, visual editor and publishing behavior are untouched by this batch.
- Localized buyer preference chips and manual-form feedback, matching badges and known reasons, saved-property states, authenticated listing detail and share controls, and MLS connection and publication feedback. Display prices use the stored listing currency where supplied and the existing USD default for older match responses. Provider errors show known localized categories and never echo raw provider text in the updated UI.
- The baseline fell from **4,800 to 4,754**. A Chromium fixture across EN, HE and ES covers connected and no-feed states, redacts raw provider errors, and compares buyer PATCH and shortlist POST payloads, including canonical criteria, IDs, scores and reasons. Language switching during the form leaves the payload and write count unchanged.
- Unknown provider debugging and matching explanations outside the known catalog, and operational verification with a live MLS or delivery provider, remain outside this fixture. Public listing filters and property flyers remain assigned to Batch 4D.

## Batch 4D Public real estate pages and property flyers

- Integrated current main `8f35fe3b` and retained #405/#406. No separate merged logout-language correction was found. #378 and #392 remain open and the existing map, visual editor, URLs and publication gates remain in place.
- Agent Pages and Neighborhood Pages use separately saved EN, HE or ES public-language settings. The additive migration defaults both to English, including existing rows and older clients. Public shares and authenticated flyer previews use the listing owner's explicit Agent Page language, with English for unavailable or unowned context. Visitor headers and dashboard languages do not affect public locale resolution.
- Localized public navigation, search and filters, inventory cards and notices, inquiry forms, share actions, flyer controls and generated metadata. Stored prices, currencies and square-foot dimensions stay canonical. Authored articles, MLS descriptions and branding remain intact. Canonicals, robots, sitemap eligibility and existing property share addresses are retained. No alternate indexed URLs are generated.
- The client localization baseline remains **4,754**. The translated SSR copy is maintained in a typed shared dictionary outside the client finding count.
- Synthetic browser tests cover first-render direction and canonical filter and inquiry payloads in three languages. Public-share row mapping passed against an isolated PostgreSQL 16 container. Live map tiles, inquiry delivery and print output on physical devices were outside verification.
