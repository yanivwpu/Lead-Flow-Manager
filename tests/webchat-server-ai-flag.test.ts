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
