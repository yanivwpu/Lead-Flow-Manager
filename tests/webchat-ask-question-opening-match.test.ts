/**
 * New-conversation Ask Question: skip the prompt only when the first inbound
 * already answers an option with high confidence.
 * Run: npx tsx tests/webchat-ask-question-opening-match.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  firstAskQuestionFromFlow,
  matchAskQuestionOpeningMessage,
} from "../shared/chatbotAskOpeningMatch";
import { applyChatbotAskAnswer, validateChatbotAskAnswer } from "../shared/chatbotAskQuestion";
import {
  chatbotCompletionPromptRules,
  classifyChatbotVisitorIntent,
} from "../shared/chatbotCompletionContext";
import { detectConversationLanguage, languageInstructionForConversation } from "../shared/conversationLanguage";
import { isCasualWebchatGreeting } from "../shared/webchatGreetingWelcome";
import { decideWebchatTurnOwner } from "../shared/webchatTurnOwner";
import { decideWebchatAiReply } from "../shared/webchatAiPolicy";

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

function persistCanonical(click: string) {
  const opening = matchAskQuestionOpeningMessage(click, CANONICAL, [HE, ES]);
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
  return (applied.patch.customFields.chatbotVars as { visitor_intent: { value: string } }).visitor_intent.value;
}

{
  for (const greeting of ["Hi", "Hello", "שלום", "👋"]) {
    assert.equal(isCasualWebchatGreeting(greeting), true, greeting);
    const miss = matchAskQuestionOpeningMessage(greeting, CANONICAL, [HE, ES]);
    assert.equal(miss.matched, false, greeting);
    assert.equal(miss.reason, "greeting", greeting);
  }
}

{
  const he = persistCanonical("אני רוצה לקבוע הדגמה");
  assert.equal(he, "Book a demo");
  assert.equal(classifyChatbotVisitorIntent(he), "book_demo");
  assert.equal(detectConversationLanguage("אני רוצה לקבוע הדגמה").code, "he");
  const prompt = chatbotCompletionPromptRules({
    visitorIntent: he,
    conversationLanguage: "he",
    bookingUrl: DEMO_URL,
  });
  assert.match(prompt, /yanivharamaty\/whachatcrm-live-product-demo/);
  assert.match(languageInstructionForConversation("he"), /עברית|Hebrew/);
}

{
  assert.equal(persistCanonical("Quiero reservar una demostración"), "Book a demo");
  assert.equal(detectConversationLanguage("Quiero reservar una demostración").code, "es");
  assert.match(languageInstructionForConversation("es"), /español|Spanish/);
}

{
  assert.equal(persistCanonical("What does Pro cost?"), "Features & pricing");
  const pricing = chatbotCompletionPromptRules({ visitorIntent: "Features & pricing" });
  assert.match(pricing, /Do not add a booking CTA/);
}

{
  assert.equal(persistCanonical("Help me choose the right setup"), "Find my solution");
  const find = chatbotCompletionPromptRules({ visitorIntent: "Find my solution" });
  assert.match(find, /ONE useful qualification question/);
}

{
  assert.equal(persistCanonical("أريد حجز عرض"), "Book a demo");
  assert.equal(detectConversationLanguage("أريد حجز عرض").code, "ar");
  assert.match(languageInstructionForConversation("ar"), /Arabic|العربية/);
  assert.equal(persistCanonical("我想预约演示"), "Book a demo");
  assert.equal(detectConversationLanguage("我想预约演示").code, "zh");
}

{
  assert.equal(matchAskQuestionOpeningMessage("I have a question", CANONICAL, [HE, ES]).matched, false);
  assert.equal(matchAskQuestionOpeningMessage("maybe later thanks", CANONICAL, [HE, ES]).matched, false);
}

{
  const first = firstAskQuestionFromFlow(
    [
      { id: "start", type: "message", data: { content: "" } },
      { id: "q1", type: "question", data: { options: CANONICAL, variableName: "visitor_intent" } },
    ],
    [{ source: "start", target: "q1" }],
  );
  assert.equal(first?.id, "q1");
  const fromStartType = firstAskQuestionFromFlow(
    [
      { id: "start", type: "start", data: {} },
      { id: "q1", type: "question", data: { options: CANONICAL, variableName: "visitor_intent" } },
    ],
    [{ source: "start", target: "q1" }],
  );
  assert.equal(fromStartType?.id, "q1");
}

{
  const turn = decideWebchatTurnOwner({
    bookingIntent: false,
    chatbot: { triggered: true, visitorFacing: false, reason: "pending_ask_complete" },
  });
  assert.equal(turn.chatbotOwnsReply, false);
  assert.equal(
    decideWebchatAiReply({
      rolloutEnabled: true,
      allowlisted: true,
      widgetEnabled: true,
      hasAiBrainAccess: true,
      planIsProOrTrial: true,
      aiModeRaw: "auto",
      chatbotOwnsReply: false,
      handoffActive: false,
      aiPaused: false,
      automationsPaused: false,
      optedOut: false,
      rateLimited: false,
    }),
    "send_auto",
  );
}

{
  const engine = read("server/chatbotEngine.ts");
  assert.match(engine, /matchAskQuestionOpeningMessage/);
  assert.match(engine, /Opening inbound already answered Ask Question/);
  assert.match(engine, /executed\.reason === "pending_ask_complete"/);
  assert.match(engine, /flowOpeningAskAlreadyAnswered/);
  assert.match(engine, /openingAnswered/);
  assert.match(engine, /sendAskQuestionPrompt\(ctx, promptText, askOptions\)/);
  assert.match(engine, /askOptions = currentNode\.type === "question" \? askCtx\.chips : \[\]/);
  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /maybeRunWebchatServerAi|pendingAskFromAiControl/);
  const webhooks = read("server/routes/webhooks.ts");
  assert.match(webhooks, /!result\.chatbotWillFire/);
  assert.match(webhooks, /maybeRunWebchatServerAi/);
}

console.log("webchat-ask-question-opening-match.test.ts: all assertions passed");
