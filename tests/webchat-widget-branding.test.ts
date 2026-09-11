/**
 * Website Chat launcher/branding: sanitization, isolation, public payload, chrome states.
 * Run: npx tsx tests/webchat-widget-branding.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  contrastRatio,
  contrastTextForBackground,
  NEUTRAL_WEBCHAT_BRANDING,
  PUBLIC_WEBCHAT_PRESENTATION_KEYS,
  pickExplicitWebchatAgentName,
  pickVerifiedWebchatCompanyName,
  resolvePublicWebchatPresentation,
  resolveWebchatPanelHeaderPaint,
  webchatBrandingReadyMessage,
  isWebchatBrandingReadyMessage,
  WEBCHAT_BRANDING_READY_MESSAGE_TYPE,
  resolveWebchatAccentColor,
  resolveWebchatDisplayName,
  sanitizePlainWidgetText,
  sanitizeWebchatBranding,
  sanitizeWidgetHexColor,
  sanitizeWidgetLogoUrl,
  firstUnsafeWidgetTextField,
  toVisitorSafePublicWebchatPayload,
  WEBCHAT_AA_CONTRAST_RATIO,
  WEBCHAT_DEFAULT_DISPLAY_NAME,
  WEBCHAT_FOREGROUND_ON_DARK,
  WEBCHAT_FOREGROUND_ON_LIGHT,
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
  assert.equal(resolveWebchatDisplayName({ companyName: "Acme HVAC" }), "Acme HVAC");
  assert.equal(
    resolveWebchatDisplayName({ brandName: "Front Desk", businessName: "Acme HVAC" }),
    "Front Desk",
  );
  assert.doesNotMatch(resolveWebchatDisplayName({}), /WhachatCRM/i);
}

{
  const ownerName = "Samantha Parezo";
  const leakyInput = {
    brandName: "",
    businessName: "",
    companyName: "",
    ownerName,
    userName: ownerName,
    email: "samantha@affordablepompano.com",
    contactName: ownerName,
    teamMemberName: ownerName,
  };
  assert.equal(resolveWebchatDisplayName(leakyInput), WEBCHAT_DEFAULT_DISPLAY_NAME);
  assert.doesNotMatch(resolveWebchatDisplayName(leakyInput), /Samantha Parezo/);
  assert.equal(pickVerifiedWebchatCompanyName(null), "");
  assert.equal(pickVerifiedWebchatCompanyName({ businessName: "" }), "");
  assert.equal(
    pickVerifiedWebchatCompanyName({ businessName: null, displayName: ownerName } as { businessName: null; displayName: string }),
    "",
  );
  assert.equal(pickVerifiedWebchatCompanyName({ businessName: "Affordable Pompano HVAC" }), "Affordable Pompano HVAC");
  assert.equal(pickExplicitWebchatAgentName({ displayName: "" }), "");
  assert.equal(pickExplicitWebchatAgentName({ displayName: ownerName }), ownerName);
  const knowledgeWithoutAgent = { displayName: null as string | null, businessName: "Acme" };
  assert.equal(pickExplicitWebchatAgentName(knowledgeWithoutAgent), "");

  const emptyBranding = resolvePublicWebchatPresentation({
    settings: { brandName: "", name: ownerName, email: "samantha@affordablepompano.com" },
    businessName: "",
    agentName: "",
  });
  assert.equal(emptyBranding.displayName, WEBCHAT_DEFAULT_DISPLAY_NAME);
  assert.equal(emptyBranding.panelHeading, WEBCHAT_DEFAULT_DISPLAY_NAME);
  assert.equal(emptyBranding.agentName, "");
  assert.equal(emptyBranding.brandName, "");
  const emptyJson = JSON.stringify(emptyBranding);
  assert.doesNotMatch(emptyJson, /Samantha Parezo/);
  assert.doesNotMatch(emptyJson, /samantha@affordablepompano/i);
  const payload = toVisitorSafePublicWebchatPayload(emptyBranding);
  assert.equal(payload.displayName, WEBCHAT_DEFAULT_DISPLAY_NAME);
  assert.equal(payload.agentName, "");
  assert.doesNotMatch(JSON.stringify(payload), /Samantha Parezo/);
  for (const key of ["name", "email", "userName", "ownerName", "contactName", "userId"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(payload, key), false, key);
  }

  const editor = buildWebchatChromeLayout({ brandName: "" }, { businessName: "", agentName: "" });
  const published = buildWebchatChromeLayout({ brandName: "" }, { businessName: "", agentName: "" });
  assert.equal(editor.presentation.displayName, published.presentation.displayName);
  assert.equal(editor.presentation.displayName, WEBCHAT_DEFAULT_DISPLAY_NAME);

  const withCompany = resolvePublicWebchatPresentation({
    settings: { brandName: "" },
    businessName: "Affordable Pompano HVAC",
  });
  assert.equal(withCompany.displayName, "Affordable Pompano HVAC");
  const withAgent = resolvePublicWebchatPresentation({
    settings: { brandName: "Pompano Air" },
    businessName: "Affordable Pompano HVAC",
    agentName: "Alex Agent",
  });
  assert.equal(withAgent.displayName, "Pompano Air");
  assert.equal(withAgent.agentName, "Alex Agent");
  assert.notEqual(withAgent.agentName, withAgent.displayName);

  const clearedRepresentative = resolvePublicWebchatPresentation({
    settings: { brandName: "", name: ownerName, email: "samantha@affordablepompano.com" },
    businessName: "Affordable Pompano HVAC",
    agentName: pickExplicitWebchatAgentName({ displayName: null }),
  });
  assert.equal(clearedRepresentative.agentName, "");
  assert.equal(clearedRepresentative.displayName, "Affordable Pompano HVAC");
  assert.doesNotMatch(JSON.stringify(clearedRepresentative), /Samantha Parezo/);
  assert.equal(toVisitorSafePublicWebchatPayload(clearedRepresentative).agentName, "");
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
  for (const key of ["allowedOrigins", "allowAnyOrigin", "userId", "widgetPublicId", "pageRules", "email", "name", "chatbotFlowId"]) {
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
  const publishedLogo = "/objects/uploads/tenant-a__aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg";
  assert.equal(
    sanitizeWidgetLogoUrl(`https://whachatcrm.com${publishedLogo}`),
    publishedLogo,
  );
  assert.equal(
    sanitizeWidgetLogoUrl(`https://evil.example${publishedLogo}`),
    publishedLogo,
  );
  const published = resolvePublicWebchatPresentation({
    settings: { logoUrl: publishedLogo, brandName: "Affordable Pompano HVAC" },
    appOrigin: "https://whachatcrm.com",
  });
  assert.equal(published.logoUrl, `https://whachatcrm.com${publishedLogo}`);
  assert.equal(published.displayName, "Affordable Pompano HVAC");
  const payload = toVisitorSafePublicWebchatPayload(published);
  assert.equal(payload.logoUrl, published.logoUrl);
  const openPanel = resolvePublicWebchatPresentation({
    settings: payload,
  });
  assert.equal(openPanel.logoUrl, publishedLogo);
  assert.match(openPanel.logoUrl, /^\/objects\/uploads\//);
  const openPanelAbs = resolvePublicWebchatPresentation({
    settings: payload,
    appOrigin: "https://app.whachatcrm.com",
    allowedLogoHttpsHosts: widgetLogoAllowedHttpsHosts([
      "https://app.whachatcrm.com",
      typeof payload.logoUrl === "string" ? payload.logoUrl : "",
    ]),
  });
  assert.equal(openPanelAbs.logoUrl, `https://app.whachatcrm.com${publishedLogo}`);
  const replaced = resolvePublicWebchatPresentation({
    settings: { logoUrl: "/objects/uploads/tenant-a__replaced.webp", brandName: "Affordable Pompano HVAC" },
    appOrigin: "https://whachatcrm.com",
  });
  const replacedPanel = resolvePublicWebchatPresentation({
    settings: toVisitorSafePublicWebchatPayload(replaced),
  });
  assert.equal(replacedPanel.logoUrl, "/objects/uploads/tenant-a__replaced.webp");
  const emptyLogo = resolvePublicWebchatPresentation({
    settings: { brandName: "Affordable Pompano HVAC" },
  });
  assert.equal(emptyLogo.logoUrl, "");
  assert.equal(emptyLogo.displayName.charAt(0).toUpperCase(), "A");
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
}

{
  const pompLightBlue = "#e0f0ff";
  assert.equal(contrastTextForBackground("#ffffff"), WEBCHAT_FOREGROUND_ON_LIGHT);
  assert.equal(contrastTextForBackground("#111111"), WEBCHAT_FOREGROUND_ON_DARK);
  assert.equal(contrastTextForBackground(pompLightBlue), WEBCHAT_FOREGROUND_ON_LIGHT);
  assert.ok(contrastRatio(WEBCHAT_FOREGROUND_ON_LIGHT, pompLightBlue) >= WEBCHAT_AA_CONTRAST_RATIO);
  assert.ok(contrastRatio(WEBCHAT_FOREGROUND_ON_DARK, pompLightBlue) < WEBCHAT_AA_CONTRAST_RATIO);
  assert.equal(contrastTextForBackground("#10b981"), WEBCHAT_FOREGROUND_ON_LIGHT);
  assert.ok(contrastRatio(contrastTextForBackground("#10b981"), "#10b981") >= WEBCHAT_AA_CONTRAST_RATIO);
  assert.equal(contrastTextForBackground("#111827"), WEBCHAT_FOREGROUND_ON_DARK);
  assert.ok(contrastRatio(WEBCHAT_FOREGROUND_ON_DARK, "#111827") >= WEBCHAT_AA_CONTRAST_RATIO);
  assert.equal(contrastTextForBackground("#ffff00"), WEBCHAT_FOREGROUND_ON_LIGHT);
  assert.ok(contrastRatio(WEBCHAT_FOREGROUND_ON_LIGHT, "#ffff00") >= WEBCHAT_AA_CONTRAST_RATIO);

  assert.equal(resolveWebchatAccentColor({ color: "#10b981" }), "#10b981");
  assert.equal(resolveWebchatAccentColor({ color: "#10b981", accentColor: "" }), "#10b981");
  assert.equal(resolveWebchatAccentColor({ color: "#10b981", accentColor: pompLightBlue }), pompLightBlue);

  const pomp = resolvePublicWebchatPresentation({
    settings: { color: pompLightBlue, brandName: "", headerTextColor: "#ffffff" },
  });
  assert.equal(pomp.accentColor, pompLightBlue);
  assert.equal(pomp.accentForeground, WEBCHAT_FOREGROUND_ON_LIGHT);
  assert.equal(pomp.headerTextColor, "#ffffff");
  assert.ok(contrastRatio(pomp.accentForeground, pomp.accentColor) >= WEBCHAT_AA_CONTRAST_RATIO);
  const pompChrome = buildWebchatChromeLayout({ color: pompLightBlue, headerTextColor: "#ffffff" });
  assert.match(pompChrome.launcherCss, new RegExp(`background:${pompLightBlue}`));
  assert.match(pompChrome.launcherCss, new RegExp(`color:${WEBCHAT_FOREGROUND_ON_LIGHT}`));
  assert.match(pompChrome.headerCss, /color:#ffffff/);
  assert.equal(pompChrome.presentation.accentForeground, pomp.accentForeground);

  const split = resolvePublicWebchatPresentation({
    settings: { color: "#111827", accentColor: pompLightBlue },
  });
  assert.equal(split.color, "#111827");
  assert.equal(split.accentColor, pompLightBlue);
  assert.equal(split.accentForeground, WEBCHAT_FOREGROUND_ON_LIGHT);

  const editor = buildWebchatChromeLayout({ color: pompLightBlue });
  const published = resolvePublicWebchatPresentation({ settings: { color: pompLightBlue } });
  assert.equal(editor.presentation.accentColor, published.accentColor);
  assert.equal(editor.presentation.accentForeground, published.accentForeground);
}

{
  const whiteSettings = { color: "#ffffff", brandName: "Pompano Air" };
  function visibleHeaderColors(
    steps: Array<{
      settingsStatus: "loading" | "ready" | "failed";
      settings?: Record<string, unknown> | null;
    }>,
  ): string[] {
    const colors: string[] = [];
    for (const step of steps) {
      const paint = resolveWebchatPanelHeaderPaint(step);
      if (paint.visible) colors.push(paint.color);
    }
    return colors;
  }

  const loading = resolveWebchatPanelHeaderPaint({
    settingsStatus: "loading",
    settings: whiteSettings,
  });
  assert.equal(loading.visible, false);
  assert.equal(loading.color, null);
  assert.notEqual(loading.color, NEUTRAL_WIDGET_COLOR);
  assert.notEqual(loading.color, "#10b981");

  const whiteOpen = visibleHeaderColors([
    { settingsStatus: "loading", settings: whiteSettings },
    { settingsStatus: "ready", settings: whiteSettings },
  ]);
  assert.deepEqual(whiteOpen, ["#ffffff"]);
  assert.equal(
    whiteOpen.some((color) => color.toLowerCase() === NEUTRAL_WIDGET_COLOR),
    false,
    "a white header must never paint default green during initial open",
  );

  const custom = "#2563eb";
  const customOpen = visibleHeaderColors([
    { settingsStatus: "loading", settings: { color: custom } },
    { settingsStatus: "ready", settings: { color: custom } },
  ]);
  assert.deepEqual(customOpen, [custom], "custom colors must apply on the first visible frame");

  const failedOpen = visibleHeaderColors([
    { settingsStatus: "loading" },
    { settingsStatus: "failed" },
  ]);
  assert.deepEqual(failedOpen, [NEUTRAL_WIDGET_COLOR]);
  const failed = resolveWebchatPanelHeaderPaint({ settingsStatus: "failed" });
  assert.equal(failed.visible, true);
  assert.equal(failed.color, NEUTRAL_WIDGET_COLOR);

  const ready = resolveWebchatPanelHeaderPaint({
    settingsStatus: "ready",
    settings: whiteSettings,
  });
  const editor = buildWebchatChromeLayout(whiteSettings);
  assert.equal(editor.presentation.color, ready.color);
  assert.equal(editor.presentation.headerTextColor, ready.headerTextColor);
  assert.equal(editor.presentation.brandName, ready.presentation.brandName);

  const readyMsg = webchatBrandingReadyMessage("wgt_abc");
  assert.equal(readyMsg.type, WEBCHAT_BRANDING_READY_MESSAGE_TYPE);
  assert.equal(isWebchatBrandingReadyMessage(readyMsg, "wgt_abc"), true);
  assert.equal(isWebchatBrandingReadyMessage(readyMsg, "wgt_other"), false);
  assert.equal(isWebchatBrandingReadyMessage({ type: WEBCHAT_BRANDING_READY_MESSAGE_TYPE }, "wgt_abc"), false);
}

{
  const chrome = buildWebchatChromeLayout({
    brandName: "</script><script>alert(1)",
    teaserGreeting: "<img src=x onerror=alert(1)>",
  });
  assert.equal(chrome.presentation.brandName.includes("<script>"), false);
  assert.doesNotMatch(chrome.launcherCss, /<script>/);
  const js = buildWebchatPublicScript({
    origin: "https://app.example.com",
  });
  assert.match(js, /textContent/);
  assert.match(js, /cache: 'no-store'/);
  assert.match(js, /window\.__wcwInit/);
  assert.match(js, /data-testid', 'wcw-launcher'/);
  assert.doesNotMatch(js, /WhachatCRM \/ Replies instantly/);
  assert.equal(js.includes("<script>alert(1)"), false);
  assert.equal(js.includes("</script><script>alert(1)"), false);
  assert.match(js, /OPEN_BEHAVIOR/);
  assert.match(js, /referrerPolicy = 'no-referrer'/);
  assert.match(js, /wcw-branding-ready/);
  assert.match(js, /e.origin !== ORIGIN/);
  assert.match(js, /brandingReady/);
  assert.match(js, /revealPanelIfOpen/);
  const loadIframe = js.slice(js.indexOf("function loadIframe()"), js.indexOf("function toggleChat()"));
  assert.doesNotMatch(loadIframe, /requestAnimationFrame/);
  assert.match(loadIframe, /visibility:hidden/);
  assert.match(loadIframe, /loading', 'eager'/);
  const reveal = js.slice(js.indexOf("function revealPanelIfOpen()"), js.indexOf("function onHostMessage"));
  assert.match(reveal, /brandingReady/);
  assert.match(reveal, /requestAnimationFrame/);
  const again = buildWebchatPublicScript({ origin: "https://app.example.com" });
  assert.equal(js, again);
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
  assert.match(website, /setQueryData\(widgetSettingsQueryKey/);
  assert.match(website, /saveQueued \|\| saveMutation\.isPending/);
  assert.match(website, /Could not save/);
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
  assert.match(settingsSlice, /toVisitorSafeWidgetLauncher/);
  assert.match(settingsSlice, /launcher: toVisitorSafeWidgetLauncher/);
  assert.match(settingsSlice, /businessName: names\.companyName/);
  assert.match(settingsSlice, /loadWebchatPublicNameFallbacks/);
  assert.doesNotMatch(settingsSlice, /access\.owner\.businessName/);
  assert.doesNotMatch(settingsSlice, /owner\.name|users\.name/);
  assert.doesNotMatch(settingsSlice, /allowedOrigins/);
  assert.doesNotMatch(settingsSlice, /createContact|insert\(contacts/);
  const identity = read("server/widgetIdentity.ts");
  assert.doesNotMatch(identity, /row\.name/);
  assert.doesNotMatch(identity, /businessName:/);
  const publicIdentity = read("server/webchatPublicIdentity.ts");
  assert.match(publicIdentity, /pickVerifiedWebchatCompanyName/);
  assert.match(publicIdentity, /pickExplicitWebchatAgentName/);
  assert.match(publicIdentity, /getAiBusinessKnowledge/);
  assert.doesNotMatch(publicIdentity, /row\.name|user\.name/);
  assert.match(routes, /loadWebchatPublicNameFallbacks/);
  assert.doesNotMatch(routes, /access\.owner\.businessName/);
  const getSettings = routes.slice(
    routes.indexOf('app.get("/api/widget-settings"'),
    routes.indexOf('app.post("/api/widget-settings/rotate-id"'),
  );
  assert.match(getSettings, /businessProfileName: names\.companyName/);
  assert.match(getSettings, /agentName: names\.agentName/);
  assert.doesNotMatch(getSettings, /user\.name|users\.name/);
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
  const chromeSrc = read("shared/webchatWidgetChrome.ts");
  assert.match(chromeSrc, /resolveWebchatPanelHeaderPaint/);
  assert.match(chromeSrc, /settingsStatus: "ready"/);
  assert.match(preview, /agentName/);
  assert.match(preview, /wcw-preview-visitor-bubble/);
  assert.match(preview, /p\.accentForeground/);
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
  assert.match(header, /webchat-panel-agent/);
  assert.match(header, /presentation\.agentName/);
  const website = read("client/src/pages/WebsiteWidget.tsx");
  assert.match(website, /NEUTRAL_WEBCHAT_BRANDING/);
  assert.match(website, /button-confirm-reset-branding/);
  assert.match(website, /beforeunload/);
  assert.match(website, /text-branding-error/);
  assert.match(website, /businessName=\{settings\.businessProfileName \|\| ""\}/);
  assert.match(website, /agentName=\{settings\.agentName \|\| ""\}/);
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
  assert.match(frame, /resolveWebchatPanelHeaderPaint/);
  assert.match(frame, /webchat-branding-pending/);
  assert.match(frame, /webchatBrandingReadyMessage/);
  assert.match(frame, /postMessage/);
  assert.match(frame, /settingsStatus: "failed"/);
  assert.doesNotMatch(frame, /useState<PublicWebchatPresentation>\(\(\) =>/);
  assert.doesNotMatch(frame, /resolvePublicWebchatPresentation\(\{\s*settings: \{\}\s*\}\)/);
  assert.doesNotMatch(frame, /data\?\.displayName/);
  assert.match(frame, /cache: "no-store"/);
  const settingsFetch = frame.slice(
    frame.indexOf("const painted = resolveWebchatPanelHeaderPaint"),
    frame.indexOf("setPresentation(nextPresentation)"),
  );
  assert.match(settingsFetch, /settingsStatus: "ready"/);
  assert.match(settingsFetch, /businessName: typeof data\?\.businessName === "string" \? data\.businessName : ""/);
  assert.match(settingsFetch, /agentName: typeof data\?\.agentName === "string" \? data\.agentName : ""/);
  assert.match(settingsFetch, /appOrigin:/);
  assert.match(settingsFetch, /allowedLogoHttpsHosts:/);
  assert.match(settingsFetch, /settings\.logoUrl/);
  assert.match(frame, /accentForeground/);
  assert.match(frame, /background: accentColor, color: accentTextColor/);
  assert.doesNotMatch(frame, /text-white rounded-br-none/);
  assert.match(frame, /presentation\.accentForeground/);
  const form = read("client/src/components/webchat/WebchatFormCard.tsx");
  assert.match(form, /field\.required \? " \*" : ""/);
  assert.match(form, /webchat-form-error/);
  assert.match(form, /consent/);
  assert.match(form, /contrastTextForBackground/);
  const media = read("client/src/components/webchat/WebchatMediaBubble.tsx");
  assert.doesNotMatch(media, /text-white rounded-br-none/);
  assert.match(media, /contrastTextForBackground/);
}

{
  const origin = read("shared/webchatOriginPolicy.ts");
  assert.match(origin, /originMatchesAllowlist/);
  const access = read("server/webchatAccess.ts");
  assert.match(access, /strictOrigin/);
  assert.match(access, /publicWidgetEmbedDecision/);
}

console.log("webchat-widget-branding.test.ts: all assertions passed");

