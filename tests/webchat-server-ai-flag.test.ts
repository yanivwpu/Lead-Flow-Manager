/**
 * Production skip_flag_off is WEBCHAT_SERVER_AI_AUTO, not tenant Auto.
 * Run: npx tsx --test tests/webchat-server-ai-flag.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decideWebchatAiReply } from "../shared/webchatAiPolicy";
import { decideWebchatInboundAiEvaluation } from "@shared/webchatInboundAiDispatch";
import { dispatchWebchatInboundAi } from "../server/webchatInboundReplyDispatch";
import {
  WEBCHAT_SERVER_AI_AUTO_FLAG,
  isWebchatServerAiAllowlisted,
  isWebchatServerAiRolloutEnabled,
  isWebchatServerAiUnattendedEligible,
  publicWebchatServerAiRollout,
  readWebchatServerAiRollout,
} from "../server/webchatServerAiRollout";
import { chatbotCompletionPromptRules } from "@shared/chatbotCompletionContext";
import { isWidgetEnabled } from "../server/webchatAccess";
import {
  PRODUCTION_SHORT_LEGACY_WIDGET_SETTINGS,
  resolveWidgetActivationState,
  widgetSurfaceStatus,
} from "../shared/webchatWidgetSettings";
import {
  parseUsersAuthCoreRow,
  userFromAuthCoreRow,
} from "../server/storage";
import {
  mapWebchatInboundReplySettings,
  widgetSettingsForAiDispatch,
} from "../server/webchatInboundUserSettings";
import type { Contact, Conversation } from "@shared/schema";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const DEMO_URL = "https://calendly.com/yanivharamaty/whachatcrm-live-product-demo";

const aiBase = {
  widgetEnabled: true,
  hasAiBrainAccess: true,
  planIsProOrTrial: true,
  aiModeRaw: "full_auto" as string,
  chatbotOwnsReply: false,
  bookingOwnsReply: false,
  crmFallbackOwnsReply: false,
  handoffActive: false,
  aiPaused: false,
  automationsPaused: false,
  optedOut: false,
  rateLimited: false,
};

function withRolloutEnv(flag: string, allowlist: string, fn: () => void) {
  const prevFlag = process.env.WEBCHAT_SERVER_AI_AUTO;
  const prevList = process.env.WEBCHAT_SERVER_AI_AUTO_ALLOWLIST;
  process.env.WEBCHAT_SERVER_AI_AUTO = flag;
  process.env.WEBCHAT_SERVER_AI_AUTO_ALLOWLIST = allowlist;
  try {
    fn();
  } finally {
    process.env.WEBCHAT_SERVER_AI_AUTO = prevFlag;
    process.env.WEBCHAT_SERVER_AI_AUTO_ALLOWLIST = prevList;
  }
}

test("workspace Auto + entitled + production flag on → one AI send", async () => {
  withRolloutEnv("1", "", () => {
    const state = readWebchatServerAiRollout("workspace-a");
    assert.equal(state.flagName, WEBCHAT_SERVER_AI_AUTO_FLAG);
    assert.equal(state.rolloutEnabled, true);
    assert.equal(state.unattendedEligible, true);
    assert.equal(
      decideWebchatAiReply({ ...aiBase, rolloutEnabled: state.rolloutEnabled, allowlisted: state.allowlisted }),
      "send_auto",
    );
  });
  const contact = { id: "c1", userId: "workspace-a" } as Contact;
  const conversation = { id: "conv-1", userId: "workspace-a", contactId: "c1" } as Conversation;
  let runs = 0;
  const out = await dispatchWebchatInboundAi(
    {
      userId: "workspace-a",
      contact,
      conversation,
      inboundMessageId: "evt-1",
      inboundText: "What does Pro cost?",
      contentType: "text",
      channel: "webchat",
      chatbotOwnsReply: false,
      turnOwner: "ai_eligible",
      awayConfigured: false,
      awayReplyWillSend: false,
      widgetSettings: { enabled: true },
    },
    {
      runAi: async () => {
        runs += 1;
        return { decision: "send_auto", sent: true };
      },
    },
  );
  assert.equal(out.evaluated, true);
  assert.equal(out.sent, true);
  assert.equal(runs, 1);
});

test("Suggest drafts and Manual sends nothing", () => {
  assert.equal(decideWebchatAiReply({ ...aiBase, rolloutEnabled: true, allowlisted: false, aiModeRaw: "suggest" }), "suggest_only");
  assert.equal(decideWebchatAiReply({ ...aiBase, rolloutEnabled: true, allowlisted: false, aiModeRaw: "off" }), "skip_manual");
});

test("genuine global kill switch off → skip_flag_off with named flag", () => {
  withRolloutEnv("", "", () => {
    assert.equal(isWebchatServerAiRolloutEnabled(), false);
    assert.equal(isWebchatServerAiAllowlisted("workspace-a"), false);
    assert.equal(isWebchatServerAiUnattendedEligible("workspace-a"), false);
    const state = readWebchatServerAiRollout("workspace-a");
    assert.equal(state.flagName, "WEBCHAT_SERVER_AI_AUTO");
    assert.equal(
      decideWebchatAiReply({
        ...aiBase,
        rolloutEnabled: state.rolloutEnabled,
        allowlisted: state.allowlisted,
      }),
      "skip_flag_off",
    );
  });
  withRolloutEnv("0", "", () => {
    assert.equal(isWebchatServerAiRolloutEnabled(), false);
  });
  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /flagName: rollout\.flagName/);
  assert.match(auto, /flagSource: "env_rollout"/);
  assert.doesNotMatch(auto, /process\.env\.WEBCHAT_SERVER_AI_AUTO \+/);
});

test("missing away reply does not affect AI evaluation", () => {
  const gate = decideWebchatInboundAiEvaluation({
    channel: "webchat",
    chatbotOwnsReply: false,
    turnOwner: "ai_eligible",
    awayReplyWillSend: false,
  });
  assert.equal(gate.evaluateAi, true);
  assert.equal(
    decideWebchatAiReply({ ...aiBase, rolloutEnabled: true, allowlisted: false, crmFallbackOwnsReply: false }),
    "send_auto",
  );
});

test("legacy static auto-reply flags do not control AI Brain", () => {
  const policy = read("shared/webchatAiPolicy.ts");
  assert.doesNotMatch(policy, /autoReplyEnabled/);
  assert.doesNotMatch(policy, /awayMessageEnabled/);
  assert.match(policy, /skip_flag_off/);
  const rollout = read("server/webchatServerAiRollout.ts");
  assert.match(rollout, /WEBCHAT_SERVER_AI_AUTO/);
  assert.doesNotMatch(rollout, /autoReplyEnabled/);
});

test("UI-selected Auto cannot silently disagree with unattended eligibility", () => {
  withRolloutEnv("", "", () => {
    const pub = publicWebchatServerAiRollout("workspace-a");
    assert.equal(pub.unattendedEligible, false);
    assert.equal("flagName" in pub, false);
    assert.equal(
      decideWebchatAiReply({ ...aiBase, rolloutEnabled: false, allowlisted: false, aiModeRaw: "full_auto" }),
      "skip_flag_off",
    );
  });
  const brain = read("client/src/pages/AIBrain.tsx");
  assert.match(brain, /text-unattended-auto-paused/);
  assert.match(brain, /Web Chat replies while Inbox is closed are paused/);
  assert.doesNotMatch(brain, /WEBCHAT_SERVER_AI_AUTO/);
  const website = read("client/src/pages/WebsiteWidget.tsx");
  assert.match(website, /unattendedEligible !== true/);
  assert.match(website, /text-auto-rollout-off/);
  assert.doesNotMatch(website, /WEBCHAT_SERVER_AI/);
  const routes = read("server/routes.ts");
  assert.match(routes, /publicWebchatServerAiRollout/);
  const aiSettings = routes.slice(routes.indexOf('app.get("/api/ai/settings"'), routes.indexOf('app.patch("/api/ai/settings"'));
  assert.match(aiSettings, /webchatServerAi/);
  assert.match(aiSettings, /publicWebchatServerAiRollout/);
});

test("Hebrew Book a demo still uses the selected Calendly URL", () => {
  const prompt = chatbotCompletionPromptRules({
    visitorIntent: "Book a demo",
    conversationLanguage: "he",
    bookingUrl: DEMO_URL,
  });
  assert.match(prompt, /yanivharamaty\/whachatcrm-live-product-demo/);
});

test("duplicate inbound shares one unattended send key", () => {
  const policy = read("shared/webchatAiPolicy.ts");
  assert.match(policy, /webchat_ai:\$\{userId\}:\$\{inboundMessageId\}/);
});

test("skip_widget_disabled is users.widget_settings.enabled from the narrow inbound accessor", () => {
  const access = read("server/webchatAccess.ts");
  assert.match(access, /return settings\?\.enabled === true/);
  const channel = read("server/channelService.ts");
  const inboundWindow = channel.slice(
    channel.indexOf("Away reply (optional)"),
    channel.indexOf('reason: "chatbot_owns"'),
  );
  assert.match(inboundWindow, /getWebchatInboundReplySettings/);
  assert.match(inboundWindow, /widgetSettingsForAiDispatch/);
  assert.doesNotMatch(inboundWindow, /getUserForSession/);
  assert.doesNotMatch(inboundWindow, /storage\.getUser\(/);
  const storageSrc = read("server/storage.ts");
  const getUser = storageSrc.slice(storageSrc.indexOf("async getUser(id"), storageSrc.indexOf("async getUserForSession"));
  assert.doesNotMatch(getUser, /widget_settings|widgetSettings/);
  const accessor = read("server/webchatInboundUserSettings.ts");
  const select = accessor.slice(accessor.indexOf(".select({"), accessor.indexOf(".from(users)"));
  assert.match(select, /widgetSettings: users\.widgetSettings/);
  assert.doesNotMatch(select, /password|twilioAuthToken|metaAccessToken|shopifyAccessToken/);
  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /widgetProperty: "widgetSettings.enabled"/);
  assert.match(auto, /widgetSource: "users.widget_settings"/);
  assert.doesNotMatch(auto, /#region agent log/);
  assert.doesNotMatch(channel, /#region agent log/);
});

test("auth-core getUser projection drops persisted widgetSettings and skips AI", () => {
  const parsed = parseUsersAuthCoreRow({
    id: "workspace-a",
    name: "A",
    email: "a@b.c",
    password: "hashed-not-for-ai",
    widget_settings: { enabled: true, allowedOrigins: ["https://example.com"] },
    widgetSettings: { enabled: true, allowedOrigins: ["https://example.com"] },
  });
  assert.ok(parsed);
  const authCoreUser = userFromAuthCoreRow(parsed!);
  assert.equal(authCoreUser.widgetSettings, undefined);
  assert.equal(Object.keys(authCoreUser).sort().join(","), "email,id,name,password");
  const fromAuthCore = widgetSettingsForAiDispatch(authCoreUser.widgetSettings);
  assert.equal(fromAuthCore.enabled, false);
  assert.equal(
    decideWebchatAiReply({
      ...aiBase,
      rolloutEnabled: false,
      allowlisted: true,
      widgetEnabled: isWidgetEnabled(fromAuthCore),
    }),
    "skip_widget_disabled",
  );
});

test("narrow accessor maps persisted enabled for inbound AI and keeps disabled skip", () => {
  const persistedActive = {
    enabled: true,
    allowedOrigins: ["https://example.com"],
    welcomeMessage: "Hi",
  };
  const mapped = mapWebchatInboundReplySettings({
    id: "workspace-a",
    widgetSettings: persistedActive,
    businessHoursEnabled: false,
    awayMessageEnabled: false,
  });
  const forAi = widgetSettingsForAiDispatch(mapped.widgetSettings);
  assert.equal(forAi.enabled, true);
  assert.equal(Object.keys(forAi).join(","), "enabled");
  assert.equal(
    decideWebchatAiReply({
      ...aiBase,
      rolloutEnabled: false,
      allowlisted: true,
      widgetEnabled: isWidgetEnabled(forAi),
    }),
    "send_auto",
  );
  assert.equal(
    decideWebchatAiReply({
      ...aiBase,
      rolloutEnabled: false,
      allowlisted: true,
      widgetEnabled: isWidgetEnabled(
        widgetSettingsForAiDispatch(PRODUCTION_SHORT_LEGACY_WIDGET_SETTINGS),
      ),
    }),
    "send_auto",
  );
  assert.equal(
    decideWebchatAiReply({
      ...aiBase,
      rolloutEnabled: true,
      allowlisted: false,
      widgetEnabled: isWidgetEnabled(widgetSettingsForAiDispatch({ enabled: false })),
    }),
    "skip_widget_disabled",
  );
  assert.equal(isWidgetEnabled({}), false);
  assert.equal(isWidgetEnabled(undefined), false);

  const live = resolveWidgetActivationState(persistedActive);
  assert.equal(widgetSurfaceStatus(live).widgetStatusLabel, "Active");
  assert.equal(live.requestedEnabled, true);
  assert.equal(
    widgetSurfaceStatus(resolveWidgetActivationState(widgetSettingsForAiDispatch(undefined))).widgetStatusLabel,
    "Disabled",
  );
});
