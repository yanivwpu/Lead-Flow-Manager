/**
 * RGE inventory source form hydrate / PATCH / secret / isolation regressions.
 * Run: npx tsx --test tests/inventory-source-form-hydrate.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QueryClient } from "@tanstack/react-query";
import { resolveQueryRequestUrl } from "../client/src/lib/accountQueryScope";
import {
  applyInventorySourcesCacheUpdate,
  clearInventorySourceSecrets,
  INVENTORY_SOURCES_BUNDLE_MARKER,
  INVENTORY_SOURCES_QUERY_PATH,
  inventoryFormHydrationIdentity,
  inventoryProviderStorageKey,
  inventorySourcesListQueryKey,
  inventorySourcesQueryKey,
  inventorySourceSaveRequest,
  inventorySourceSyncUrl,
  loadInventorySourceForm,
  normalizeInventorySourcesQueryData,
  pickInitialInventoryProvider,
  resolveActiveInventorySource,
  shouldResetInventoryForm,
} from "../client/src/lib/inventorySourceFormState";
import { buildBridgeSourcePayload, type PublicInventorySource } from "../client/src/lib/inventoryApi";
import { DEFAULT_MAX_LISTINGS } from "../shared/inventory/reso/resoSyncScope";
import {
  buildDuplicateCreateRecoveryPatch,
  credentialsAreBlankOrAbsent,
  duplicateCreateRecoveryPatchIsEmpty,
  isInventorySourcesUserProviderUniqueViolation,
  mergeCredentialsPatch,
  resolveCreateInventorySourcePlan,
  toPublicInventorySource,
} from "../server/inventory/inventorySourceService";
import {
  decryptSourceCredentials,
  encryptSourceCredentials,
} from "../server/inventory/inventoryDb";
import { isEncrypted } from "../server/userTwilio";
import type { InventorySource } from "../shared/schema";

const ACCOUNT_A = "51f64011-eb3a-48a4-bb10-031abd3c0cdc";
const ACCOUNT_B = "2e311869-a443-454c-8da9-fa8ef4dd191e";
const SOURCE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const PLAIN_TOKEN = "bridge-server-token-plain";
const REPLACEMENT_TOKEN = "bridge-server-token-rotated";

function bridgeSource(overrides: Partial<PublicInventorySource> = {}): PublicInventorySource {
  return {
    id: SOURCE_ID,
    provider: "bridge_interactive",
    displayName: "My Bridge inventory",
    connectionStatus: "connected",
    config: {
      datasetId: "miamire",
      expandMedia: true,
      syncCities: ["Miami"],
      syncZipCodes: ["33101"],
      maxListings: 2500,
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

test("existing Bridge source loads into the form without exposing the server token", () => {
  const source = bridgeSource();
  const form = loadInventorySourceForm(source, false);
  assert.equal(form.displayName, "My Bridge inventory");
  assert.equal(form.datasetId, "miamire");
  assert.equal(form.syncCities, "Miami");
  assert.equal(form.syncZipCodes, "33101");
  assert.equal(form.maxListings, 2500);
  assert.equal(form.serverToken, "");
  assert.equal(pickInitialInventoryProvider([source], null), "bridge_interactive");
  assert.equal(resolveActiveInventorySource([source], "bridge_interactive")?.id, SOURCE_ID);
});

test("bundle cache rejects a public array so the two response shapes cannot collide", () => {
  const source = bridgeSource();
  const poisoned = normalizeInventorySourcesQueryData([source]);
  assert.equal(poisoned.sources.length, 0);
  assert.equal(resolveActiveInventorySource(poisoned.sources, "bridge_interactive"), undefined);
  const canonical = normalizeInventorySourcesQueryData({
    sources: [source],
    publicationStats: { totalSynced: 100 },
  });
  assert.equal(canonical.sources.length, 1);
  assert.equal(canonical.sources[0].id, SOURCE_ID);
});

test("public-array and RGE-bundle queries use separate workspace-scoped keys", () => {
  const qc = new QueryClient();
  const source = bridgeSource();
  const legacyUnscoped = [INVENTORY_SOURCES_QUERY_PATH];
  const bundleA = inventorySourcesQueryKey(ACCOUNT_A);
  const bundleB = inventorySourcesQueryKey(ACCOUNT_B);
  const listA = inventorySourcesListQueryKey(ACCOUNT_A);

  assert.notDeepEqual(legacyUnscoped, bundleA);
  assert.notDeepEqual(listA, bundleA);
  assert.notDeepEqual(bundleA, bundleB);
  assert.ok(bundleA.includes(INVENTORY_SOURCES_BUNDLE_MARKER));
  assert.ok(String(bundleA[bundleA.length - 1]).includes(ACCOUNT_A));
  assert.ok(String(listA[listA.length - 1]).includes(ACCOUNT_A));
  assert.equal(resolveQueryRequestUrl(bundleA), INVENTORY_SOURCES_QUERY_PATH);
  assert.equal(resolveQueryRequestUrl(listA), INVENTORY_SOURCES_QUERY_PATH);

  qc.setQueryData(legacyUnscoped, [source]);
  qc.setQueryData(listA, [source]);
  qc.setQueryData(bundleA, { sources: [source], publicationStats: { totalSynced: 1 } });

  assert.equal(Array.isArray(qc.getQueryData(legacyUnscoped)), true);
  assert.equal(Array.isArray(qc.getQueryData(listA)), true);
  assert.equal(Array.isArray(qc.getQueryData(bundleA)), false);
  assert.equal(qc.getQueryData(bundleB), undefined);
  const cachedBundle = qc.getQueryData(bundleA) as { sources: PublicInventorySource[] };
  assert.equal(cachedBundle.sources[0].id, SOURCE_ID);
});

test("stale duplicate POST recovery does not overwrite live source fields", () => {
  const staleCreate = {
    provider: "bridge_interactive" as const,
    displayName: "My Bridge inventory",
    config: {
      datasetId: "",
      expandMedia: true,
      syncCities: [],
      syncZipCodes: [],
      maxListings: DEFAULT_MAX_LISTINGS,
    },
    credentials: { serverToken: "" },
    integrationId: null,
  };
  const stalePatch = buildDuplicateCreateRecoveryPatch("bridge_interactive", staleCreate);
  assert.equal(duplicateCreateRecoveryPatchIsEmpty(stalePatch), true);
  assert.equal(stalePatch.displayName, undefined);
  assert.equal(stalePatch.config, undefined);
  assert.equal(stalePatch.credentials, undefined);
  assert.equal(stalePatch.connectionStatus, undefined);
  assert.equal(stalePatch.isActive, undefined);
  assert.equal(stalePatch.integrationId, undefined);
  assert.equal(credentialsAreBlankOrAbsent(staleCreate.credentials), true);

  const meaningful = buildDuplicateCreateRecoveryPatch("bridge_interactive", {
    provider: "bridge_interactive",
    displayName: "Coral Gables Bridge",
    config: {
      datasetId: "miamire",
      syncCities: ["Coral Gables"],
      maxListings: 2500,
    },
    credentials: { serverToken: "rotated-token" },
  });
  assert.equal(meaningful.displayName, "Coral Gables Bridge");
  assert.deepEqual(meaningful.config, {
    datasetId: "miamire",
    syncCities: ["Coral Gables"],
    maxListings: 2500,
  });
  assert.deepEqual(meaningful.credentials, { serverToken: "rotated-token" });
  assert.equal(meaningful.connectionStatus, undefined);
  assert.equal(credentialsAreBlankOrAbsent({ serverToken: "rotated-token" }), false);
});

test("update uses PATCH, not POST", () => {
  const existing = inventorySourceSaveRequest(bridgeSource());
  assert.equal(existing.method, "PATCH");
  assert.equal(existing.url, `/api/inventory/sources/${SOURCE_ID}`);
  const create = inventorySourceSaveRequest(undefined);
  assert.equal(create.method, "POST");
  assert.equal(create.url, "/api/inventory/sources");
});

test("switching browser tabs does not erase dirty values", () => {
  const identity = inventoryFormHydrationIdentity({
    workspaceUserId: ACCOUNT_A,
    selectedProvider: "bridge_interactive",
    sourceId: SOURCE_ID,
  });
  const form = loadInventorySourceForm(bridgeSource(), false);
  const dirty = { ...form, displayName: "Edited while away", syncCities: "Coral Gables" };

  const afterBlur = inventoryFormHydrationIdentity({
    workspaceUserId: ACCOUNT_A,
    selectedProvider: "bridge_interactive",
    sourceId: SOURCE_ID,
  });
  const afterVisibility = inventoryFormHydrationIdentity({
    workspaceUserId: ACCOUNT_A,
    selectedProvider: "bridge_interactive",
    sourceId: SOURCE_ID,
  });
  const afterAuthRefresh = inventoryFormHydrationIdentity({
    workspaceUserId: ACCOUNT_A,
    selectedProvider: "bridge_interactive",
    sourceId: SOURCE_ID,
  });

  assert.equal(shouldResetInventoryForm(identity, afterBlur), false);
  assert.equal(shouldResetInventoryForm(identity, afterVisibility), false);
  assert.equal(shouldResetInventoryForm(identity, afterAuthRefresh), false);
  assert.equal(dirty.displayName, "Edited while away");
  assert.equal(dirty.syncCities, "Coral Gables");
});

test("query refetch does not reset dirty fields", () => {
  const identity = inventoryFormHydrationIdentity({
    workspaceUserId: ACCOUNT_A,
    selectedProvider: "bridge_interactive",
    sourceId: SOURCE_ID,
  });
  const original = loadInventorySourceForm(bridgeSource(), false);
  const dirty = { ...original, datasetId: "miamire-edited", serverToken: "typed-but-unsaved" };
  const refetched = bridgeSource({
    updatedAt: "2026-09-15T21:00:00.000Z",
    lastSyncStatus: "running",
  });
  const afterRefetch = inventoryFormHydrationIdentity({
    workspaceUserId: ACCOUNT_A,
    selectedProvider: "bridge_interactive",
    sourceId: refetched.id,
  });
  assert.equal(shouldResetInventoryForm(identity, afterRefetch), false);
  assert.equal(dirty.datasetId, "miamire-edited");
  assert.equal(dirty.serverToken, "typed-but-unsaved");
});

test("blank token omits credentials on update so the stored secret is preserved", () => {
  const form = {
    ...loadInventorySourceForm(bridgeSource(), false),
    serverToken: "   ",
  };
  const payload = buildBridgeSourcePayload(form, true);
  assert.equal(payload.credentials, undefined);

  const existing = { serverToken: "stored-encrypted-or-plain" };
  const merged = mergeCredentialsPatch("bridge_interactive", existing, { serverToken: "" });
  assert.equal(merged, undefined);

  const omitted = mergeCredentialsPatch("bridge_interactive", existing, undefined);
  assert.equal(omitted, undefined);
});

test("replacement token is encrypted through the existing path and never returned publicly", () => {
  const existingPlain = { serverToken: PLAIN_TOKEN };
  const merged = mergeCredentialsPatch("bridge_interactive", existingPlain, {
    serverToken: REPLACEMENT_TOKEN,
  });
  assert.deepEqual(merged, { serverToken: REPLACEMENT_TOKEN });

  const encrypted = encryptSourceCredentials(merged!);
  assert.equal(typeof encrypted.serverToken, "string");
  assert.notEqual(encrypted.serverToken, REPLACEMENT_TOKEN);
  assert.notEqual(encrypted.serverToken, PLAIN_TOKEN);
  assert.equal(isEncrypted(String(encrypted.serverToken)), true);

  const decrypted = decryptSourceCredentials(encrypted);
  assert.equal(decrypted.serverToken, REPLACEMENT_TOKEN);

  const publicSource = toPublicInventorySource({
    id: SOURCE_ID,
    userId: ACCOUNT_A,
    provider: "bridge_interactive",
    displayName: "My Bridge inventory",
    connectionStatus: "connected",
    config: { datasetId: "miamire" },
    credentialsEnc: encrypted,
    integrationId: null,
    lastSyncAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    lastSyncStats: {},
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  } as InventorySource);

  const serialized = JSON.stringify(publicSource);
  assert.equal(publicSource.hasCredentials, true);
  assert.equal("serverToken" in publicSource, false);
  assert.equal("credentialsEnc" in publicSource, false);
  assert.equal("credentials" in publicSource, false);
  assert.equal(serialized.includes(REPLACEMENT_TOKEN), false);
  assert.equal(serialized.includes(PLAIN_TOKEN), false);
});

test("save then sync uses the updated existing source", () => {
  const source = bridgeSource();
  const save = inventorySourceSaveRequest(source);
  const saved = applyInventorySourcesCacheUpdate({ sources: [source] }, {
    ...source,
    displayName: "Updated Bridge",
    hasCredentials: true,
  });
  const active = resolveActiveInventorySource(saved.sources, "bridge_interactive");
  assert.ok(active);
  assert.equal(active.id, SOURCE_ID);
  assert.equal(save.method, "PATCH");
  assert.equal(inventorySourceSyncUrl(active), `/api/inventory/sources/${SOURCE_ID}/sync`);
  const afterSaveForm = clearInventorySourceSecrets({
    ...loadInventorySourceForm(active, false),
    serverToken: "should-clear",
  });
  assert.equal(afterSaveForm.datasetId, "miamire");
  assert.equal(afterSaveForm.serverToken, "");
  assert.equal(active.hasCredentials, true);
});

test("workspace and account caches are isolated", () => {
  const qc = new QueryClient();
  const keyA = inventorySourcesQueryKey(ACCOUNT_A);
  const keyB = inventorySourcesQueryKey(ACCOUNT_B);
  qc.setQueryData(keyA, { sources: [bridgeSource()], publicationStats: { totalSynced: 100 } });
  assert.equal(qc.getQueryData(keyB), undefined);
  assert.notDeepEqual(keyA, keyB);
  assert.notEqual(inventoryProviderStorageKey(ACCOUNT_A), inventoryProviderStorageKey(ACCOUNT_B));

  const identityA = inventoryFormHydrationIdentity({
    workspaceUserId: ACCOUNT_A,
    selectedProvider: "bridge_interactive",
    sourceId: SOURCE_ID,
  });
  const identityB = inventoryFormHydrationIdentity({
    workspaceUserId: ACCOUNT_B,
    selectedProvider: "bridge_interactive",
    sourceId: SOURCE_ID,
  });
  assert.equal(shouldResetInventoryForm(identityA, identityB), true);

  const db = readFileSync(join(process.cwd(), "server", "inventory", "inventoryDb.ts"), "utf8");
  assert.match(db, /eq\(inventorySources\.userId, userId\)/);
  assert.match(db, /eq\(inventorySources\.id, sourceId\)/);
});

test("duplicate-source race updates the owned row instead of failing as a create", () => {
  const existing = { id: SOURCE_ID };
  assert.deepEqual(resolveCreateInventorySourcePlan(existing), {
    mode: "update",
    sourceId: SOURCE_ID,
  });
  assert.deepEqual(resolveCreateInventorySourcePlan(undefined), { mode: "insert" });

  assert.equal(
    isInventorySourcesUserProviderUniqueViolation({
      code: "23505",
      constraint: "inventory_sources_user_provider_unique",
    }),
    true,
  );
  assert.equal(
    isInventorySourcesUserProviderUniqueViolation({
      code: "23505",
      cause: {
        constraint: "inventory_sources_user_provider_unique",
        message: "duplicate key value violates unique constraint",
      },
    }),
    true,
  );
  assert.equal(
    isInventorySourcesUserProviderUniqueViolation({ code: "23503", message: "foreign key" }),
    false,
  );

  const schema = readFileSync(join(process.cwd(), "shared", "schema.ts"), "utf8");
  assert.match(schema, /inventory_sources_user_provider_unique/);
  const migration = readFileSync(join(process.cwd(), "migrations", "0031_inventory_sources.sql"), "utf8");
  assert.match(migration, /UNIQUE \(user_id, provider\)/);
  const service = readFileSync(join(process.cwd(), "server", "inventory", "inventorySourceService.ts"), "utf8");
  assert.match(service, /buildDuplicateCreateRecoveryPatch/);
  assert.match(service, /preserveRuntimeState: true/);
  assert.match(service, /credentialsAreBlankOrAbsent/);
});

test("RGE form and Inbox share the bundle queryFn and scoped key", () => {
  const root = join(process.cwd(), "client", "src");
  const section = readFileSync(join(root, "components", "inventory", "InventorySourcesSection.tsx"), "utf8");
  const inbox = readFileSync(join(root, "components", "InboxLeadDetailsPanel.tsx"), "utf8");
  const sidebar = readFileSync(join(root, "components", "inventory", "InventorySidebarSummary.tsx"), "utf8");
  const formState = readFileSync(join(root, "lib", "inventorySourceFormState.ts"), "utf8");

  assert.match(formState, /INVENTORY_SOURCES_BUNDLE_MARKER/);
  assert.match(formState, /inventorySourcesListQueryKey/);
  assert.match(formState, /withUserQueryScope/);

  assert.match(section, /inventorySourcesQueryKey/);
  assert.match(section, /inventorySourceSaveRequest/);
  assert.match(section, /normalizeInventorySourcesQueryData/);
  assert.match(section, /fetchInventorySourcesBundle/);
  assert.doesNotMatch(section, /queryFn:\s*fetchInventorySources[^B]/);

  assert.match(inbox, /fetchInventorySourcesBundle/);
  assert.match(inbox, /inventorySourcesQueryKey/);
  assert.match(inbox, /normalizeInventorySourcesQueryData/);
  assert.doesNotMatch(inbox, /queryFn:\s*fetchInventorySources[^B]/);

  assert.match(sidebar, /fetchInventorySourcesBundle/);
  assert.match(sidebar, /inventorySourcesQueryKey/);
  assert.match(sidebar, /normalizeInventorySourcesQueryData/);
});
