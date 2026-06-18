/**
 * Copilot inventory connected state + settings route.
 * Run: npx tsx tests/copilot-inventory-connected.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isWorkspaceInventoryConnected } from "../shared/inventory/inventoryWorkspaceConnected";
import {
  RGE_INVENTORY_SETTINGS_HASH,
  RGE_INVENTORY_SETTINGS_PATH,
  RGE_TEMPLATE_DETAIL_PATH,
} from "../shared/rgePaths";

function testConnectedWithListingsButNotStrictConnectionStatus() {
  const connected = isWorkspaceInventoryConnected([
    {
      isActive: true,
      listingSyncSupported: true,
      connectionStatus: "error",
      lastSyncAt: "2026-06-01T00:00:00.000Z",
      listingCount: 42,
      inventoryStats: { totalSynced: 42, activeForMatching: 30 },
    },
  ]);
  assert.equal(connected, true, "listings/sync history counts as connected");
  console.log("  connected with listings: OK");
}

function testConnectedWithValidatedSource() {
  const connected = isWorkspaceInventoryConnected([
    {
      isActive: true,
      listingSyncSupported: true,
      connectionStatus: "connected",
      hasCredentials: true,
    },
  ]);
  assert.equal(connected, true);
  console.log("  connected with MLS source: OK");
}

function testDisconnectedWithoutSources() {
  assert.equal(isWorkspaceInventoryConnected([]), false);
  assert.equal(
    isWorkspaceInventoryConnected([
      {
        isActive: false,
        listingSyncSupported: true,
        connectionStatus: "connected",
      },
    ]),
    false,
  );
  console.log("  disconnected without active source: OK");
}

function testZeroMatchesIsStillConnected() {
  const connected = isWorkspaceInventoryConnected([
    {
      isActive: true,
      listingSyncSupported: true,
      connectionStatus: "connected",
      inventoryStats: { totalSynced: 100, activeForMatching: 0 },
    },
  ]);
  assert.equal(connected, true, "zero matchable listings still connected");
  console.log("  zero matches still connected: OK");
}

function testInventorySettingsRoute() {
  assert.equal(
    RGE_INVENTORY_SETTINGS_PATH,
    `${RGE_TEMPLATE_DETAIL_PATH}#${RGE_INVENTORY_SETTINGS_HASH}`,
  );
  assert.ok(
    RGE_INVENTORY_SETTINGS_PATH.includes("#inventory-sources"),
    "settings path includes inventory anchor",
  );
  assert.notEqual(
    RGE_INVENTORY_SETTINGS_PATH,
    RGE_TEMPLATE_DETAIL_PATH,
    "settings path is not bare template route",
  );
  console.log("  inventory settings route: OK");
}

function testInboxDoesNotLinkBareTemplateRoute() {
  const root = join(process.cwd(), "client", "src", "components");
  const emptyState = readFileSync(join(root, "inventory", "CopilotInventoryEmptyState.tsx"), "utf8");
  assert.ok(
    emptyState.includes("RGE_INVENTORY_SETTINGS_PATH"),
    "Copilot empty state uses inventory settings path constant",
  );
  assert.ok(
    !emptyState.includes('href="/app/templates/realtor-growth-engine"'),
    "no hardcoded bare template href in Copilot",
  );

  const inbox = readFileSync(join(root, "InboxLeadDetailsPanel.tsx"), "utf8");
  assert.ok(
    !inbox.includes('"/app/templates/realtor-growth-engine"'),
    "Inbox panel does not hardcode bare template route",
  );
  assert.ok(
    inbox.includes("isWorkspaceInventoryConnected"),
    "Inbox uses workspace inventory connected helper",
  );
  console.log("  inbox route wiring: OK");
}

function main() {
  console.log("copilot-inventory-connected tests");
  testConnectedWithListingsButNotStrictConnectionStatus();
  testConnectedWithValidatedSource();
  testDisconnectedWithoutSources();
  testZeroMatchesIsStillConnected();
  testInventorySettingsRoute();
  testInboxDoesNotLinkBareTemplateRoute();
  console.log("\nAll tests passed.");
}

main();
