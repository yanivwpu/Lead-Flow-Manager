# Storefront unavailable: evidence and next read-only check

Reviewed production 50a667cf006ebe62841bf7f731492ac320d97694 (PR #102).
The actual cause of the reported failure is not yet verified.

## Request contract

The existing provider uses POST to
`https://whachatcrm.myshopify.com/api/2026-10/graphql.json` with the audited
CheckoutVariant document and exact variant ID. Tokenless headers contain only
Content-Type: application/json; no Admin/Storefront token, cookies, buyer identity,
password, or additional scopes. Fetch uses redirect:error and a 15,000 ms abort
signal, normal TLS validation, the configured/native fetch implementation and no
custom agent, DNS family override or retry. No timeout/version/fetch behavior is
changed by this diagnostic patch.

The previous unavailable code merged fetch rejection, non-success HTTP status,
missing/unavailable variant, unsupported components/selling plan, invalid inventory
proof and quantity-rule failures. Therefore this code alone never established a
network failure. API-version/GraphQL/JSON errors already had separate categories.

## Sanitized observed evidence

Railway deployment b6cc33bf-5a24-49a7-9e99-fadbd3a186b5 is SUCCESS.
At 2026-10-17 18:04:35 UTC (14:04:35 America/New_York), the administrator preflight
returned 503 in 774 ms. That invocation did not consume the 15-second fetch timeout.
Railway recorded shop A/AAAA lookups with NOERROR, including around that invocation.
In the 18:04:30–18:04:40 UTC window, a flow to Shopify's resolved IPv4 port 443
spanned roughly 716 ms, with 6,143 bytes and 19 packets. The stream marks it partial,
with no dropCause. This does not establish TLS success, an HTTP status, nor which
Admin/Storefront operation used the connection. Connections may be reused.
No checkout_test runtime lines were returned by the bounded deploy-log query.
Absence of a matching line is not evidence of a successful request or complete logs.

No live Shopify query was issued by this investigation. The chat executor's network
policy is separate from Railway's production network and cannot diagnose its egress.

## Diagnostics

Only the existing private authorized administrator error vocabulary is extended.
No raw logging, error messages/stacks, response bodies, URLs, cookies, headers,
credentials, checkout links or user data are added. Lower-level causes are mapped
through bounded, fixed code/name classifications. The exact Undici unexpected
redirect sentinel maps to a fixed redirect category, never to its raw message.
Mixed/unknown aggregate errors remain transport_unknown rather than guessing.

- transport_timeout/aborted/dns/tls/connect/socket/redirect/unknown: fetch did not
  resolve a Response. This is the fetch boundary, not proof that no bytes arrived.
- http_redirect/client_error/server_error/unexpected_status: a Response was received.
  Existing 401/403 setup_required and 429 throttled behavior is unchanged.
- http_html_response: a successful HTTP response declared HTML and failed the
  existing API-version/JSON acceptance checks.
  This may be an access/password/challenge page, but is not proof of which one.
- response_body_timeout/read_failed: headers arrived but JSON body consumption failed.
- invalid_json/api_version_mismatch/graphql_error/missing_data: response handling.
- inventory_proof_invalid: stopped before any Storefront request.
- variant_not_visible/identity_mismatch/unavailable, unsupported_variant,
  quantity_rule_invalid/rejected: a GraphQL response or local proof failed a guard.

All route codes retain the checkout_test_storefront_ prefix. A null variant can
indicate tokenless visibility/publication restrictions; it is not a DNS failure.
HTML or redirect evidence must be inspected before attributing password protection.
Do not disable the password, send it as a token, request more scopes, or loosen
publication, quantity, inventory, identity or currency checks.

## Exact next non-mutating check

After separate review/deployment of diagnostics, invoke only the existing
runValidation(selection, deps) with approval omitted (or provider.verify with a fresh
owned Admin proof), from the same Railway runtime/network, using the fixed test
selection and installed credential in memory. Use consume/saveReceipt callbacks that
throw if called. Report the fixed verification error or sanitized success; do not
invoke prepare/status/cartCreate. Do not use the admin preflight route for a strictly
zero-write probe: that route can insert readiness into 0112 after successful checks.

Retain only fixed diagnostic categories and the existing selection digest. If HTTP
or HTML/redirect classification is returned, the next focused same-runtime read-only
probe should retain status number, elapsed milliseconds, received-headers boolean,
allowlisted content-type family and API-version comparison only. Never retain a raw
body, Location/Set-Cookie headers, arbitrary error text, or checkout URLs. A password
screen at the storefront root alone does not prove the GraphQL endpoint is blocked.

No production deployment/configuration, migration, secret change, cart, order,
payment, message, subscription change or customer checkout activation is authorized
by this document. Source checkout gate stays false.
