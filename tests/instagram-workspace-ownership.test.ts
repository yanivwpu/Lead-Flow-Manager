import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isInstagramConnectedInAnotherWorkspace } from "../shared/instagramWorkspaceOwnership";

const row = (userId: string, config: Record<string, unknown>, connected = true) => ({
  userId, channel: "instagram", isConnected: connected, config,
});
const target = { instagramAccountId: "17840000123456789", pageId: "998877665544" };

test("the same IG or Page cannot be connected to a different workspace", () => {
  assert.equal(isInstagramConnectedInAnotherWorkspace(
    [row("marketing", { instagramAccountId: target.instagramAccountId, pageId: target.pageId })],
    "realtor", target,
  ), true);
  assert.equal(isInstagramConnectedInAnotherWorkspace(
    [row("marketing", { instagramId: target.instagramAccountId })],
    "realtor", target,
  ), true);
  assert.equal(isInstagramConnectedInAnotherWorkspace(
    [row("marketing", { pageId: target.pageId })],
    "realtor", target,
  ), true);
  assert.equal(isInstagramConnectedInAnotherWorkspace(
    [row("marketing", { instagram_id: target.instagramAccountId })],
    "realtor", target,
  ), true);
});

test("self reconnect, unrelated IG, disconnected entries and other channels are not collisions", () => {
  const rows = [
    row("realtor", { instagramAccountId: target.instagramAccountId, pageId: target.pageId }),
    row("old", { instagramAccountId: target.instagramAccountId }, false),
    row("other", { instagramAccountId: "another-ig", pageId: "another-page" }),
    { userId: "facebook-owner", channel: "facebook", isConnected: true, config: { pageId: target.pageId } },
  ];
  assert.equal(isInstagramConnectedInAnotherWorkspace(rows, "realtor", target), false);
  assert.equal(isInstagramConnectedInAnotherWorkspace(rows, "new", { pageId: null }), false);
  assert.equal(isInstagramConnectedInAnotherWorkspace(rows, "new", { instagramAccountId: "" }), false);
  assert.equal(isInstagramConnectedInAnotherWorkspace(rows, "realtor", { pageId: "another-page" }), true);
});

test("OAuth connection preflight and atomic claim cover legacy bypasses", () => {
  const source = readFileSync(join(process.cwd(), "server/routes.ts"), "utf8");
  const channelRoutes = readFileSync(join(process.cwd(), "server/routes/channels.ts"), "utf8");
  const service = readFileSync(join(process.cwd(), "server/instagramWorkspaceOwnership.ts"), "utf8");
  const settings = readFileSync(join(process.cwd(), "client/src/components/ChannelSettings.tsx"), "utf8");
  const connect = source.slice(
    source.indexOf('app.post("/api/integrations/meta/connect-page"'),
    source.indexOf('app.get("/api/integrations/meta-webhook-config"'),
  );
  assert.ok(connect.indexOf("instagramHasWorkspaceConflict") < connect.indexOf("await connectPage("));
  assert.match(connect, /saveExclusiveInstagramConnection/);
  assert.match(connect, /INSTAGRAM_WORKSPACE_CONFLICT/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /await db\.transaction/);
  assert.match(service, /isInstagramConnectedInAnotherWorkspace\(rows, workspaceUserId, input\)/);
  assert.match(channelRoutes, /channel === "instagram"/);
  assert.match(source, /type === "meta_instagram"\) \{/);
  assert.match(source, /integration\.type === "meta_instagram" && config !== undefined/);
  assert.match(source, /duplicateWorkspaceConnection: instagramIdentityConflict/);
  assert.match(settings, /Account conflict/);
  assert.match(settings, /Messages may appear in the wrong Inbox/);
  // The existing duplicate rows are displayed as a warning until an owner
  // disconnects the redundant integration: no automatic tenant reassignment.
  assert.match(source, /const matchSetting = allSettings\.find/);
});
