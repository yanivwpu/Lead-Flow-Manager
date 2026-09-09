/**
 * Neutral Website Chat Widget defaults, activation state, and legacy fingerprint migration.
 * Run: npx tsx tests/webchat-widget-defaults.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { publicWidgetEmbedDecision } from "../shared/webchatOriginPolicy";
import {
  applyLegacyDefaultWidgetSanitize,
  classifyWidgetSettings,
  countWidgetSettingsClasses,
  leftoverLegacyExamplePageRules,
  LEGACY_DEFAULT_CTA_LABEL,
  LEGACY_DEFAULT_PAGE_RULES,
  LEGACY_DEFAULT_SUGGESTED_QUESTIONS,
  LEGACY_WIDGET_COLOR,
  LEGACY_WIDGET_WELCOME,
  mergeNeutralWidgetSettings,
  NEUTRAL_WIDGET_COLOR,
  NEUTRAL_WIDGET_SETTINGS,
  NEUTRAL_WIDGET_WELCOME,
  PRODUCTION_SHORT_LEGACY_WIDGET_SETTINGS,
  resolveWidgetActivationState,
  rulesMatchLegacyDefaultFingerprint,
  validateWidgetPageRules,
  widgetSurfaceStatus,
} from "../shared/webchatWidgetSettings";
import { isWidgetEnabled } from "../server/webchatAccess";
import { buildWebchatScriptSnippet } from "../shared/webchatWidgetSnippet";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const exactLegacyStored = {
  enabled: true,
  color: LEGACY_WIDGET_COLOR,
  welcomeMessage: LEGACY_WIDGET_WELCOME,
  position: "right",
  showOnMobile: true,
  showOnDesktop: true,
  triggerType: "always",
  triggerDelaySeconds: 5,
  triggerScrollPercent: 50,
  pageRules: LEGACY_DEFAULT_PAGE_RULES.map((r) => ({ ...r })),
};

{
  const merged = mergeNeutralWidgetSettings({});
  assert.equal(merged.enabled, false);
  assert.deepEqual(merged.pageRules, []);
  assert.equal(merged.allowAnyOrigin, false);
  assert.equal(merged.welcomeMessage, NEUTRAL_WIDGET_WELCOME);
  assert.equal(merged.color, NEUTRAL_WIDGET_COLOR);
  assert.ok(!JSON.stringify(merged).includes("/pricing"));
  assert.ok(!JSON.stringify(merged).includes("Book a demo"));
}

{
  const schema = read("shared/schema.ts");
  assert.match(schema, /"enabled":false/);
  assert.match(schema, /"pageRules":\[\]/);
  assert.doesNotMatch(schema, /Questions about pricing\?/);
  const patch = read("server/startupSchemaPatches.ts");
  assert.match(patch, /0090_widget_settings_neutral_default/);
}

{
  assert.equal(classifyWidgetSettings(PRODUCTION_SHORT_LEGACY_WIDGET_SETTINGS), "exact_legacy_default");
  const sanitizedShort = applyLegacyDefaultWidgetSanitize({ ...PRODUCTION_SHORT_LEGACY_WIDGET_SETTINGS });
  assert.equal(sanitizedShort.enabled, false);
  assert.deepEqual(sanitizedShort.pageRules, []);
  assert.equal(sanitizedShort.color, NEUTRAL_WIDGET_COLOR);

  const productionStoredThreeRules = {
    allowAnyOrigin: false,
    color: "#10b981",
    enabled: false,
    pageRules: [
      {
        chatbotFlowId: "",
        ctaLabel: "",
        ctaUrl: "",
        greeting: "Questions about pricing?",
        prefilledMessage: "Hi! I have a question about your pricing.",
        suggestedQuestions: [],
        urlContains: "/pricing",
      },
      {
        chatbotFlowId: "",
        ctaLabel: "",
        ctaUrl: "",
        greeting: "Let us get in touch",
        prefilledMessage: "Hi! I would like to get in touch.",
        suggestedQuestions: [],
        urlContains: "/contact",
      },
      {
        chatbotFlowId: "",
        ctaLabel: "",
        ctaUrl: "",
        greeting: "Tell us what you need",
        prefilledMessage: "Hi! I am interested in your services.",
        suggestedQuestions: [],
        urlContains: "/services",
      },
    ],
    position: "right",
    showOnDesktop: true,
    showOnMobile: true,
    triggerDelaySeconds: 5,
    triggerScrollPercent: 50,
    triggerType: "always",
    welcomeMessage: LEGACY_WIDGET_WELCOME,
  };
  assert.equal(classifyWidgetSettings(productionStoredThreeRules), "exact_legacy_default");

  const screenshotPlaceholderRules = {
    enabled: true,
    color: LEGACY_WIDGET_COLOR,
    welcomeMessage: LEGACY_WIDGET_WELCOME,
    pageRules: LEGACY_DEFAULT_PAGE_RULES.map((r) => ({
      ...r,
      suggestedQuestions: [...LEGACY_DEFAULT_SUGGESTED_QUESTIONS],
      ctaLabel: LEGACY_DEFAULT_CTA_LABEL,
      ctaUrl: "",
      chatbotFlowId: "",
    })),
  };
  assert.equal(classifyWidgetSettings(screenshotPlaceholderRules), "exact_legacy_default");
  assert.equal(rulesMatchLegacyDefaultFingerprint(screenshotPlaceholderRules.pageRules), true);
}

{
  assert.equal(rulesMatchLegacyDefaultFingerprint(exactLegacyStored.pageRules), true);
  const sanitized = applyLegacyDefaultWidgetSanitize(exactLegacyStored);
  assert.equal(classifyWidgetSettings(sanitized), "already_neutral");
  assert.deepEqual(sanitized.pageRules, []);
  assert.equal(sanitized.enabled, false);
  assert.equal(sanitized.welcomeMessage, NEUTRAL_WIDGET_WELCOME);
  const again = applyLegacyDefaultWidgetSanitize(sanitized);
  assert.deepEqual(again.pageRules, []);
  assert.equal(again.enabled, false);
}

{
  const customizedRules = {
    ...exactLegacyStored,
    pageRules: [
      ...exactLegacyStored.pageRules,
      { urlContains: "/listings", greeting: "Looking at homes?", prefilledMessage: "I want a showing." },
    ],
  };
  assert.equal(classifyWidgetSettings(customizedRules), "customized");
  const preserved = applyLegacyDefaultWidgetSanitize(customizedRules);
  assert.equal(preserved.pageRules.length, 4);

  const customizedGreeting = {
    ...exactLegacyStored,
    welcomeMessage: "Welcome to our clinic.",
  };
  assert.equal(classifyWidgetSettings(customizedGreeting), "customized");
  assert.equal(applyLegacyDefaultWidgetSanitize(customizedGreeting).welcomeMessage, "Welcome to our clinic.");

  const customizedCtaUrl = {
    ...exactLegacyStored,
    pageRules: exactLegacyStored.pageRules.map((r, i) =>
      i === 0 ? { ...r, ctaLabel: "Book a demo", ctaUrl: "https://example.com/demo" } : r,
    ),
  };
  assert.equal(classifyWidgetSettings(customizedCtaUrl), "customized");
  assert.equal((applyLegacyDefaultWidgetSanitize(customizedCtaUrl).pageRules as unknown[]).length, 3);

  const customizedQuestions = {
    ...exactLegacyStored,
    pageRules: exactLegacyStored.pageRules.map((r, i) =>
      i === 0 ? { ...r, suggestedQuestions: ["What is your MLS ID?"] } : r,
    ),
  };
  assert.equal(classifyWidgetSettings(customizedQuestions), "customized");

  const withOrigins = {
    ...exactLegacyStored,
    allowedOrigins: ["https://www.customer.com"],
  };
  assert.equal(classifyWidgetSettings(withOrigins), "customized");
  assert.equal(leftoverLegacyExamplePageRules(withOrigins), true);
  assert.equal(applyLegacyDefaultWidgetSanitize(withOrigins).pageRules.length, 3);
}

{
  const counts = countWidgetSettingsClasses([
    exactLegacyStored,
    PRODUCTION_SHORT_LEGACY_WIDGET_SETTINGS,
    { pageRules: [] },
    { ...exactLegacyStored, allowedOrigins: ["https://a.com"] },
    { ...exactLegacyStored, color: "#ec4899" },
  ]);
  assert.equal(counts.exactLegacyDefault, 2);
  assert.equal(counts.alreadyNeutral, 1);
  assert.equal(counts.customized, 2);
  assert.equal(counts.leftoverLegacyExampleRules, 2);
  const after = countWidgetSettingsClasses([
    applyLegacyDefaultWidgetSanitize(exactLegacyStored),
    { pageRules: [] },
    { ...exactLegacyStored, allowedOrigins: ["https://a.com"] },
    applyLegacyDefaultWidgetSanitize(exactLegacyStored),
  ]);
  assert.equal(after.exactLegacyDefault, 0);
  assert.equal(after.alreadyNeutral, 3);
}

{
  const missing = publicWidgetEmbedDecision(undefined);
  assert.equal(missing.ok, false);
  const empty = publicWidgetEmbedDecision({});
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.reason, "disabled");
  assert.equal(isWidgetEnabled(undefined), false);
  assert.equal(isWidgetEnabled({}), false);

  const noOrigin = resolveWidgetActivationState({ enabled: true, allowedOrigins: [] });
  assert.equal(noOrigin.effectivePublic, false);
  assert.equal(noOrigin.reason, "no_origins");
  const surface = widgetSurfaceStatus(noOrigin);
  assert.equal(surface.switchChecked, false);
  assert.equal(surface.originHint, "Add a website domain before enabling the widget.");
  assert.equal(surface.channelPill, "needs_attention");

  const lostOrigin = resolveWidgetActivationState({ enabled: true, allowedOrigins: [] });
  assert.equal(widgetSurfaceStatus(lostOrigin).switchChecked, false);

  const allowAny = resolveWidgetActivationState({ enabled: true, allowAnyOrigin: true, allowedOrigins: [] });
  assert.equal(allowAny.effectivePublic, true);
  assert.equal(allowAny.reason, "allow_any");
  assert.equal(widgetSurfaceStatus(allowAny).switchChecked, true);

  const live = resolveWidgetActivationState({
    enabled: true,
    allowedOrigins: ["https://www.example.com"],
  });
  assert.equal(live.effectivePublic, true);
  const widgetUi = widgetSurfaceStatus(live);
  const channelUi = widgetSurfaceStatus(live);
  assert.deepEqual(widgetUi, channelUi);
}

{
  const dup = validateWidgetPageRules([
    { urlContains: "/about", greeting: "Hi" },
    { urlContains: "/about", greeting: "Hello" },
  ]);
  assert.equal(dup.ok, false);
  const ok = validateWidgetPageRules([{ urlContains: "/about", greeting: "Hi", ctaUrl: "" }]);
  assert.equal(ok.ok, true);
  const badCta = validateWidgetPageRules([{ urlContains: "/about", ctaUrl: "javascript:alert(1)" }]);
  assert.equal(badCta.ok, false);
}

{
  const website = read("client/src/pages/WebsiteWidget.tsx");
  assert.match(website, /Website Chat Widget/);
  assert.match(website, /Capture, qualify and assist website visitors directly inside your unified Inbox/);
  assert.doesNotMatch(website, /Website → WhatsApp/);
  assert.doesNotMatch(website, /start WhatsApp conversations automatically/);
  assert.doesNotMatch(website, /WhatsApp Green/);
  assert.match(website, /switchChecked/);
  assert.match(website, /resolveWidgetActivationState/);
  assert.match(website, /widgetSurfaceStatus/);
  assert.doesNotMatch(website, /checked=\{settings\.enabled\}/);
  assert.match(website, /empty-page-rules/);
  assert.match(website, /No page-specific rules are configured/);
  assert.match(website, /Add a website domain before enabling the widget/);
  assert.match(website, /button-confirm-rotate-widget-id/);
  assert.match(website, /invalidates existing embed snippets/);
  assert.match(website, /WebchatChromePreview/);
  assert.match(website, /button-preview-desktop/);
  assert.match(website, /button-preview-mobile/);
  assert.match(website, /button-preview-\$\{item\.id\}/);
  assert.doesNotMatch(website, /WhachatCRM<\/div>/);
  assert.match(website, /Manual: your team replies in the Inbox/);
  assert.match(website, /does not automatically enable Auto/);
  assert.doesNotMatch(website, /WEBCHAT_SERVER_AI/);
  assert.match(website, /effectiveHasAIBrain/);
  assert.match(website, /text-auto-rollout-off/);
  assert.doesNotMatch(website, /Book a demo/);
  assert.doesNotMatch(website, /user\.id/);

  const channels = read("client/src/components/ChannelSettings.tsx");
  assert.match(channels, /resolveWidgetActivationState/);
  assert.match(channels, /widgetSurfaceStatus/);
  assert.match(channels, /text-webchat-effective-status/);
  assert.match(channels, /icon-webchat-neutral/);
  assert.doesNotMatch(channels, /filter\(\(channel\) => channel !== "webchat"\)/);
  assert.match(channels, /logoSrc: '\/logos\/whatsapp\.svg'/);

  const routes = read("server/routes.ts");
  assert.match(routes, /buildWebchatPublicScript/);
  assert.match(routes, /getChatbotFlowForWorkspace/);
  assert.match(routes, /ORIGIN_REQUIRED/);
  assert.match(routes, /hasWidgetOriginPrerequisite/);
  const widgetJs = read("server/webchatPublicScript.ts");
  assert.match(widgetJs, /JSON\.stringify\(p\.color\)/);
  assert.match(widgetJs, /ARIA_OPEN/);
  assert.match(widgetJs, /Close website chat/);
  assert.doesNotMatch(widgetJs, /whatsapp\.svg/i);
  assert.doesNotMatch(
    routes.slice(routes.indexOf('app.get("/widget.js"'), routes.indexOf('app.get("/widget.js"') + 2500),
    /whatsapp\.svg/i,
  );

  const snippet = buildWebchatScriptSnippet({
    baseUrl: "https://app.example.com",
    widgetPublicId: "wgt_" + "b".repeat(48),
  });
  assert.match(snippet, /\?id=wgt_/);
  assert.doesNotMatch(snippet, /11111111-1111-4111-8111-111111111111/);

  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  assert.match(inbox, /webchat: 'Web Chat'/);
  assert.match(inbox, /whatsapp: \{ icon: MessageCircle, color: '#25D366', label: 'WhatsApp' \}/);
}

{
  const defaults = NEUTRAL_WIDGET_SETTINGS;
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.pageRules.length, 0);
  assert.ok(!("ctaLabel" in (defaults as Record<string, unknown>)));
}

console.log("webchat-widget-defaults.test.ts: all assertions passed");
