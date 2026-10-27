# E-Commerce Growth Engine — merchant workspace activation release

Scope: merchant-selected workspace availability, **not** customer messaging, carts, orders, checkout, scheduling or workflow activation.

## Deployment prerequisites

1. Review migration `0117_ecommerce_merchant_workspace_activation.sql` against the production schema. Apply it using an approved, authenticated database migration path **before** deploying the application change. Never use client requests to create tables.
2. Verify the table exists with columns `account_id`, `installation_id`, `shop`, `activated_at`, and the account/installation foreign keys. Existing users/integrations are not altered.
3. Verify that Shopify's existing authenticated session handling and subscription entitlement source remain in place. No new token or third-party configuration is required.
4. Confirm custom Shopify cart dispatch and outbound customer messaging are still disabled. Do not touch the consumed cart claim/fence.

## Authenticated read-only acceptance

- Signed-in Free user: Templates card → Preview opens; Activate is not offered; existing app billing path remains available.
- Eligible Pro/trial merchant with active Shopify installation: Preview displays the activation action, but does not auto-activate.
- Logged-out: activation API returns 401, no mutation; no sensitive merchant data disclosed.
- Cross-origin or nonempty JSON POST: activation API rejects without a database write.
- Unconnected/expired/canceled/invalid/ambiguous installation: no activated sidebar or workspace access.
- Pilot merchant: existing pilot access remains; private pilot APIs do not become generally available.

## Explicit activation acceptance

Only after deployment verification and merchant approval:
1. Log into the **correct** merchant workspace and confirm Shopify connection and Pro entitlement.
2. From Templates > E-Commerce Preview, click Activate Growth Engine once.
3. Confirm the activation status is persisted for the exact Shopify installation; sign out and sign in again.
4. The E-Commerce Growth Engine appears under Growth Engines on desktop and mobile. Dashboard sections link to existing tools; disabled customer-facing functions remain disabled.
5. Downgrade, uninstall and cross-account denial regressions must stay green. Uninstall clears the activation state with the same Shopify privacy lock. Reinstall requires a fresh activation.

## Rollback

Roll back application code/image without dropping, truncating or rewriting the activation table, Shopify data or any historical cart journal. Keep existing cart execution/outbound flags disabled. The `0117` table is inert for earlier code.

## Current boundary

Merchant activation only opens the workspace; order-support task opt-in remains pilot-scoped and must be promoted through a separate authorization and acceptance milestone. Do not describe recovery messaging or checkout/cart execution as active.
