/**
 * Sales Admin auth for email-crypto diagnostics.
 * Run: npx tsx tests/admin-email-crypto-auth.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hasAdminSession, isAdminAuthorized } from "../shared/adminAccess";

{
  assert.equal(hasAdminSession({ sessionIsAdmin: true }), true);
  assert.equal(hasAdminSession({ sessionIsAdmin: false }), false);
  assert.equal(hasAdminSession({}), false);
  assert.equal(hasAdminSession({ sessionIsAdmin: null }), false);
}

{
  // Unauthorized — no session, no token
  const denied = await isAdminAuthorized({}, async () => true);
  assert.equal(denied, false);

  // Unauthorized — token present but invalid
  const badToken = await isAdminAuthorized(
    { adminToken: "not-valid" },
    async () => false,
  );
  assert.equal(badToken, false);

  // Normal CRM owner session is NOT modeled as sessionIsAdmin — must be rejected
  const ownerSession = await isAdminAuthorized(
    { sessionIsAdmin: false, adminToken: null },
    async () => true,
  );
  assert.equal(ownerSession, false);
}

{
  // Existing admin session path (POST /api/admin/login → session.isAdmin)
  const sessionOk = await isAdminAuthorized(
    { sessionIsAdmin: true },
    async () => {
      throw new Error("verifyAdminToken should not be called when session is admin");
    },
  );
  assert.equal(sessionOk, true);
}

{
  // Existing internal admin token path (x-admin-token)
  let seen = "";
  const tokenOk = await isAdminAuthorized(
    { sessionIsAdmin: false, adminToken: "persist-token" },
    async (token) => {
      seen = token;
      return token === "persist-token";
    },
  );
  assert.equal(tokenOk, true);
  assert.equal(seen, "persist-token");
}

{
  const routesSrc = readFileSync(
    join(import.meta.dirname, "..", "server/routes.ts"),
    "utf8",
  );
  const start = routesSrc.indexOf('/api/admin/diagnostics/email-crypto');
  assert.ok(start >= 0, "email-crypto route must exist");
  // Route must be registered with requireAdmin (same pattern as other admin endpoints)
  const window = routesSrc.slice(Math.max(0, start - 200), start + 400);
  assert.ok(window.includes("requireAdmin"));
  assert.ok(routesSrc.includes("isAdminAuthorized"));
  assert.ok(
    routesSrc.includes("Does NOT accept normal WhachatCRM owner login"),
  );
}

{
  const adminSrc = readFileSync(
    join(import.meta.dirname, "..", "client/src/pages/Admin.tsx"),
    "utf8",
  );
  assert.ok(adminSrc.includes("AdminEmailCryptoTab"));
  assert.ok(adminSrc.includes('value="email-crypto"') || adminSrc.includes("email-crypto"));
}

console.log("admin-email-crypto-auth.test.ts: all assertions passed");
