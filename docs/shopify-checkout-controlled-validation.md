# Controlled development-store checkout validation

Preparation only. No execution authorization is conveyed by this document or its PR.
Baseline: production d944ef7. Operator independently reports both 0110/0111 tables
absent in production Neon `neondb`; Railway receipt key is also absent. These are
prerequisites for eventual production handoff, not this standalone provider test.

## Boundaries

Only `whachatcrm.myshopify.com`; production app ID
`e4585d4da1434c9e5649a2269e716076`. The standalone CLI imports the existing checkout
provider, installation resolver, publication predicate and exact Admin inventory query.
It never starts the application or workers, changes catalog/settings/subscriptions,
creates a customer/conversation/order, sends messages, or invokes payment APIs.
Production source gate remains false. Private Test Chat remains a pure preview.
No app configuration or Storefront token is needed. No migration/key is needed for
this test: its one-shot marker and private receipt are local, not production journals.

## Prepare before requesting genuine-cart approval

1. Use one trusted operator checkout on persistent local disk (not an ephemeral CI
   or Railway service). All invocations must use this checkout. Do not delete/copy
   around the fixed `work/checkout-validation/cart-dispatch-consumed.json` marker.
   The marker is an operational one-shot fence, not a cross-machine lock. Coordinate
   a single operator; using another checkout requires a fresh review and approval.
2. Obtain least-privilege read-only database access to the existing installation's
   database through a secret manager, bound as `CHECKOUT_TEST_READONLY_DATABASE_URL`.
   Never paste credentials into arguments/chat/logs. The CLI additionally holds one
   explicit `BEGIN READ ONLY` transaction and rolls it back, including failures.
   It reads the existing token in memory through the owned installation resolver.
   No new Admin credential, scope grant, secret configuration or database mutation.
3. Confirm the live store is a development store in Shopify Partner/Admin and record
   evidence. The CLI additionally requires live Admin `shop.plan.partnerDevelopment`
   to be exactly true; unsupported/null schema behavior blocks the test. It checks
   actual current installation app ID and read_products/read_inventory grants.
4. Choose an existing published test product; do not publish/create/edit products.
   Create a private selection JSON file (0600) with exactly these keys:

   ```json
   {
     "shop": "whachatcrm.myshopify.com",
     "userId": "EXISTING_OWNING_USER_ID",
     "productId": "gid://shopify/Product/REPLACE_WITH_REAL_NUMERIC_ID",
     "variantId": "gid://shopify/ProductVariant/REPLACE_WITH_REAL_NUMERIC_ID",
     "quantity": 1,
     "price": "REPLACE_WITH_EXACT_DECIMAL_PRICE",
     "currency": "USD",
     "options": [{"name": "Title", "value": "Default Title"}]
   }
   ```

   Replace currency/options too; the example is not a live test selection. Admin
   ACTIVE/publication time, availability, no components/required selling plan,
   exact IDs/options/price/currency, inventory tracking/policy and sufficient stock
   are mandatory. Password-protected stores may have null onlineStoreUrl; existing
   publication predicate is authoritative, followed by tokenless variant visibility.
5. In an environment authorized to reach the installation DB and exact Shopify host:

   `node --import tsx scripts/validate-shopify-checkout.ts --preflight /private/selection.json`

   This performs only DB and Admin reads plus the provider's tokenless variant query.
   It prints a selection digest, no token/cart URL. Any mismatch fails closed. Shopify
   Admin version must be 2026-01 and Storefront version 2026-10. No redirects/retries.
6. Present the concrete selection, digest, development-store evidence and storefront
   password/access constraints to the user for separate approval of exactly one cart.
   Receipt-key/migration approval does not authorize this cart, or vice versa.

## Exactly one authorized cart, later

After separate approval, create a private 0600 authorization JSON file:

```json
{
  "action": "CREATE EXACTLY ONE DEVELOPMENT STORE CART",
  "selectionSha256": "REPLACE_WITH_PREFLIGHT_DIGEST",
  "expiresAt": "REPLACE_WITH_UTC_ISO_TIME_WITHIN_30_MINUTES",
  "approvedBy": "APPROVING_OPERATOR",
  "developmentStoreEvidence": "REFERENCE_TO_VERIFIED_PARTNER_ADMIN_EVIDENCE"
}
```

This file records approval; generating it must never substitute for obtaining approval.
Run, once, from the same persistent checkout:

`node --import tsx scripts/validate-shopify-checkout.ts --create-one-cart /private/selection.json /private/approval.json`

The CLI repeats all preflight checks, verifies installation identity again, consumes
an exclusive 0600 fsynced local marker, then calls existing provider.prepare once.
Prepare repeats tokenless verification and creates only one line with merchandiseId
and quantity. No customer/buyer identity. Existing provider validates exact one-line
product/variant/quantity/unit price/currency, empty warnings/userErrors, API version,
cart ID and actual HTTPS checkout URL. provider.status rechecks the cart contents and
same returned URL. No automatic retry even after an uncertain result. A consumed
marker must remain on failure; examine the protected receipt if present and do not
run a replacement cart without separate approval. Stock is not reserved or promised.

The private receipt is written to `work/checkout-validation/receipt.private.json`
(0600); directory is 0700 when created and gitignored. Use a private trusted directory
with no symlinks/shared writers. Do not upload its contents, cart keys, checkout URL,
HAR, browser storage or screenshots containing URLs as CI/log artifacts. A provider
failure after mutation can leave a genuine cart even if no receipt was saved.

### Checkout-page accessibility (manual, same approved test)

The harness reports navigation_pending, never claims buyer usability from HTTP 200.
Open the private returned URL in an isolated browser with request interception:
allow only the exact shop origin initially; inspect redirects before allowing any
other host. Do not weaken the provider's domain/path validator or follow an unrelated
host. Unexpected Shopify checkout domains require attribution/review before proceeding.
Record whether the page renders the expected variant/options/quantity/unit price and
currency, or shows password, challenge, unavailable-checkout or other error. Check
redirect chain/status and actual rendered checkout together; a HEAD/GET 200 alone is
insufficient. Report taxes/shipping/discount totals separately from exact unit price.
Do not submit customer data, shipping information, payment or an order; stop at the
rendered checkout. Password access must use an already approved secure mechanism;
do not disable storefront protection. Cart existence never proves order/payment.

### Remaining live blockers

Actual development-plan/app/grant evidence, owning user ID, exact existing published
product/variant/options/quantity/price/currency, usable read-only installation access,
network permission to the DB and Shopify host, storefront/password constraints, and
separate live-cart approval remain required. Fixtures do not establish live eligibility.
This session's network policy currently omits Shopify and database destinations.

## Production migrations: plan only, separate approval

1. Reconfirm target Neon project/branch/role and database `neondb`; production gate
   false and merchant settings OFF. Do not use broad `db:push` or startup patches.
2. In a read-only transaction inspect to_regclass for both tables, catalog columns,
   constraints/indexes and any migration ledger. User reports both absent; stop if
   reality differs, rather than relying on IF NOT EXISTS to repair partial schema.
   Verify users(id), conversations(id) types and expected FK targets/search path.
3. Verify recoverable backup/PITR and rehearse on an isolated database with representative
   parent schema; verify the same definitions and rollback behavior before production.
4. After separate migration approval, use pinned files from reviewed d944ef7 and a
   session with the intended public search_path. Execute together in one transaction:

   ```sql
   BEGIN;
   SET LOCAL lock_timeout = '5s';
   SET LOCAL statement_timeout = '30s';
   SET LOCAL search_path = public;
   -- Execute migrations/0110_checkout_preparation_attempts.sql exactly.
   -- Execute migrations/0111_checkout_provider_gates.sql exactly, after 0110.
   -- Inspect definitions before COMMIT; rollback on any mismatch.
   COMMIT;
   ```

   Use stop-on-error behavior (psql ON_ERROR_STOP) and approved migration tracking
   conventions after discovering the actual runner/ledger; do not invent ledger rows.
5. Verify 0110: text request_key PK; owner and conversation varchar FKs with DELETE
   CASCADE; status CHECK preparing/ready/failed/ambiguous; encrypted_receipt text;
   retry_at/created_at/expires_at timestamptz, created_at default now(); NOT NULLs per
   source; owner index on (user_id,conversation_id). Verify 0111: composite PK
   (user_id,shop), owner FK DELETE CASCADE, next_request_at timestamptz NOT NULL.
   Check application health and settings/gate remain OFF; inspect no receipt contents.
6. Failure before commit: ROLLBACK, inspect locks/schema, no automatic retries. After
   commit prefer retaining additive tables with checkout OFF. A destructive rollback
   requires separate approval and proof newly created tables remain unused; never
   delete durable ambiguous/preparing attempts to permit redispatch. Back up encrypted
   records before any approved data removal. App rollback does not reverse schema.

## Server-only receipt key: procedure only, separate approval

Target Railway project luminous-transformation, production environment, service
Lead-Flow-Manager. Recheck presence by variable names including sealed names; never
replace an existing key. Before mutation review staged changes and deployment effects.

On a trusted operator machine with shell tracing/recording disabled, generate 32 random
bytes directly into a new 0600 temporary file inside a 0700 private directory, for example
with Node crypto.randomBytes(32).toString('base64'), using exclusive create and no stdout.
Do not pass the key in process arguments, environment dumps, command history or chat.
Transfer through Railway's reviewed protected secret input/import mechanism, storing
only server-side SHOPPING_CHECKOUT_RECEIPT_KEY as a sealed variable where supported.
No VITE_ prefix or client exposure. If a protected no-echo mechanism is unavailable,
stop and use the secure Railway dashboard; do not fall back to plaintext tool output.

Check canonical base64 decoding yields exactly 32 bytes locally, printing only pass/fail.
Verify Railway variable-name presence/sealed status without reading back its value.
Delete the temporary file after secure transfer, retain an access-controlled recovery
copy in the approved secret manager. Provisioning/deployment requires separate approval;
adding a variable can trigger deployment, so do not commit staged configuration or deploy
implicitly. Keep the source gate false and all merchant opt-ins OFF throughout.

No multi-key decryption exists. Future rotation requires checkout OFF and an explicit
receipt expiration/preservation plan; never reset ambiguous attempts to generate carts.
