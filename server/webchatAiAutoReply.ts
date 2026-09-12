/**
 * Unattended AI Brain replies for webchat (no Inbox client required).
 *
 * Concurrency policy (latest-turn supersession):
 * - One generation lease per conversation.
 * - A newer inbound message replaces the pending lease.
 * - Take Over / human reply / resume bumps generationEpoch and cancels the lease.
 * - The model is asked to answer the latest un-replied inbound turn (joined text).
 */

import { randomUUID } from "crypto";
import type { Contact, Conversation } from "@shared/schema";
import { contactHasAutomationsPaused } from "@shared/contactAutomationsPause";
import { isConversationHandoffActive } from "@shared/handoffActivity";
import { formatPageContextForAi, type WebchatPageContext } from "@shared/webchatPageContext";
import {
  acquireWebchatGenerationLease,
  completeWebchatGenerationLease,
  decideWebchatAiReply,
  generationLeaseAllowsCommit,
  readConversationAiControl,
  WEBCHAT_AI_GENERATION_TIMEOUT_MS,
  webchatAutoSendIdempotencyKey,
} from "@shared/webchatAiPolicy";
import { logAiReplyDecision, outcomeForReasonCode } from "@shared/aiReplyDecisionLog";
import { consumeRateLimit } from "./rateLimitMiddleware";
import { isCasualWebchatGreeting, coerceWebchatGreetingWelcome } from "@shared/webchatGreetingWelcome";
import { isWebchatServerAiAllowlisted, isWebchatServerAiRolloutEnabled } from "./webchatServerAiRollout";
import { isWidgetEnabled } from "./webchatAccess";
import { storage } from "./storage";
import { channelService } from "./channelService";
import { subscriptionService } from "./subscriptionService";
import { contactHasDoNotContact, withAutomationSendGuard } from "./automationSendGuard";
import {
  businessKnowledgeFromAiRecord,
  evaluateFullAutoSend,
} from "./aiAutoSendGate";
import {
  clearWebchatGenerationAbort,
  registerWebchatGenerationAbort,
} from "./webchatGenerationAbort";

export type WebchatAiGenerateFn = (input: {
  userId: string;
  conversationId: string;
  history: Array<{ role: string; content: string }>;
  inboundText: string;
  signal: AbortSignal;
}) => Promise<{
  suggestion?: string;
  confidence?: number;
  confidenceProvided?: boolean;
  knowledgeGrounded?: boolean;
  modelGenerationSucceeded?: boolean;
  groundingViolations?: string[];
}>;

export type WebchatAiAutoReplyDeps = {
  generate?: WebchatAiGenerateFn;
  timeoutMs?: number;
  now?: () => Date;
  randomId?: () => string;
};

function joinLatestVisitorTurn(
  messages: Array<{ direction: string; content: string | null }>,
  fallback: string,
): string {
  const pending: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.direction === "outbound") break;
    if (m.direction === "inbound" && (m.content || "").trim()) {
      pending.unshift((m.content || "").trim());
    }
  }
  return pending.length ? pending.join("\n") : fallback;
}

function inboundTurnAlreadyReplied(
  messages: Array<{
    id: string;
    direction: string;
    generatedBy?: string | null;
    generationMeta?: unknown;
  }>,
  inboundMessageId: string,
): boolean {
  if (
    messages.some(
      (m) =>
        m.direction === "outbound" &&
        (m.generationMeta as { inboundMessageId?: string } | null)?.inboundMessageId === inboundMessageId,
    )
  ) {
    return true;
  }
  const idx = messages.findIndex((m) => m.id === inboundMessageId);
  if (idx < 0) return false;
  return messages.slice(idx + 1).some((m) => m.direction === "outbound");
}

async function defaultGenerate(input: Parameters<WebchatAiGenerateFn>[0]) {
  const { aiService } = await import("./aiService");
  const { applyCalendlyBookingLinkForAi } = await import("./calendlyBookingConnected");
  const { readConversationAiControl } = await import("@shared/webchatAiPolicy");
  const { buildChatbotCompletionContactContext, resolveChatbotCompletionRouting } = await import(
    "@shared/chatbotCompletionContext"
  );
  const settings = await storage.getAiSettings(input.userId);
  const knowledgeRaw = await storage.getAiBusinessKnowledge(input.userId);
  const knowledge = await applyCalendlyBookingLinkForAi(input.userId, knowledgeRaw || undefined);
  const conversation = await storage.getConversation(input.conversationId);
  const contact = conversation?.contactId ? await storage.getContact(conversation.contactId) : null;
  const control = readConversationAiControl(conversation?.aiControl);
  const completion = buildChatbotCompletionContactContext({
    customFields: contact?.customFields,
    name: contact?.name,
    leadSource: "webchat",
    conversationLanguage: control.conversationLanguage,
  });
  const routing = resolveChatbotCompletionRouting({
    inbound: input.inboundText,
    visitorIntent: completion.visitorIntent,
    history: input.history,
    handoffKeywords: settings?.handoffKeywords ?? undefined,
    industry: knowledge?.industry ?? undefined,
  });
  if (input.signal.aborted) {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  }
  return aiService.suggestReply(
    input.userId,
    input.conversationId,
    input.history,
    knowledge || undefined,
    settings || undefined,
    undefined,
    control.conversationLanguage,
    {
      websiteFormInquiry: undefined,
      leadSource: "webchat",
      ...completion,
    },
    routing,
    "webchat",
  );
}

export async function maybeRunWebchatServerAi(
  params: {
    userId: string;
    contact: Contact;
    conversation: Conversation;
    inboundMessageId: string;
    inboundText: string;
    chatbotWillFire: boolean;
    bookingOwnsReply?: boolean;
    crmFallbackOwnsReply?: boolean;
    widgetSettings: Record<string, unknown>;
  },
  deps: WebchatAiAutoReplyDeps = {},
): Promise<{ decision: string; sent: boolean }> {
  const timeoutMs = deps.timeoutMs ?? WEBCHAT_AI_GENERATION_TIMEOUT_MS;
  const generate = deps.generate ?? defaultGenerate;
  const leaseId = (deps.randomId ?? randomUUID)();

  const evaluate = async (
    contact: Contact,
    conv: Conversation,
    chatbotOwnsReply: boolean,
  ) => {
    const limits = await subscriptionService.getUserLimits(params.userId);
    const settings = await storage.getAiSettings(params.userId);
    const events = await storage.getActivityEvents(contact.id, 80);
    const aiControl = readConversationAiControl(conv.aiControl);
    const dnc = contactHasDoNotContact(contact);
    const rate = await consumeRateLimit(`webchat-ai:${params.userId}:${conv.id}`, 20, 15 * 60 * 1000);
    return decideWebchatAiReply({
      rolloutEnabled: isWebchatServerAiRolloutEnabled(),
      allowlisted: isWebchatServerAiAllowlisted(params.userId),
      widgetEnabled: isWidgetEnabled(params.widgetSettings),
      hasAiBrainAccess: !!limits?.effectiveHasAIBrain,
      planIsProOrTrial: (limits?.plan || "free") === "pro" || !!limits?.effectiveHasAIBrain,
      aiModeRaw: settings?.aiMode,
      chatbotOwnsReply: chatbotOwnsReply || aiControl.lastTurnOwner === "chatbot",
      bookingOwnsReply: params.bookingOwnsReply === true || aiControl.lastTurnOwner === "booking",
      crmFallbackOwnsReply: params.crmFallbackOwnsReply === true,
      handoffActive: isConversationHandoffActive(events, conv.id),
      aiPaused: aiControl.paused,
      automationsPaused: contactHasAutomationsPaused(contact),
      optedOut: dnc.blocked,
      rateLimited: !rate.allowed,
    });
  };

  const report = (reasonCode: string, extra?: { sent?: boolean; hasDraft?: boolean; confidenceSource?: string }) => {
    logAiReplyDecision({
      source: "webchat_unattended",
      channel: "webchat",
      outcome: extra?.sent ? "sent" : outcomeForReasonCode(reasonCode, extra),
      reasonCode,
      workspaceUserId: params.userId,
      eligibility: {
        decision: reasonCode,
        chatbotWillFire: params.chatbotWillFire,
        bookingOwnsReply: params.bookingOwnsReply === true,
        crmFallbackOwnsReply: params.crmFallbackOwnsReply === true,
        confidenceSource: extra?.confidenceSource,
      },
    });
  };

  let conv = (await storage.getConversation(params.conversation.id)) || params.conversation;
  if (conv.userId !== params.userId) {
    report("skip_tenant_isolation");
    return { decision: "skip_incomplete_safe", sent: false };
  }
  let contact = (await storage.getContact(params.contact.id)) || params.contact;
  if (contact.userId !== params.userId) {
    report("skip_tenant_isolation");
    return { decision: "skip_incomplete_safe", sent: false };
  }

  let decision = await evaluate(contact, conv, params.chatbotWillFire);
  if (decision === "skip_manual" || decision.startsWith("skip_")) {
    report(decision);
    return { decision, sent: false };
  }

  const acquired = acquireWebchatGenerationLease({
    previous: conv.aiControl,
    leaseId,
    inboundMessageId: params.inboundMessageId,
  });
  if (!acquired.ok) {
    report("skip_ai_paused");
    return { decision: "skip_ai_paused", sent: false };
  }
  await storage.updateConversation(conv.id, { aiControl: acquired.control });

  const messages = await storage.getMessages(conv.id, 40);
  if (inboundTurnAlreadyReplied(messages, params.inboundMessageId)) {
    report("skip_already_replied");
    await storage.updateConversation(conv.id, {
      aiControl: completeWebchatGenerationLease(conv.aiControl, leaseId),
    });
    return { decision: `${decision}:idempotent`, sent: false };
  }

  const joinedInbound = joinLatestVisitorTurn(messages, params.inboundText);
  const history = messages.map((m) => ({
    role: m.direction === "inbound" ? "user" : "assistant",
    content: m.content || "",
  }));
  const pageBlock = formatPageContextForAi(contact.webchatContext as WebchatPageContext);

  const controller = new AbortController();
  registerWebchatGenerationAbort(conv.id, controller);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let suggestion: {
    suggestion?: string;
    confidence?: number;
    confidenceProvided?: boolean;
    knowledgeGrounded?: boolean;
    modelGenerationSucceeded?: boolean;
    groundingViolations?: string[];
  } = {
    suggestion: "",
    confidence: 0,
  };
  try {
    const genPromise = generate({
      userId: params.userId,
      conversationId: conv.id,
      history: pageBlock
        ? [{ role: "system", content: pageBlock }, ...history]
        : history,
      inboundText: joinedInbound,
      signal: controller.signal,
    });
    suggestion = await Promise.race([
      genPromise,
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          const err = new Error("generation_timeout");
          err.name = controller.signal.reason === "timeout" ? "TimeoutError" : "AbortError";
          reject(err);
        });
      }),
    ]);
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    conv = (await storage.getConversation(conv.id)) || conv;
    const leaseStillValid = generationLeaseAllowsCommit(readConversationAiControl(conv.aiControl), leaseId);
    await storage.createActivityEvent({
      userId: params.userId,
      contactId: contact.id,
      conversationId: conv.id,
      eventType: "ai_generation_failed",
      eventData: {
        reason: name || "generation_failed",
      },
      actorType: "ai",
    }).catch(() => {});
    const reasonCode =
      !leaseStillValid
        ? "skip_lease_invalid"
        : name === "TimeoutError" || name === "AbortError"
          ? "skip_generation_timeout"
          : "generation_failed";
    report(reasonCode);
    return { decision: reasonCode, sent: false };
  } finally {
    clearTimeout(timer);
    clearWebchatGenerationAbort(conv.id, controller);
  }

  let text = (suggestion.suggestion || "").trim();
  if (isCasualWebchatGreeting(params.inboundText)) {
    text = coerceWebchatGreetingWelcome(text).text;
  }
  if (!text) {
    report(`${decision}:empty`);
    return { decision: `${decision}:empty`, sent: false };
  }

  contact = (await storage.getContact(contact.id)) || contact;
  conv = (await storage.getConversation(conv.id)) || conv;
  if (contact.userId !== params.userId || conv.userId !== params.userId) {
    report("skip_tenant_isolation");
    return { decision: "skip_incomplete_safe", sent: false };
  }
  const controlNow = readConversationAiControl(conv.aiControl);
  if (!generationLeaseAllowsCommit(controlNow, leaseId)) {
    report("skip_lease_invalid");
    return { decision: "skip_lease_invalid", sent: false };
  }
  decision = await evaluate(contact, conv, params.chatbotWillFire);
  if (decision === "skip_manual" || decision.startsWith("skip_")) {
    report(decision);
    return { decision, sent: false };
  }

  const persistDraft = async (reasonCode: string) => {
    await storage.createActivityEvent({
      userId: params.userId,
      contactId: contact.id,
      conversationId: conv.id,
      eventType: "ai_suggestion",
      eventData: {
        suggestion: text.slice(0, 2000),
        confidence: suggestion.confidence ?? 0,
        channel: "webchat",
        holdReason: reasonCode,
      },
      actorType: "ai",
    });
    await storage.updateConversation(conv.id, {
      aiControl: completeWebchatGenerationLease(conv.aiControl, leaseId),
    });
  };

  if (decision === "suggest_only") {
    await persistDraft("suggest_only");
    report("suggest_only", { hasDraft: true });
    return { decision, sent: false };
  }

  const knowledge = await storage.getAiBusinessKnowledge(params.userId);
  const gate = evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: history,
    suggestion: text,
    confidence: typeof suggestion.confidence === "number" ? suggestion.confidence : 0,
    confidenceProvided: suggestion.confidenceProvided === true,
    knowledgeGrounded: suggestion.knowledgeGrounded === true,
    businessKnowledge: businessKnowledgeFromAiRecord(knowledge as Record<string, unknown> | undefined),
    groundingViolations: suggestion.groundingViolations,
  });
  if (!gate.allowed) {
    const reasonCode = `send_auto:held:${gate.reason}`;
    await persistDraft(reasonCode);
    report(reasonCode, { hasDraft: true, confidenceSource: gate.confidenceSource });
    return { decision: reasonCode, sent: false };
  }

  conv = (await storage.getConversation(conv.id)) || conv;
  if (!generationLeaseAllowsCommit(readConversationAiControl(conv.aiControl), leaseId)) {
    report("skip_lease_invalid");
    return { decision: "skip_lease_invalid", sent: false };
  }

  const idempotencyKey = webchatAutoSendIdempotencyKey(params.userId, params.inboundMessageId);
  const guarded = await withAutomationSendGuard(
    {
      userId: params.userId,
      contactId: contact.id,
      conversationId: conv.id,
      channel: "webchat",
      source: "ai_auto",
      idempotencyKey,
    },
    async () =>
      channelService.sendMessage({
        userId: params.userId,
        contactId: contact.id,
        content: text,
        forceChannel: "webchat",
        generatedBy: "ai_brain",
        generationMeta: {
          decision,
          reasonCode: gate.reason,
          confidence: suggestion.confidence ?? 0,
          inboundMessageId: params.inboundMessageId,
          leaseId,
          modelGenerationSucceeded: suggestion.modelGenerationSucceeded === true,
        },
      }),
  );
  if (!guarded.ok) {
    const reasonCode = `skip_guard:${guarded.reason}`;
    report(reasonCode);
    return { decision: reasonCode, sent: false };
  }
  const send = guarded.result;
  if (!send.success) {
    report("send_failed");
    return { decision: "send_failed", sent: false };
  }
  const afterSend = (await storage.getConversation(conv.id)) || conv;
  await storage.updateConversation(conv.id, {
    aiControl: completeWebchatGenerationLease(afterSend.aiControl, leaseId),
  });
  report(gate.reason, { sent: true, confidenceSource: gate.confidenceSource });
  return { decision, sent: true };
}
