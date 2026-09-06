/**
 * Bull Board /admin/queues must require Sales Admin before any queue data.
 * Run: npx tsx tests/admin-queues-auth.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminDenialStatus, isAdminAuthorized } from "../shared/adminAccess";

const indexSrc = readFileSync(join(process.cwd(), "server/index.ts"), "utf8");
assert.match(indexSrc, /app\.use\("\/admin\/queues", requireSalesAdmin, serverAdapter\.getRouter\(\)\)/);
assert.doesNotMatch(indexSrc, /app\.use\("\/admin\/queues", serverAdapter/);

const adjacent = [
  'app.use("/admin/',
  "createBullBoard",
  "express-status-monitor",
  "arena",
];
const otherAdminMounts = [...indexSrc.matchAll(/app\.use\("\/admin\/[^"]+"/g)].map((m) => m[0]);
assert.deepEqual(otherAdminMounts, ['app.use("/admin/queues"']);

assert.equal(adminDenialStatus({ isAdmin: false, hasCrmUser: false }), 401);
assert.equal(adminDenialStatus({ isAdmin: false, hasCrmUser: true }), 403);
assert.equal(adminDenialStatus({ isAdmin: true, hasCrmUser: false }), null);

{
  const denied = await isAdminAuthorized({}, async () => true);
  assert.equal(denied, false);
  const crmOnly = await isAdminAuthorized({ sessionIsAdmin: false, adminToken: "" }, async () => true);
  assert.equal(crmOnly, false);
  const admin = await isAdminAuthorized({ sessionIsAdmin: true }, async () => false);
  assert.equal(admin, true);
}

const auth = readFileSync(join(process.cwd(), "server/adminAuth.ts"), "utf8");
assert.match(auth, /timingSafeStringEqual/);
assert.match(auth, /Admin authentication required/);
assert.doesNotMatch(auth, /console\.(log|info|debug)\([^)]*adminToken/);

void adjacent;

console.log("admin-queues-auth.test.ts: all assertions passed");
