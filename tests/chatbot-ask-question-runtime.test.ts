/**
 * Channel-neutral Chatbot Ask Question runtime.
 * Run: npx tsx tests/chatbot-ask-question-runtime.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decideWebchatTurnOwner } from "../shared/webchatTurnOwner";
import { decideWebchatAiReply } from "../shared/webchatAiPolicy";
import {
  applyChatbotAskAnswer,
  claimChatbotPendingAsk,
  classifyChatbotAskVariable,
  clearChatbotPendingAsk,
  createChatbotPendingAsk,
  isConsentYesNoButtons,
  markChatbotPendingConsumed,
  mergeChatbotPendingIntoAiControl,
  pendingAskFromAiControl,
  rememberChatbotPendingAsk,
  resetChatbotAskQuestionMemoryForTests,
  sanitizeChatbotVariableName,
  validateChatbotAskAnswer,
  type ChatbotPendingAsk,
} from "../shared/chatbotAskQuestion";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

resetChatbotAskQuestionMemoryForTests();

{
  assert.equal(classifyChatbotAskVariable("customer_name"), "name");
  assert.equal(classifyChatbotAskVariable("email/phone"), "email_or_phone");
  assert.equal(classifyChatbotAskVariable("business"), "custom");
  assert.equal(sanitizeChatbotVariableName("__proto__"), "");
  assert.equal(sanitizeChatbotVariableName("constructor"), "");
}

{
  const name = validateChatbotAskAnswer("name", "Jane Doe");
  assert.equal(name.ok, true);
  if (name.ok) assert.equal(name.value, "Jane Doe");
  assert.equal(validateChatbotAskAnswer("name", "a").ok, false);
  assert.equal(validateChatbotAskAnswer("email", "not-an-email").ok, false);
  const email = validateChatbotAskAnswer("email", "jane@acme.com");
  assert.equal(email.ok, true);
  const phone = validateChatbotAskAnswer("email_or_phone", "+1 (954) 555-0100");
  assert.equal(phone.ok, true);
  if (phone.ok) assert.equal(phone.kind, "phone");
  assert.equal(validateChatbotAskAnswer("email_or_phone", "hello there").ok, false);
  const yes = validateChatbotAskAnswer("consent", "Yes");
  assert.equal(yes.ok, true);
  if (yes.ok) assert.equal(yes.accepted, true);
  assert.equal(validateChatbotAskAnswer("consent", "maybe").ok, false);
}

{
  const existing = {
    userId: "tenant-a",
    name: "Prior",
    email: "verified@acme.com",
    phone: "+15551212",
    customFields: {},
  };
  const invalidEmail = validateChatbotAskAnswer("email", "thanks!", existing);
  assert.equal(invalidEmail.ok, false);
  const applied = applyChatbotAskAnswer({
    contact: existing,
    expectedUserId: "tenant-a",
    variableName: "email",
    validated: { ok: true, kind: "email", value: "new@acme.com" },
    channel: "facebook",
    conversationId: "conv-1",
    flowRunId: "run-1",
  });
  assert.equal(applied.ok, true);
  if (applied.ok) assert.equal(applied.patch.email, "new@acme.com");
  const isolated = applyChatbotAskAnswer({
    contact: existing,
    expectedUserId: "tenant-b",
    variableName: "name",
    validated: { ok: true, kind: "name", value: "Eve" },
    channel: "facebook",
    conversationId: "conv-1",
    flowRunId: "run-1",
  });
  assert.equal(isolated.ok, false);
}

{
  const biz = applyChatbotAskAnswer({
    contact: { userId: "tenant-a", customFields: {} },
    expectedUserId: "tenant-a",
    variableName: "business",
    validated: { ok: true, kind: "custom", value: "Acme Boats" },
    channel: "facebook",
    conversationId: "conv-1",
    flowRunId: "run-1",
    savedAt: "2026-09-10T12:00:00.000Z",
  });
  assert.equal(biz.ok, true);
  if (biz.ok) {
    const vars = (biz.patch.customFields.chatbotVars as { business: { value: string } }).business;
    assert.equal(vars.value, "Acme Boats");
  }
  const consent = applyChatbotAskAnswer({
    contact: { userId: "tenant-a", customFields: {} },
    expectedUserId: "tenant-a",
    variableName: "consent",
    validated: { ok: true, kind: "consent", value: "yes", accepted: true },
    channel: "facebook",
    conversationId: "conv-1",
    flowRunId: "run-1",
    savedAt: "2026-09-10T12:00:00.000Z",
  });
  assert.equal(consent.ok, true);
  if (consent.ok) {
    const stored = consent.patch.customFields.chatbotConsent as {
      accepted: boolean;
      channel: string;
      acceptedAt: string;
    };
    assert.equal(stored.accepted, true);
    assert.equal(stored.channel, "facebook");
    assert.equal(stored.acceptedAt, "2026-09-10T12:00:00.000Z");
  }
}

{
  const pending = createChatbotPendingAsk({
    flowRunId: "run-1",
    flowId: "flow-1",
    nodeId: "q-email",
    variableName: "email",
    nextNodeId: "q-next",
    channel: "facebook",
    userId: "tenant-a",
    contactId: "c1",
    conversationId: "conv-1",
  });
  rememberChatbotPendingAsk(pending);
  const first = claimChatbotPendingAsk({
    conversationId: "conv-1",
    userId: "tenant-a",
    sourceEventId: "evt-1",
    pending,
  });
  assert.equal(first.ok, true);
  const marked = markChatbotPendingConsumed(pending, "evt-1");
  const dup = claimChatbotPendingAsk({
    conversationId: "conv-1",
    userId: "tenant-a",
    sourceEventId: "evt-1",
    pending: marked,
  });
  assert.equal(dup.ok, false);
  if (!dup.ok) assert.equal(dup.reason, "duplicate");
  const otherTenant = claimChatbotPendingAsk({
    conversationId: "conv-1",
    userId: "tenant-b",
    sourceEventId: "evt-2",
    pending: marked,
  });
  assert.equal(otherTenant.ok, false);
  if (!otherTenant.ok) assert.equal(otherTenant.reason, "tenant_mismatch");
  resetChatbotAskQuestionMemoryForTests();
}

{
  assert.equal(
    isConsentYesNoButtons(
      [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" },
      ],
      "consent",
    ),
    true,
  );
  const control = mergeChatbotPendingIntoAiControl(
    { paused: false, lastTurnOwner: "ai_eligible" },
    createChatbotPendingAsk({
      flowRunId: "run-1",
      flowId: "flow-1",
      nodeId: "q1",
      nextNodeId: "q2",
      channel: "whatsapp",
      userId: "u1",
      contactId: "c1",
      conversationId: "cv1",
    }),
  );
  assert.ok(pendingAskFromAiControl(control));
}

{
  const waiting = decideWebchatTurnOwner({
    bookingIntent: false,
    chatbot: { triggered: true, visitorFacing: true, reason: "wait_for_input" },
  });
  assert.equal(waiting.owner, "chatbot");
  assert.equal(waiting.chatbotOwnsReply, true);
  assert.equal(
    decideWebchatAiReply({
      rolloutEnabled: true,
      allowlisted: true,
      widgetEnabled: true,
      hasAiBrainAccess: true,
      planIsProOrTrial: true,
      aiModeRaw: "full_auto",
      chatbotOwnsReply: true,
      handoffActive: false,
      aiPaused: false,
      automationsPaused: false,
      optedOut: false,
      rateLimited: false,
    }),
    "skip_chatbot_owns",
  );
  const unmatched = decideWebchatTurnOwner({
    bookingIntent: false,
    chatbot: { triggered: false, visitorFacing: false, reason: "no_flow_match" },
  });
  assert.equal(unmatched.owner, "ai_eligible");
}

{
  const engine = read("server/chatbotEngine.ts");
  assert.match(engine, /type === "question"/);
  assert.match(engine, /wait_for_input/);
  assert.match(engine, /checkAndResolvePendingAsk/);
  assert.match(engine, /kind: "ask_question"/);
  assert.match(engine, /kind: "consent_buttons"/);
  assert.match(engine, /expectedWorkspaceUserId: ctx\.userId/);
  assert.match(engine, /ctx\.channel !== "webchat"/);
  const channel = read("server/channelService.ts");
  assert.match(channel, /awaitExecution: true/);
  assert.match(channel, /sourceEventId: externalMessageId \|\| message\.id/);
  assert.match(channel, /if \(!chatbotWillFire\)/);
}

type CaptureContact = {
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  customFields: Record<string, unknown>;
};

function nextPending(
  prev: ChatbotPendingAsk,
  nodeId: string,
  variableName: string,
  nextNodeId: string,
  kind: ChatbotPendingAsk["kind"] = "ask_question",
): ChatbotPendingAsk {
  const created = createChatbotPendingAsk({
    flowRunId: prev.flowRunId,
    flowId: prev.flowId,
    nodeId,
    variableName,
    nextNodeId,
    channel: prev.channel,
    userId: prev.userId,
    contactId: prev.contactId,
    conversationId: prev.conversationId,
    kind,
    consumedSourceEventIds: prev.consumedSourceEventIds,
  });
  rememberChatbotPendingAsk(created);
  return created;
}

function consumeReply(params: {
  pending: ChatbotPendingAsk;
  contact: CaptureContact;
  message: string;
  sourceEventId: string;
  expectedUserId?: string;
}): { status: "saved" | "retry" | "duplicate" | "tenant_mismatch"; pending: ChatbotPendingAsk } {
  const claim = claimChatbotPendingAsk({
    conversationId: params.pending.conversationId,
    userId: params.expectedUserId || params.pending.userId,
    sourceEventId: params.sourceEventId,
    pending: params.pending,
  });
  if (!claim.ok) {
    return {
      status: claim.reason === "duplicate" ? "duplicate" : "tenant_mismatch",
      pending: params.pending,
    };
  }
  const variableName = claim.pending.kind === "consent_buttons" ? "consent" : claim.pending.variableName;
  const validated = validateChatbotAskAnswer(variableName || "answer", params.message);
  if (!validated.ok) {
    return { status: "retry", pending: params.pending };
  }
  const applied = applyChatbotAskAnswer({
    contact: params.contact,
    expectedUserId: params.expectedUserId || params.pending.userId,
    variableName,
    validated,
    channel: params.pending.channel,
    conversationId: params.pending.conversationId,
    flowRunId: params.pending.flowRunId,
  });
  if (!applied.ok) return { status: "tenant_mismatch", pending: params.pending };
  if (applied.patch.name !== undefined) params.contact.name = applied.patch.name;
  if (applied.patch.email !== undefined) params.contact.email = applied.patch.email;
  if (applied.patch.phone !== undefined) params.contact.phone = applied.patch.phone;
  params.contact.customFields = applied.patch.customFields;
  return { status: "saved", pending: markChatbotPendingConsumed(params.pending, params.sourceEventId) };
}

{
  resetChatbotAskQuestionMemoryForTests();
  const contact: CaptureContact = {
    userId: "tenant-a",
    name: null,
    email: "verified@example.com",
    phone: "+15550001111",
    customFields: {},
  };
  let pending = createChatbotPendingAsk({
    flowRunId: "run-seq",
    flowId: "flow-1",
    nodeId: "q-name",
    variableName: "name",
    nextNodeId: "q-biz",
    channel: "facebook",
    userId: "tenant-a",
    contactId: "c1",
    conversationId: "conv-seq",
  });
  rememberChatbotPendingAsk(pending);

  const waiting = decideWebchatTurnOwner({
    bookingIntent: false,
    chatbot: { triggered: true, visitorFacing: true, reason: "wait_for_input" },
  });
  assert.equal(waiting.chatbotOwnsReply, true);

  const named = consumeReply({ pending, contact, message: "Jane", sourceEventId: "evt-name" });
  assert.equal(named.status, "saved");
  assert.equal(contact.name, "Jane");
  pending = nextPending(named.pending, "q-biz", "business", "q-reach");

  const biz = consumeReply({ pending, contact, message: "Acme Boats", sourceEventId: "evt-biz" });
  assert.equal(biz.status, "saved");
  assert.equal((contact.customFields.chatbotVars as { business: { value: string } }).business.value, "Acme Boats");
  pending = nextPending(biz.pending, "q-reach", "email_or_phone", "q-consent");

  const priorEmail = contact.email;
  const retry = consumeReply({ pending, contact, message: "thanks!", sourceEventId: "evt-bad" });
  assert.equal(retry.status, "retry");
  assert.equal(contact.email, priorEmail);
  assert.equal(pending.nodeId, "q-reach");

  const reach = consumeReply({ pending, contact, message: "jane@acme.com", sourceEventId: "evt-email" });
  assert.equal(reach.status, "saved");
  assert.equal(contact.email, "jane@acme.com");
  pending = nextPending(reach.pending, "q-consent", "consent", "", "consent_buttons");

  const dup = consumeReply({ pending, contact, message: "jane@acme.com", sourceEventId: "evt-email" });
  assert.equal(dup.status, "duplicate");
  assert.equal(contact.email, "jane@acme.com");

  const steal = consumeReply({
    pending,
    contact,
    message: "Mallory",
    sourceEventId: "evt-steal",
    expectedUserId: "tenant-b",
  });
  assert.equal(steal.status, "tenant_mismatch");
  assert.equal(contact.name, "Jane");

  const consent = consumeReply({ pending, contact, message: "Yes", sourceEventId: "evt-consent" });
  assert.equal(consent.status, "saved");
  const stored = contact.customFields.chatbotConsent as { accepted: boolean; channel: string; acceptedAt: string };
  assert.equal(stored.accepted, true);
  assert.equal(stored.channel, "facebook");
  assert.ok(stored.acceptedAt);

  clearChatbotPendingAsk("conv-seq");
  const unmatched = decideWebchatTurnOwner({
    bookingIntent: false,
    chatbot: { triggered: false, visitorFacing: false, reason: "no_flow_match" },
  });
  assert.equal(unmatched.owner, "ai_eligible");
  resetChatbotAskQuestionMemoryForTests();
}

console.log("chatbot-ask-question-runtime.test.ts: all assertions passed");
