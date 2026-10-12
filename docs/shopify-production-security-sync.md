# Production authentication security synchronization

This integration merges production `main` at `112ea8c61be69640ec5f63430d32ca7f7ce901f4` into Shopify PR #59's head `325b321c6b25d8b246a69446f7873479c4e7c7f4`, preserving both histories. The review PR targets `codex/shopify-trial-first-onboarding`; it does not update that branch until reviewed and merged.

The only conflict was the import block in `server/routes.ts`. Resolution retains `registerShopifyPrivacyAdminRoutes`, `registerSalesAdminLoginRoute`, and `validateNewPassword`. Shopify privacy route registrations and startup patches remain present. Shopify OAuth, onboarding, trial activation, Managed Pricing, customer/order processing, privacy services, client code, schemas, and staging configuration are unchanged from the Shopify head.

The production authentication modules are identical to main. Retired emergency/debug reset APIs and the reset page return 404 without account mutation. Token recovery uses atomic single-use claims, new passwords use the production policy, public Sales Admin login cannot initialize credentials, and fixed-password demo/startup provisioning is removed.

## Local validation

- Authentication regressions: 66 tests passed, zero failures/skips, across the 13 affected suites listed in `docs/auth-security-fix.md`. Real recovery-handler SQL executes in PGlite; storage and email are isolated fixtures.
- All `tests/shopify*.test.ts` and `tests/shopify*.test.tsx`: 102 tests passed, zero failures/skips. Includes OAuth/session navigation, rendered onboarding, billing, trial eligibility/reconciliation, real PostgreSQL concurrent trial provisioning, webhook health/registration, privacy capture/redaction, scoped customer erasure, worker races, and alert email safety.
- PostgreSQL fixtures used an explicitly disposable local database, `127.0.0.1:55432/whachat_shopify_test`; no merchant or remote database was used.
- Python staging configuration: 4 tests passed. Diagnostic normalization: 1 test passed.
- Production client/server/worker build: passed. Generated hero assets were excluded from the integration changes.
- TypeScript comparison against the exact Shopify head: base 97, candidate 97, zero added diagnostics. Comparison against production main also reports base 97, candidate 97, zero added diagnostics. The repository-wide typecheck still has pre-existing errors.

Commands used:

```sh
DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:1/fixture node --import tsx --test tests/auth-security-fix.test.ts tests/portal-password-reset.test.ts tests/auth-signup-hardening.test.ts tests/auth-login-rate-limit.test.ts tests/auth-turnstile.test.ts tests/auth-turnstile-siteverify-http.test.ts tests/auth-frontend-errors.test.ts tests/turnstile-signup-retry.test.ts tests/admin-queues-auth.test.ts tests/admin-email-crypto-auth.test.ts tests/account-switch-auth-isolation.test.ts tests/crm-marketplace-handoff-auth.test.ts tests/authenticated-locale.test.ts
SHOPIFY_TEST_DATABASE_URL=postgresql://shopify_test@127.0.0.1:55432/whachat_shopify_test DATABASE_URL=postgresql://shopify_test@127.0.0.1:55432/whachat_shopify_test node --import tsx --test tests/shopify*.test.ts tests/shopify*.test.tsx
python3 tests/shopify-staging-config.test.py
node --test tests/typecheck-diagnostic-normalization.test.mjs
TYPECHECK_BASE_SHA=325b321c6b25d8b246a69446f7873479c4e7c7f4 node scripts/check-types-against-base.mjs
TYPECHECK_BASE_SHA=112ea8c61be69640ec5f63430d32ca7f7ce901f4 node scripts/check-types-against-base.mjs
npm run build
```

## Remaining staging validation

After this synchronization PR is reviewed and merged into the Shopify branch, PR #59 is ready for its remaining staging validation. Validate a browser installation, top-level OAuth and persisted session, first-install trial/onboarding, channel connection, existing/paid merchant routing, a voluntary Managed Pricing round trip, customer/order webhook delivery, uninstall/reinstall eligibility, and privacy workflows using staging fixtures. Automated tests and unchanged source are not evidence of a live Shopify installation or delivery.

No deployment, production merge, live Shopify/Railway configuration change, merchant-data mutation, or operator credential initialization was performed. Existing risks documented in PR #59 and `docs/auth-security-fix.md` still apply.
