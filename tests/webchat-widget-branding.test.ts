/**
 * Website Chat launcher/branding: sanitization, isolation, public payload, chrome states.
 * Run: npx tsx tests/webchat-widget-branding.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  contrastTextForBackground,
  NEUTRAL_WEBCHAT_BRANDING,
  PUBLIC_WEBCHAT_PRESENTATION_KEYS,
  resolvePublicWebchatPresentation,
  resolveWebchatDisplayName,
  sanitizePlainWidgetText,
  sanitizeWebchatBranding,
  sanitizeWidgetHexColor,
  sanitizeWidgetLogoUrl,
  firstUnsafeWidgetTextField,
  toVisitorSafePublicWebchatPayload,
  WEBCHAT_DEFAULT_DISPLAY_NAME,
  widgetLogoAllowedHttpsHosts,
  widgetTextContainsUnsafeMarkup,
} from "../shared/webchatWidgetBranding";
import { buildWebchatChromeLayout, chromeCssForPreview } from "../shared/webchatWidgetChrome";
import { mergeNeutralWidgetSettings, NEUTRAL_WIDGET_COLOR } from "../shared/webchatWidgetSettings";
import { buildWebchatPublicScript } from "../server/webchatPublicScript";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

{
  assert.equal(resolveWebchatDisplayName({}), WEBCHAT_DEFAULT_DISPLAY_NAME);
  assert.equal(resolveWebchatDisplayName({ businessName: "Acme HVAC" }), "Acme HVAC");
  assert.equal(
    resolveWebchatDisplayName({ brandName: "Front Desk", businessName: "Acme HVAC" }),
    "Front Desk",
  );
  assert.doesNotMatch(resolveWebchatDisplayName({}), /WhachatCRM/i);
}

{
  const tenantA = resolvePublicWebchatPresentation({
    settings: { brandName: "Tenant A Co", color: "#111111", launcherStyle: "pill" },
    businessName: "A Biz",
  });
  const tenantB = resolvePublicWebchatPresentation({
    settings: { brandName: "Tenant B Co", color: "#eeeeee", launcherStyle: "card" },
    businessName: "B Biz",
  });
  assert.equal(tenantA.displayName, "Tenant A Co");
  assert.equal(tenantB.displayName, "Tenant B Co");
  assert.doesNotMatch(JSON.stringify(tenantA), /Tenant B/);
  assert.doesNotMatch(JSON.stringify(tenantB), /Tenant A/);
  const payloadA = toVisitorSafePublicWebchatPayload(tenantA);
  for (const key of ["allowedOrigins", "allowAnyOrigin", "userId", "widgetPublicId", "pageRules", "email", "chatbotFlowId"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(payloadA, key), false, key);
  }
  assert.deepEqual(Object.keys(payloadA).sort(), [...PUBLIC_WEBCHAT_PRESENTATION_KEYS].sort());
}

{
  assert.equal(sanitizeWidgetHexColor("red"), "");
  assert.equal(sanitizeWidgetHexColor("#10b981"), "#10b981");
  assert.equal(sanitizeWidgetHexColor("#10B981"), "#10b981");
  assert.equal(sanitizeWidgetLogoUrl("javascript:alert(1)"), "");
  assert.equal(sanitizeWidgetLogoUrl("data:image/png;base64,aaaa"), "");
  assert.equal(sanitizeWidgetLogoUrl("http://evil.example/x.png"), "");
  assert.equal(sanitizeWidgetLogoUrl("https://cdn.example/logo.png"), "");
  assert.equal(
    sanitizeWidgetLogoUrl("https://cdn.example/logo.png", { allowedHttpsHosts: ["cdn.example"] }),
    "https://cdn.example/logo.png",
  );
  assert.equal(sanitizeWidgetLogoUrl("/objects/uploads/123-456.png"), "/objects/uploads/123-456.png");
  assert.equal(sanitizeWidgetLogoUrl("/objects/secret.png"), "");
  assert.equal(sanitizeWidgetLogoUrl("/objects/uploads/../x.png"), "");
  assert.equal(sanitizeWidgetLogoUrl("https://127.0.0.1/logo.png", { allowedHttpsHosts: ["127.0.0.1"] }), "");
  assert.equal(widgetTextContainsUnsafeMarkup("<b>Hi</b>"), true);
  assert.equal(widgetTextContainsUnsafeMarkup("javascript:alert(1)"), true);
  const html = sanitizePlainWidgetText("<script>alert(1)</script>Hi", 80);
  assert.equal(html, "");
  assert.equal(firstUnsafeWidgetTextField({ brandName: "<script>" }), "brandName");
  assert.equal(firstUnsafeWidgetTextField({ brandName: "Acme" }), null);
  const branded = sanitizeWebchatBranding({
    launcherStyle: "evil",
    brandName: `<b>${"x".repeat(200)}</b>`,
    headerTextColor: "not-a-color",
    panelWidth: "huge",
  });
  assert.equal(branded.launcherStyle, "circle");
  assert.equal(branded.brandName, "");
  assert.equal(branded.headerTextColor, "auto");
  assert.equal(branded.panelWidth, "standard");
  assert.deepEqual(widgetLogoAllowedHttpsHosts(["https://app.example.com", "files.example.r2.dev"]), [
    "app.example.com",
    "files.example.r2.dev",
  ]);
}

{
  const customized = mergeNeutralWidgetSettings({
    enabled: true,
    color: "#3b82f6",
    welcomeMessage: "Hello from custom",
    allowedOrigins: ["https://a.example"],
    launcherStyle: "pill",
    launcherLabel: "Help",
    pageRules: [{ urlContains: "/pricing", greeting: "Price?" }],
  });
  assert.equal(customized.color, "#3b82f6");
  assert.equal(customized.welcomeMessage, "Hello from custom");
  assert.equal(customized.launcherStyle, "pill");
  assert.equal(customized.launcherLabel, "Help");
  assert.equal((customized.pageRules as unknown[]).length, 1);

  const fresh = mergeNeutralWidgetSettings({});
  assert.equal(fresh.launcherStyle, "circle");
  assert.equal(fresh.brandName, "");
  assert.equal(fresh.enabled, false);
  assert.equal(fresh.color, NEUTRAL_WIDGET_COLOR);
  assert.deepEqual(
    Object.fromEntries(Object.keys(NEUTRAL_WEBCHAT_BRANDING).map((k) => [k, fresh[k]])),
    NEUTRAL_WEBCHAT_BRANDING,
  );
}

{
  const circle = buildWebchatChromeLayout({ launcherStyle: "circle", color: "#10b981", position: "right" });
  assert.match(circle.launcherCss, /border-radius:50%/);
  assert.match(circle.launcherCss, /width:56px/);
  assert.match(circle.launcherAriaLabel, /Open Website chat/);
  const pill = buildWebchatChromeLayout({
    launcherStyle: "pill",
    launcherLabel: "Let's Chat",
    brandName: "Pompano",
  });
  assert.match(pill.launcherCss, /height:48px/);
  assert.equal(pill.presentation.launcherLabel, "Let's Chat");
  const card = buildWebchatChromeLayout({
    launcherStyle: "card",
    brandName: "Affordable Air",
    logoUrl: "/objects/uploads/logo.png",
  });
  assert.match(card.launcherCss, /min-height:52px/);
  assert.equal(card.presentation.displayName, "Affordable Air");
  const teaser = buildWebchatChromeLayout({
    teaserGreeting: "Need a quote?",
    welcomeMessage: "Hi there",
    openBehavior: "teaser",
  });
  assert.equal(teaser.presentation.openBehavior, "teaser");
  assert.equal(teaser.presentation.teaserGreeting, "Need a quote?");
  assert.match(teaser.teaserCss, /overflow-wrap:anywhere/);
  const wide = buildWebchatChromeLayout({ panelWidth: "wide", position: "left" });
  assert.match(wide.panelCss, /min\(420px,calc\(100vw - 32px\)\)/);
  assert.match(wide.panelCss, /left:20px/);
  assert.match(wide.launcherCss, /max-width:min\(240px,calc\(100vw - 40px\)\)/);
  const previewCss = chromeCssForPreview(wide.panelCss, { panelFill: true });
  assert.match(previewCss, /position:absolute/);
  assert.doesNotMatch(previewCss, /position:fixed/);
  assert.equal(contrastTextForBackground("#ffffff"), "#111827");
  assert.equal(contrastTextForBackground("#111111"), "#ffffff");
}

{
  const chrome = buildWebchatChromeLayout({
    brandName: "</script><script>alert(1)",
    teaserGreeting: "<img src=x onerror=alert(1)>",
  });
  const js = buildWebchatPublicScript({
    enabled: true,
    widgetId: "wgt_" + "a".repeat(48),
    origin: "https://app.example.com",
    chrome,
    triggerType: "always",
    triggerDelaySeconds: 5,
    triggerScrollPercent: 50,
    showOnDesktop: true,
    showOnMobile: true,
    pageRules: [{ urlContains: "/x", greeting: "<b>Hi</b>", prefilledMessage: "js:alert(1)" }],
  });
  assert.match(js, /textContent/);
  assert.doesNotMatch(js, /WhachatCRM \/ Replies instantly/);
  assert.match(js, /data-testid', 'wcw-launcher'/);
  assert.equal(js.includes("<script>alert(1)"), false);
  assert.match(js, /OPEN_BEHAVIOR/);
  assert.match(js, /referrerPolicy = 'no-referrer'/);
  const disabled = buildWebchatPublicScript({
    enabled: false,
    widgetId: "",
    origin: "https://app.example.com",
    chrome,
    triggerType: "always",
    triggerDelaySeconds: 5,
    triggerScrollPercent: 50,
    showOnDesktop: true,
    showOnMobile: true,
    pageRules: [],
  });
  assert.equal(disabled, "/* widget disabled */");
}

{
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /WebchatPanelHeader/);
  assert.doesNotMatch(frame, /Chat with \$\{/);
  assert.match(frame, /Powered by WhaChat/);
  assert.match(frame, /\[overflow-wrap:anywhere\]/);
  const website = read("client/src/pages/WebsiteWidget.tsx");
  assert.match(website, /Launcher & Branding/);
  assert.match(website, /WebchatChromePreview/);
  assert.match(website, /button-reset-branding/);
  assert.match(website, /button-preview-\$\{item\.id\}/);
  assert.match(website, /id: "collapsed"/);
  assert.match(website, /id: "teaser"/);
  assert.match(website, /id: "open"/);
  assert.doesNotMatch(website, /WhachatCRM<\/div>/);
  assert.doesNotMatch(website, /Replies instantly/);
  const routes = read("server/routes.ts");
  assert.match(routes, /buildWebchatPublicScript/);
  assert.match(routes, /UNSAFE_WIDGET_TEXT/);
  assert.match(routes, /INVALID_LOGO_URL/);
  assert.match(routes, /launcherStyle: z\.enum\(\["circle", "pill", "card"\]\)/);
  assert.match(routes, /panelWidth: z\.enum\(\["compact", "standard", "wide"\]\)/);
  assert.match(routes, /openBehavior: z\.enum\(\["teaser", "direct"\]\)/);
  assert.match(routes, /color: z\.string\(\)\.regex\(\/\^#\[0-9A-Fa-f\]\{6\}\$\/\)/);
  assert.doesNotMatch(routes, /aria-label', 'Open website chat'/);
  const patchSlice = routes.slice(
    routes.indexOf('app.patch("/api/widget-settings"'),
    routes.indexOf("Phone Registration Endpoints"),
  );
  assert.match(patchSlice, /if \(!req\.user\)/);
  assert.match(patchSlice, /status\(401\)/);
  assert.match(patchSlice, /getWidgetPublicIdForUser/);
  assert.doesNotMatch(patchSlice, /rotateWidgetPublicId/);
  assert.match(patchSlice, /req\.user\.id/);
  const agent = read("shared/agent/publicAgentPageHtml.ts");
  assert.match(agent, /Let's Chat/);
  const webhooks = read("server/routes/webhooks.ts");
  const settingsSlice = webhooks.slice(
    webhooks.indexOf('app.get("/api/webchat/:userId/settings"'),
    webhooks.indexOf('app.get("/api/webchat/:userId/:visitorId/messages"'),
  );
  assert.match(webhooks, /toVisitorSafePublicWebchatPayload/);
  assert.match(settingsSlice, /leadForm/);
  assert.match(settingsSlice, /businessName/);
  assert.doesNotMatch(settingsSlice, /allowedOrigins/);
  assert.doesNotMatch(settingsSlice, /createContact|insert\(contacts/);
}

{
  const compact = buildWebchatChromeLayout({ panelWidth: "compact" });
  const standard = buildWebchatChromeLayout({ panelWidth: "standard" });
  const wide = buildWebchatChromeLayout({ panelWidth: "wide" });
  assert.match(compact.panelCss, /min\(300px,calc\(100vw - 32px\)\)/);
  assert.match(standard.panelCss, /min\(360px,calc\(100vw - 32px\)\)/);
  assert.match(wide.panelCss, /min\(420px,calc\(100vw - 32px\)\)/);
  for (const layout of [compact, standard, wide]) {
    assert.match(layout.panelCss, /max-width:calc\(100vw - 32px\)/);
    assert.match(layout.launcherCss, /max-width:min\(240px,calc\(100vw - 40px\)\)/);
  }
  const at390 = 390;
  assert.ok(300 < at390 && 360 < at390);
  assert.ok(420 > at390 - 32, "wide panel must clamp below a 390px viewport");
}

{
  const preview = read("client/src/components/webchat/WebchatChromePreview.tsx");
  assert.match(preview, /buildWebchatChromeLayout/);
  assert.match(preview, /chromeCssForPreview/);
  assert.match(preview, /WebchatPanelHeader/);
  const script = read("server/webchatPublicScript.ts");
  assert.match(script, /prefers-reduced-motion/);
  assert.match(script, /sessionStorage/);
  assert.match(script, /e\.key === 'Escape'/);
  assert.match(script, /setAttribute\('type', 'button'\)/);
  assert.match(script, /max-width:100%/);
  assert.match(script, /textContent/);
  const header = read("client/src/components/webchat/WebchatPanelHeader.tsx");
  assert.match(header, /onError/);
  assert.match(header, /webchat-panel-avatar/);
  const website = read("client/src/pages/WebsiteWidget.tsx");
  assert.match(website, /NEUTRAL_WEBCHAT_BRANDING/);
  assert.match(website, /button-confirm-reset-branding/);
  assert.match(website, /beforeunload/);
  assert.match(website, /text-branding-error/);
  const brandingSection = website.slice(
    website.indexOf("section-launcher-branding"),
    website.indexOf(">Appearance<") >= 0 ? website.indexOf(">Appearance<") : website.indexOf("Appearance"),
  );
  assert.doesNotMatch(brandingSection, /chatbotFlowId/);
}

{
  const stored = mergeNeutralWidgetSettings({
    enabled: true,
    allowedOrigins: ["https://a.example"],
    launcherStyle: "card",
    brandName: "Acme",
    color: "#3b82f6",
  });
  const afterReset = { ...stored, ...NEUTRAL_WEBCHAT_BRANDING };
  assert.equal(afterReset.launcherStyle, "circle");
  assert.equal(afterReset.brandName, "");
  assert.equal(afterReset.color, "#3b82f6");
  assert.equal(afterReset.enabled, true);
  assert.deepEqual(afterReset.allowedOrigins, ["https://a.example"]);
}

{
  const frame = read("client/src/pages/WidgetFrame.tsx");
  const welcomeBlock = frame.slice(frame.indexOf("{/* Welcome bubble */}"), frame.indexOf("suggestedQuestions.length"));
  assert.match(welcomeBlock, /settingsWelcome/);
  assert.doesNotMatch(welcomeBlock, /sendMessage\(/);
  assert.doesNotMatch(welcomeBlock, /\/api\/webchat\/\$\{userId\}(?!\/settings)/);
  assert.match(frame, /text-settings-error/);
  assert.match(frame, /text-widget-unavailable/);
  assert.match(frame, /WebchatFormCard/);
  assert.match(frame, /WebchatMediaBubble/);
  const form = read("client/src/components/webchat/WebchatFormCard.tsx");
  assert.match(form, /field\.required \? " \*" : ""/);
  assert.match(form, /webchat-form-error/);
  assert.match(form, /consent/);
}

{
  const origin = read("shared/webchatOriginPolicy.ts");
  assert.match(origin, /originMatchesAllowlist/);
  const access = read("server/webchatAccess.ts");
  assert.match(access, /strictOrigin/);
  assert.match(access, /publicWidgetEmbedDecision/);
}

console.log("webchat-widget-branding.test.ts: all assertions passed");

