/**
 * Inventory source connected-card / available-connector UX states.
 * Run: npx tsx --test tests/inventory-source-connection-ui.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PublicInventorySource } from "../client/src/lib/inventoryApi";
import { buildBridgeSourcePayload } from "../client/src/lib/inventoryApi";
import {
  inventorySourceSaveRequest,
  loadInventorySourceForm,
} from "../client/src/lib/inventorySourceFormState";
import {
  buildInventorySourceSummaryCard,
  canConnectInventoryProvider,
  inventoryConnectedSourceIdentityLine,
  inventoryCredentialConfiguredLabel,
  inventorySecretFieldMode,
  listInventoryConnectorAvailability,
  resolveInventoryFormPanel,
  shouldSendInventorySecretOnSave,
} from "../client/src/lib/inventorySourceConnectionUi";

const SOURCE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function bridgeSource(overrides: Partial<PublicInventorySource> = {}): PublicInventorySource {
  return {
    id: SOURCE_ID,
    provider: "bridge_interactive",
    displayName: "My Bridge inventory",
    connectionStatus: "connected",
    config: {
      datasetId: "miamire",
      syncCities: ["Miami"],
      syncZipCodes: ["33101"],
      maxListings: 2500,
      initialImportComplete: true,
      lastSuccessfulSyncAt: "2026-09-01T00:00:00.000Z",
    },
    integrationId: null,
    lastSyncAt: "2026-09-01T00:00:00.000Z",
    lastSyncStatus: "success",
    lastSyncError: null,
    lastSyncStats: {},
    isActive: true,
    listingSyncSupported: true,
    hasCredentials: true,
    listingCount: 100,
    inventoryStats: {
      activeForMatching: 80,
      configuredCap: 2500,
      totalSynced: 100,
      inactiveOffMarket: 20,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

test("connected Bridge source is a collapsed summary, not an empty connector", () => {
  const source = bridgeSource();
  const card = buildInventorySourceSummaryCard(source);
  assert.equal(card.connectionState, "connected");
  assert.equal(card.connectionStateLabel, "Connected");
  assert.equal(card.providerLabel, "Bridge Interactive");
  assert.equal(card.displayName, "My Bridge inventory");
  assert.equal(card.datasetId, "miamire");
  assert.equal(card.marketScope.includes("Miami"), true);
  assert.equal(card.listingCountLabel.includes("100"), true);
  assert.equal(card.listingCountLabel.includes("2,500"), true);
  assert.equal(card.automaticSyncLabel, "Automatic background sync is on");
  assert.equal(card.lastSuccessfulSyncLabel !== "Never", true);
  assert.equal(card.credentialConfiguredLabel, "Server token configured.");
  assert.equal(card.showReconnect, false);
  assert.equal(card.lastError, null);
  assert.equal(inventoryConnectedSourceIdentityLine(card), "My Bridge inventory / miamire");
  assert.equal(
    inventoryConnectedSourceIdentityLine({
      ...card,
      originatingSystemName: "Miami REALTORS",
      datasetId: "miamire",
    }),
    "Miami REALTORS / miamire",
  );

  const form = loadInventorySourceForm(source, false);
  assert.equal(form.datasetId, "miamire");
  assert.equal(form.serverToken, "");

  const idle = resolveInventoryFormPanel({
    editingSourceId: null,
    connectingProvider: null,
    sources: [source],
  });
  assert.equal(idle.panel.kind, "idle");
});

test("sync or credential errors are Needs attention with Edit/Reconnect", () => {
  const transientFail = buildInventorySourceSummaryCard(
    bridgeSource({ lastSyncStatus: "failed", lastSyncError: "Bridge Interactive HTTP 500" }),
  );
  assert.equal(transientFail.connectionState, "needs_attention");
  assert.equal(transientFail.connectionStateLabel, "Needs attention");
  assert.equal(transientFail.showReconnect, true);
  assert.ok(transientFail.lastError);
  // Non-auth failures keep connectionStatus=connected, so the 6-hour cron still retries.
  assert.equal(transientFail.automaticSyncLabel, "Automatic background sync is on");

  const authFail = buildInventorySourceSummaryCard(
    bridgeSource({
      connectionStatus: "error",
      lastSyncStatus: "failed",
      lastSyncError: "Bridge Interactive HTTP 401",
    }),
  );
  assert.equal(authFail.automaticSyncLabel, "Automatic sync paused until this is resolved");
  assert.ok(authFail.lastError);

  const credError = buildInventorySourceSummaryCard(
    bridgeSource({ connectionStatus: "error", hasCredentials: false, lastSyncError: "Unauthorized" }),
  );
  assert.equal(credError.connectionState, "needs_attention");
  assert.equal(credError.credentialConfiguredLabel, null);
  assert.equal(credError.automaticSyncLabel, "Automatic sync paused until this is resolved");
  assert.ok(credError.lastError);

  const connectors = listInventoryConnectorAvailability([
    bridgeSource({ connectionStatus: "error", lastSyncStatus: "failed" }),
  ]);
  const bridge = connectors.find((c) => c.id === "bridge_interactive");
  assert.equal(bridge?.status, "connected");
  assert.equal(bridge?.disabled, true);
  assert.equal(bridge?.statusLabel, "Connected");
  assert.equal(canConnectInventoryProvider("bridge_interactive", [bridgeSource()]), false);
});

test("card fields come from source/sync data, not from row existence", () => {
  const waitingForImport = buildInventorySourceSummaryCard(
    bridgeSource({
      connectionStatus: "connected",
      lastSyncStatus: null,
      lastSyncAt: null,
      lastSyncError: null,
      listingCount: 0,
      inventoryStats: {
        activeForMatching: 0,
        configuredCap: 2500,
        totalSynced: 0,
        inactiveOffMarket: 0,
      },
      config: { datasetId: "miamire", maxListings: 2500 },
    }),
  );
  assert.equal(waitingForImport.automaticSyncLabel, "Automatic background sync starts after the first completed import");
  assert.equal(waitingForImport.lastSuccessfulSyncLabel, "Never");
  assert.equal(waitingForImport.listingCountLabel.includes("0"), true);
  assert.equal(waitingForImport.lastError, null);

  const runningNotSuccess = buildInventorySourceSummaryCard(
    bridgeSource({
      lastSyncStatus: "running",
      lastSyncAt: "2026-09-15T12:00:00.000Z",
      lastSyncStats: {},
      config: { datasetId: "miamire", initialImportComplete: true },
    }),
  );
  assert.equal(runningNotSuccess.connectionState, "syncing");
  assert.equal(runningNotSuccess.automaticSyncLabel, "Sync in progress");
  assert.equal(runningNotSuccess.lastSuccessfulSyncLabel, "Never");
});

test("disconnected existing source stays in the connected list", () => {
  const card = buildInventorySourceSummaryCard(
    bridgeSource({ isActive: false, connectionStatus: "disconnected_by_user" }),
  );
  assert.equal(card.connectionState, "disconnected");
  assert.equal(card.automaticSyncLabel, "Automatic sync off");
  assert.equal(canConnectInventoryProvider("bridge_interactive", [bridgeSource({ isActive: false })]), false);
});

test("syncing state and available unused providers", () => {
  const syncing = buildInventorySourceSummaryCard(bridgeSource({ lastSyncStatus: "running" }));
  assert.equal(syncing.connectionState, "syncing");
  assert.equal(syncing.connectionStateLabel, "Syncing");
  assert.equal(syncing.automaticSyncLabel, "Sync in progress");

  const connectors = listInventoryConnectorAvailability([bridgeSource()]);
  const trestle = connectors.find((c) => c.id === "trestle");
  const idx = connectors.find((c) => c.id === "idx_broker");
  assert.equal(trestle?.status, "available");
  assert.equal(trestle?.disabled, false);
  assert.equal(trestle?.actionLabel, "Connect");
  assert.equal(idx?.status, "coming_soon");
  assert.equal(idx?.disabled, true);
  assert.equal(idx?.actionLabel, "Coming soon");
  assert.equal(canConnectInventoryProvider("trestle", [bridgeSource()]), true);
});

test("edit settings expands the existing source and PATCHes it", () => {
  const source = bridgeSource();
  const panel = resolveInventoryFormPanel({
    editingSourceId: SOURCE_ID,
    connectingProvider: "bridge_interactive",
    sources: [source],
  });
  assert.equal(panel.panel.kind, "edit");
  assert.equal(panel.isUpdate, true);
  assert.equal(panel.source?.id, SOURCE_ID);
  const save = inventorySourceSaveRequest(panel.source);
  assert.equal(save.method, "PATCH");
  assert.equal(save.url, `/api/inventory/sources/${SOURCE_ID}`);
  const form = loadInventorySourceForm(panel.source, false);
  assert.equal(form.datasetId, "miamire");
  assert.equal(form.syncCities, "Miami");
  assert.equal(form.serverToken, "");
});

test("token replacement is explicit and a blank replacement preserves the stored token", () => {
  assert.equal(inventoryCredentialConfiguredLabel("bridge_interactive"), "Server token configured.");
  assert.equal(
    inventorySecretFieldMode({ isUpdate: true, hasStoredCredentials: true, replacing: false }),
    "hidden_configured",
  );
  assert.equal(
    inventorySecretFieldMode({ isUpdate: true, hasStoredCredentials: true, replacing: true }),
    "replace",
  );
  assert.equal(
    inventorySecretFieldMode({ isUpdate: false, hasStoredCredentials: false, replacing: false }),
    "required_new",
  );

  const form = loadInventorySourceForm(bridgeSource(), false);
  const blankReplace = buildBridgeSourcePayload({ ...form, serverToken: "" }, true);
  assert.equal(blankReplace.credentials, undefined);
  assert.equal(
    shouldSendInventorySecretOnSave({ isUpdate: true, replacing: true, secretValue: "" }),
    false,
  );
  assert.equal(
    shouldSendInventorySecretOnSave({ isUpdate: true, replacing: true, secretValue: "new-token" }),
    true,
  );
  assert.equal(
    shouldSendInventorySecretOnSave({ isUpdate: true, replacing: false, secretValue: "typed-in-error" }),
    false,
  );
});

test("duplicate Bridge provider cannot be added again", () => {
  const connectors = listInventoryConnectorAvailability([bridgeSource()]);
  const bridge = connectors.find((c) => c.id === "bridge_interactive");
  assert.ok(bridge);
  assert.equal(bridge.disabled, true);
  assert.equal(bridge.status, "connected");
  assert.equal(bridge.actionLabel, "Connected");

  const connectAttempt = resolveInventoryFormPanel({
    editingSourceId: null,
    connectingProvider: "bridge_interactive",
    sources: [bridgeSource()],
  });
  assert.equal(connectAttempt.panel.kind, "idle");
  assert.equal(canConnectInventoryProvider("bridge_interactive", [bridgeSource()]), false);
});

test("InventorySourcesSection uses a compact card, modal editor, and hidden connectors", () => {
  const section = readFileSync(
    join(process.cwd(), "client", "src", "components", "inventory", "InventorySourcesSection.tsx"),
    "utf8",
  );
  assert.match(section, /inventory-connected-sources/);
  assert.match(section, /button-inventory-add-another-source/);
  assert.match(section, /button-inventory-fix-connection/);
  assert.match(section, /button-inventory-source-more/);
  assert.match(section, /button-inventory-edit/);
  assert.match(section, /button-inventory-replace-token/);
  assert.match(section, /inventory-source-form/);
  assert.match(section, /<Dialog/);
  assert.match(section, /shouldSyncAfterInventoryCredentialSave/);
  assert.match(section, /inventoryCredentialConfiguredLabel/);
  assert.match(section, /inventoryReplaceSecretLabel/);
  assert.match(section, /inventorySourceSaveRequest/);
  assert.match(section, /listInventoryConnectorAvailability/);
  assert.equal(section.includes("inventory-source-status"), false);
  assert.equal(section.includes("Leave this blank to keep it"), false);
  assert.equal(section.includes("button-inventory-reconnect"), false);
});
