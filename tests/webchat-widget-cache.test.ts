/**
 * Branding PATCH must reach a fresh visitor on the same /widget.js?id= URL.
 * Run: npx tsx --test tests/webchat-widget-cache.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyWebchatPublicCacheHeaders,
  WEBCHAT_CDN_CACHE_CONTROL,
  WEBCHAT_PUBLIC_CACHE_CONTROL,
} from "../server/webchatAccess";
import { buildWebchatPublicScript } from "../server/webchatPublicScript";
import { resolvePublicWebchatPresentation, sanitizeWebchatBranding } from "../shared/webchatWidgetBranding";
import { buildWebchatChromeLayout } from "../shared/webchatWidgetChrome";
import {
  toVisitorSafeWebchatPublicBody,
  visitorRuntimeConfigFromPublicSettings,
} from "../shared/webchatWidgetLauncher";
import { mergeNeutralWidgetSettings } from "../shared/webchatWidgetSettings";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

function mockRes() {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
  };
}

function applyPatch(current: Record<string, unknown>, patch: Record<string, unknown>) {
  const merged = { ...mergeNeutralWidgetSettings(current), ...patch } as Record<string, unknown>;
  Object.assign(merged, sanitizeWebchatBranding(merged));
  return merged;
}

function publicSettingsBody(settings: Record<string, unknown>) {
  const chrome = buildWebchatChromeLayout(settings);
  const presentation = resolvePublicWebchatPresentation({ settings });
  return toVisitorSafeWebchatPublicBody(presentation, settings, chrome);
}

test("CDN and browser caches must not store tenant widget configuration", () => {
  const res = mockRes();
  applyWebchatPublicCacheHeaders(res);
  assert.equal(res.headers["Cache-Control"], WEBCHAT_PUBLIC_CACHE_CONTROL);
  assert.match(res.headers["Cache-Control"] || "", /no-store/);
  assert.equal(res.headers["CDN-Cache-Control"], WEBCHAT_CDN_CACHE_CONTROL);
  assert.equal(res.headers["Cloudflare-CDN-Cache-Control"], WEBCHAT_CDN_CACHE_CONTROL);
  assert.equal(res.headers["Surrogate-Control"], WEBCHAT_CDN_CACHE_CONTROL);
  assert.equal(res.headers["Pragma"], "no-cache");
  assert.equal(res.headers["Expires"], "0");

  const routes = read("server/routes.ts");
  const widgetJs = routes.slice(
    routes.indexOf('app.get("/widget.js"'),
    routes.indexOf('app.get("/api/widget-settings"'),
  );
  assert.match(widgetJs, /applyWebchatPublicCacheHeaders/);
  assert.doesNotMatch(widgetJs, /max-age=300/);
  assert.doesNotMatch(widgetJs, /stale-while-revalidate/);
  assert.doesNotMatch(widgetJs, /resolvePublicWidgetAccess/);
  assert.doesNotMatch(widgetJs, /buildWebchatChromeLayout/);

  const getAuth = routes.slice(
    routes.indexOf('app.get("/api/widget-settings"'),
    routes.indexOf('app.post("/api/widget-settings/rotate-id"'),
  );
  const patchAuth = routes.slice(
    routes.indexOf('app.patch("/api/widget-settings"'),
    routes.indexOf("Phone Registration Endpoints"),
  );
  assert.match(getAuth, /applyWebchatPublicCacheHeaders/);
  assert.match(patchAuth, /applyWebchatPublicCacheHeaders/);

  const webhooks = read("server/routes/webhooks.ts");
  const settingsSlice = webhooks.slice(
    webhooks.indexOf('app.get("/api/webchat/:userId/settings"'),
    webhooks.indexOf('app.get("/api/webchat/:userId/:visitorId/messages"'),
  );
  assert.match(settingsSlice, /sendWebchatPublicJson/);
  assert.match(settingsSlice, /requireEnabled:\s*true/);
  assert.match(settingsSlice, /toVisitorSafeWidgetLauncher/);
  assert.doesNotMatch(settingsSlice, /chatbotFlowId/);

  const logo = read("server/routes/widgetLogo.ts");
  assert.match(logo, /applyWebchatPublicCacheHeaders/);
});

test("same widget.js URL stays a stable loader; PATCH branding appears on the next public settings fetch", () => {
  const origin = "https://app.whachatcrm.com";
  const widgetId = "wgt_3c14a2d2a3f30565406e0a2a395c7dcc0903e0f4fba9d188";
  const widgetJsUrl = `${origin}/widget.js?id=${widgetId}`;

  let db = applyPatch(
    {},
    {
      enabled: true,
      launcherLabel: "Old Chat",
      color: "#111827",
      launcherStyle: "pill",
      pageRules: [
        {
          urlContains: "/pricing",
          greeting: "Old greeting",
          prefilledMessage: "",
          chatbotFlowId: "secret-flow-id",
        },
      ],
    },
  );

  const scriptBefore = buildWebchatPublicScript({ origin });
  const publicBefore = publicSettingsBody(db);
  const runtimeBefore = visitorRuntimeConfigFromPublicSettings(publicBefore, origin, widgetId);
  assert.ok(runtimeBefore);
  assert.equal(runtimeBefore.launcherLabel, "Old Chat");
  assert.equal(runtimeBefore.color, "#111827");

  db = applyPatch(db, { launcherLabel: "New Chat", color: "#2563eb" });

  const scriptAfter = buildWebchatPublicScript({ origin });
  const publicAfter = publicSettingsBody(db);
  const runtimeAfter = visitorRuntimeConfigFromPublicSettings(publicAfter, origin, widgetId);
  assert.ok(runtimeAfter);

  assert.equal(scriptBefore, scriptAfter, "installed /widget.js?id= body must not change after branding PATCH");
  assert.equal(widgetJsUrl, `${origin}/widget.js?id=${widgetId}`);
  assert.doesNotMatch(scriptAfter, /Old Chat/);
  assert.doesNotMatch(scriptAfter, /New Chat/);
  assert.doesNotMatch(scriptAfter, /#111827|#2563eb/i);
  assert.match(scriptAfter, /cache: 'no-store'/);
  assert.match(scriptAfter, /credentials: 'omit'/);
  assert.match(scriptAfter, /window\.__wcwInit/);
  assert.match(scriptAfter, /if \(window\.__wcwInit\) return;/);
  assert.match(scriptAfter, /\/api\/webchat\/' \+ encodeURIComponent\(install\.widgetId\) \+ '\/settings'/);

  assert.equal(publicAfter.launcherLabel, "New Chat");
  assert.equal(publicAfter.color, "#2563eb");
  assert.equal(runtimeAfter.launcherLabel, "New Chat");
  assert.equal(runtimeAfter.color, "#2563eb");
  assert.notEqual(runtimeBefore.launcherLabel, runtimeAfter.launcherLabel);
  assert.match(String(runtimeAfter.launcherCss), /./);

  const rules = (publicAfter.launcher as { pageRules: Array<Record<string, unknown>> }).pageRules;
  assert.equal(rules[0]?.urlContains, "/pricing");
  assert.equal("chatbotFlowId" in rules[0], false);
  assert.equal("allowedOrigins" in publicAfter, false);
  assert.equal("userId" in publicAfter, false);

  assert.equal(visitorRuntimeConfigFromPublicSettings(null, origin, widgetId), null);
  assert.equal(visitorRuntimeConfigFromPublicSettings({ color: "#2563eb" }, origin, widgetId), null);

  const website = read("client/src/pages/WebsiteWidget.tsx");
  assert.match(website, /setQueryData\(widgetSettingsQueryKey/);
  assert.match(website, /staleTime: 0/);
  const snippet = read("shared/webchatWidgetSnippet.ts");
  assert.match(snippet, /\/widget\.js'\)\)/);
  assert.doesNotMatch(snippet, /widget\.js\?id=.*&v=/);
});
