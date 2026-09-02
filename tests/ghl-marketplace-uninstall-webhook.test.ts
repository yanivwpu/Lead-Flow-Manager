/**
 * Route-level GHL Marketplace UNINSTALL: real HTTP against POST /api/ext/webhook.
 * Uses an in-memory lifecycle store — never writes production rows.
 * Run: npx tsx --test tests/ghl-marketplace-uninstall-webhook.test.ts
 */
process.env.GHL_WEBHOOK_ROUTE_TEST = "1";

import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import { handleGhlWebhook } from "../server/ghlRoutes";
import { storage } from "../server/storage";
import { resolveUserGhlConnectionStatus } from "../server/ghlConnectionDiagnostics";
import {
  createMemoryGhlLifecyclePersistence,
  setGhlLifecyclePersistenceForTests,
} from "../server/ghlMarketplaceLifecycleStore";
import { parseGhlLifecycleEvent } from "../shared/ghlMarketplaceLifecycle";
import type { Integration } from "@shared/schema";

const APP_ID = "698aac74b0b22c778055e2cc";
const VERSION_ID = "6a9508949596830098ee3525";
const COMPANY_ID = "co_sandbox_1";
const LOCATION_ID = "loc_sandbox_1";
const USER_ID = "user_sandbox_1";
const OTHER_USER_ID = "user_other_tenant";
const OTHER_COMPANY_ID = "co_other_tenant";
const OTHER_LOCATION_ID = "loc_other_tenant";
const ACCESS_SECRET = "SECRET_ACCESS_TOKEN_XYZ_DO_NOT_LOG";
const REFRESH_SECRET = "SECRET_REFRESH_TOKEN_XYZ_DO_NOT_LOG";
const HANDOFF_MARK = "pending-handoff-identity";

const PRODUCTION_UNINSTALL_SHAPE = {
  type: "UNINSTALL",
  appId: APP_ID,
  locationId: LOCATION_ID,
  webhookId: "a8acc102-542e-4425-927c-30a0dbae0fe3",
  timestamp: "2026-09-02T02:14:26.534Z",
  versionId: VERSION_ID,
  userId: "MDWRlJpN0ePLWn51JUaM",
  planId: "698abb1fc7198bfbf0b89a99",
  installType: "Location",
};

function productionUninstallBody(overrides: Record<string, unknown> = {}) {
  return {
    type: "UNINSTALL",
    appId: APP_ID,
    locationId: LOCATION_ID,
    versionId: VERSION_ID,
    userId: "MDWRlJpN0ePLWn51JUaM",
    planId: "698abb1fc7198bfbf0b89a99",
    installType: "Location",
    webhookId: `wh_un_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    timestamp: new Date(Date.now() + 5_000).toISOString(),
    ...overrides,
  };
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
process.env.GHL_WEBHOOK_ED25519_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" }).toString();

function signBody(raw: Buffer): string {
  return sign(null, raw, privateKey).toString("base64");
}

type TestIntegration = Integration & { config: Record<string, unknown> };

function makeIntegration(partial: Partial<TestIntegration> & Pick<TestIntegration, "id" | "userId">): TestIntegration {
  return {
    type: "gohighlevel",
    name: "CRM Integration",
    isActive: true,
    accessToken: ACCESS_SECRET,
    refreshToken: REFRESH_SECRET,
    tokenExpiresAt: new Date(Date.now() + 86400_000),
    config: {},
    lastSyncAt: new Date(),
    createdAt: new Date(),
    ...partial,
  } as TestIntegration;
}

let memory = createMemoryGhlLifecyclePersistence();
let integrations: TestIntegration[] = [];
const logs: string[] = [];
let origLog: typeof console.log;
let origError: typeof console.error;
let origGetAll: typeof storage.getAllIntegrationsByType;
let origUpdate: typeof storage.updateIntegration;
let origGet: typeof storage.getIntegrations;

function installStorageMocks() {
  origGetAll = storage.getAllIntegrationsByType.bind(storage);
  origUpdate = storage.updateIntegration.bind(storage);
  origGet = storage.getIntegrations.bind(storage);
  storage.getAllIntegrationsByType = (async (type: string) =>
    integrations.filter((row) => row.type === type)) as typeof storage.getAllIntegrationsByType;
  storage.getIntegrations = (async (userId: string) =>
    integrations.filter((row) => row.userId === userId)) as typeof storage.getIntegrations;
  storage.updateIntegration = (async (id: string, updates: Partial<Integration>) => {
    const row = integrations.find((item) => item.id === id);
    if (!row) return undefined;
    Object.assign(row, updates);
    return row;
  }) as typeof storage.updateIntegration;
}

function restoreStorageMocks() {
  if (origGetAll) storage.getAllIntegrationsByType = origGetAll;
  if (origUpdate) storage.updateIntegration = origUpdate;
  if (origGet) storage.getIntegrations = origGet;
}

async function withWebhookApp(
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(
    express.json({
      type: "*/*",
      verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.post("/api/ext/webhook", handleGhlWebhook);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no listen address");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function postWebhook(
  baseUrl: string,
  body: Record<string, unknown>,
  options?: { signature?: string | null; webhookId?: string },
): Promise<{ status: number; json: Record<string, unknown> }> {
  const payload = options?.webhookId ? { ...body, webhookId: options.webhookId } : body;
  const raw = Buffer.from(JSON.stringify(payload), "utf8");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options?.signature !== null) {
    headers["x-ghl-signature"] = options?.signature || signBody(raw);
  }
  const res = await fetch(`${baseUrl}/api/ext/webhook`, {
    method: "POST",
    headers,
    body: raw,
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

function captureLogs() {
  origLog = console.log;
  origError = console.error;
  const push = (...args: unknown[]) => {
    logs.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  console.log = (...args: unknown[]) => {
    push(...args);
  };
  console.error = (...args: unknown[]) => {
    push(...args);
  };
}

function restoreLogs() {
  if (origLog) console.log = origLog;
  if (origError) console.error = origError;
}

function assertNoSecretsInLogs() {
  const blob = logs.join("\n");
  assert.doesNotMatch(blob, new RegExp(ACCESS_SECRET));
  assert.doesNotMatch(blob, new RegExp(REFRESH_SECRET));
  assert.doesNotMatch(blob, /client_secret/i);
  assert.doesNotMatch(blob, /authorizationCode|authorization_code/);
}

async function seedConnectedLocationPlusAgencyToken(params?: {
  companyId?: string;
  locationId?: string;
  userId?: string;
  integrationId?: string;
  includeHandoff?: boolean;
}) {
  const companyId = params?.companyId ?? COMPANY_ID;
  const locationId = params?.locationId ?? LOCATION_ID;
  const userId = params?.userId ?? USER_ID;
  const integrationId = params?.integrationId ?? "int_agency_1";
  await persistInstall({
    type: "INSTALL",
    appId: APP_ID,
    companyId,
    locationId,
    versionId: VERSION_ID,
    planId: "plan_free_test",
    webhookId: `wh_install_${locationId}_${Date.now()}_${Math.random()}`,
    timestamp: new Date(Date.now() - 60_000).toISOString(),
  });
  const locRow = memory.installs.find((row) => row.locationId === locationId);
  assert.ok(locRow);
  locRow.integrationId = integrationId;
  locRow.whachatUserId = userId;
  await memory.insertInstall({
    agency: null,
    companyId,
    locationId: null,
    appId: null,
    marketplacePlanId: null,
    paymentStatus: null,
    ghlUserId: null,
    previousVersionId: null,
    versionId: null,
    ghlTrialOnTrial: null,
    ghlTrialDuration: null,
    ghlTrialStartDate: null,
    lastWebhookId: null,
    lastEventOccurredAt: null,
    lastEventType: null,
    unknownPlanWarning: null,
    installationStatus: "Active",
    uninstallDate: null,
    pricePlan: null,
    billingStatus: null,
    source: "oauth",
    rawPayload: { companyId, userType: "Company" },
    lastSyncedAt: new Date(),
    updatedAt: new Date(),
    installDate: new Date(),
    integrationId,
    whachatUserId: userId,
  });
  integrations.push(
    makeIntegration({
      id: integrationId,
      userId,
      config: { companyId, locationId: null, userType: "Company", appId: APP_ID },
    }),
  );
  if (params?.includeHandoff) {
    memory.handoffs.push({
      id: `handoff_${locationId}`,
      companyId,
      locationId,
      appId: APP_ID,
      consumedAt: null,
    });
  }
}

async function persistInstall(body: Record<string, unknown>) {
  await withWebhookApp(async (baseUrl) => {
    const result = await postWebhook(baseUrl, body);
    assert.equal(result.status, 200);
    assert.deepEqual(result.json, { received: true });
  });
}

test.beforeEach(() => {
  memory = createMemoryGhlLifecyclePersistence();
  setGhlLifecyclePersistenceForTests(memory);
  integrations = [];
  logs.length = 0;
  installStorageMocks();
  captureLogs();
});

test.afterEach(() => {
  restoreLogs();
  restoreStorageMocks();
  setGhlLifecyclePersistenceForTests(null);
});

test("1. production location UNINSTALL payload shape is classified as UNINSTALL", () => {
  const parsed = parseGhlLifecycleEvent(PRODUCTION_UNINSTALL_SHAPE);
  assert.ok(parsed);
  assert.equal(parsed.type, "UNINSTALL");
  assert.equal(parsed.locationId, LOCATION_ID);
  assert.equal(parsed.companyId, "unknown");
  assert.equal(parsed.appId, APP_ID);
  assert.equal(parsed.versionId, VERSION_ID);
});

test("2. INSTALL → agency-token Connected → location UNINSTALL → not Connected", async () => {
  await seedConnectedLocationPlusAgencyToken();
  const before = await resolveUserGhlConnectionStatus(USER_ID);
  assert.equal(before.connected, true);

  await withWebhookApp(async (baseUrl) => {
    const result = await postWebhook(baseUrl, productionUninstallBody());
    assert.equal(result.status, 200);
    assert.deepEqual(result.json, { received: true });
  });

  const locRow = memory.installs.find((row) => row.locationId === LOCATION_ID);
  const agencyRow = memory.installs.find((row) => row.companyId === COMPANY_ID && !row.locationId);
  assert.equal(locRow?.installationStatus, "Uninstalled");
  assert.equal(locRow?.companyId, COMPANY_ID);
  assert.equal(agencyRow?.installationStatus, "Uninstalled");
  const integration = integrations.find((row) => row.id === "int_agency_1");
  assert.equal(integration?.isActive, false);
  assert.equal(integration?.accessToken, null);
  assert.equal(integration?.refreshToken, null);
  const after = await resolveUserGhlConnectionStatus(USER_ID);
  assert.equal(after.connected, false);
  assert.equal(after.connectionState, "not_connected");
  assert.equal(after.installedInGhlNotConnected, false);
  assert.match(logs.join("\n"), /webhook_uninstall_credentials_revoked/);
  assertNoSecretsInLogs();
});

test("3. location-level installation with agency-level OAuth identity is revoked", async () => {
  await seedConnectedLocationPlusAgencyToken();
  await withWebhookApp(async (baseUrl) => {
    await postWebhook(baseUrl, {
      type: "UNINSTALL",
      appId: APP_ID,
      locationId: LOCATION_ID,
    });
  });
  const integration = integrations[0];
  assert.equal(integration.config.locationId, null);
  assert.equal(integration.config.companyId, COMPANY_ID);
  assert.equal(integration.isActive, false);
  assert.equal(integration.accessToken, null);
  assert.match(logs.join("\n"), /location_plus_agency_token/);
  const agencyRow = memory.installs.find((row) => row.companyId === COMPANY_ID && !row.locationId);
  assert.equal(agencyRow?.installationStatus, "Uninstalled");
});

test("4. duplicate agency/location rows cannot leave a stale Connected result", async () => {
  await seedConnectedLocationPlusAgencyToken();
  const afterUninstall = memory.installs.filter((row) => row.integrationId === "int_agency_1");
  assert.ok(afterUninstall.length >= 1);
  await withWebhookApp(async (baseUrl) => {
    await postWebhook(baseUrl, productionUninstallBody());
  });
  const duplicateStatus = await resolveUserGhlConnectionStatus(USER_ID);
  assert.equal(duplicateStatus.connected, false);
  assert.equal(duplicateStatus.connectionState, "not_connected");
  assert.equal(
    memory.installs
      .filter((row) => row.integrationId === "int_agency_1")
      .every((row) => String(row.installationStatus).toLowerCase() === "uninstalled"),
    true,
  );
});

test("5. repeated UNINSTALL is idempotent", async () => {
  await seedConnectedLocationPlusAgencyToken();
  await withWebhookApp(async (baseUrl) => {
    const uninstallBody = productionUninstallBody({ webhookId: "wh_un_repeat_1" });
    const first = await postWebhook(baseUrl, uninstallBody);
    const second = await postWebhook(baseUrl, uninstallBody);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.deepEqual(second.json, { received: true });
  });
  assert.equal(integrations[0].isActive, false);
  assert.equal(integrations[0].accessToken, null);
  const blob = logs.join("\n");
  assert.match(blob, /webhook_uninstall_credentials_revoked/);
  assert.match(blob, /webhook_uninstall_already_revoked/);
});

test("6. wrong company/location/app identity fails closed", async () => {
  await seedConnectedLocationPlusAgencyToken();
  await withWebhookApp(async (baseUrl) => {
    const result = await postWebhook(baseUrl, {
      type: "UNINSTALL",
      appId: APP_ID,
      locationId: "loc_does_not_exist",
      companyId: "co_does_not_exist",
    });
    assert.equal(result.status, 200);
  });
  assert.equal(integrations[0].isActive, true);
  assert.equal(integrations[0].accessToken, ACCESS_SECRET);
  assert.equal(await (await resolveUserGhlConnectionStatus(USER_ID)).connected, true);
});

test("7. UNINSTALL revokes unconsumed pending handoffs for that identity", async () => {
  await seedConnectedLocationPlusAgencyToken({ includeHandoff: true });
  memory.handoffs.push({
    id: "handoff_other",
    companyId: OTHER_COMPANY_ID,
    locationId: OTHER_LOCATION_ID,
    appId: APP_ID,
    consumedAt: null,
  });
  await withWebhookApp(async (baseUrl) => {
    await postWebhook(baseUrl, productionUninstallBody());
  });
  const mine = memory.handoffs.find((row) => row.id === `handoff_${LOCATION_ID}`);
  const other = memory.handoffs.find((row) => row.id === "handoff_other");
  assert.ok(mine?.consumedAt);
  assert.equal(other?.consumedAt, null);
  void HANDOFF_MARK;
});

test("8. UNINSTALL does not revoke another tenant", async () => {
  await seedConnectedLocationPlusAgencyToken();
  await seedConnectedLocationPlusAgencyToken({
    companyId: OTHER_COMPANY_ID,
    locationId: OTHER_LOCATION_ID,
    userId: OTHER_USER_ID,
    integrationId: "int_other",
  });
  await withWebhookApp(async (baseUrl) => {
    await postWebhook(baseUrl, productionUninstallBody());
  });
  const mine = integrations.find((row) => row.id === "int_agency_1");
  const other = integrations.find((row) => row.id === "int_other");
  assert.equal(mine?.accessToken, null);
  assert.equal(other?.isActive, true);
  assert.equal(other?.accessToken, ACCESS_SECRET);
  assert.equal(await (await resolveUserGhlConnectionStatus(OTHER_USER_ID)).connected, true);
});

test("9. reinstall after uninstall can connect again", async () => {
  await seedConnectedLocationPlusAgencyToken();
  await withWebhookApp(async (baseUrl) => {
    await postWebhook(baseUrl, productionUninstallBody());
  });
  assert.equal(await (await resolveUserGhlConnectionStatus(USER_ID)).connected, false);

  await persistInstall({
    type: "INSTALL",
    appId: APP_ID,
    companyId: COMPANY_ID,
    locationId: LOCATION_ID,
    versionId: VERSION_ID,
    webhookId: `wh_reinstall_${Date.now()}`,
    timestamp: new Date(Date.now() + 30_000).toISOString(),
  });
  const locRow = memory.installs.find((row) => row.locationId === LOCATION_ID);
  assert.equal(locRow?.installationStatus, "Active");
  locRow!.integrationId = "int_agency_1";
  locRow!.whachatUserId = USER_ID;
  const integration = integrations.find((row) => row.id === "int_agency_1")!;
  integration.isActive = true;
  integration.accessToken = ACCESS_SECRET;
  integration.refreshToken = REFRESH_SECRET;
  assert.equal(await (await resolveUserGhlConnectionStatus(USER_ID)).connected, true);
});

test("10. signature verification remains enforced", async () => {
  await seedConnectedLocationPlusAgencyToken();
  await withWebhookApp(async (baseUrl) => {
    const missing = await postWebhook(baseUrl, productionUninstallBody(), { signature: null });
    assert.equal(missing.status, 401);
    const bad = await postWebhook(baseUrl, productionUninstallBody(), { signature: "AAAA" });
    assert.equal(bad.status, 401);
  });
  assert.equal(integrations[0].isActive, true);
  assert.equal(integrations[0].accessToken, ACCESS_SECRET);
  assert.match(logs.join("\n"), /webhook_signature_rejected/);
});

test("11. logs never include tokens, codes, or secrets", async () => {
  await seedConnectedLocationPlusAgencyToken();
  await withWebhookApp(async (baseUrl) => {
    await postWebhook(baseUrl, productionUninstallBody());
  });
  assertNoSecretsInLogs();
});
