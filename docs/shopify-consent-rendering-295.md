# Storefront consent rendering (#295)

## Evidence and diagnosis

Base: `a8a2446fb2566668238c1358f5d57fe119eb963d` (merged #294). Reuse the [accepted evidence in #295](https://github.com/yanivwpu/Lead-Flow-Manager/issues/295): the published `test-data` theme has the correct current embed UUID enabled, authenticated verification says Live on store, and direct signed app-proxy navigation after storefront password access returns all four selected notices (order, shipping, cancellation and checkout reminders). Raw unstyled proxy HTML is expected. No install, permission approval, theme setup, token operation, real opt-in, or customer send was repeated.

Those observations establish extension activation and proxy delivery. They do not establish that the page loaded its JavaScript, found the host container, fetched through the password session or inserted the response. This environment offers no authenticated desktop-control tool or ready live Shopify credential; the exact production page/network trace is not claimed. The following renderer failures are directly reproduced with the accepted base asset and a real Chromium storefront fixture:

| Scenario | Accepted-base asset | Fixed asset |
| --- | --- | --- |
| Password-gated proxy, browser already has the storefront session | `credentials: omit` excludes the session cookie, redirect is rejected, empty host is incorrectly marked loaded | Same-origin session reaches Shopify; signed proxy response renders on the first attempt |
| First notice GET returns 503 | Host is marked loaded before success; repeated section events cannot recover; one request, no notices | No early loaded marker; second bounded GET succeeds |
| Host inserted after the initial scan | No host observed, no request, no notices | Mutation observation discovers the host and renders once |

The password/session failure explains how direct proxy navigation can work while the embed fetch fails: navigation and the old fetch have different cookie behavior. It is a confirmed failure for a password-gated proxy, not an unsupported assertion that the unobserved live page took that exact branch. Permanent premature-loaded state is a confirmed independent defect. The fixture also distinguishes CSP denial, missing assets, password HTML and HTTP denial without treating any of them as notice success.

## Rendering and customer design

- Only a successfully parsed, allowlist-rebuilt section with a safe wa.me link gets `data-loaded=true`. There are at most three notice GET attempts per mounted host, with 500ms/1500ms backoff and an eight-second request timeout. Network failures and 5xx are retryable; 204, denial/throttling, password/unexpected HTML, oversized responses and unsafe-link-only content are terminal. No consent or messaging request is made.
- One active host renders at a time. Duplicate asset loads, repeated Shopify section events and duplicate hosts do not duplicate notices/requests. A sanitized detached DOM snapshot restores content cleared by theme re-rendering without another provider request. Removed hosts cancel pending work; late hosts and landmarks are discovered.
- Default placement is inline at the end of `main`, `[role=main]` or `#MainContent`; vintage themes without those landmarks place notices before the footer. This also moves the host out of a hidden injection wrapper. A localized merchant setting retains the original theme embed position when desired. No popup, fixed overlay, automatic theme save or storefront code surgery is used.
- Theme typography/colors are inherited. Responsive purpose cards, visible green WhatsApp choices, 44px targets, keyboard focus, clear optional-consent/STOP copy and expandable exact-message previews support EN/ES/HE and RTL. Every selected purpose retains its existing mandatory notice and exact English WhatsApp command. Opening a link does not subscribe a customer.
- The signed proxy's supported HTML tags/structure remain compatible with older released assets. The new extension builds its presentation from sanitized legacy-compatible HTML locally. Backend changes only shorten localized introductory/action copy. A backend deployment alone does not deliver the new renderer, styles or placement setting.

Fixture previews (no production/customer data):

[Desktop cards](assets/shopify-consent-desktop.png) · [Hebrew mobile RTL](assets/shopify-consent-rtl-mobile.png)

## Privacy, identity and delivery invariants

The sole browser fetch destination remains the same-origin `/apps/whachat-consent`, with redirects rejected and no customer/account/phone selectors. `credentials: same-origin` preserves Shopify's own storefront/password session; the browser never calls the application origin directly. The signed shop remains the backend tenant selector. Cookies and Shopify's optional signed customer field do not establish consent identity. The fixture forwarder signs the real application request and asserts it forwards no browser cookies.

Raw HMAC verification, timestamp/duplicate-query checks, tenant/current-installation/capture/privacy gates and HTML/link escaping are unchanged. The original element/link allowlist is retained; new disclosure/header elements are created locally after sanitization, never copied as executable provider markup. No raw response is inserted with innerHTML. No local storage, tracking call, new customer record or diagnostic payload retention is added. Signed Meta customer binding, exact-purpose consent, replay ordering, STOP, suppression and every independent messaging gate remain authoritative. All delivery stays OFF.

## Safe read-only page diagnostic

The new released asset exposes `window.WhachatConsentDiagnostics()`, returning only:

- `scriptLoaded`, container count, fixed `state`/`reason`, bounded attempt count and `rendered` boolean.
- No HTML, notice text, URLs, cookie values, shop/customer identifiers or credentials.

`ready/notices_rendered` means safe DOM insertion, not customer consent or messaging activation. `missing_container` distinguishes absent/late Liquid host; an undefined function distinguishes an absent/blocked/old asset. `retrying/failed` with `fetch_failed` can represent network, redirect, timeout or CSP failure; it does not invent a more specific cause than the browser exposes. `empty/no_notices` and terminal blocked-response codes remain distinct. Matching data-state/reason attributes are available on the host. Nothing is logged or posted automatically.

## Required separate Shopify version and owner/merchant release

**No app version was staged or released by this task. No merge or deployment occurred.** Liquid, JS, CSS and schema locale changes require a separate Shopify app-version operation. Railway/backend builds cannot update Shopify CDN extension assets.

1. Review this PR, CI, CodeQL and the fixture previews. Preserve the current verified serialized extension UUID, production client ID, existing app-proxy path, scopes and webhooks. Do not substitute the historical UID from old fixtures or create a duplicate extension.
2. After a separately approved merge, reuse [the existing manual stage-only workflow](../.github/workflows/shopify-app-stage-unreleased.yml). It runs only on main and verifies production WhachatCRM/client `e4585d4da1434c9e5649a2269e716076`, then invokes `shopify app deploy --config whachatcrm --no-release`. Do not run it as part of this PR. Review the entire staged version (extension assets, proxy, current topics, privacy handlers and unchanged scopes); its generated version label is not a release approval.
3. Review the staged extension/theme preview with the merchant and obtain explicit owner/merchant approval before release through Shopify's version controls. Release is a separate authorized action. Keep the existing merchant-controlled embed enable/save behavior; no reinstall, scope re-approval, template setup or consent test replay is needed for these asset changes. The placement default is main-content end; a merchant who changes the optional placement setting saves that choice themselves in Shopify.
4. Record the version that was actually released using the existing release-record process. Do not change the verified current block UUID unless separately verified evidence establishes a genuine identity change. Any backend copy deployment is a separate authorized operation and remains compatible with old/new assets.
5. One focused post-release page check may confirm the new asset is present, the safe diagnostic is ready, the four saved purposes render near the main-content end, and mobile/RTL/focus/STOP remain visible. On a password store, use its already authorized storefront session. Do not click an opt-in link, send a message or repeat accepted opt-in/permission/setup tests. If the asset is missing/CSP blocked, record that narrow status instead of claiming success or bypassing policy.

Rollback requires a separately approved previous Shopify app-version release or a merchant-controlled disable/save. Preserve all consent/STOP history, privacy and delivery kill switches; no token rotation, grant seeding or sender activation is part of rollout/rollback.

## Regression coverage

The real-browser fixture loads the actual extension JS/CSS using Shopify-style deferred asset injection, serves selected notices through the actual signed application proxy, and simulates the password gate separately from the application. It covers initial load, late insertion, hidden injection, vintage/original placement, DOM restoration, repeated scripts/events/hosts, 200/204/403/password HTML, network/503 recovery, bounded terminal failure, CSP/missing assets, malicious markup/links, mobile/RTL and zero external calls or send requests. Playwright is pinned as a development dependency; the dedicated existing extension CI job installs Chromium and runs these fixtures. Other suites skip only that browser launcher and retain all their existing assertions.

The accepted native proxy, JSONB, consent capture, signed inbound/STOP, theme identity, tenant/privacy and activation tests remain in e-commerce CI. Shopify CLI Theme Check validates Liquid/schema/locales; exact-base TypeScript, production builds and security-extended CodeQL also remain required. Browser simulations and screenshots are implementation evidence, not a claim of production recovery before the reviewed Shopify version is released.
