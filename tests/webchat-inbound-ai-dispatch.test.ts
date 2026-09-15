/**
 * Production Web Chat inbound path: away reply must not skip AI Auto.
 * Exercises the same dispatcher processIncomingMessage awaits.
 * Run: npx tsx --test tests/webchat-inbound-ai-dispatch.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Contact, Conversation } from "@shared/schema";
import { decideWebchatInboundAiEvaluation } from "@shared/webchatInboundAiDispatch";
import { dispatchWebchatInboundAi } from "../server/webchatInboundReplyDispatch";
import { matchAskQuestionOpeningMessage } from "@shared/chatbotAskOpeningMatch";
import { applyChatbotAskAnswer, validateChatbotAskAnswer } from "@shared/chatbotAskQuestion";
import {
  chatbotCompletionPromptRules,
  classifyChatbotVisitorIntent,
} from "@shared/chatbotCompletionContext";
import { languageInstructionForConversation } from "@shared/conversationLanguage";
import { decideWebchatTurnOwner } from "@shared/webchatTurnOwner";
import { decideWebchatAiReply, webchatAutoSendIdempotencyKey } from "@shared/webchatAiPolicy";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const CANONICAL = [
  { label: "Features & pricing", value: "Features & pricing" },
  { label: "Find my solution", value: "Find my solution" },
  { label: "Book a demo", value: "Book a demo" },
];
const HE = [{ label: "קביעת הדגמה", value: "קביעת הדגמה" }];
const DEMO_URL = "https://calendly.com/yanivharamaty/whachatcrm-live-product-demo";

const contact = { id: "c1", userId: "workspace-a" } as Contact;
const conversation = { id: "conv-1", userId: "workspace-a", contactId: "c1" } as Conversation;

function productionInboundArgs(overrides: Record<string, unknown> = {}) {
  return {
    userId: "workspace-a",
    contact,
    conversation,
    inboundMessageId: "evt-1",
    inboundText: "What does Pro cost?",
    contentType: "text",
    channel: "webchat",
    chatbotOwnsReply: false,
    turnOwner: "ai_eligible" as const,
    awayConfigured: false,
    awayReplyWillSend: false,
    widgetSettings: { enabled: true },
    ...overrides,
  };
}

test("no away reply + AI Auto + Ask Question complete → one AI send", async () => {
  const turn = decideWebchatTurnOwner({
    bookingIntent: false,
    chatbot: { triggered: true, visitorFacing: false, reason: "pending_ask_complete" },
  });
  assert.equal(turn.owner, "ai_eligible");
  assert.equal(turn.chatbotOwnsReply, false);
  assert.equal(
    decideWebchatInboundAiEvaluation({
      channel: "webchat",
      chatbotOwnsReply: false,
      turnOwner: turn.owner,
      awayReplyWillSend: false,
    }).evaluateAi,
    true,
  );
  let runs = 0;
  const out = await dispatchWebchatInboundAi(productionInboundArgs({ inboundText: "קביעת הדגמה" }), {
    runAi: async () => {
      runs += 1;
      return { decision: "send_auto", sent: true };
    },
  });
  assert.equal(out.evaluated, true);
  assert.equal(out.sent, true);
  assert.equal(runs, 1);
});

test("no away reply + AI Auto + ordinary later inbound → one AI send", async () => {
  let runs = 0;
  const out = await dispatchWebchatInboundAi(productionInboundArgs(), {
    runAi: async () => {
      runs += 1;
      return { decision: "send_auto", sent: true };
    },
  });
  assert.equal(out.evaluated, true);
  assert.equal(out.decision, "send_auto");
  assert.equal(out.sent, true);
  assert.equal(runs, 1);
});

test("no away reply + Suggest → one draft", async () => {
  let runs = 0;
  const out = await dispatchWebchatInboundAi(productionInboundArgs(), {
    runAi: async () => {
      runs += 1;
      return { decision: "suggest_only", sent: false };
    },
  });
  assert.equal(out.evaluated, true);
  assert.equal(out.decision, "suggest_only");
  assert.equal(out.sent, false);
  assert.equal(runs, 1);
  assert.equal(decideWebchatAiReply({
    rolloutEnabled: true,
    allowlisted: true,
    widgetEnabled: true,
    hasAiBrainAccess: true,
    planIsProOrTrial: true,
    aiModeRaw: "suggest",
    chatbotOwnsReply: false,
    handoffActive: false,
    aiPaused: false,
    automationsPaused: false,
    optedOut: false,
    rateLimited: false,
  }), "suggest_only");
});

test("no away reply + Manual → nothing", async () => {
  let runs = 0;
  const out = await dispatchWebchatInboundAi(productionInboundArgs(), {
    runAi: async () => {
      runs += 1;
      return { decision: "skip_manual", sent: false };
    },
  });
  assert.equal(out.evaluated, true);
  assert.equal(out.sent, false);
  assert.equal(runs, 1);
  assert.equal(decideWebchatAiReply({
    rolloutEnabled: true,
    allowlisted: true,
    widgetEnabled: true,
    hasAiBrainAccess: true,
    planIsProOrTrial: true,
    aiModeRaw: "off",
    chatbotOwnsReply: false,
    handoffActive: false,
    aiPaused: false,
    automationsPaused: false,
    optedOut: false,
    rateLimited: false,
  }), "skip_manual");
});

test("away reply configured + Auto → away owns, no duplicate AI", async () => {
  let runs = 0;
  const out = await dispatchWebchatInboundAi(
    productionInboundArgs({ awayConfigured: true, awayReplyWillSend: true }),
    {
      runAi: async () => {
        runs += 1;
        return { decision: "send_auto", sent: true };
      },
    },
  );
  assert.equal(out.evaluated, false);
  assert.equal(out.reason, "away_reply_owns");
  assert.equal(out.sent, false);
  assert.equal(runs, 0);
});

test("chatbot still waiting → AI suppressed", async () => {
  let runs = 0;
  const out = await dispatchWebchatInboundAi(
    productionInboundArgs({ chatbotOwnsReply: true, turnOwner: "chatbot" }),
    {
      runAi: async () => {
        runs += 1;
        return { decision: "send_auto", sent: true };
      },
    },
  );
  assert.equal(out.evaluated, false);
  assert.equal(out.reason, "chatbot_owns");
  assert.equal(runs, 0);
});

test("Hebrew Book a demo uses visitor language and selected Calendly URL", () => {
  const opening = matchAskQuestionOpeningMessage("אני רוצה לקבוע הדגמה", CANONICAL, [HE]);
  assert.equal(opening.matched, true);
  if (!opening.matched) throw new Error("expected match");
  const validated = validateChatbotAskAnswer("visitor_intent", opening.option.value);
  assert.equal(validated.ok, true);
  if (!validated.ok) throw new Error("expected valid");
  const applied = applyChatbotAskAnswer({
    contact: { userId: "t1", customFields: {} },
    expectedUserId: "t1",
    variableName: "visitor_intent",
    validated,
    channel: "webchat",
    conversationId: "c1",
    flowRunId: "r1",
  });
  assert.equal(applied.ok, true);
  if (!applied.ok) throw new Error("expected apply");
  const intent = (applied.patch.customFields.chatbotVars as { visitor_intent: { value: string } })
    .visitor_intent.value;
  assert.equal(intent, "Book a demo");
  assert.equal(classifyChatbotVisitorIntent(intent), "book_demo");
  const prompt = chatbotCompletionPromptRules({
    visitorIntent: intent,
    conversationLanguage: "he",
    bookingUrl: DEMO_URL,
  });
  assert.match(prompt, /yanivharamaty\/whachatcrm-live-product-demo/);
  assert.match(languageInstructionForConversation("he"), /עברית|Hebrew/);
});

test("duplicate sourceEventId → no duplicate AI generation", async () => {
  const seen = new Set<string>();
  const runAi = async (p: { inboundMessageId: string }) => {
    if (seen.has(p.inboundMessageId)) return { decision: "skip_already_replied", sent: false };
    seen.add(p.inboundMessageId);
    return { decision: "send_auto", sent: true };
  };
  const first = await dispatchWebchatInboundAi(productionInboundArgs({ inboundMessageId: "evt-dup" }), {
    runAi,
  });
  const second = await dispatchWebchatInboundAi(productionInboundArgs({ inboundMessageId: "evt-dup" }), {
    runAi,
  });
  assert.equal(first.sent, true);
  assert.equal(second.sent, false);
  assert.equal(second.decision, "skip_already_replied");
  assert.equal(seen.size, 1);
  assert.equal(webchatAutoSendIdempotencyKey("workspace-a", "evt-dup"), "webchat_ai:workspace-a:evt-dup");
});

test("generation failure is observable, not a silent ready state", async () => {
  const out = await dispatchWebchatInboundAi(productionInboundArgs(), {
    runAi: async () => ({ decision: "ok_generation_recovery", sent: true }),
  });
  assert.equal(out.evaluated, true);
  assert.equal(out.sent, true);
  assert.equal(out.decision, "ok_generation_recovery");
  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /recoverWebchatGenerationFailure/);
  assert.match(auto, /generation_recovery/);
  assert.match(auto, /\[AIAutoReply\]/);
  assert.doesNotMatch(auto, /AI could not generate a reply/);
});

test("new-conversation smart matching from 1ca9f2a9 still works", () => {
  assert.equal(matchAskQuestionOpeningMessage("Hi", CANONICAL, [HE]).matched, false);
  assert.equal(matchAskQuestionOpeningMessage("שלום", CANONICAL, [HE]).matched, false);
  const he = matchAskQuestionOpeningMessage("אני רוצה לקבוע הדגמה", CANONICAL, [HE]);
  assert.equal(he.matched, true);
  if (he.matched) assert.equal(he.option.value, "Book a demo");
  const engine = read("server/chatbotEngine.ts");
  assert.match(engine, /matchAskQuestionOpeningMessage/);
  assert.match(engine, /Opening inbound already answered Ask Question/);
});

test("production inbound path awaits AI after away skip, webhook does not re-dispatch", () => {
  const channel = read("server/channelService.ts");
  const webhooks = read("server/routes/webhooks.ts");
  const dispatch = read("server/webchatInboundReplyDispatch.ts");
  const scheduleCall = channel.indexOf("this._scheduleAutoReply(");
  const inboundAi = channel.indexOf("await dispatchWebchatInboundAi");
  assert.ok(scheduleCall > 0 && inboundAi > scheduleCall);
  assert.match(channel, /\[AwayReply\]/);
  assert.match(channel, /\[AIAutoReply\]/);
  assert.match(channel, /await dispatchWebchatInboundAi/);
  assert.match(dispatch, /decideWebchatInboundAiEvaluation/);
  assert.match(dispatch, /maybeRunWebchatServerAi/);
  const post = webhooks.slice(
    webhooks.indexOf('app.post("/api/webchat/:userId"'),
    webhooks.indexOf('app.get("/api/webchat/:userId/settings"'),
  );
  assert.match(post, /processIncomingMessage/);
  assert.doesNotMatch(post, /maybeRunWebchatServerAi/);
  assert.doesNotMatch(post, /dispatchWebchatInboundAi/);
  assert.match(channel, /An unconfigured away reply must not skip|must not skip AI Auto/);
});

test("production inbound path loads persisted widget enabled via the narrow accessor", () => {
  const channel = read("server/channelService.ts");
  const accessor = read("server/webchatInboundUserSettings.ts");
  const inboundWindow = channel.slice(
    channel.indexOf("Away reply (optional)"),
    channel.indexOf('reason: "chatbot_owns"'),
  );
  assert.match(inboundWindow, /getWebchatInboundReplySettings\(userId\)/);
  assert.match(inboundWindow, /widgetSettingsForAiDispatch\(inboundSettings\?\.widgetSettings\)/);
  assert.doesNotMatch(inboundWindow, /getUserForSession/);
  assert.doesNotMatch(inboundWindow, /storage\.getUser\(/);
  const select = accessor.slice(accessor.indexOf(".select({"), accessor.indexOf(".from(users)"));
  assert.match(select, /widgetSettings: users\.widgetSettings/);
  assert.match(accessor, /enabled: extractWidgetSettingsRecord\(raw\)\.enabled === true/);
  assert.doesNotMatch(select, /password|twilioAuthToken|metaAccessToken|shopifyAccessToken/);
});
