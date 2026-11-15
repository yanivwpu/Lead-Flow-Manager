/** Runs the real inbound dispatcher, AI gate, lease and guarded send with in-memory persistence/transport. */
import assert from "node:assert/strict";
import test from "node:test";
process.env.DATABASE_URL ||= "postgres://test:test@127.0.0.1:1/test";
process.env.WEBCHAT_SERVER_AI_AUTO_ALLOWLIST = "solution-test";
const { storage } = await import("../server/storage");
const { subscriptionService } = await import("../server/subscriptionService");
const { channelService } = await import("../server/channelService");
const { dispatchWebchatInboundAi } = await import("../server/webchatInboundReplyDispatch");
const { db } = await import("../drizzle/db");
const { startFindSolutionJourney } = await import("../shared/webchatActiveJourney");
const { trustedPageRuleFindSolutionReply } = await import("../shared/webchatPageRuleReplies");
const { toPublicWebchatMessages } = await import("../shared/webchatPublicMessages");
const { mergeWebchatPolledMessages } = await import("../shared/webchatWidgetScroll");
const { webchatGenerationRecoveryMessage } = await import("../shared/webchatGenerationRecovery");

// Catalog reads are empty; no external provider or database is contacted.
const query: any = new Proxy({}, {get: (_, key) => key === "then" ? (resolve: Function) => resolve([]) : () => query});
(db as any).select = () => query;
(subscriptionService as any).getUserLimits = async () => ({ effectiveHasAIBrain: true, plan: "pro" });
let contact: any, conversation: any, messages: any[], events: any[];
let mode = "auto";
const dedup = new Set<string>();
Object.assign(storage, {
  getContact: async () => contact,
  getConversation: async () => conversation,
  updateConversation: async (_id: string, patch: any) => (conversation = {...conversation, ...patch}),
  getMessages: async () => messages,
  getAiSettings: async () => ({ aiMode: mode }),
  getAiBusinessKnowledge: async () => ({ qualifyingQuestions: [] }),
  getIntegrationByUserAndType: async () => undefined,
  getActivityEvents: async () => events,
  createActivityEvent: async (event: any) => { events.push(event); return event; },
  tryAcquireAutomationSendDedup: async (key: string) => { if(dedup.has(key)) return false; dedup.add(key); return true; },
  completeAutomationSendDedup: async () => {},
});
(channelService as any).sendMessage = async (input: any) => {
  assert.equal(input.forceChannel, "webchat");
  messages.push({id: `out-${messages.length}`, direction: "outbound", content: input.content, status: "sent", generationMeta: input.generationMeta});
  return {success: true};
};
function reset(answer: string, locale: string) {
  contact = {id: "contact", userId: "solution-test", webchatId: "visitor", customFields: {}};
  conversation = {id: `conv-${answer}`, userId: contact.userId, contactId: contact.id, channel: "webchat", status: "open", aiControl: { conversationLanguage: locale }};
  conversation.aiControl.activeJourney = startFindSolutionJourney({userId: contact.userId, visitorId: contact.webchatId, conversationId: conversation.id, ruleKey: "home", actionIndex: 1, originInboundId: "click"});
  messages = [{id:"click",direction:"inbound",content:"Find my solution",status:"delivered"}, {id:"question",direction:"outbound",content:trustedPageRuleFindSolutionReply("en"),status:"sent"}, {id:`in-${answer}`,direction:"inbound",content:answer,status:"delivered"}];
  events = []; mode = "auto"; dedup.clear();
}
async function dispatch(generate: any) {
  return dispatchWebchatInboundAi({userId: contact.userId, contact, conversation, inboundMessageId: messages[2].id, inboundText: messages[2].content, channel: "webchat", chatbotOwnsReply: false, awayConfigured: false, awayReplyWillSend: false, widgetSettings:{enabled:true}}, {generate});
}
for (const [answer, locale] of [["נדל״ן","he"],["real estate","en"],["inmobiliaria","es"]]) {
  test(`real server dispatch → guarded outbound → widget poll: ${answer}`, async () => {
    reset(answer,locale);
    const reply = locale === "he" ? "מה הבעיה העיקרית שברצונך לפתור?" : locale === "es" ? "¿Qué problema quieres resolver primero?" : "What problem would you like to solve first?";
    const result = await dispatch(async (input: any) => {
      assert.ok(input.history.some((m: any) => m.content === answer));
      return {suggestion:reply, confidence:.9, confidenceProvided:true, knowledgeGrounded:true, modelGenerationSucceeded:true};
    });
    assert.equal(result.sent,true);
    assert.equal(messages.at(-1).generationMeta.reasonCode,"ok_active_journey");
    const widget = mergeWebchatPolledMessages([],toPublicWebchatMessages(messages));
    assert.equal(widget.at(-1)?.content,reply);
    assert.equal((await dispatch(async () => {throw new Error("duplicate must not generate")})).sent,false);
    assert.equal(messages.length,4);
  });
}
test("held unsafe draft is reviewed; only localized recovery reaches the visitor", async () => {
  reset("נדל״ן","he");
  const result = await dispatch(async () => ({suggestion:"Invented product claim",confidence:.9,confidenceProvided:true,groundingViolations:["invented_claim"]}));
  assert.equal(result.sent,true);
  assert.ok(events.some(e=>e.eventData?.holdReason === "send_auto:held:grounding_violation:invented_claim"));
  assert.equal(messages.at(-1).content,webchatGenerationRecoveryMessage("he"));
  assert.equal(messages.at(-1).generationMeta.reasonCode,"ok_held_recovery");
});
test("takeover during generation blocks both the model reply and fallback", async () => {
  reset("retail","en");
  const result = await dispatch(async () => {
    conversation.aiControl = {...conversation.aiControl, paused:true, generationEpoch:99};
    return {suggestion:"Unsafe claim",confidence:.2,confidenceProvided:true};
  });
  assert.equal(result.sent,false);
  assert.equal(messages.length,3);
});
