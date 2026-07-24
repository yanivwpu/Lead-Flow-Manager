/**
 * Gmail Sync now must hit the email-channel route, not CRM /integrations/:id/sync.
 * Run: npx tsx tests/gmail-email-sync-route-order.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const routesSrc = readFileSync(join(root, "server/routes.ts"), "utf8");
const emailRoutesSrc = readFileSync(join(root, "server/routes/emailChannel.ts"), "utf8");
const channelSettingsSrc = readFileSync(
  join(root, "client/src/components/ChannelSettings.tsx"),
  "utf8",
);

// Frontend Sync now posts to the native email-channel endpoint (no CRM integration id).
assert.ok(channelSettingsSrc.includes('fetch("/api/integrations/email/sync"'));
assert.ok(channelSettingsSrc.includes('data-testid="button-sync-gmail"'));
assert.ok(channelSettingsSrc.includes('"/api/integrations/email/status"'));

// Backend: status + Sync now both resolve the workspace primary mailbox.
assert.ok(emailRoutesSrc.includes('app.post("/api/integrations/email/sync"'));
assert.ok(emailRoutesSrc.includes('app.get("/api/integrations/email/status"'));
assert.ok(emailRoutesSrc.includes("getWorkspaceEmailStatus"));
assert.ok(emailRoutesSrc.includes("getPrimaryEmailMailbox"));
assert.match(
  emailRoutesSrc,
  /app\.post\("\/api\/integrations\/email\/sync"[\s\S]{0,400}?getPrimaryEmailMailbox/,
);
// Registration order: email channel routes before parameterized CRM sync.
const emailRegisterIdx = routesSrc.indexOf("registerEmailChannelRoutes(app)");
const crmSyncIdx = routesSrc.indexOf('app.post("/api/integrations/:id/sync"');
assert.ok(emailRegisterIdx >= 0, "registerEmailChannelRoutes must be called");
assert.ok(crmSyncIdx >= 0, "CRM :id/sync route must exist");
assert.ok(
  emailRegisterIdx < crmSyncIdx,
  `Email routes must register before /api/integrations/:id/sync (email@${emailRegisterIdx}, crmSync@${crmSyncIdx}) — otherwise Sync now resolves id="email" and returns Integration not found`,
);

// Must not register email routes only after the CRM :id/sync block (regression of late boot registration).
const afterCrmBoot = routesSrc.slice(crmSyncIdx);
assert.ok(
  !afterCrmBoot.includes("registerEmailChannelRoutes(app)"),
  "registerEmailChannelRoutes must not appear only after :id/sync",
);

console.log("gmail-email-sync-route-order.test.ts: all assertions passed");
