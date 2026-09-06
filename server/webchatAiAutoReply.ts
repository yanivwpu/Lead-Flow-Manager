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
} from "@shared/webchatAiPolicy";
import { consumeRateLimit } from "./rateLimitMiddleware";
import { isWebchatServerAiAllowlisted, isWebchatServerAiRolloutEnabled } from "./webchatServerAiRollout";
import { isWidgetEnabled } from "./webchatAccess";
import { storage } from "./storage";
import { channelService } from "./channelService";
import { subscriptionService } from "./subscriptionService";
import { contactHasDoNotContact, evaluateAutomationSendGuard } from "./automationSendGuard";
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
}) => Promise<{ suggestion?: string; confidence?: number; modelGenerationSucceeded?: boolean }>;

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

async function defaultGenerate(input: Parameters<WebchatAiGenerateFn>[0]) {
  const { aiService } = await import("./aiService");
  const settings = await storage.getAiSettings(input.userId);
  const knowledge = await storage.getAiBusinessKnowledge(input.userId);
  const contact = await storage.getConversation(input.conversationId);
  void contact;
  const { resolveAiRouting } = await import("@shared/aiRouting");
  const routing = resolveAiRouting({
    inbound: input.inboundText,
    joinedInbound: input.inboundText,
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
    undefined,
    { websiteFormInquiry: undefined, leadSource: "webchat" },
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
      handoffActive: isConversationHandoffActive(events, conv.id),
      aiPaused: aiControl.paused,
      automationsPaused: contactHasAutomationsPaused(contact),
      optedOut: dnc.blocked,
      rateLimited: !rate.allowed,
    });
  };

  const log = (event: string, extra?: Record<string, unknown>) => {
    console.info(
      JSON.stringify({
        tag: "[WebchatServerAi]",
        event,
        userId: params.userId,
        conversationId: params.conversation.id,
        inboundMessageId: params.inboundMessageId,
        ...extra,
      }),
    );
  };

  let conv = (await storage.getConversation(params.conversation.id)) || params.conversation;
  if (conv.userId !== params.userId) {
    log("skip_foreign_conversation");
    return { decision: "skip_incomplete_safe", sent: false };
  }
  let contact = (await storage.getContact(params.contact.id)) || params.contact;
  if (contact.userId !== params.userId) {
    log("skip_foreign_contact");
    return { decision: "skip_incomplete_safe", sent: false };
  }

  let decision = await evaluate(contact, conv, params.chatbotWillFire);
  log("decision", { decision });
  if (decision === "skip_manual" || decision.startsWith("skip_")) {
    return { decision, sent: false };
  }

  const acquired = acquireWebchatGenerationLease({
    previous: conv.aiControl,
    leaseId,
    inboundMessageId: params.inboundMessageId,
  });
  if (!acquired.ok) {
    log("lease_paused");
    return { decision: "skip_ai_paused", sent: false };
  }
  await storage.updateConversation(conv.id, { aiControl: acquired.control });

  const messages = await storage.getMessages(conv.id, 40);
  const already = messages.some(
    (m) =>
      m.direction === "outbound" &&
      m.generatedBy === "ai_brain" &&
      (m.generationMeta as { inboundMessageId?: string } | null)?.inboundMessageId ===
        params.inboundMessageId,
  );
  if (already) return { decision: `${decision}:idempotent`, sent: false };

  const joinedInbound = joinLatestVisitorTurn(messages, params.inboundText);
  const history = messages.map((m) => ({
    role: m.direction === "inbound" ? "user" : "assistant",
    content: m.content || "",
  }));
  const pageBlock = formatPageContextForAi(contact.webchatContext as WebchatPageContext);

  const controller = new AbortController();
  registerWebchatGenerationAbort(conv.id, controller);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let suggestion: { suggestion?: string; confidence?: number; modelGenerationSucceeded?: boolean } = {
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
    log("generation_failed", { name, leaseStillValid });
    await storage.createActivityEvent({
      userId: params.userId,
      contactId: contact.id,
      conversationId: conv.id,
      eventType: "ai_generation_failed",
      eventData: {
        reason: name || "generation_failed",
        inboundMessageId: params.inboundMessageId,
      },
      actorType: "ai",
    }).catch(() => {});
    if (!leaseStillValid) {
      return { decision: "skip_lease_invalid", sent: false };
    }
    return {
      decision: name === "TimeoutError" || name === "AbortError" ? "skip_generation_timeout" : "generation_failed",
      sent: false,
    };
  } finally {
    clearTimeout(timer);
    clearWebchatGenerationAbort(conv.id, controller);
  }

  const text = (suggestion.suggestion || "").trim();
  if (!text) return { decision: `${decision}:empty`, sent: false };

  contact = (await storage.getContact(contact.id)) || contact;
  conv = (await storage.getConversation(conv.id)) || conv;
  if (contact.userId !== params.userId || conv.userId !== params.userId) {
    log("skip_ownership_changed");
    return { decision: "skip_incomplete_safe", sent: false };
  }
  const controlNow = readConversationAiControl(conv.aiControl);
  if (!generationLeaseAllowsCommit(controlNow, leaseId)) {
    log("lease_invalidated");
    return { decision: "skip_lease_invalid", sent: false };
  }
  decision = await evaluate(contact, conv, params.chatbotWillFire);
  if (decision === "skip_manual" || decision.startsWith("skip_")) {
    log("post_generation_skip", { decision });
    return { decision, sent: false };
  }

  if (decision === "suggest_only") {
    await storage.createActivityEvent({
      userId: params.userId,
      contactId: contact.id,
      conversationId: conv.id,
      eventType: "ai_suggestion",
      eventData: {
        suggestion: text.slice(0, 2000),
        confidence: suggestion.confidence ?? 0,
        channel: "webchat",
        inboundMessageId: params.inboundMessageId,
      },
      actorType: "ai",
    });
    await storage.updateConversation(conv.id, {
      aiControl: completeWebchatGenerationLease(conv.aiControl, leaseId),
    });
    return { decision, sent: false };
  }

  const idempotencyKey = `webchat_ai:${params.userId}:${params.inboundMessageId}`;
  const guard = await evaluateAutomationSendGuard({
    userId: params.userId,
    contactId: contact.id,
    conversationId: conv.id,
    channel: "webchat",
    source: "ai_auto",
    idempotencyKey,
  });
  if (!guard.ok) {
    return { decision: `skip_guard:${guard.reason}`, sent: false };
  }

  conv = (await storage.getConversation(conv.id)) || conv;
  if (!generationLeaseAllowsCommit(readConversationAiControl(conv.aiControl), leaseId)) {
    log("lease_invalidated_before_send");
    return { decision: "skip_lease_invalid", sent: false };
  }

  const send = await channelService.sendMessage({
    userId: params.userId,
    contactId: contact.id,
    content: text,
    forceChannel: "webchat",
    generatedBy: "ai_brain",
    generationMeta: {
      decision,
      confidence: suggestion.confidence ?? 0,
      inboundMessageId: params.inboundMessageId,
      leaseId,
      modelGenerationSucceeded: suggestion.modelGenerationSucceeded === true,
    },
  });

  if (!send.success) {
    log("send_failed");
    return { decision: "send_failed", sent: false };
  }
  const afterSend = (await storage.getConversation(conv.id)) || conv;
  await storage.updateConversation(conv.id, {
    aiControl: completeWebchatGenerationLease(afterSend.aiControl, leaseId),
  });
  return { decision, sent: true };
}
