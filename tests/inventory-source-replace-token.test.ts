/**
 * Replace-token must change the encrypted credential used by the immediately following sync.
 * Never prints or asserts plaintext token values.
 * Run: npx tsx --test tests/inventory-source-replace-token.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyInventorySourceReconnectSuccessState,
  applyInventorySourceSyncAcceptedState,
  applySecretReplacementToForm,
  buildInventorySourceSummaryCard,
  deriveInventoryConnectionUiState,
  inventoryReconnectFailureMessageIsSafe,
  isInventorySourceEnrolledInBackgroundSync,
  shouldCloseInventorySourceEditorAfterSave,
  shouldSendInventorySecretOnSave,
} from "../client/src/lib/inventorySourceConnectionUi";
import {
  buildBridgeSourcePayload,
  inventorySourceCredentialFieldName,
  payloadIncludesInventoryCredentials,
  type PublicInventorySource,
} from "../client/src/lib/inventoryApi";
import {
  loadInventorySourceForm,
  shouldSyncAfterInventoryCredentialSave,
  inventorySourceSyncUrl,
} from "../client/src/lib/inventorySourceFormState";
import { validateInventorySourceForm } from "../client/src/lib/inventorySourceFormValidation";
import {
  applyBridgeCredentialReplacementForSync,
  mergeCredentialsPatch,
} from "../server/inventory/inventorySourceService";
import { encryptSourceCredentials } from "../server/inventory/inventoryDb";
import { buildResoBearerAuthorization } from "../shared/inventory/inventoryCredentialValue";
import { friendlyInventoryErrorMessage } from "../shared/inventory/inventoryProviderDisplay";

const SOURCE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const REJECTED_TOKEN = "bridge-rejected-token";
const REPLACEMENT_TOKEN = "bridge-replacement-token";

function bridgeSource(overrides: Partial<PublicInventorySource> = {}): PublicInventorySource {
  return {
    id: SOURCE_ID,
    provider: "bridge_interactive",
    displayName: "My Bridge inventory",
    connectionStatus: "error",
    config: { datasetId: "miamire", expandMedia: true, maxListings: 2500 },
    integrationId: null,
    lastSyncAt: "2026-09-01T00:00:00.000Z",
    lastSyncStatus: "failed",
    lastSyncError: "Bridge Interactive HTTP 401",
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
    updatedAt: "2026-09-15T00:00:00.000Z",
    ...overrides,
  };
}

test("blank Replace token is rejected and omits credentials so a naive save cannot rotate", () => {
  const form = loadInventorySourceForm(bridgeSource(), false);
  const blankReplace = validateInventorySourceForm({
    provider: "bridge_interactive",
    form,
    isUpdate: true,
    hasStoredCredentials: true,
    replacingSecret: true,
  });
  assert.equal(blankReplace.valid, false);
  if (!blankReplace.valid) {
    assert.equal(Boolean(blankReplace.errors.serverToken), true);
  }

  const keepStored = validateInventorySourceForm({
    provider: "bridge_interactive",
    form,
    isUpdate: true,
    hasStoredCredentials: true,
    replacingSecret: false,
  });
  assert.equal(keepStored.valid, true);

  assert.equal(
    shouldSendInventorySecretOnSave({ isUpdate: true, replacing: true, secretValue: "" }),
    false,
  );
  const omitted = buildBridgeSourcePayload(applySecretReplacementToForm(form, true), true);
  assert.equal(payloadIncludesInventoryCredentials(omitted), false);
  assert.equal(omitted.credentials, undefined);
});

test("Replace token PATCH uses credentials.serverToken and the following sync uses the new encrypted secret", () => {
  assert.equal(inventorySourceCredentialFieldName("bridge_interactive"), "serverToken");

  const form = {
    ...loadInventorySourceForm(bridgeSource(), false),
    serverToken: `Bearer ${REPLACEMENT_TOKEN}`,
  };
  const replacingForm = applySecretReplacementToForm(form, true);
  const payload = buildBridgeSourcePayload(replacingForm, true);

  assert.equal(payloadIncludesInventoryCredentials(payload), true);
  assert.equal(Boolean(payload.credentials && "serverToken" in payload.credentials), true);
  assert.equal(shouldSyncAfterInventoryCredentialSave(payload), true);
  assert.equal(inventorySourceSyncUrl({ id: SOURCE_ID }), `/api/inventory/sources/${SOURCE_ID}/sync`);

  const ignoredTypedSecret = applySecretReplacementToForm(
    { ...form, serverToken: REPLACEMENT_TOKEN },
    false,
  );
  const nonReplacePayload = buildBridgeSourcePayload(ignoredTypedSecret, true);
  assert.equal(payloadIncludesInventoryCredentials(nonReplacePayload), false);

  const existingEnc = encryptSourceCredentials({ serverToken: REJECTED_TOKEN });
  const blankWouldKeepRejected = applyBridgeCredentialReplacementForSync({
    existingCredentialsEnc: existingEnc,
    patchCredentials: { serverToken: "" },
  });
  assert.equal(blankWouldKeepRejected.credentialsUpdated, false);
  assert.equal(blankWouldKeepRejected.usedStaleCredentials, true);
  assert.equal(blankWouldKeepRejected.tokenReplaced, false);
  assert.equal(blankWouldKeepRejected.credentialPresent, true);

  const replaced = applyBridgeCredentialReplacementForSync({
    existingCredentialsEnc: existingEnc,
    patchCredentials: payload.credentials,
  });
  assert.equal(replaced.credentialsUpdated, true);
  assert.equal(replaced.usedStaleCredentials, false);
  assert.equal(replaced.tokenReplaced, true);
  assert.equal(replaced.credentialPresent, true);
  assert.equal(replaced.authorizationHeaderWellFormed, true);

  const merged = mergeCredentialsPatch("bridge_interactive", { serverToken: REJECTED_TOKEN }, payload.credentials);
  assert.equal(merged !== undefined, true);
  const authorization = buildResoBearerAuthorization(String(merged?.serverToken ?? ""));
  assert.equal(authorization.startsWith("Bearer "), true);
  assert.equal(/^Bearer\s+Bearer\s+/i.test(authorization), false);
});

test("immediately following sync reloads the persisted source and builds Bearer auth from decrypted credentials", () => {
  const syncSrc = readFileSync(join(process.cwd(), "server", "inventory", "inventorySyncService.ts"), "utf8");
  assert.match(syncSrc, /export async function startInventorySourceSync/);
  assert.match(syncSrc, /let source = await getInventorySource\(userId, sourceId\)/);
  assert.match(syncSrc, /buildAdapterContext\(source\)/);

  const adapterSrc = readFileSync(
    join(process.cwd(), "server", "inventory", "providers", "bridgeInteractiveResoProvider.ts"),
    "utf8",
  );
  assert.match(adapterSrc, /creds\.serverToken/);
  assert.match(adapterSrc, /normalizeInventorySecretValue/);

  const clientSrc = readFileSync(join(process.cwd(), "server", "inventory", "reso", "resoClient.ts"), "utf8");
  assert.match(clientSrc, /buildResoBearerAuthorization\(this\.auth\.token\)/);

  const routesSrc = readFileSync(join(process.cwd(), "server", "routes", "inventory.ts"), "utf8");
  assert.match(routesSrc, /validateSourceConnection/);
  assert.match(routesSrc, /startInventorySourceSync/);

  const sectionSrc = readFileSync(
    join(process.cwd(), "client", "src", "components", "inventory", "InventorySourcesSection.tsx"),
    "utf8",
  );
  assert.match(sectionSrc, /shouldSyncAfterInventoryCredentialSave\(payload\)/);
  assert.match(sectionSrc, /inventorySourceSyncUrl/);
  assert.match(sectionSrc, /replacingSecret/);
  assert.match(sectionSrc, /applyInventorySourceSyncAcceptedState/);
  assert.match(sectionSrc, /shouldCloseInventorySourceEditorAfterSave/);
});

test("successful reconnect updates public source fields used by the card and closes the editor", () => {
  const broken = bridgeSource();
  assert.equal(deriveInventoryConnectionUiState(broken), "needs_attention");
  assert.equal(isInventorySourceEnrolledInBackgroundSync(broken), false);

  const accepted = applyInventorySourceSyncAcceptedState(broken);
  assert.equal(accepted.connectionStatus, "connected");
  assert.equal(accepted.lastSyncStatus, "running");
  assert.equal(accepted.lastSyncError, null);
  assert.equal(deriveInventoryConnectionUiState(accepted), "syncing");
  assert.equal(shouldCloseInventorySourceEditorAfterSave({ syncError: null }), true);

  const syncedAt = "2026-09-16T02:30:00.000Z";
  const succeeded = applyInventorySourceReconnectSuccessState(broken, syncedAt);
  assert.equal(succeeded.connectionStatus, "connected");
  assert.equal(succeeded.lastSyncStatus, "success");
  assert.equal(succeeded.lastSyncError, null);
  assert.equal(succeeded.config.initialImportComplete, true);
  assert.equal(isInventorySourceEnrolledInBackgroundSync(succeeded), true);
  const card = buildInventorySourceSummaryCard(succeeded);
  assert.equal(card.connectionState, "connected");
  assert.equal(card.connectionStateLabel, "Connected");
  assert.equal(card.lastError, null);
  assert.equal(card.lastSuccessfulSyncLabel !== "Never", true);
});

test("failed immediate sync keeps the editor open with a safe error", () => {
  assert.equal(
    shouldCloseInventorySourceEditorAfterSave({
      syncError: "Bridge Interactive HTTP 401: Unauthorized",
    }),
    false,
  );
  const replacement = "bridge-replacement-token";
  const message = friendlyInventoryErrorMessage("Bridge Interactive HTTP 401: Unauthorized");
  assert.equal(message, "Bridge server token was rejected. Confirm your dataset ID and server token, then validate again.");
  assert.equal(inventoryReconnectFailureMessageIsSafe(message, replacement), true);
  assert.equal(inventoryReconnectFailureMessageIsSafe(`${message} ${replacement}`, replacement), false);
  const card = buildInventorySourceSummaryCard(
    bridgeSource({ lastSyncError: "Bridge Interactive HTTP 401: Unauthorized" }),
  );
  assert.equal(card.lastError, message);
  assert.equal(message.includes(replacement), false);
});

test("POST /sync queues the listing import and returns without waiting for it", () => {
  const syncSrc = readFileSync(join(process.cwd(), "server", "inventory", "inventorySyncService.ts"), "utf8");
  assert.match(syncSrc, /setImmediate\(\(\) => \{/);
  assert.match(syncSrc, /void runInventorySyncJob/);
  assert.match(syncSrc, /return \{ started: true \}/);
  const startedIdx = syncSrc.indexOf("return { started: true }");
  const jobIdx = syncSrc.indexOf("async function runInventorySyncJob");
  assert.equal(startedIdx > 0 && jobIdx > startedIdx, true);

  const routesSrc = readFileSync(join(process.cwd(), "server", "routes", "inventory.ts"), "utf8");
  assert.match(routesSrc, /res\.status\(202\)\.json\(\{ syncStarted: true, validated: true \}\)/);

  const sectionSrc = readFileSync(
    join(process.cwd(), "client", "src", "components", "inventory", "InventorySourcesSection.tsx"),
    "utf8",
  );
  assert.match(sectionSrc, /The replacement token was saved and sync started/);
  assert.equal(sectionSrc.includes("await runInventorySyncJob"), false);
});
