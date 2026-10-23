# Test WhatsApp inbound routing: evidence and approval-only repair

Investigated October 22, 2026, America/New_York. Related: #151, #154, #156.

## Confirmed destination and limit

Production **received the test WABA's `messages` event**, while staging did not.
The production service is Railway project `luminous-transformation`, environment
`production`, service `Lead-Flow-Manager` (domain `app.whachatcrm.com`). Read-only
runtime metadata at **2026-10-23T03:12:41.452888344Z** (October 22, 11:12:41 p.m.
Eastern) records:

```json
{
  "object": "whatsapp_business_account",
  "entryIds": ["967263072832328"],
  "changesFields": ["messages"],
  "phoneNumberIdFromPayload": "1144480422078565",
  "resolvedUserId": null,
  "signatureHeaderPresent": true
}
```

At `03:12:41.452897250Z`, production logged `Signature verification: PASSED`.
At `03:12:41.457794675Z`, it logged that no user was found for this phone ID.
These are timestamp-correlated records; the existing log format has no shared
request identifier. Production HTTP logs show three webhook POSTs returning 200
in the bounded investigation window. No customer content or raw payload was
needed to establish this result.

Staging HTTP logs from `2026-10-23T01:45:00Z` through the investigation showed
eight verification GETs returning 403 and zero webhook POSTs. Invalid-token GET
probes returning 403 are expected. Latest successful staging diagnostics at
`03:12:57.083949976Z` confirm the configured app is subscribed, the saved phone
belongs to the WABA, and the phone status is CONNECTED. Earlier token-expiry
errors (190/463) do not supersede that later successful probe.

**Cause:** the test phone's webhook is reaching production, where there is no
matching workspace, instead of the staging workspace. Existing signup and repair
POST to `/{waba}/subscribed_apps` without specifying `override_callback_uri` or
`verify_token`; they establish app membership, not a staging destination. The
known global app callback is production. A missing WABA override is a likely
explanation, but the exact current WABA/phone hierarchy is still unverified.
Do not label absence of an override as confirmed until the fresh read-only probe
returns it. Do not use the existing generic Repair button during this exercise:
its bare subscription POST can reset an existing WABA override to app fallback.

## Small repair deployed independently of callback configuration

The existing authenticated `GET /api/integrations/whatsapp/coexistence-diagnostics`
now makes a separate, optional, header-authenticated
`GET /{saved-phone-id}?fields=webhook_configuration`. Its failure never changes
subscriptions or invalidates the existing phone-status probe. The sanitized
`callbackRouting` block reports phone/WABA/app hierarchy and applies phone-first
precedence. Missing/malformed configuration, incorrect returned phone identity,
conflicting WABA evidence, and failed Graph reads stay unknown. WABA membership
without a configured app ID also stays unknown (the unresolved #156 review item).

`routingLikelyActive` now requires a reported destination matching this app's
origin and webhook path. A known destination mismatch is an explicit blocker.
The sanitized routing block is also logged, allowing the operator to run the
authenticated diagnostic without copying credentials into chat. Responses use
`Cache-Control: no-store`.

Only the exact staging environment, app `810621184995059`, WABA
`967263072832328`, and phone `1144480422078565` receive a
`stagingCallbackRepair` preview. It checks unique inbound phone ownership against
the authenticated workspace, WABA phone membership, token app identity and
management permission, app `messages` subscription, existing verification-token
availability, effective routing, and a reversible prior WABA callback state.
A phone override blocks a WABA-only repair pending separate review.

This is a **read-only dry-run**: no apply route, callback-changing fetch,
subscription DELETE, credential reset, or recovery activation is added.

## Proposed live operation — separate explicit approval required

Only after refreshing the authenticated diagnostic, resolving all preview
blockers, and securely retaining the exact prior configuration:

```text
POST /967263072832328/subscribed_apps
Authorization: Bearer <existing saved test-WABA token; never print>
Content-Type: application/json

{
  "override_callback_uri": "https://whachatcrm-staging-app-staging.up.railway.app/api/webhook/meta",
  "verify_token": "<existing staging META_WEBHOOK_VERIFY_TOKEN; never print>"
}
```

Use the configured Graph API version. Update the existing app's subscription on
this WABA; do not add another app, alter the global production callback, or modify
any other WABA. Revalidate the token, exact scope, callback verification GET and
current rollback state immediately before any separately approved operation.

Rollback, also separately approved: POST the securely captured previous WABA
override and its original verification token to the **same test WABA**. If the
phone configuration authoritatively showed no WABA override, POST with no body
to restore app fallback. Never DELETE the subscription. Re-read the hierarchy
after apply or rollback. A redacted URL category is insufficient to restore an
arbitrary or query-bearing callback, so those cases block the preview.

Meta's official [Postman override request](https://www.postman.com/meta/whatsapp-business-platform/request/un84tul/override-callback-url)
documents the WABA subscription POST. The official
[webhook override reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/override)
was consulted but returned HTTP 429 during this investigation; live field support
and the current hierarchy still require the authenticated GET. An unsupported or
omitted response stays blocked rather than guessing a callback or executing POST.

## Consent remains independently blocked

Fresh Railway variable-name inspection finds neither
`ECOMMERCE_RECOVERY_CONSENT_CAPTURE_ENABLED` nor
`ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY`, including rendered shared names.
No variables were changed. Capture requires exact staging environment/origin,
flag `true`, and a securely configured HMAC key of at least 32 characters, matching
the key used to verify recipient evidence. Before activation, independently
review merchant identity, reminder purpose/frequency, and STOP disclosure; verify
unique active Shopify installation, correct phone owner, exact contact/WhatsApp
number, shop/customer mapping, schema and privacy-lock behavior. Generic YES and
Shopify marketing preferences cannot create consent. The routing test text is
not an opt-in. Preparation, outbound delivery and worker gates remain off by
default; their enabling variables are absent from staging's rendered listing.

## Validation and acceptance still required

- Eleven callback evidence/dry-run tests pass, including hierarchy precedence,
  failed/wrong-phone evidence, cross-tenant/app/WABA/production rejection,
  rollback uncertainty, URL/exception redaction, and GET/header-only probes.
- Five existing signed-consent gate/contract tests pass. No unrelated Shopify or
  AI shopping tests were replayed. The existing PR workflow runs these relevant
  checks, staging TypeScript regression comparison, and build.
- An isolated local harness executed the exact existing signature, inbound
  parser, unique phone-owner lookup, and duplicate-delivery handler declarations:
  valid/tampered/wrong/missing signatures, zero/one/duplicate owners, and replay
  returning the original message without storage writes passed. It used no live
  database, network, customer messages, or synthetic live-delivery claims.
- Helper/tests standalone TypeScript and route esbuild transformation pass.
  Full source validation runs in CI because shell git cannot reach its proxy;
  inspected files were retrieved at staging commit `8a72348` through GitHub.

After separate routing approval and application, observe one authorized recipient
message at staging: real Meta signature success, intended unique workspace,
Unified Inbox persistence, duplicate delivery returning the same message, and
unchanged production health. A 200 response alone is insufficient. Do not resend
until routing is verified. The signed consent/YES/STOP/HMAC acceptance requires
the independent disclosure and key gates above. No live callback was changed and
no test messages were sent during this repair.
