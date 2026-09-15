/**
 * Ask Question → AI Auto handoff: localized chips, pending release, mode policy.
 * Run: npx tsx tests/webchat-ask-question-ai-handoff.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyChatbotAskAnswer,
  claimChatbotPendingAsk,
  createChatbotPendingAsk,
  markChatbotPendingConsumed,
  mergeChatbotPendingIntoAiControl,
  pendingAskFromAiControl,
  rememberChatbotPendingAsk,
  resetChatbotAskQuestionMemoryForTests,
  validateChatbotAskAnswer,
  wouldPendingAskComplete,
} from "../shared/chatbotAskQuestion";
import {
  matchAskQuestionQuickReply,
  visitorFacingAskQuestionChips,
} from "../shared/chatbotAskQuestionOptions";
import {
  chatbotCompletionPromptRules,
  classifyChatbotVisitorIntent,
} from "../shared/chatbotCompletionContext";
import { decideWebchatAiReply } from "../shared/webchatAiPolicy";
import { decideWebchatTurnOwner } from "../shared/webchatTurnOwner";
import { resolveCalendlyCustomerSchedulingUrlFromConfig } from "../shared/calendlyEventSelection";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const CANONICAL = [
  { label: "Features & pricing", value: "Features & pricing" },
  { label: "Find my solution", value: "Find my solution" },
  { label: "Book a demo", value: "Book a demo" },
];
const HE = [
  { label: "פיצ'רים ומחירים", value: "פיצ'רים ומחירים" },
  { label: "למצוא את הפתרון שלי", value: "למצוא את הפתרון שלי" },
  { label: "קביעת הדגמה", value: "קביעת הדגמה" },
];
const ES = [
  { label: "Características y precios", value: "Características y precios" },
  { label: "Encontrar mi solución", value: "Encontrar mi solución" },
  { label: "Reservar una demo", value: "Reservar una demo" },
];
const DEMO_URL = "https://calendly.com/yanivharamaty/whachatcrm-live-product-demo";

const aiBase = {
  rolloutEnabled: true,
  allowlisted: true,
  widgetEnabled: true,
  hasAiBrainAccess: true,
  planIsProOrTrial: true,
  aiModeRaw: "auto" as string,
  chatbotOwnsReply: false,
  handoffActive: false,
  aiPaused: false,
  automationsPaused: false,
  optedOut: false,
  rateLimited: false,
};

function pendingFor(localeSets: Record<string, typeof HE>) {
  return createChatbotPendingAsk({
    flowRunId: "run-1",
    flowId: "flow-1",
    nodeId: "q1",
    variableName: "visitor_intent",
    nextNodeId: "",
    channel: "webchat",
    userId: "tenant-a",
    contactId: "c1",
    conversationId: "conv-handoff",
    promptText: "What would you like help with today?",
    quickReplies: CANONICAL,
    localeOptionSets: localeSets,
  });
}

function completeAsk(clickText: string, localeSets: Record<string, typeof HE>) {
  resetChatbotAskQuestionMemoryForTests();
  const pending = pendingFor(localeSets);
  rememberChatbotPendingAsk(pending);
  assert.equal(wouldPendingAskComplete(pending, clickText), true);
  const claim = claimChatbotPendingAsk({
    conversationId: "conv-handoff",
    userId: "tenant-a",
    sourceEventId: "evt-1",
    pending,
  });
  assert.equal(claim.ok, true);
  const matched = matchAskQuestionQuickReply(clickText, pending.quickReplies, Object.values(localeSets));
  assert.ok(matched);
  const validated = validateChatbotAskAnswer("visitor_intent", matched!.value);
  assert.equal(validated.ok, true);
  if (!validated.ok) throw new Error("expected valid ask answer");
  const applied = applyChatbotAskAnswer({
    contact: { userId: "tenant-a", customFields: {} },
    expectedUserId: "tenant-a",
    variableName: "visitor_intent",
    validated,
    channel: "webchat",
    conversationId: "conv-handoff",
    flowRunId: "run-1",
  });
  assert.equal(applied.ok, true);
  if (!applied.ok) throw new Error("expected apply");
  const intent = (applied.patch.customFields.chatbotVars as { visitor_intent: { value: string } }).visitor_intent.value;
  markChatbotPendingConsumed(pending, "evt-1");
  const turn = decideWebchatTurnOwner({
    bookingIntent: false,
    chatbot: { triggered: true, visitorFacing: false, reason: "pending_ask_complete" },
  });
  assert.equal(turn.owner, "ai_eligible");
  assert.equal(turn.chatbotOwnsReply, false);
  const cleared = mergeChatbotPendingIntoAiControl({ lastTurnOwner: "ai_eligible" }, null);
  assert.equal(pendingAskFromAiControl(cleared), null);
  return { intent, display: clickText, matched };
}

{
  const he = completeAsk("קביעת הדגמה", { he: HE, es: ES });
  assert.equal(he.intent, "Book a demo");
  assert.equal(he.display, "קביעת הדגמה");
  assert.equal(classifyChatbotVisitorIntent(he.intent), "book_demo");
  const prompt = chatbotCompletionPromptRules({ visitorIntent: he.intent, bookingUrl: DEMO_URL });
  assert.match(prompt, /yanivharamaty\/whachatcrm-live-product-demo/);
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "auto" }), "send_auto");
}

{
  const es = completeAsk("Reservar una demo", { he: HE, es: ES });
  assert.equal(es.intent, "Book a demo");
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "full_auto" }), "send_auto");
}

{
  const en = completeAsk("Book a demo", { he: HE, es: ES });
  assert.equal(en.intent, "Book a demo");
  assert.equal(decideWebchatAiReply(aiBase), "send_auto");
}

{
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "suggest" }), "suggest_only");
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "suggest_only" }), "suggest_only");
}

{
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "off" }), "skip_manual");
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "manual" }), "skip_manual");
}

{
  resetChatbotAskQuestionMemoryForTests();
  const pending = pendingFor({ he: HE });
  rememberChatbotPendingAsk(pending);
  const first = claimChatbotPendingAsk({
    conversationId: "conv-handoff",
    userId: "tenant-a",
    sourceEventId: "evt-dup",
    pending,
  });
  assert.equal(first.ok, true);
  const consumed = markChatbotPendingConsumed(pending, "evt-dup");
  const dup = claimChatbotPendingAsk({
    conversationId: "conv-handoff",
    userId: "tenant-a",
    sourceEventId: "evt-dup",
    pending: consumed,
  });
  assert.equal(dup.ok, false);
  if (!dup.ok) assert.equal(dup.reason, "duplicate");
  const turn = decideWebchatTurnOwner({
    bookingIntent: false,
    chatbot: { triggered: true, visitorFacing: true, reason: "pending_ask_duplicate" },
  });
  assert.equal(turn.chatbotOwnsReply, true);
  assert.equal(decideWebchatAiReply({ ...aiBase, chatbotOwnsReply: true }), "skip_chatbot_owns");
}

{
  const waiting = mergeChatbotPendingIntoAiControl({ lastTurnOwner: "chatbot" }, pendingFor({ he: HE }));
  assert.ok(pendingAskFromAiControl(waiting));
  const after = mergeChatbotPendingIntoAiControl({ lastTurnOwner: "ai_eligible" }, null);
  assert.equal(pendingAskFromAiControl(after), null);
  assert.equal(
    decideWebchatAiReply({
      ...aiBase,
      chatbotOwnsReply: Boolean(pendingAskFromAiControl(after)),
    }),
    "send_auto",
  );
  assert.equal(
    decideWebchatAiReply({
      ...aiBase,
      chatbotOwnsReply: Boolean(pendingAskFromAiControl(waiting)),
    }),
    "skip_chatbot_owns",
  );
}

{
  const chips = visitorFacingAskQuestionChips(CANONICAL, HE);
  assert.equal(chips[2].label, "קביעת הדגמה");
  assert.equal(chips[2].value, "קביעת הדגמה");
  assert.equal(matchAskQuestionQuickReply(chips[2].value, CANONICAL, [HE, ES])?.value, "Book a demo");
  const free = validateChatbotAskAnswer("visitor_intent", "I want pricing details");
  assert.equal(free.ok, true);
  if (free.ok) assert.equal(free.value, "I want pricing details");
}

{
  const selected = resolveCalendlyCustomerSchedulingUrlFromConfig({
    calendlyPrimarySchedulingUrl: DEMO_URL,
    calendlySelectedEventSchedulingUrl: DEMO_URL,
  });
  assert.equal(selected, DEMO_URL);
}

{
  const engine = read("server/chatbotEngine.ts");
  assert.match(engine, /wouldPendingAskComplete/);
  assert.match(engine, /lastTurnOwner: pending \? "chatbot" : "ai_eligible"/);
  assert.match(engine, /reason: "pending_ask_complete"/);
  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /pendingAskFromAiControl/);
  assert.match(auto, /chatbotOwnsReply \|\| pendingStillActive/);
  assert.doesNotMatch(auto, /lastTurnOwner === "chatbot"/);
  assert.match(auto, /recoverWebchatGenerationFailure/);
  assert.match(auto, /generation_recovery/);
  assert.doesNotMatch(auto, /AI could not generate a reply/);
  const channel = read("server/channelService.ts");
  assert.match(channel, /dispatchWebchatInboundAi/);
  const webhooks = read("server/routes/webhooks.ts");
  assert.match(webhooks, /processIncomingMessage/);
  assert.doesNotMatch(
    webhooks.slice(webhooks.indexOf('app.post("/api/webchat/:userId"'), webhooks.indexOf('app.get("/api/webchat/:userId/settings"')),
    /maybeRunWebchatServerAi/,
  );
}

resetChatbotAskQuestionMemoryForTests();
console.log("webchat-ask-question-ai-handoff.test.ts: all assertions passed");
