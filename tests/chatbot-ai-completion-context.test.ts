/**
 * AI replies after chatbot completion: relevance, prices, booking CTA, Calendly.
 * Run: npx tsx tests/chatbot-ai-completion-context.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildChatbotCompletionContactContext,
  chatbotCompletionPromptRules,
  classifyChatbotVisitorIntent,
  formatNaturalPrice,
  readChatbotVars,
  resolveChatbotCompletionRouting,
  visitorIntentAllowsBookingCta,
} from "../shared/chatbotCompletionContext";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

{
  assert.equal(classifyChatbotVisitorIntent("Features & pricing"), "features_pricing");
  assert.equal(classifyChatbotVisitorIntent("Find my solution"), "find_solution");
  assert.equal(classifyChatbotVisitorIntent("Book a demo"), "book_demo");
  assert.equal(visitorIntentAllowsBookingCta("features_pricing"), false);
  assert.equal(visitorIntentAllowsBookingCta("find_solution"), false);
  assert.equal(visitorIntentAllowsBookingCta("book_demo"), true);
}

{
  const vars = readChatbotVars({
    chatbotVars: { visitor_intent: { value: "Features & pricing", savedAt: "2026-09-12" } },
  });
  assert.equal(vars.visitor_intent, "Features & pricing");
  const ctx = buildChatbotCompletionContactContext({
    customFields: { chatbotVars: { visitor_intent: { value: "Features & pricing" } } },
    leadSource: "webchat",
    conversationLanguage: "en",
  });
  assert.equal(ctx.visitorIntent, "Features & pricing");
  assert.equal(ctx.intent, "Features & pricing");
}

{
  const pricing = chatbotCompletionPromptRules({ visitorIntent: "Features & pricing" });
  assert.match(pricing, /2–4 short sentences|2-4 short sentences/);
  assert.match(pricing, /\$49\/month/);
  assert.match(pricing, /Do not add a booking CTA/);
  assert.doesNotMatch(pricing, /Share this exact workspace-selected Calendly/);
  const demo = chatbotCompletionPromptRules({
    visitorIntent: "Book a demo",
    bookingUrl: "https://calendly.com/whachatcrm/product-demo",
  });
  assert.match(demo, /https:\/\/calendly.com\/whachatcrm\/product-demo/);
  assert.doesNotMatch(demo, /whachatcrm\.com\/contact/);
  const find = chatbotCompletionPromptRules({ visitorIntent: "Find my solution" });
  assert.match(find, /ONE useful qualification question/);
}

{
  const pricingRoute = resolveChatbotCompletionRouting({
    inbound: "Features & pricing",
    visitorIntent: "Features & pricing",
  });
  assert.equal(pricingRoute.decision, "CONTINUE_AI");
  assert.equal(visitorIntentAllowsBookingCta("features_pricing", pricingRoute), false);
  const demoRoute = resolveChatbotCompletionRouting({
    inbound: "Book a demo",
    visitorIntent: "Book a demo",
  });
  assert.equal(demoRoute.decision, "BOOK_APPOINTMENT");
  assert.equal(formatNaturalPrice(49, "month", "en"), "$49/month");
  assert.equal(formatNaturalPrice(490, "year", "en"), "$490/year");
}

{
  const ai = read("server/aiService.ts");
  assert.match(ai, /chatbotCompletionPromptRules/);
  assert.match(ai, /visitorIntent/);
  assert.match(ai, /2–4 short sentences/);
  assert.match(ai, /languageInstructionForConversation/);
  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /applyCalendlyBookingLinkForAi/);
  assert.match(auto, /buildChatbotCompletionContactContext/);
  assert.match(auto, /conversationLanguage/);
  const calendly = read("server/calendlyBookingConnected.ts");
  assert.match(calendly, /resolveCalendlyCustomerSchedulingUrlFromConfig/);
  assert.doesNotMatch(auto, /dashboardLanguage|userLanguage|i18n\.language/);
}

console.log("chatbot-ai-completion-context.test.ts: all assertions passed");
