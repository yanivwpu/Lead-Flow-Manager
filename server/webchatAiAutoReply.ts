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
import { pendingAskFromAiControl } from "@shared/chatbotAskQuestion";
import { logAiReplyDecision, outcomeForReasonCode } from "@shared/aiReplyDecisionLog";
import { consumeRateLimit } from "./rateLimitMiddleware";
import { isCasualWebchatGreeting, coerceWebchatGreetingWelcome } from "@shared/webchatGreetingWelcome";
import { readWebchatServerAiRollout } from "./webchatServerAiRollout";
import { isWidgetEnabled } from "./webchatAccess";
import { storage } from "./storage";
import { channelService } from "./channelService";
import { subscriptionService } from "./subscriptionService";
import { contactHasDoNotContact, withAutomationSendGuard } from "./automationSendGuard";
import {
  businessKnowledgeFromAiRecord,
  evaluateFullAutoSend,
  WEBCHAT_AUTO_SEND_MIN_CONFIDENCE,
} from "./aiAutoSendGate";
import { resolveCurrentTurnStructuredAskIntent } from "@shared/chatbotAskQuestion";
import {
  pageActionGateDiagnostics,
  resolveCurrentTurnPageAction,
} from "@shared/webchatPageRuleAction";
import {
  clearWebchatGenerationAbort,
  registerWebchatGenerationAbort,
} from "./webchatGenerationAbort";
import {
  classifyWebchatGenerationFailure,
  safeGenerationErrorCode,
  webchatGenerationRecoveryMessage,
} from "@shared/webchatGenerationRecovery";

export type WebchatAiGenerateFn = (input: {
  userId: string;
  conversationId: string;
  history: Array<{ role: string; content: string }>;
  inboundText: string;
  inboundMessageId?: string;
  signal: AbortSignal;
}) => Promise<{
  suggestion?: string;
  confidence?: number;
  confidenceProvided?: boolean;
  knowledgeGrounded?: boolean;
  modelGenerationSucceeded?: boolean;
  groundingViolations?: string[];
  retrievalIntent?: string;
  savingsJourneyComplete?: boolean;
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
  const pageAction = resolveCurrentTurnPageAction({
    pageContext: contact?.webchatContext,
    inboundMessageId: input.inboundMessageId || "",
  });
  const { resolveCurrentTurnJourney } = await import("@shared/webchatActiveJourney");
  const journey = resolveCurrentTurnJourney({
    journey: control.activeJourney,
    userId: input.userId,
    visitorId: String(contact?.webchatId || ""),
    conversationId: input.conversationId,
    inboundMessageId: input.inboundMessageId || "",
  });
  const pageCtx = contact?.webchatContext as WebchatPageContext | undefined;
  const parentUrl = pageCtx?.latestUrl || pageCtx?.pageAction?.parentUrl || pageCtx?.landingUrl;
  const completion = buildChatbotCompletionContactContext({
    customFields: contact?.customFields,
    name: contact?.name,
    source: contact?.source,
    sourceDetails: contact?.sourceDetails,
    leadSource: "webchat",
    conversationLanguage: control.conversationLanguage,
  });
  const routing = resolveChatbotCompletionRouting({
    inbound: input.inboundText,
    visitorIntent: completion.visitorIntent,
    history: input.history,
    handoffKeywords: settings?.handoffKeywords ?? undefined,
    industry: knowledge?.industry ?? undefined,
    pageActionKind: pageAction.trusted ? pageAction.kind : undefined,
    journeyKind: journey.trusted ? journey.kind : undefined,
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
      ...(pageAction.trusted
        ? { pageActionKind: pageAction.kind, pageActionLabel: pageAction.label }
        : {}),
      ...(parentUrl ? { parentUrl } : {}),
      ...(journey.trusted
        ? {
            journeyKind: journey.kind,
            journeyTrusted: true,
            journeyContinuation: journey.continuation,
            journeyCollected: journey.collected,
            journeyMissing: journey.missingFields,
          }
        : {}),
    },
    routing,
    "webchat",
  );
}

function webchatParentUrl(contact: Contact): string | undefined {
  const ctx = contact.webchatContext as WebchatPageContext | undefined;
  return ctx?.latestUrl || ctx?.pageAction?.parentUrl || ctx?.landingUrl;
}

async function recoverPricingCompareSuggestion(input: {
  locale: string;
  inboundText: string;
  pageActionKind?: string | null;
  parentUrl?: string | null;
}): Promise<{ text: string; outcome: string }> {
  try {
    const { realizeTrustedFeaturesPricingReply } = await import("@shared/featuresPricingReply");
    const { canonicalPricingCompareEvidence, parentUrlAllowsCanonicalWhachatCatalog } = await import(
      "@shared/webchatPricingCompare"
    );
    const { buildTurnEvidenceBundle } = await import("@shared/turnEvidence");
    const useCanonical = parentUrlAllowsCanonicalWhachatCatalog(input.parentUrl);
    const bundle = buildTurnEvidenceBundle({
      userId: "recover",
      retrieved: [],
      supplementalEvidence: useCanonical ? canonicalPricingCompareEvidence() : [],
    });
    const realized = realizeTrustedFeaturesPricingReply({
      retrieved: [],
      locale: input.locale,
      bundle,
      useCanonicalCatalog: useCanonical,
      parentUrl: input.parentUrl,
      inbound: input.inboundText,
      pageActionKind: input.pageActionKind,
    });
    return { text: realized.text, outcome: realized.outcome };
  } catch {
    return { text: "", outcome: "formatter_exception" };
  }
}

async function recoverWebchatGenerationFailure(input: {
  locale: string;
  inboundText: string;
  pageActionKind?: string | null;
  parentUrl?: string | null;
  journeyKind?: string | null;
  journeyTrusted?: boolean;
  journeyCollected?: {
    platform?: string;
    monthlyCost?: number;
    currency?: string;
    teamSize?: number;
    monthlyVolume?: number;
  };
  journeyMissing?: string[];
  verifiedBookingUrl?: string | null;
}): Promise<{ text: string; outcome: string; kind: "pricing" | "savings" | "booking" | "find_solution" | "generic" }> {
  try {
    const kind = String(input.pageActionKind || "");
    if (kind === "book_demo") {
      const { trustedPageRuleBookDemoReply } = await import("@shared/webchatPageRuleReplies");
      const text = trustedPageRuleBookDemoReply(input.locale, input.verifiedBookingUrl || "");
      if (text?.trim()) return { text: text.trim(), outcome: "formatted", kind: "booking" };
    }
    if (kind === "find_solution") {
      const { trustedPageRuleFindSolutionReply } = await import("@shared/webchatPageRuleReplies");
      const text = trustedPageRuleFindSolutionReply(input.locale);
      if (text?.trim()) return { text: text.trim(), outcome: "formatted", kind: "find_solution" };
    }
    if (kind === "compare_plans" || kind === "features_pricing") {
      const recovered = await recoverPricingCompareSuggestion(input);
      if (recovered.text.trim()) return { ...recovered, kind: "pricing" };
    }
    if (input.journeyTrusted && (input.journeyKind === "pricing_compare" || kind === "compare_plans")) {
      const recovered = await recoverPricingCompareSuggestion({
        ...input,
        pageActionKind: input.pageActionKind || "compare_plans",
      });
      if (recovered.text.trim()) return { ...recovered, kind: "pricing" };
    }
    if (input.journeyTrusted && (input.journeyKind === "pricing_savings" || input.journeyKind === "calculate_savings")) {
      const { resolveSavingsJourneyReply } = await import("@shared/webchatSavingsJourney");
      const savings = resolveSavingsJourneyReply({
        locale: input.locale,
        collected: input.journeyCollected || {},
        missing: input.journeyMissing || [],
      });
      if (savings.text.trim()) return { text: savings.text, outcome: "formatted", kind: "savings" };
    }
  } catch {
    /* generic recovery below — never throw out of this helper */
  }
  return { text: webchatGenerationRecoveryMessage(input.locale), outcome: "generic_recovery", kind: "generic" };
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
    awayConfigured?: boolean;
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
    ignorePendingAskForExplicitAsset = false,
  ) => {
    const limits = await subscriptionService.getUserLimits(params.userId);
    const settings = await storage.getAiSettings(params.userId);
    const events = await storage.getActivityEvents(contact.id, 80);
    const aiControl = readConversationAiControl(conv.aiControl);
    const pendingStillActive = Boolean(pendingAskFromAiControl(conv.aiControl));
    const dnc = contactHasDoNotContact(contact);
    const rate = await consumeRateLimit(`webchat-ai:${params.userId}:${conv.id}`, 20, 15 * 60 * 1000);
    const rawMode = String(settings?.aiMode || "off").toLowerCase();
    const effectiveMode =
      rawMode === "full_auto" || rawMode === "auto"
        ? "auto"
        : rawMode === "suggest_only" || rawMode === "suggest"
          ? "suggest"
          : "manual";
    const rollout = readWebchatServerAiRollout(params.userId);
    const widgetEnabled = isWidgetEnabled(params.widgetSettings);
    const chatbotOwnsForPolicy = ignorePendingAskForExplicitAsset
      ? false
      : chatbotOwnsReply || pendingStillActive;
    console.info("[AIAutoReply]", {
      evaluate: true,
      effectiveMode,
      chatbotOwns: chatbotOwnsForPolicy,
      awayConfigured: params.awayConfigured === true,
      awayWillSend: params.crmFallbackOwnsReply === true,
      flagName: rollout.flagName,
      flagSource: "env_rollout",
      rolloutEnabled: rollout.rolloutEnabled,
      allowlisted: rollout.allowlisted,
      unattendedEligible: rollout.unattendedEligible,
      widgetProperty: "widgetSettings.enabled",
      widgetSource: "users.widget_settings",
      widgetEnabled,
    });
    return decideWebchatAiReply({
      rolloutEnabled: rollout.rolloutEnabled,
      allowlisted: rollout.allowlisted,
      widgetEnabled,
      hasAiBrainAccess: !!limits?.effectiveHasAIBrain,
      planIsProOrTrial: (limits?.plan || "free") === "pro" || !!limits?.effectiveHasAIBrain,
      aiModeRaw: settings?.aiMode,
      chatbotOwnsReply: chatbotOwnsForPolicy,
      bookingOwnsReply: params.bookingOwnsReply === true || aiControl.lastTurnOwner === "booking",
      crmFallbackOwnsReply: params.crmFallbackOwnsReply === true,
      handoffActive: isConversationHandoffActive(events, conv.id),
      aiPaused: aiControl.paused,
      automationsPaused: contactHasAutomationsPaused(contact),
      optedOut: dnc.blocked,
      rateLimited: !rate.allowed,
    });
  };

  const report = (reasonCode: string, extra?: {
    sent?: boolean;
    hasDraft?: boolean;
    confidenceSource?: string;
    pageActionValidated?: boolean;
    pageActionCurrentInbound?: boolean;
    pageRuleKey?: string;
    pageActionIndex?: number;
    explicitUserChoice?: boolean;
    activeJourneyKind?: string;
    activeJourneyTrusted?: boolean;
    activeJourneyContinuation?: boolean;
    activeJourneyOriginInboundId?: string;
    currentInboundId?: string;
    collectedFields?: string;
    missingFields?: string;
    retrievalIntent?: string;
    groundingResult?: string;
    stage?: string;
    effectiveMode?: string;
    turnOwner?: string;
    routeCategory?: string;
    generationOutcome?: string;
    errorClass?: string;
    errorCode?: string;
    fallbackAttempted?: boolean;
    fallbackSucceeded?: boolean;
    outboundPersisted?: boolean;
    publicPollingEligible?: boolean;
  }) => {
    const outcome = extra?.sent ? "sent" : outcomeForReasonCode(reasonCode, extra);
    const rollout = readWebchatServerAiRollout(params.userId);
    const turnOwner =
      extra?.turnOwner ||
      (params.chatbotWillFire
        ? "chatbot"
        : params.bookingOwnsReply
          ? "booking"
          : params.crmFallbackOwnsReply
            ? "away"
            : "ai_eligible");
    logAiReplyDecision({
      source: "webchat_unattended",
      channel: "webchat",
      outcome,
      reasonCode,
      workspaceUserId: params.userId,
      eligibility: {
        correlationId: leaseId.slice(0, 8),
        stage: extra?.stage || (reasonCode.startsWith("skip_") ? "evaluate" : "outbound"),
        turnOwner,
        effectiveMode:
          extra?.effectiveMode ||
          (reasonCode === "skip_manual"
            ? "manual"
            : reasonCode === "suggest_only"
              ? "suggest"
              : reasonCode.startsWith("skip_")
                ? "skip"
                : "auto"),
        ...(extra?.routeCategory ? { routeCategory: extra.routeCategory } : {}),
        ...(extra?.generationOutcome ? { generationOutcome: extra.generationOutcome } : {}),
        ...(extra?.errorClass ? { errorClass: extra.errorClass } : {}),
        ...(extra?.errorCode ? { errorCode: extra.errorCode.slice(0, 80) } : {}),
        fallbackAttempted: extra?.fallbackAttempted === true,
        fallbackSucceeded: extra?.fallbackSucceeded === true,
        outboundPersisted: extra?.outboundPersisted === true || extra?.sent === true,
        publicPollingEligible: extra?.publicPollingEligible === true || extra?.sent === true,
        finalOutcomeReason: reasonCode.slice(0, 80),
        decision: reasonCode,
        chatbotWillFire: params.chatbotWillFire,
        bookingOwnsReply: params.bookingOwnsReply === true,
        crmFallbackOwnsReply: params.crmFallbackOwnsReply === true,
        awayConfigured: params.awayConfigured === true,
        flagName: rollout.flagName,
        flagSource: "env_rollout",
        rolloutEnabled: rollout.rolloutEnabled,
        allowlisted: rollout.allowlisted,
        unattendedEligible: rollout.unattendedEligible,
        widgetProperty: "widgetSettings.enabled",
        widgetSource: "users.widget_settings",
        widgetEnabled: isWidgetEnabled(params.widgetSettings),
        confidenceSource: extra?.confidenceSource,
        ...(typeof extra?.pageActionValidated === "boolean"
          ? {
              pageActionValidated: extra.pageActionValidated,
              pageActionCurrentInbound: extra.pageActionCurrentInbound === true,
              ...(extra.pageRuleKey ? { pageRuleKey: extra.pageRuleKey } : {}),
              ...(typeof extra.pageActionIndex === "number" ? { pageActionIndex: extra.pageActionIndex } : {}),
              explicitUserChoice: extra.explicitUserChoice === true,
            }
          : {}),
        ...(typeof extra?.activeJourneyTrusted === "boolean"
          ? {
              activeJourneyTrusted: extra.activeJourneyTrusted,
              activeJourneyContinuation: extra.activeJourneyContinuation === true,
              ...(extra.activeJourneyKind ? { activeJourneyKind: extra.activeJourneyKind } : {}),
              ...(extra.activeJourneyOriginInboundId
                ? { activeJourneyOriginInboundId: extra.activeJourneyOriginInboundId }
                : {}),
              ...(extra.currentInboundId ? { currentInboundId: extra.currentInboundId } : {}),
              ...(extra.collectedFields ? { collectedFields: extra.collectedFields } : {}),
              ...(extra.missingFields ? { missingFields: extra.missingFields } : {}),
              ...(extra.retrievalIntent ? { retrievalIntent: extra.retrievalIntent } : {}),
              ...(extra.groundingResult ? { groundingResult: extra.groundingResult } : {}),
            }
          : {}),
      },
    });
    console.info("[AIAutoReply]", {
      evaluated: true,
      decision: reasonCode,
      outcome,
      correlationId: leaseId.slice(0, 8),
      stage: extra?.stage || null,
      generationOutcome: extra?.generationOutcome || null,
      errorClass: extra?.errorClass || null,
      fallbackAttempted: extra?.fallbackAttempted === true,
      fallbackSucceeded: extra?.fallbackSucceeded === true,
      outboundPersisted: extra?.outboundPersisted === true,
      publicPollingEligible: extra?.publicPollingEligible === true,
      chatbotOwns: params.chatbotWillFire === true,
      awayConfigured: params.awayConfigured === true,
      awayWillSend: params.crmFallbackOwnsReply === true,
      sent: extra?.sent === true,
      hasDraft: extra?.hasDraft === true,
      flagName: rollout.flagName,
      flagSource: "env_rollout",
      rolloutEnabled: rollout.rolloutEnabled,
      allowlisted: rollout.allowlisted,
      unattendedEligible: rollout.unattendedEligible,
      widgetProperty: "widgetSettings.enabled",
      widgetSource: "users.widget_settings",
      widgetEnabled: isWidgetEnabled(params.widgetSettings),
      ...(typeof extra?.pageActionValidated === "boolean"
        ? {
            pageActionValidated: extra.pageActionValidated,
            pageActionCurrentInbound: extra.pageActionCurrentInbound === true,
            ...(extra.pageRuleKey ? { pageRuleKey: extra.pageRuleKey } : {}),
            ...(typeof extra.pageActionIndex === "number" ? { pageActionIndex: extra.pageActionIndex } : {}),
            explicitUserChoice: extra.explicitUserChoice === true,
          }
        : {}),
      ...(typeof extra?.activeJourneyTrusted === "boolean"
        ? {
            activeJourneyTrusted: extra.activeJourneyTrusted,
            activeJourneyContinuation: extra.activeJourneyContinuation === true,
            ...(extra.activeJourneyKind ? { activeJourneyKind: extra.activeJourneyKind } : {}),
            ...(extra.collectedFields ? { collectedFields: extra.collectedFields } : {}),
            ...(extra.missingFields ? { missingFields: extra.missingFields } : {}),
            ...(extra.retrievalIntent ? { retrievalIntent: extra.retrievalIntent } : {}),
            ...(extra.groundingResult ? { groundingResult: extra.groundingResult } : {}),
          }
        : {}),
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

  const {
    dispatchExplicitApprovedAssetTurn,
    resolveExplicitApprovedAssetForTurn,
    shouldSkipChatbotForExplicitApprovedAsset,
  } = await import("./marketingAssets/explicitAssetTurn");
  const explicitLocale = String(
    readConversationAiControl(conv.aiControl).conversationLanguage || "en",
  ).slice(0, 8);
  const explicitResolution = await resolveExplicitApprovedAssetForTurn({
    userId: params.userId,
    inboundText: params.inboundText,
    locale: explicitLocale,
  });
  const skipChatbotOwnsForExplicit = shouldSkipChatbotForExplicitApprovedAsset(explicitResolution);

  let decision = await evaluate(
    contact,
    conv,
    skipChatbotOwnsForExplicit ? false : params.chatbotWillFire,
    skipChatbotOwnsForExplicit,
  );
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

  if (decision === "send_auto" || decision === "suggest_only") {
    const persistExplicitDraft = async (
      reasonCode: string,
      extra?: { suggestion: string; proposedApprovedAssetId: string | null },
    ) => {
      const prior = await storage.getActivityEvents(contact.id, 40);
      const already = prior.some(
        (event) =>
          event.eventType === "ai_suggestion" &&
          (event.eventData as { inboundMessageId?: string } | null)?.inboundMessageId ===
            params.inboundMessageId,
      );
      if (!already) {
        await storage.createActivityEvent({
          userId: params.userId,
          contactId: contact.id,
          conversationId: conv.id,
          eventType: "ai_suggestion",
          eventData: {
            suggestion: String(extra?.suggestion || "").slice(0, 2000),
            confidence: 1,
            channel: "webchat",
            holdReason: reasonCode,
            inboundMessageId: params.inboundMessageId,
            conversationId: conv.id,
            proposedApprovedAssetId: extra?.proposedApprovedAssetId || null,
            holdNote: extra?.proposedApprovedAssetId
              ? "AI proposed a marketing material. It was not sent. Send it from Inbox if you want."
              : undefined,
          },
          actorType: "ai",
        });
      }
      await storage.updateConversation(conv.id, {
        aiControl: completeWebchatGenerationLease(conv.aiControl, leaseId),
      });
    };
    const explicitHandled = await dispatchExplicitApprovedAssetTurn({
      userId: params.userId,
      contact,
      conversation: conv,
      inboundMessageId: params.inboundMessageId,
      inboundText: params.inboundText,
      locale: explicitLocale,
      decision,
      persistDraft: persistExplicitDraft,
    });
    if (explicitHandled.handled) {
      if (explicitHandled.sent) {
        conv = (await storage.getConversation(conv.id)) || conv;
        await storage.updateConversation(conv.id, {
          aiControl: completeWebchatGenerationLease(conv.aiControl, leaseId),
        });
        report("send_auto", {
          sent: true,
          stage: "outbound",
          outboundPersisted: true,
          publicPollingEligible: true,
        });
      } else {
        report(explicitHandled.decision, {
          sent: false,
          hasDraft: decision === "suggest_only",
        });
      }
      return { decision: explicitHandled.decision, sent: explicitHandled.sent };
    }
  }

  const joinedInbound = joinLatestVisitorTurn(messages, params.inboundText);
  const history = messages.map((m) => ({
    role: m.direction === "inbound" ? "user" : "assistant",
    content: m.content || "",
  }));
  const pageBlock = formatPageContextForAi(contact.webchatContext as WebchatPageContext);
  const currentTurnPageActionForGenerate = resolveCurrentTurnPageAction({
    pageContext: contact.webchatContext,
    inboundMessageId: params.inboundMessageId,
  });
  const { resolveCurrentTurnJourney: resolveJourneyForGenerate } = await import("@shared/webchatActiveJourney");
  const currentTurnJourneyForGenerate = resolveJourneyForGenerate({
    journey: readConversationAiControl(conv.aiControl).activeJourney,
    userId: params.userId,
    visitorId: String(contact.webchatId || ""),
    conversationId: conv.id,
    inboundMessageId: params.inboundMessageId,
  });
  const generateLocale = String(readConversationAiControl(conv.aiControl).conversationLanguage || "en").slice(0, 8);
  const { classifyChatbotVisitorIntent } = await import("@shared/chatbotCompletionContext");
  const inboundVisitorKind = classifyChatbotVisitorIntent(joinedInbound);
  const pricingRecoverable =
    (currentTurnPageActionForGenerate.trusted === true &&
      currentTurnPageActionForGenerate.provenanceCurrentInbound === true &&
      (currentTurnPageActionForGenerate.kind === "compare_plans" ||
        currentTurnPageActionForGenerate.kind === "features_pricing")) ||
    (currentTurnJourneyForGenerate.trusted === true &&
      currentTurnJourneyForGenerate.kind === "pricing_compare") ||
    inboundVisitorKind === "features_pricing" ||
    inboundVisitorKind === "compare_plans";

  const controller = new AbortController();
  registerWebchatGenerationAbort(conv.id, controller);
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  let suggestion: {
    suggestion?: string;
    confidence?: number;
    confidenceProvided?: boolean;
    knowledgeGrounded?: boolean;
    modelGenerationSucceeded?: boolean;
    groundingViolations?: string[];
    retrievalIntent?: string;
    savingsJourneyComplete?: boolean;
    sendApprovedAssetId?: string | null;
  } = {
    suggestion: "",
    confidence: 0,
  };
  let generationStage = "model";
  try {
    generationStage = "model";
    const genPromise = generate({
      userId: params.userId,
      conversationId: conv.id,
      history: pageBlock
        ? [{ role: "system", content: pageBlock }, ...history]
        : history,
      inboundText: joinedInbound,
      inboundMessageId: params.inboundMessageId,
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
    const reasonCode =
      !leaseStillValid
        ? "skip_lease_invalid"
        : name === "TimeoutError" || name === "AbortError"
          ? "skip_generation_timeout"
          : "generation_failed";
    const diag = {
      stage: generationStage,
      pageActionKind: currentTurnPageActionForGenerate.kind || currentTurnJourneyForGenerate.kind || null,
      locale: generateLocale,
      formatterOutcome: "recovery",
      errorName: name || "Error",
      errorCode: safeGenerationErrorCode(err, false),
      errorClass: classifyWebchatGenerationFailure(err, false),
      fallbackAttempted: true,
      fallbackSucceeded: false,
      finalDecision: reasonCode,
    };
    if (!leaseStillValid || reasonCode === "skip_lease_invalid") {
      console.info("[AI] generation_stage", { ...diag, fallbackAttempted: false });
      report("skip_lease_invalid");
      return { decision: "skip_lease_invalid", sent: false };
    }
    const recovered = await recoverWebchatGenerationFailure({
      locale: generateLocale,
      inboundText: joinedInbound,
      pageActionKind: pricingRecoverable
        ? currentTurnPageActionForGenerate.kind
        : currentTurnPageActionForGenerate.trusted
          ? currentTurnPageActionForGenerate.kind
          : inboundVisitorKind,
      parentUrl: webchatParentUrl(contact),
      journeyKind: currentTurnJourneyForGenerate.kind,
      journeyTrusted: currentTurnJourneyForGenerate.trusted,
      journeyCollected: currentTurnJourneyForGenerate.collected,
      journeyMissing: currentTurnJourneyForGenerate.missingFields,
    });
    suggestion = {
      suggestion: recovered.text,
      confidence: WEBCHAT_AUTO_SEND_MIN_CONFIDENCE,
      confidenceProvided: recovered.kind !== "generic",
      knowledgeGrounded: recovered.kind !== "generic" && recovered.outcome === "formatted",
      modelGenerationSucceeded: false,
      groundingViolations: [],
      retrievalIntent: recovered.kind === "generic" ? "generation_recovery" : "pricing_question",
    };
    diag.fallbackSucceeded = Boolean(recovered.text.trim());
    diag.formatterOutcome = recovered.outcome;
    diag.finalDecision = recovered.kind === "generic" ? "generation_recovery" : "formatter_fallback";
    console.info("[AI] generation_stage", diag);
  } finally {
    clearTimeout(timer);
    clearWebchatGenerationAbort(conv.id, controller);
  }

  let text = (suggestion.suggestion || "").trim();
  if (isCasualWebchatGreeting(params.inboundText)) {
    text = coerceWebchatGreetingWelcome(text).text;
  }
  if (!text) {
    const recovered = await recoverWebchatGenerationFailure({
      locale: generateLocale,
      inboundText: joinedInbound,
      pageActionKind: pricingRecoverable
        ? currentTurnPageActionForGenerate.kind
        : currentTurnPageActionForGenerate.trusted
          ? currentTurnPageActionForGenerate.kind
          : inboundVisitorKind,
      parentUrl: webchatParentUrl(contact),
      journeyKind: currentTurnJourneyForGenerate.kind,
      journeyTrusted: currentTurnJourneyForGenerate.trusted,
      journeyCollected: currentTurnJourneyForGenerate.collected,
      journeyMissing: currentTurnJourneyForGenerate.missingFields,
    });
    text = recovered.text.trim();
    suggestion = {
      ...suggestion,
      suggestion: text,
      confidence: WEBCHAT_AUTO_SEND_MIN_CONFIDENCE,
      confidenceProvided: recovered.kind !== "generic",
      knowledgeGrounded: recovered.kind !== "generic" && recovered.outcome === "formatted",
      modelGenerationSucceeded: false,
      retrievalIntent: recovered.kind === "generic" ? "generation_recovery" : suggestion.retrievalIntent,
    };
    console.info("[AI] generation_stage", {
      stage: "formatter",
      pageActionKind: currentTurnPageActionForGenerate.kind || currentTurnJourneyForGenerate.kind || null,
      locale: generateLocale,
      formatterOutcome: recovered.outcome,
      errorClass: "empty",
      errorCode: "empty",
      fallbackAttempted: true,
      fallbackSucceeded: Boolean(text),
      finalDecision: text ? (recovered.kind === "generic" ? "generation_recovery" : "empty_recovered") : "empty",
    });
  }
  if (!text) {
    text = webchatGenerationRecoveryMessage(generateLocale);
    suggestion = {
      ...suggestion,
      suggestion: text,
      confidence: WEBCHAT_AUTO_SEND_MIN_CONFIDENCE,
      confidenceProvided: false,
      knowledgeGrounded: false,
      modelGenerationSucceeded: false,
      retrievalIntent: "generation_recovery",
    };
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
  decision = await evaluate(
    contact,
    conv,
    skipChatbotOwnsForExplicit ? false : params.chatbotWillFire,
    skipChatbotOwnsForExplicit,
  );
  if (decision === "skip_manual" || decision.startsWith("skip_")) {
    report(decision);
    return { decision, sent: false };
  }

  const persistDraft = async (reasonCode: string) => {
    const prior = await storage.getActivityEvents(contact.id, 40);
    const already = prior.some(
      (event) =>
        event.eventType === "ai_suggestion" &&
        (event.eventData as { inboundMessageId?: string } | null)?.inboundMessageId ===
          params.inboundMessageId,
    );
    if (!already) {
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
          inboundMessageId: params.inboundMessageId,
          conversationId: conv.id,
          proposedApprovedAssetId: suggestion.sendApprovedAssetId || null,
          holdNote: suggestion.sendApprovedAssetId
            ? "AI proposed a marketing material. It was not sent. Send it from Inbox if you want."
            : undefined,
        },
        actorType: "ai",
      });
      try {
        const { notifyUser } = await import("./presence");
        notifyUser(params.userId, {
          type: "ai_review_draft",
          contactId: contact.id,
          conversationId: conv.id,
        });
      } catch {
        /* inbox still hydrates on next timeline fetch */
      }
    }
    await storage.updateConversation(conv.id, {
      aiControl: completeWebchatGenerationLease(conv.aiControl, leaseId),
    });
  };

  if (decision === "suggest_only") {
    await persistDraft("suggest_only");
    report("suggest_only", { hasDraft: true });
    return { decision, sent: false };
  }

  const knowledgeRaw = await storage.getAiBusinessKnowledge(params.userId);
  const { applyCalendlyBookingLinkForAi } = await import("./calendlyBookingConnected");
  const knowledge = await applyCalendlyBookingLinkForAi(params.userId, knowledgeRaw || undefined);
  const currentTurnAskIntent = resolveCurrentTurnStructuredAskIntent({
    customFields: contact.customFields,
    inboundMessageId: params.inboundMessageId,
  });
  const currentTurnPageAction = resolveCurrentTurnPageAction({
    pageContext: contact.webchatContext,
    inboundMessageId: params.inboundMessageId,
  });
  const { resolveCurrentTurnJourney, journeyGateDiagnostics, markJourneyStatus, readActiveJourney } =
    await import("@shared/webchatActiveJourney");
  const currentTurnJourney = resolveCurrentTurnJourney({
    journey: controlNow.activeJourney,
    userId: params.userId,
    visitorId: String(contact.webchatId || ""),
    conversationId: conv.id,
    inboundMessageId: params.inboundMessageId,
  });
  const gate = evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: history,
    suggestion: text,
    confidence: typeof suggestion.confidence === "number" ? suggestion.confidence : 0,
    confidenceProvided: suggestion.confidenceProvided === true,
    knowledgeGrounded: suggestion.knowledgeGrounded === true,
    verifiedBookingUrl: String(knowledge?.bookingLink || "").trim(),
    businessKnowledge: businessKnowledgeFromAiRecord(knowledge as Record<string, unknown> | undefined),
    groundingViolations: suggestion.groundingViolations,
    currentTurnAskIntent,
    currentTurnPageAction,
    currentTurnJourney,
  });
  const gateDiagnostics = {
    ...pageActionGateDiagnostics(currentTurnPageAction),
    ...journeyGateDiagnostics(currentTurnJourney, params.inboundMessageId),
    ...(suggestion.retrievalIntent ? { retrievalIntent: suggestion.retrievalIntent } : {}),
    groundingResult:
      suggestion.groundingViolations && suggestion.groundingViolations.length
        ? suggestion.groundingViolations[0]
        : suggestion.knowledgeGrounded
          ? "grounded"
          : "ungrounded",
  };
  if (!gate.allowed) {
    const reasonCode = `send_auto:held:${gate.reason}`;
    await persistDraft(reasonCode);
    report(reasonCode, {
      hasDraft: true,
      confidenceSource: gate.confidenceSource,
      ...gateDiagnostics,
    });
    return { decision: reasonCode, sent: false };
  }

  conv = (await storage.getConversation(conv.id)) || conv;
  if (!generationLeaseAllowsCommit(readConversationAiControl(conv.aiControl), leaseId)) {
    report("skip_lease_invalid");
    return { decision: "skip_lease_invalid", sent: false };
  }

  const idempotencyKey = webchatAutoSendIdempotencyKey(params.userId, params.inboundMessageId);
  const approvedAssetId =
    typeof suggestion.sendApprovedAssetId === "string" && suggestion.sendApprovedAssetId.trim()
      ? suggestion.sendApprovedAssetId.trim()
      : "";
  if (approvedAssetId) {
    const { sendApprovedMarketingAsset } = await import("./marketingAssets/sendApprovedAsset");
    const assetSend = await sendApprovedMarketingAsset({
      userId: params.userId,
      contactId: contact.id,
      conversationId: conv.id,
      inboundMessageId: params.inboundMessageId,
      assetId: approvedAssetId,
      caption: text,
      locale: generateLocale,
      inboundText: params.inboundText,
      greetingTurn: isCasualWebchatGreeting(params.inboundText),
      generatedBy: "ai_brain",
      generationMeta: {
        decision,
        reasonCode: gate.reason,
        confidence: suggestion.confidence ?? 0,
        inboundMessageId: params.inboundMessageId,
        leaseId,
        modelGenerationSucceeded: suggestion.modelGenerationSucceeded === true,
        approvedAssetId,
      },
    });
    if (assetSend.ok) {
      const afterSend = (await storage.getConversation(conv.id)) || conv;
      const afterControl = readConversationAiControl(afterSend.aiControl);
      const completedLease = completeWebchatGenerationLease(afterControl, leaseId);
      const liveJourney = readActiveJourney(afterControl.activeJourney);
      await storage.updateConversation(conv.id, {
        aiControl: {
          ...completedLease,
          activeJourney:
            suggestion.savingsJourneyComplete && liveJourney
              ? markJourneyStatus(liveJourney, "completed")
              : afterControl.activeJourney,
        },
      });
      report("send_auto", {
        sent: true,
        stage: "outbound",
        outboundPersisted: true,
        publicPollingEligible: true,
      });
      return { decision: "send_auto", sent: true };
    }
    if (assetSend.reason === "skip_guard:duplicate") {
      const recent = await storage.getMessages(conv.id, 40);
      const alreadySent = inboundTurnAlreadyReplied(recent, params.inboundMessageId) &&
        recent.some(
          (m) =>
            m.direction === "outbound" &&
            (m.status === "sent" || m.status === "delivered") &&
            (m.generationMeta as { inboundMessageId?: string } | null)?.inboundMessageId ===
              params.inboundMessageId,
        );
      if (alreadySent) {
        const afterSend = (await storage.getConversation(conv.id)) || conv;
        const afterControl = readConversationAiControl(afterSend.aiControl);
        await storage.updateConversation(conv.id, {
          aiControl: completeWebchatGenerationLease(afterControl, leaseId),
        });
        report("send_auto", {
          sent: true,
          stage: "outbound",
          outboundPersisted: true,
          publicPollingEligible: true,
        });
        return { decision: "send_auto", sent: true };
      }
      await persistDraft("skip_guard:duplicate");
      report("skip_guard:duplicate", {
        hasDraft: true,
        stage: "outbound",
        outboundPersisted: false,
        publicPollingEligible: false,
      });
      return { decision: "skip_guard:duplicate", sent: false };
    }
    if (assetSend.reason === "send_failed" || assetSend.reason.startsWith("skip_guard:")) {
      await persistDraft(assetSend.reason === "send_failed" ? "send_failed" : assetSend.reason);
      report(assetSend.reason, {
        hasDraft: true,
        stage: "outbound",
        outboundPersisted: false,
        publicPollingEligible: false,
      });
      return { decision: assetSend.reason, sent: false };
    }
    // Disabled, deleted, locale mismatch, invented id, greeting, or not relevant:
    // answer in text only. Media unavailable also falls through so the visitor is not silent.
  }
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
        suppressFallback: true,
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
    await persistDraft(reasonCode);
    report(reasonCode, {
      hasDraft: true,
      stage: "outbound",
      outboundPersisted: false,
      publicPollingEligible: false,
      fallbackAttempted: true,
      fallbackSucceeded: false,
    });
    return { decision: reasonCode, sent: false };
  }
  const send = guarded.result;
  if (!send.success) {
    await persistDraft("send_failed");
    report("send_failed", {
      hasDraft: true,
      stage: "outbound",
      outboundPersisted: false,
      publicPollingEligible: false,
    });
    return { decision: "send_failed", sent: false };
  }
  const afterSend = (await storage.getConversation(conv.id)) || conv;
  const afterControl = readConversationAiControl(afterSend.aiControl);
  const completedLease = completeWebchatGenerationLease(afterControl, leaseId);
  const liveJourney = readActiveJourney(afterControl.activeJourney);
  await storage.updateConversation(conv.id, {
    aiControl: {
      ...completedLease,
      activeJourney:
        suggestion.savingsJourneyComplete && liveJourney
          ? markJourneyStatus(liveJourney, "completed")
          : afterControl.activeJourney,
    },
  });
  report(gate.reason, {
    sent: true,
    confidenceSource: gate.confidenceSource,
    stage: "outbound",
    generationOutcome: suggestion.modelGenerationSucceeded ? "model" : "recovered",
    fallbackAttempted: suggestion.modelGenerationSucceeded !== true,
    fallbackSucceeded: suggestion.modelGenerationSucceeded !== true,
    outboundPersisted: true,
    publicPollingEligible: true,
    ...gateDiagnostics,
  });
  return { decision, sent: true };
}
