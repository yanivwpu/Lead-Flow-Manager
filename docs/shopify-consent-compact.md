# Compact WhatsApp updates section

Audited merged PR #296 (`46f48fdc`) and its accepted rendering, signed-proxy, password-session and opt-in evidence. This change only refines storefront appearance, preference review and placement. No live setup, real opt-in or customer messaging test was repeated.

The theme-adaptive card shows “Stay updated on WhatsApp.”, four independent unchecked preferences when all four purposes are available, one green review action, and expandable per-purpose notices and exact messages. Only the merchant's capture-ready purposes appear. Review reveals each selected purpose's existing sanitized WhatsApp link. Selection is temporary and resets on reload; selection, review and link opening never create consent. Each purpose still requires its own exact message and the existing verified customer identity. No combined message, preference save endpoint, tracking, new storage or outbound send is added. STOP, authorization, signed verification and delivery gates are unchanged.

New embeds default above the footer; themes without a footer fall back to the end of main content. In the existing app embed's Shopify theme-editor placement setting, merchants can select above-footer, end-of-main-content or original theme embed placement without code. Persisted `content_end` and `original` merchant choices remain supported. The section stays in normal document flow.

EN/ES/HE, Hebrew RTL, native checkboxes and disclosures, visible keyboard focus and 44px targets support mobile and desktop. See [desktop preview](assets/shopify-consent-compact-desktop.png) and [Hebrew mobile preview](assets/shopify-consent-compact-rtl.png), both synthetic storefront fixtures.

Readable source lives in `scripts/shopify-consent/consent.js`. Run `node scripts/build-shopify-consent.mjs` to regenerate the minified extension asset. CI checks reproducibility and Shopify's asset budget.

Validation: focused UI tests, real Chromium regression fixture (including selection independence, exact link/message preservation, no writes/sends, reload reset, compact dimensions and placement), production build, native Shopify Theme Check, existing PR CI and security-extended CodeQL. CI retains CodeQL SARIF as an artifact rather than uploading it to default code scanning.

This is a review-only code change. No merge, deployment, Shopify app version staging/release or messaging activation is authorized or performed. Delivering the extension later requires the separate reviewed Shopify app version process documented in `shopify-consent-rendering-295.md`; rollback restores the previously approved extension version. Controlled automation activation and Shopify Growth Engine rollout remain the next separate priority.
