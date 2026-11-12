# Consent verification mismatch (#293)

## Reused evidence and what it establishes

Base: merged #291, `1909c49066fe3010e4efe9a3e23d4a7f90a4f9de`. Reuse the accepted screenshots and production evidence recorded in [issue #293](https://github.com/yanivwpu/Lead-Flow-Manager/issues/293): the pilot's active `test-data` theme has the consent embed ON, Shopify has no pending save, `read_themes` was approved, and current enrollment/editor/merchant-confirmation records exist. No editor visit, save, permission flow, token access, consent seeding or messaging is repeated.

The existing Railway production service is identified by the checked-in [production mapping](shopify-private-checkout-preflight.md). A bounded read of its existing consent-theme runtime logs for 2026-11-12 06:00–07:00 UTC returned deployment `87792356-b93e-4b7d-a626-bbe39270390b` and HTTP status/duration entries only. It contains no backend `state`, scope response or serialized theme block. An HTTP 200 cannot distinguish any of the service's returned states.

This environment has no ready Shopify credential or authenticated merchant browser-control tool. The issue includes no theme-file export or consent-theme response body. **The pilot's exact backend state and serialized-block cause are not independently established.** No synthetic fixture is presented as production data; no production recovery or rendered notices are claimed. The diagnostic fallback explicitly requested in #293 is implemented so one scoped acceptance read can identify the condition without exposing a theme file.

## Confirmed code defects and correction

1. `ConsentThemePanel` mapped `disabled_verified` to **Ready to install**. It now says **Not enabled on published theme** in EN/ES/HE. Ready remains for configuration that has not yet been verified.
2. The parser combined an explicitly disabled block, absent block, wrong handle/extension UID and unknown/missing `disabled` flag into the same `disabled_verified` result. `inspectConsentTheme` now reports a fixed `verificationReason`. An absent or invalid enabled flag is **unverified**; it is not positive evidence of either toggle state. This does not assume Shopify's omitted-field default or loosen activation verification without a real current fixture.
3. `query.isFetching` disabled and paled the main action during each background read. Background verification now shows its checking state while retaining the existing eligible setup action. Initial missing setup, connection/readiness blockers and actual setup writes still disable it. Styling/size classes are unchanged to keep #292 independent.

A live result still requires a single MAIN theme, non-processing status, valid current settings and exactly one matching handle/registered extension UID with an explicit `disabled: false`. Presets, foreign/draft themes, merchant declarations, setup clicks and HTTP success are not live evidence. Shopify's own save remains authoritative.

## Safe diagnostic contract

Only the authenticated merchant's existing consent-theme endpoint returns `verificationReason`. The signed public proxy still returns allowlisted notice HTML only. No new endpoint, account/shop selector, log payload, environment flag or persisted record is added. Codes never include provider messages, credentials, theme content, customer identifiers or connection digests.

The codes separate `block_enabled`, `block_disabled`, `block_missing`, `wrong_handle`, `extension_id_mismatch`, `duplicate_block`, `enabled_flag_missing` and `enabled_flag_invalid`. Missing settings files, invalid content/JSON/current blocks, malformed GraphQL, MAIN/processing failures, missing optional/required scopes, unauthorized provider reads, throttling and provider unavailability also remain distinct. Unknown provider exceptions produce only `provider_unavailable`. Codes are visible in expandable help, not the normal setup instructions.

## Storefront rendering evidence

The existing signed HTTP proxy and native extension test harness now run together: a fixture Shopify forwarder signs the query, the real proxy validates it and returns current purpose notices, and the actual unchanged `consent.js` renders that HTML into its initially blank embed. EN/ES/HE assert visible business name, all seven notices/phrases, STOP, RTL and wa.me destinations. Empty capture-ready rows return 204. Denied, empty and password-page responses never produce a notice section. Existing HMAC tampering, cross-tenant, JSONB, signature/STOP and no-send regressions remain in CI.

These fixtures establish the code path. They do not establish that the production store is public, that its proxy is configured correctly, or that its browser rendered notices. A password barrier is represented in the harness; the actual pilot's password status remains unobserved. The UI help distinguishes theme activation from rendered customer-facing content. No extension asset or Shopify app-version change is required.

## One focused owner acceptance after separate review and authorized rollout

1. In the existing pilot merchant session, open Growth Engine once, without clicking **Set up in Shopify**. Record only `state`, `verificationReason` and `checkedAt` from its authenticated GET, plus the displayed status. Do not copy tokens, account data, complete theme JSON or customer information into logs/issues. The setup CTA should remain eligible during a background read and no fresh live result should be shown while checking.
2. If `block_enabled` is returned, use one storefront page load to check the same-origin `/apps/whachat-consent` response and actual `section.whachat-consent` content. An embed toggle or empty placeholder is insufficient. If a password page prevents access, record that barrier; do not bypass it or claim rendering success. Do not click a WhatsApp opt-in link or send a message.
3. If a mismatch remains, report the fixed reason. `block_missing`, `wrong_handle` and `extension_id_mismatch` require examination of the current exact block identity; `enabled_flag_missing/invalid` requires a sanitized structural fixture of the matching entry before deciding whether Shopify's serialization contract supports an additional representation. Capture only field presence/types, the non-secret block identity and flag value; exclude other settings. Unauthorized/errors require a read-only investigation, not a repeated scope grant or reinstall.

Keep all existing consent, STOP, privacy, tenant and activation gates intact and customer sends OFF. This PR performs no merge, deployment, permission change, template change, token migration or app release.
