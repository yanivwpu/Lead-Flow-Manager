# Managed Pricing approval return and recovery

## Verified incident

Production logs on October 16, 2026 at 10:07:23 AM EDT show:

- `GET https://www.whachatcrm.com/api/shopify/billing/callback` → 307.
- `GET https://app.whachatcrm.com/api/shopify/billing/callback` → 400.
- The callback logged the canonical app host, then returned the reported `Missing shop parameter` error before any subscription query.

Existing logs retain paths, not query strings or session state. The exact original query parameters cannot be reconstructed. The host redirect preserves `originalUrl`, including its query; there is no evidence it discarded parameters. New callback diagnostics record only session presence and presence of `shop`, `plan_handle` and `charge_id`, never query values, cookies or tokens.

Read-only production inspection confirms the internal owner's canonical shop is `whachatcrm.myshopify.com`, an installation token exists and the Shopify integration is active. Local billing remains Free/pending with no charge ID. The original May 20–June 3 trial is expired and no plan override is enabled. No production writes or reconciliation calls were made.

## Root causes and correction

The old callback required `shop`, ignoring the authenticated merchant session, then looked up an installation from an unauthenticated query parameter. The shared sync accepted an unverified `plan_handle` even when no active subscription existed. Provider exceptions were swallowed as empty lists; the callback then marked the subscription cancelled. The SPA also displayed a success destination on verification failure.

Both callback and normal `sync-return` now share authenticated return handling. The canonical session-owned installation supplies shop and token when query shop is absent. A supplied conflicting or malformed shop is rejected; an unsigned shop/charge/plan never establishes identity or grants access. Missing sessions receive a sign-in/retry response, without creating a workspace or restarting onboarding.

The existing Admin GraphQL subscription query is read-only and now retrieves `AppRecurringPricing.planHandle` from the provider, not the browser. API errors and malformed responses fail closed. An active provider subscription maps to the existing Free/Starter/Pro rules, including $0 test subscriptions and annual plans. Billing writes are atomically fenced by owner ID, canonical shop, unchanged token, deletion state and uninstalled/redacted status. Only existing billing fields are written; trial dates/status, overrides and other merchants are untouched.

Replay requests re-query the current installation and set the same verified billing state. They never create, approve, replace or cancel a Shopify subscription. Empty lists and transient verification failures preserve local billing fields and report verification pending instead of cancellation or success. Explicit existing subscription lifecycle webhooks remain unchanged.

## Shopify documentation and API compatibility

Checked the current [Shopify App Pricing documentation](https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing): Shopify supplies `plan_handle`; `shop` is documented for external welcome URLs, so absence must not be the sole identity mechanism. Returns are signals to verify, not proof of entitlement. Dev-store $0 selections create subscription contracts, rather than requiring an internal Pro override.

The existing authorized-installation integration uses [Admin API currentAppInstallation.activeSubscriptions](https://shopify.dev/docs/api/admin-graphql/2026-01/objects/AppInstallation). [AppRecurringPricing.planHandle is available in 2026-01](https://shopify.dev/docs/api/admin-graphql/2026-01/objects/AppRecurringPricing). We retain that integration and its version; no permissions, prices, subscription configuration or app version changes are included.

Current Shopify documentation recommends Partner API `activeSubscription(appId:, shopId:)` for the newer App Pricing model and distinguishes legacy enrollment before April 2026. This environment has no authenticated Shopify/Partner API access, so neither the app's enrollment model nor the live approved contract can be independently confirmed here. Database token presence is not proof of a live Pro contract. Do not assume that an empty Admin subscription list means the merchant must approve again, or use a return handle to bypass verification. If the app uses the newer contract model and Admin API does not expose the contract, an authorized Partner API check is required before deciding on a separate adapter change; do not silently change billing models in this callback fix.

## Recovering the already-approved test plan (after review)

There is no reason to create another subscription to repair a failed local return. Once this fix is reviewed, deployed with separate authorization, and the correct owner is signed in, the existing normal `GET /api/shopify/billing/sync-return` can re-query the installation without `shop`, `charge_id` or `plan_handle`. It will activate local Pro only if the existing Shopify API verifies an active Pro subscription. Calling this endpoint writes local entitlements and was deliberately **not performed** during this investigation.

Before that write, an authorized owner can inspect the existing installation's read-only Shopify query:

```graphql
query VerifyApprovedPlan {
  currentAppInstallation {
    activeSubscriptions {
      id
      name
      status
      test
      lineItems {
        plan {
          pricingDetails {
            ... on AppRecurringPricing { planHandle interval price { amount currencyCode } }
          }
        }
      }
    }
  }
}
```

Use the existing application's authorized runtime/tooling; do not paste installation tokens into chat or logs. If this returns an active Pro contract, normal synchronization can safely reconcile it without another approval. If unavailable or empty, keep current entitlements, inspect the authoritative Partner API model as applicable, and retry verification. Do not approve another charge, reinstall, reset the trial or manually mark paid access.

## Regression validation

Tests exercise real callback and sync-return routes with isolated database fixtures and mocked read-only Shopify responses: missing shop, provider-verified annual Pro, forged shop/plan/charge, missing/deleted session user, repeated callbacks, delayed empty lists, exceptions, malformed data, existing Starter/Pro, tenant isolation, token rotation and uninstall fences. They assert the original trial remains expired and unchanged, and verify no provider mutations occur. CI includes the tests in Shopify onboarding validation and runs the same integration against native PostgreSQL in Sales Catalog validation.
