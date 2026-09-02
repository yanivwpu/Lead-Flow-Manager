/**
 * GHL Marketplace raw_payload sanitizer + repair-script contract.
 * Run: npx tsx --test tests/ghl-marketplace-raw-payload-sanitation.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  collectGhlSensitivePayloadKeyNames,
  ghlPayloadContainsOAuthSecrets,
  mergeGhlLifecycleRawPayload,
  sanitizeGhlMarketplaceRawPayload,
  stripGhlOAuthSecretsFromPayload,
} from "../shared/ghlConnectionState";
import {
  formatGhlMarketplaceRawPayloadRepairReport,
  parseSanitizeGhlRawPayloadCli,
  planGhlMarketplaceRawPayloadSanitation,
  reportContainsSecretValues,
  SANITIZE_GHL_RAW_PAYLOAD_CONFIRM,
  sanitizedGhlMarketplaceRawPayloadForRepair,
} from "../shared/ghlMarketplaceRawPayloadRepair";

const SECRET_ACCESS = "secret-access-token-value-XYZ";
const SECRET_REFRESH = "secret-refresh-token-value-XYZ";
const SECRET_CODE = "oauth-auth-code-value-XYZ";
const IDENTITY = {
  appId: "app_1",
  versionId: "ver_1",
  companyId: "co_1",
  locationId: "loc_1",
  userId: "ghl_user_1",
  installType: "Location",
  planId: "plan_free",
  type: "INSTALL",
  timestamp: "2026-09-01T00:00:00.000Z",
};

const nestedDirty = {
  ...IDENTITY,
  access_token: SECRET_ACCESS,
  nested: {
    RefreshToken: SECRET_REFRESH,
    headers: {
      Authorization: "Bearer nest-auth",
      Cookie: "handoff=abc",
    },
    items: [
      { authorization_code: SECRET_CODE, locationId: "loc_1" },
      { CLIENT_SECRET: "client-secret-xyz", planId: "plan_free" },
    ],
  },
};

const root = process.cwd();

test("1-4. Nested objects, arrays, mixed-case, snake_case and camelCase keys", () => {
  const keys = collectGhlSensitivePayloadKeyNames(nestedDirty);
  assert.ok(keys.includes("access_token"));
  assert.ok(keys.includes("RefreshToken"));
  assert.ok(keys.includes("Authorization"));
  assert.ok(keys.includes("Cookie"));
  assert.ok(keys.includes("authorization_code"));
  assert.ok(keys.includes("CLIENT_SECRET"));
});

test("5-6. Sensitive values removed and identity/lifecycle fields preserved", () => {
  const sanitized = stripGhlOAuthSecretsFromPayload(nestedDirty);
  assert.equal("access_token" in sanitized, false);
  assert.equal(ghlPayloadContainsOAuthSecrets(sanitized), false);
  assert.equal(sanitized.appId, "app_1");
  assert.equal(sanitized.versionId, "ver_1");
  assert.equal(sanitized.companyId, "co_1");
  assert.equal(sanitized.locationId, "loc_1");
  assert.equal(sanitized.userId, "ghl_user_1");
  assert.equal(sanitized.installType, "Location");
  assert.equal(sanitized.planId, "plan_free");
  assert.equal(sanitized.type, "INSTALL");
  assert.equal(sanitized.timestamp, IDENTITY.timestamp);
  const nested = sanitized.nested as Record<string, unknown>;
  assert.equal("RefreshToken" in nested, false);
  const items = nested.items as Array<Record<string, unknown>>;
  assert.equal(items[0].locationId, "loc_1");
  assert.equal("authorization_code" in items[0], false);
  assert.equal(items[1].planId, "plan_free");
});

test("7. Lifecycle merge cannot reintroduce a secret", () => {
  const merged = mergeGhlLifecycleRawPayload(nestedDirty, {
    type: "PLAN_CHANGE",
    refresh_token: "new-secret-should-not-persist",
    newPlanId: "plan_pro",
  });
  assert.equal("access_token" in merged, false);
  assert.equal("refresh_token" in merged, false);
  assert.equal(merged.type, "PLAN_CHANGE");
  assert.equal(merged.newPlanId, "plan_pro");
  assert.equal(merged.companyId, "co_1");
});

test("8. Dry-run performs no writes", () => {
  const cli = parseSanitizeGhlRawPayloadCli([]);
  assert.equal(cli.apply, false);
  assert.equal(cli.authorized, false);
  const script = readFileSync(join(root, "scripts/sanitize-ghl-marketplace-raw-payload.ts"), "utf8");
  assert.match(script, /mode === "dry-run"/);
  assert.match(script, /dry-run complete: no writes/);
  assert.doesNotMatch(script, /startupSchemaPatches/);
});

test("9. Apply mode requires explicit authorization", () => {
  assert.equal(parseSanitizeGhlRawPayloadCli(["--apply"]).authorized, false);
  assert.equal(
    parseSanitizeGhlRawPayloadCli(["--apply", `--confirm=${SANITIZE_GHL_RAW_PAYLOAD_CONFIRM}`])
      .authorized,
    true,
  );
  assert.equal(
    parseSanitizeGhlRawPayloadCli(["--apply"], {
      SANITIZE_GHL_RAW_PAYLOAD_CONFIRM,
    }).authorized,
    true,
  );
});

test("10. Repair is idempotent", () => {
  const first = planGhlMarketplaceRawPayloadSanitation({
    id: "row-1",
    source: "oauth",
    installationStatus: "Active",
    lastEventType: "INSTALL",
    rawPayload: nestedDirty,
  });
  assert.equal(first.needsUpdate, true);
  const cleaned = sanitizedGhlMarketplaceRawPayloadForRepair(nestedDirty);
  const second = planGhlMarketplaceRawPayloadSanitation({
    id: "row-1",
    source: "oauth",
    installationStatus: "Active",
    lastEventType: "INSTALL",
    rawPayload: cleaned,
  });
  assert.equal(second.needsUpdate, false);
  assert.deepEqual(
    sanitizeGhlMarketplaceRawPayload(cleaned),
    cleaned,
  );
});

test("11. Canonical encrypted credential fields remain unchanged", () => {
  const script = readFileSync(join(root, "scripts/sanitize-ghl-marketplace-raw-payload.ts"), "utf8");
  assert.match(script, /ghlMarketplaceInstalls/);
  assert.match(script, /rawPayload:/);
  assert.doesNotMatch(script, /accessToken:/);
  assert.doesNotMatch(script, /refreshToken:/);
  assert.doesNotMatch(script, /from\("\.\.\/server\/startupSchemaPatches/);
  assert.doesNotMatch(script, /whachatUserId:/);
  const startup = readFileSync(join(root, "server/startupSchemaPatches.ts"), "utf8");
  assert.doesNotMatch(startup, /sanitize-ghl-marketplace-raw-payload/);
  assert.doesNotMatch(startup, /SANITIZE_GHL_RAW_PAYLOAD/);
});

test("12. Logs and reports never include secret values", () => {
  const plan = planGhlMarketplaceRawPayloadSanitation({
    id: "row-secret",
    source: "oauth",
    installationStatus: "Active",
    lastEventType: "INSTALL",
    rawPayload: nestedDirty,
  });
  const report = formatGhlMarketplaceRawPayloadRepairReport([plan], "dry-run");
  assert.match(report, /affected=1/);
  assert.match(report, /row-secret/);
  assert.match(report, /access_token/);
  assert.equal(report.includes(SECRET_ACCESS), false);
  assert.equal(report.includes(SECRET_REFRESH), false);
  assert.equal(report.includes(SECRET_CODE), false);
  assert.equal(reportContainsSecretValues(report, [nestedDirty]), false);
});
