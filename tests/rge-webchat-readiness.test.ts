/**
 * Guided Launch Web Chat readiness regression coverage.
 * Run: npx tsx --test tests/rge-webchat-readiness.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  resolveWebchatProductionReadiness,
  widgetSurfaceStatus,
} from "../shared/webchatWidgetSettings";

const root = process.cwd();
const token = `wgt_${"a".repeat(48)}`;

test("active configured widget is ready for Settings and Guided Launch", () => {
  const readiness = resolveWebchatProductionReadiness(
    { enabled: true, allowedOrigins: ["https://affordable-pompano.example"] },
    token,
  );
  assert.equal(readiness.effectivePublic, true);
  assert.equal(readiness.hasValidPublicToken, true);
  assert.equal(widgetSurfaceStatus(readiness).channelPill, "connected");
});

test("disabled widget requires setup", () => {
  const readiness = resolveWebchatProductionReadiness(
    { enabled: false, allowedOrigins: ["https://example.com"] },
    token,
  );
  assert.equal(readiness.effectivePublic, false);
  assert.equal(readiness.reason, "disabled");
});

test("missing token or allowed origins requires setup", () => {
  assert.equal(
    resolveWebchatProductionReadiness({ enabled: true, allowedOrigins: ["https://example.com"] }, "user-id")
      .effectivePublic,
    false,
  );
  assert.equal(
    resolveWebchatProductionReadiness({ enabled: true, allowedOrigins: [] }, token).effectivePublic,
    false,
  );
});

test("Settings and Guided Launch consume the same workspace-scoped server readiness", () => {
  const routes = readFileSync(join(root, "server/routes.ts"), "utf8");
  const settings = readFileSync(join(root, "client/src/components/ChannelSettings.tsx"), "utf8");
  const guided = readFileSync(join(root, "client/src/pages/RealtorGrowthEngine.tsx"), "utf8");
  const endpoint = routes.slice(
    routes.indexOf('app.get("/api/widget-settings"'),
    routes.indexOf('app.post("/api/widget-settings/rotate-id"'),
  );

  assert.match(endpoint, /getUserForSession\(req\.user\.id\)/);
  assert.match(endpoint, /getWidgetPublicIdForUser\(req\.user\.id\)/);
  assert.match(endpoint, /resolveWebchatProductionReadiness\(merged, widgetPublicId\)/);
  assert.doesNotMatch(endpoint, /process\.env|channelSettings/);
  assert.match(settings, /widgetInstall\?\.webchatReadiness/);
  assert.match(guided, /withUserQueryScope\(\["\/api\/widget-settings"\], user\?\.id\)/);
  assert.match(guided, /widgetSettings\?\.webchatReadiness\?\.effectivePublic === true/);
  assert.doesNotMatch(guided, /channel === "webchat" && !!s\.isConnected/);
});

test("one workspace readiness cannot make another workspace ready", () => {
  const workspaceA = resolveWebchatProductionReadiness(
    { enabled: true, allowedOrigins: ["https://a.example"] },
    token,
  );
  const workspaceB = resolveWebchatProductionReadiness(
    { enabled: false, allowedOrigins: [] },
    `wgt_${"b".repeat(48)}`,
  );
  assert.equal(workspaceA.effectivePublic, true);
  assert.equal(workspaceB.effectivePublic, false);
});
