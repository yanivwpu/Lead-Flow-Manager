# Shopify merchant education and welcome experience

Based on merged #304 (c6e838b5); #301 remains untouched. No merge or deployment
is part of this change.

## Reused behavior

Reviewed the current engine dashboard, setup/details, AI Shopping, Cart Recovery,
Post-Purchase, Settings, Prospect AI guide, Shopify bootstrap/OAuth navigation and
merchant release notes. Reused the existing dashboard view route, i18next locale
bundles, shared Dialog, account-scoped queries, Shopify connection/activation
reads, approved-template selection, consent/theme setup and shopping settings API.
Prior UX work (#268, #279, #283, #284, #289–291, #294, #296–297) remains in place.

## Merchant experience

- **How It Works / User Guide**: `/app/ecommerce-growth-engine?view=guide`.
  All eight requested topics, eight getting-started steps and ten FAQs are included.
  Available from the dashboard header on every feature screen, setup/details and
  the existing engine sidebar. Direct authenticated document loads also work before
  engine activation; this exception grants no operational API access.
- All new guide, welcome, shopping feedback and changed status/consent copy is in
  English, Spanish and Hebrew. The guide/welcome follow the existing language
  preference and RTL direction; brand names/commands use bidi isolation. Existing
  automatic template submission still creates missing **English** messages; the
  guide makes clear that interface language does not translate customer templates.
- Checkout assistance is verified as gated off (`CHECKOUT_ROLLOUT_APPROVED=false`).
  It shows **Not available yet**, with the actual prerequisite explanation, instead
  of an unusable checkbox or implementation details. No release date is promised.
- AI Shopping leads with its benefit, translates channel labels, shows loading,
  errors, saving and saved feedback, and reloads committed preferences from the
  existing API. Editing is disabled while saving to avoid losing a later edit.
- Consent explanations and blockers use merchant language. Template activation
  distinguishes ready to activate from needs setup and explains missing prerequisites.
  Meta acceptance remains distinct from the existing delivered/read aggregate.
- Eligible connected merchants see the existing engine navigation item before
  activation; it opens setup. Operational views keep their original boundaries.

## Welcome lifecycle

The existing `shopify_installed=1` bootstrap signal records a short-lived,
user-scoped session hint after login. Only after the authenticated app renders
and existing APIs confirm a connected store with an unactivated engine does the
welcome open. OAuth, billing/plan selection and sync continue through existing flows.
Already activated engines, ordinary visits, failed status reads and other workspaces
are excluded. No activation or settings mutation occurs from the welcome.

Explore opens existing setup; Learn opens the guide; Maybe later, close, Escape
and outside dismissal save the same browser-local, user/store-scoped completion
state. Dismissal persists on revisit/reload for that store’s initial onboarding;
a fresh hint does not re-prompt a merchant who already dismissed it. Browser state
is optional; inaccessible session storage skips the welcome. This is presentation
state, not a cross-device onboarding record or a sending authorization.

## Focused validation

- 34 focused checks pass: guide rendered content and language switching, complete
  locale shape, RTL/bidi markup, welcome eligibility/persistence/workspace isolation,
  template UI, dashboard wiring, navigation and onboarding document access.
- Chromium component fixture with mocked reads/settings persistence: EN/ES/HE,
  1366×768 desktop and 390×844 mobile; guide language switching and Hebrew overflow;
  welcome dismissal/reload, completed-engine suppression, Explore/Learn destinations;
  zero welcome writes; AI Shopping saved feedback and settings after reload.
  This is UI validation, not a real merchant OAuth/provider journey.
- Frontend production build passes. TypeScript: main 97, candidate 97, identical
  diagnostic locations/codes; none in changed UI files. Existing unrelated type
  errors remain. No new test framework or infrastructure.
- Reused previous automation, consent enforcement and messaging test evidence;
  no live sends, Shopify changes, environment changes, schema changes or production
  credentials involved. No historical PR merged.

Recommendation: review and approve the focused PR before merge; main deploys
on merge. Real merchant usability feedback is the next validation stage.
