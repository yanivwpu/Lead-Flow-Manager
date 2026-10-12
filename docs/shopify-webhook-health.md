# Shopify scope and webhook verification

The audit is read-only. It calls `currentAppInstallation.accessScopes` and paginates
`webhookSubscriptions` for the current merchant token. Requested `SHOPIFY_SCOPES`
are configuration intent, never evidence of a grant. A failed, timed-out, malformed,
or empty scope response yields unknown permissions and no inferred missing scopes.
A failed or incomplete subscription lookup yields unknown registration, not missing
registration. Empty *complete* subscription connections confirm absence.

Customers/create requires read_customers. Orders/create requires read_orders. Both
are required commerce registrations; app/uninstalled is also required. Returned
HTTP callbacks are compared to HOST plus the existing route, preserving path and
query case. A matching duplicate subscription satisfies the callback check.
A confirmed subscription does not establish delivery or successful processing.

Compliance callbacks remain:

| Topic | Expected path | Registration method |
| --- | --- | --- |
| customers/data_request | /api/shopify/webhooks/customers/data_request | App-level TOML deployment |
| customers/redact | /api/shopify/webhooks/customers/redact | App-level TOML deployment |
| shop/redact | /api/shopify/webhooks/shop/redact | App-level TOML deployment |

Commerce callbacks remain /api/shopify/webhooks/customers-create and
/api/shopify/webhooks/orders-create. The uninstall callback remains
/api/shopify/webhooks/app-uninstalled. Their audit evidence comes from per-shop
Admin GraphQL; local commerce TOML declarations are not used as live evidence.

The production WhachatCRM protected customer-data approval dated June 25, 2026 is
reported operator evidence. This audit does not independently inspect Partner
Dashboard, confirm the active deployed app version, or validate that approval for
an installed merchant. Missing orders alone never proves a protected-data rejection.
An explicit failed registration response is reported separately when supplied by
the existing re-registration action. Later read-only audits do not invent or retain
registration failure history. No read_all_orders scope was added.

The existing merchant diagnostics and a compact read-only section in Admin's Users
tab show the same report. Known missing scopes, callbacks, or explicit rejections
produce Action Required. Unknown required checks produce Verification Unavailable
when there are no known failures. Unknown app-level compliance deployment evidence
prevents Healthy even when all per-shop checks pass. This is intentional: an
operator must confirm those live app-level subscriptions separately; this change
adds no unsupported automatic confirmation source.

## Production release checks

No live Shopify verification was performed during implementation. Before release,
run the read-only merchant audit with production access and confirm actual scope
handles and customer/order/uninstall callback registrations. In Partner Dashboard,
confirm the active app version's three compliance subscriptions and URLs, and the
reported protected-data approval. Check event delivery/processing separately using
existing Shopify delivery evidence. Do not re-register, deploy, or mutate merchant
data as part of these checks. Scope approval and subscription repair require a
separately authorized action after reviewing the specific failure.
