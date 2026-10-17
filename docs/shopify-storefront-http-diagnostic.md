# Exact upstream HTTP metadata, administrator only

Production baseline: c26bdad32ce97f9e8a62d955b8cd2115ebf8c161.
The reported checkout_test_storefront_http_client_error is not an exact status.
In this provider, 401/403 map to setup_required and 429 maps to throttled before
that category, so the reported category excludes those three statuses. The exact
remaining 4xx status, content type and API-version header presence were not retained.
A bounded search of the current deployment's checkout_test_storefront runtime logs
returned no matching lines. Inbound Railway HTTP 503 is not Shopify's upstream status.

## Read-only diagnostic

After separate review/deployment, use the existing authenticated administrator
browser session on the application origin:

```js
await fetch('/api/sales-catalog/commerce/checkout-test/diagnose', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {'Content-Type': 'application/json'},
  body: '{}'
}).then(response => response.json())
```

No credentials are copied or supplied manually. Existing administrator authorization,
workspace/operator allowlists, session, same-origin JSON restrictions, development
store/app/grants/publication/inventory and exact-selection checks remain mandatory.
Denied authorization keeps the existing generic 401/404 behavior and returns no
upstream metadata. The endpoint accepts no target, query, selection, approval or URL.

The action reuses runValidation without approval. It captures only response metadata
from the existing Storefront fetch, before provider validation, then returns before
any readiness journal insert, approval or dispatch. Failure also writes nothing.
It does not create a cart even when all checks pass. No new Shopify API call/query is
added: the standard Admin metadata/inventory checks precede the existing tokenless
CheckoutVariant query at https://whachatcrm.myshopify.com/api/2026-10/graphql.json.
The provider itself, request document, version, 15-second timeout, TLS, redirect:error,
no-retry policy and all acceptance guards are unchanged.

Authorized diagnostic output contains exactly five keys:

- httpStatus: the numeric upstream Response.status, or null if no response was observed.
- redirectOccurred: Response.redirected (whether fetch followed a redirect), or null
  without a response. A returned 3xx is not evidence of a followed redirect; the fixed
  http_redirect category distinguishes it. redirect:error rejects real redirects.
- contentTypeFamily: JSON, HTML, other, or null without a response. MIME parameters
  are removed and structured +json MIME types are recognized; the raw value is never
  returned. Null and other must not be interpreted as JSON.
- apiVersionHeaderPresent: presence only, never its arbitrary value, or null without
  a response. A present header does not prove the pinned version was served; the
  existing API-version guard still validates it.
- errorCategory: the existing fixed stage/guard error category, or verified on success.

No response body, arbitrary headers, cookies, Location, URL, checkout/cart secret,
credential, user identity, provider error message or stack is logged or returned.
Metadata is per request and exists only in memory. Response caching remains private,
no-store. Network/earlier Admin failures preserve null metadata rather than inventing
an upstream status.

## Evidence-driven interpretation

No live diagnostic has been run in this preparation, so development-password,
tokenless-access, endpoint and version explanations remain unverified. Status and
family narrow the investigation but do not alone prove any of those causes. HTML,
redirects or access statuses can represent storefront/password/edge restrictions;
404 can represent route/access issues; JSON 400 can represent request rejection.
Use the exact five-field result before choosing another read-only check. Do not
change the endpoint/version, add a token/scope, alter request fields, disable the
password or bypass an access gate to force a pass. If version_mismatch is returned,
review the existing pinned version rather than guessing from header presence alone.

No production deployment/configuration/secret changes, migrations, Shopify app
release, cart, order/payment action, customer message or checkout activation are
part of this PR. Production checkout gate remains OFF.
