/**
 * Website Chat Ask Question quick replies — persist, render, click, resume once.
 * Run: npx tsx tests/webchat-ask-question-quick-replies.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  claimChatbotPendingAsk,
  createChatbotPendingAsk,
  markChatbotPendingConsumed,
  rememberChatbotPendingAsk,
  resetChatbotAskQuestionMemoryForTests,
  validateChatbotAskAnswer,
  applyChatbotAskAnswer,
} from "../shared/chatbotAskQuestion";
import {
  chatbotAskQuestionPublishError,
  formatAskQuestionOptionsFallback,
  matchAskQuestionQuickReply,
  sanitizeAskQuestionQuickReplies,
} from "../shared/chatbotAskQuestionOptions";
import { resolveChatbotNodeCopy } from "../shared/chatbotNodeI18n";
import { decideWebchatTurnOwner } from "../shared/webchatTurnOwner";
import { decideWebchatAiReply } from "../shared/webchatAiPolicy";
import { toPublicWebchatMessages } from "../shared/webchatPublicMessages";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

resetChatbotAskQuestionMemoryForTests();

{
  const options = sanitizeAskQuestionQuickReplies([
    { label: "Features & pricing", nextNodeId: "" },
    { label: "Find my solution" },
    { label: "Book a demo", value: "Book a demo" },
    { label: "" },
  ]);
  assert.equal(options.length, 3);
  assert.equal(options[0].value, "Features & pricing");
  assert.equal(matchAskQuestionQuickReply("Features & pricing", options)?.value, "Features & pricing");
  assert.equal(matchAskQuestionQuickReply("2", options)?.label, "Find my solution");
  assert.equal(matchAskQuestionQuickReply("something else", options), null);
}

{
  const engine = read("server/chatbotEngine.ts");
  assert.match(engine, /sendAskQuestionPrompt/);
  assert.match(engine, /quickReplies: askOptions/);
  assert.match(engine, /Do NOT store pending button/);
  assert.match(engine, /sendChatbotButtonsWebchat/);
  assert.doesNotMatch(
    engine.slice(engine.indexOf("async function sendAskQuestionPrompt"), engine.indexOf("async function sendChatbotButtons(")),
    /setPendingButtons/,
  );
  const publicMsgs = toPublicWebchatMessages([
    {
      id: "m1",
      direction: "outbound",
      content: "What would you like help with today?",
      contentType: "buttons",
      templateVariables: {
        chatbotButtons: [
          { label: "Features & pricing", value: "Features & pricing" },
          { label: "Find my solution", value: "Find my solution" },
          { label: "Book a demo", value: "Book a demo" },
        ],
      },
    },
  ]);
  assert.equal(publicMsgs[0].contentType, "buttons");
  assert.equal((publicMsgs[0].templateVariables?.chatbotButtons as { value: string }[]).length, 3);
}

{
  resetChatbotAskQuestionMemoryForTests();
  const pending = createChatbotPendingAsk({
    flowRunId: "run-1",
    flowId: "flow-1",
    nodeId: "q1",
    variableName: "visitor_intent",
    nextNodeId: "",
    channel: "webchat",
    userId: "tenant-a",
    contactId: "c1",
    conversationId: "conv-qr",
    promptText: "Hi! Welcome to WhachatCRM. What would you like help with today?",
    quickReplies: [
      { label: "Features & pricing", value: "Features & pricing" },
      { label: "Find my solution", value: "Find my solution" },
      { label: "Book a demo", value: "Book a demo" },
    ],
  });
  rememberChatbotPendingAsk(pending);
  const contact = { userId: "tenant-a", customFields: {} as Record<string, unknown> };
  const first = claimChatbotPendingAsk({
    conversationId: "conv-qr",
    userId: "tenant-a",
    sourceEventId: "evt-1",
    pending,
  });
  assert.equal(first.ok, true);
  const matched = matchAskQuestionQuickReply("Features & pricing", pending.quickReplies);
  assert.ok(matched);
  const validated = validateChatbotAskAnswer("visitor_intent", matched!.value);
  assert.equal(validated.ok, true);
  if (validated.ok) {
    const applied = applyChatbotAskAnswer({
      contact,
      expectedUserId: "tenant-a",
      variableName: "visitor_intent",
      validated,
      channel: "webchat",
      conversationId: "conv-qr",
      flowRunId: "run-1",
    });
    assert.equal(applied.ok, true);
    if (applied.ok) {
      const vars = applied.patch.customFields.chatbotVars as { visitor_intent: { value: string } };
      assert.equal(vars.visitor_intent.value, "Features & pricing");
    }
  }
  markChatbotPendingConsumed(pending, "evt-1");
  const dup = claimChatbotPendingAsk({
    conversationId: "conv-qr",
    userId: "tenant-a",
    sourceEventId: "evt-1",
    pending: { ...pending, consumedSourceEventIds: ["evt-1"] },
  });
  assert.equal(dup.ok, false);
  if (!dup.ok) assert.equal(dup.reason, "duplicate");
}

{
  const free = validateChatbotAskAnswer("visitor_intent", "I want pricing details");
  assert.equal(free.ok, true);
  if (free.ok) assert.equal(free.value, "I want pricing details");
}

{
  const complete = decideWebchatTurnOwner({
    bookingIntent: false,
    chatbot: { triggered: true, visitorFacing: false, reason: "pending_ask_complete" },
  });
  assert.equal(complete.owner, "ai_eligible");
  assert.equal(complete.chatbotOwnsReply, false);
  const waiting = decideWebchatTurnOwner({
    bookingIntent: false,
    chatbot: { triggered: true, visitorFacing: true, reason: "wait_for_input" },
  });
  assert.equal(waiting.chatbotOwnsReply, true);
  const modes = {
    rolloutEnabled: true,
    allowlisted: true,
    widgetEnabled: true,
    hasAiBrainAccess: true,
    planIsProOrTrial: true,
    handoffActive: false,
    aiPaused: false,
    automationsPaused: false,
    optedOut: false,
    rateLimited: false,
    chatbotOwnsReply: false,
  };
  assert.equal(decideWebchatAiReply({ ...modes, aiModeRaw: "off" }), "skip_manual");
  assert.equal(decideWebchatAiReply({ ...modes, aiModeRaw: "suggest" }), "suggest_only");
  assert.equal(decideWebchatAiReply({ ...modes, aiModeRaw: "auto" }), "send_auto");
}

{
  const combined = resolveChatbotNodeCopy({
    content: "Hi! 👋 Welcome to WhachatCRM. I can help you explore our features, find the right solution for your business, or book a live demo. What would you like help with today?",
    options: [
      { label: "Features & pricing" },
      { label: "Find my solution" },
      { label: "Book a demo" },
    ],
  }, "en");
  assert.match(combined.content, /Welcome to WhachatCRM/);
  assert.equal(combined.options.length, 3);
  assert.equal(formatAskQuestionOptionsFallback("Choose:", combined.options).includes("1. Features & pricing"), true);
}

{
  const err = chatbotAskQuestionPublishError([
    { type: "question", data: { label: "Ask", options: [{ label: "" }] } },
  ]);
  assert.ok(err && /empty/i.test(err));
  assert.equal(
    chatbotAskQuestionPublishError([
      { type: "question", data: { label: "Ask", options: [{ label: "Features & pricing" }] } },
    ]),
    null,
  );
}

{
  const widget = read("client/src/pages/WidgetFrame.tsx");
  assert.match(widget, /min-h-\[44px\]/);
  assert.match(widget, /laterInbound/);
  assert.match(widget, /chatbotButtons/);
}

console.log("webchat-ask-question-quick-replies.test.ts: all assertions passed");
