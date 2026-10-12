# Authentication security fix — October 12, 2026

## Confirmed findings and changes

- `/api/auth/emergency-reset` changed allowlisted accounts' passwords using only an email and a chosen password. Neither a session nor a recovery token was required. The reset page and both alternate APIs (`emergency-reset` and secret-based `reset-debug`) now return uniform 404 responses without account lookup or mutation. An email allowlist or shared environment secret is no longer a recovery credential.
- `/api/admin/login` initialized Sales Admin credentials and granted access to the first public requester when `admin_settings` was empty. Login now only verifies existing credentials. Operator initialization uses a separate insert-only script; concurrent initialization cannot replace an existing administrator.
- App and portal token consumption used a read followed by an unconditional write. Concurrent requests could both change a password. Consumption now uses a conditional `UPDATE ... WHERE used_at IS NULL AND expires_at > ... RETURNING`; exactly one requester can claim a token.
- Signup and administrative partner password mutations lacked a shared policy; portal recovery allowed six-character passwords. Newly chosen passwords now require 15 Unicode characters and at most 72 UTF-8 bytes, avoiding bcrypt truncation. Malformed inputs are rejected before token consumption. Bcrypt cost 10 and existing short-password / legacy plaintext migration login remain intact.
- Partner demo login could create an account or overwrite its password with a source-code credential. Startup also provisioned an account with a fixed source-code password. Those provisioning/bypass paths are removed. No OAuth handlers were changed.

## Operator procedure

Normal recovery remains `/api/auth/forgot-password` followed by `/api/auth/reset-password`, or the existing partner/sales portal recovery routes. Tokens remain hashed at rest with a 60-minute lifetime. Forgotten-password responses remain neutral. Do not use the retired emergency APIs, even with `EMERGENCY_AUTH_RESET_SECRET` configured.

For a genuinely uninitialized Sales Admin, an explicitly authorized operator with access to the correct environment's database may run:

```bash
node --import tsx scripts/initialize-sales-admin.ts < /path/to/protected-password-input
```

Supply one newly chosen password through protected stdin, not a command-line argument. Do not commit the input, print it, or place it in shell history. The script does not accept public HTTP requests, prints no credential or hash, and refuses to replace an existing administrator. Run it only when provisioning has been explicitly authorized. This fix does **not** run that script against production.

## Validation

Run from the repository root after `npm ci`:

```bash
node --import tsx tests/auth-security-fix.test.ts
DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:1/fixture node --import tsx tests/portal-password-reset.test.ts
npm run check
npm run build
```

The new integration suite executes real authentication handlers and reset-token SQL using PGlite, fake accounts, mocked storage adapters, and stubbed email delivery. It covers retired recovery routes (including a supplied debug secret), malformed/weak passwords, neutral forgotten-password responses, valid/invalid/expired/reused tokens, concurrent token use for app and both portals, legacy login/migration, operator bootstrap concurrency, public bootstrap rejection, and guarded administrative partner password changes. Administrative partner mutation handlers are executed from the actual route-registration blocks with the real Sales Admin middleware.

Affected existing suites: `portal-password-reset`, `auth-signup-hardening`, `auth-login-rate-limit`, `auth-turnstile`, `auth-turnstile-siteverify-http`, `auth-frontend-errors`, `turnstile-signup-retry`, `admin-queues-auth`, `admin-email-crypto-auth`, `account-switch-auth-isolation`, `crm-marketplace-handoff-auth`, and `authenticated-locale`. The Turnstile source contract now asserts removal of fixed-password startup provisioning.

No production database, real email, password rotation, reset notification, merge, or deployment is part of these tests.

## Release risks and rollback

- Existing Sales Admin credentials and user passwords are not changed; no schema migration is required. Public first-login setup intentionally stops working. New installations require the operator procedure above.
- Existing recovery links continue working subject to expiry and single use. If a credential write fails after a token is claimed, request a fresh recovery link; a claimed token must never become reusable.
- New password choices must meet the stronger policy. Existing passwords remain valid; frontend forms may still describe their previous weaker minimum and the server returns the authoritative validation error.
- Removed demo/seed shortcuts will no longer recreate missing accounts or overwrite an existing password. Previously created fixed-password accounts are not automatically disabled or rotated. An authorized incident-response review should assess their prior exposure and any necessary credential/session remediation separately.
- Session configuration, cookie attributes, normal account login, Sales Admin token derivation, and Shopify OAuth/billing/privacy code remain unchanged.
- Do not roll back by reverting the full security patch: that would reopen takeover and public bootstrap. Prefer a forward correction; if rollback is essential, retain the route removals, login-only admin behavior, and atomic claims.

## Shopify PR #59 integration

The inspected Shopify head is `325b321c6b25d8b246a69446f7873479c4e7c7f4`. It contains the reported emergency reset and first-admin vulnerabilities. Authentication files are otherwise shared with main; its `server/index.ts` and `server/routes.ts` additionally register Shopify privacy routes.

After this security PR is reviewed and merged to main, the Shopify branch maintainer should merge the corrected main into `codex/shopify-trial-first-onboarding` using the normal reviewed integration process. If integration is required earlier, cherry-pick the security commit into a separate integration branch and open a reviewed PR against the Shopify branch. Do not merge, rebase, force-push, or otherwise rewrite the Shopify branch automatically.

Resolve any import/context conflicts by retaining both the security imports and the Shopify route registrations. Re-run this authentication suite, the affected regressions, the Shopify PR's onboarding/OAuth/trial/privacy suites, its comparison against main's TypeScript diagnostics, and the production build. PR #59 must include the security changes before it reaches production.
