# Admin-only Shopify Checkout Test

Implementation baseline: ee6921de7740d6c7f9899106087766c75b7071fa.
This interface runs in the existing application backend. No CLI runner, new infrastructure,
Storefront token, customer conversation, order, payment, or messaging channel is involved.
`CHECKOUT_ROLLOUT_APPROVED` remains false. Merchant checkout settings stay unchanged.

## Reviewed setup

Deploy only after review. Apply `migrations/0112_shopify_checkout_admin_tests.sql` using
the existing reviewed migration process. The endpoint never installs or repairs schema.
This dedicated journal does not require the customer checkout receipt key or migrations
0110/0111, and never persists cart secrets or checkout URLs. Do not use broad db:push.

Set these server-only variables on the existing application:

- `SHOPIFY_CHECKOUT_TEST_WORKSPACE_ID`: independently verified existing account-owner ID
  of the connected whachatcrm.myshopify.com development installation.
- `SHOPIFY_CHECKOUT_TEST_OPERATOR_IDS`: comma-separated explicitly permitted authenticated
  operator IDs. Each must also pass existing workspace owner/admin authorization.

No default workspace/operator exists. Do not infer IDs from client input or a shop name.
Missing configuration hides/denies the feature. The current workspace resolver supports
account owners; do not use this feature to impersonate a workspace or broaden tenancy.
No production configuration, migration, deployment or real cart was executed during implementation.

## Operator flow

In Sales Catalog → Shopify Products, below Test Chat, find **Shopify Checkout Test**.
The section is only rendered after server authorization. Verify readiness first.
The server fixes store, product `10108113912090`, variant `51638768632090` and quantity 1.
Live price, currency and options replace all previously cached observations. It reuses
the controlled verifier for development plan, app identity, grants, publication,
Admin inventory and tokenless Storefront accessibility. A preflight creates no cart.

Review the concrete result and digest. Explicitly check the authorization statement
and press **Record One-Time Operator Authorization**. This separate request rechecks
live eligibility and records operator approval. Only then is **Create One Test Shopify Cart**
available. Approval expires with the preflight after ten minutes; it is bound to the
workspace, operator, authenticated session, installation identity/token fingerprint,
selection digest and server-generated request ID. The server repeats restrictions even
when callers bypass the UI. It accepts no merchant/variant/price input.

Creation rechecks Admin and Storefront data, installation continuity and approval, then
commits a durable database claim before the existing provider's prepare operation.
A partial unique index permits **one dispatch total for this store**, even across
requests, new preflights, sessions and processes. Failure or process death after claim
is permanently consumed. There are no automatic retries or claim-reset APIs. Do not
clear, delete or reset claims to retry. A further test needs separate review and approval.
The foreign keys prevent account deletion from silently removing this safety fence.

The existing provider creates one cart line, validates Shopify's returned checkout URL,
and revalidates the returned cart. The URL exists only in the private HTTP response and
component state; refreshing/unmounting loses it. It is not recoverable from the journal.
An unavailable response may mean a real cart exists: stop and inspect privately rather
than dispatch another. Successful cart validation does not prove checkout-page usability.

Open the returned link manually. Inspect any redirects before allowing another origin;
the app does not fetch or follow the checkout URL. Record whether the actual checkout
renders expected variant/options/quantity/price/currency or a password/challenge/error.
Do not enter customer information, shipping details or payment, or submit an order.
Use an isolated browser and existing approved storefront access. Do not disable passwords.
Never share URLs/cart keys, HAR files, screenshots containing secrets, browser storage,
provider responses or request bodies in ordinary logs/analytics/error reporting.

## Verification

`node --import tsx --test tests/shopify-checkout-admin-test.test.ts`

`node --import tsx --test tests/shopping-checkout-harness.test.ts tests/shopping-checkout.test.ts tests/shopping-checkout-postgres.test.ts`

For Node 24 runtimes affected by the PGlite/V8 Wasm crash, run these files directly with
`node --no-wasm-code-gc --no-wasm-tier-up --import tsx <test-file>`.

Tests use synthetic Shopify responses and disposable local PostgreSQL-compatible fixtures;
they establish application safeguards, not live eligibility or a real Shopify result.
Review, database migration, exact operator/workspace configuration and deployment remain
operational prerequisites. Stage A can run after reviewed deployment. Stage B still needs
the administrator's separate explicit approval after seeing those live Stage A results.
