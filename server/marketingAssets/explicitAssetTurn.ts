/**
 * Server-owned explicit approved-material turn.
 * Unique high-confidence requests send a validated asset with a deterministic
 * caption and never wait on model generation or fact-denial grounding.
 */

import type { Contact, Conversation } from "@shared/schema";
import {
  approvedAssetClarificationCaption,
  approvedAssetDeterministicCaption,
  isServerOwnedExplicitApprovedAssetAction,
  resolveExplicitApprovedAssetRequest,
  type ExplicitApprovedAssetResolution,
  type MarketingAssetCatalogItem,
} from "@shared/marketingAssets";
import { channelService } from "../channelService";
import { withAutomationSendGuard } from "../automationSendGuard";
import { webchatAutoSendIdempotencyKey } from "@shared/webchatAiPolicy";
import { listEnabledMarketingAssetCatalog } from "./assetStore";
import { sendApprovedMarketingAsset } from "./sendApprovedAsset";

export async function resolveExplicitApprovedAssetForTurn(params: {
  userId: string;
  inboundText: string;
  locale?: string;
}): Promise<ExplicitApprovedAssetResolution<MarketingAssetCatalogItem>> {
  const catalog = await listEnabledMarketingAssetCatalog(
    params.userId,
    params.locale,
    params.inboundText,
  );
  return resolveExplicitApprovedAssetRequest(params.inboundText, catalog);
}

export function shouldSkipChatbotForExplicitApprovedAsset(
  resolution: ExplicitApprovedAssetResolution<MarketingAssetCatalogItem>,
): boolean {
  return isServerOwnedExplicitApprovedAssetAction(resolution);
}

export async function dispatchExplicitApprovedAssetTurn(params: {
  userId: string;
  contact: Contact;
  conversation: Conversation;
  inboundMessageId: string;
  inboundText: string;
  locale: string;
  decision: "send_auto" | "suggest_only";
  persistDraft: (reasonCode: string, extra?: { suggestion: string; proposedApprovedAssetId: string | null }) => Promise<void>;
}): Promise<{ handled: false } | { handled: true; sent: boolean; decision: string }> {
  const resolution = await resolveExplicitApprovedAssetForTurn({
    userId: params.userId,
    inboundText: params.inboundText,
    locale: params.locale,
  });
  if (!isServerOwnedExplicitApprovedAssetAction(resolution)) {
    return { handled: false };
  }

  if (resolution.kind === "ambiguous") {
    const caption = approvedAssetClarificationCaption(params.locale);
    if (params.decision === "suggest_only") {
      await params.persistDraft("suggest_only", {
        suggestion: caption,
        proposedApprovedAssetId: null,
      });
      return { handled: true, sent: false, decision: "suggest_only" };
    }
    const sent = await sendClarification(params, caption);
    return { handled: true, sent, decision: sent ? "send_auto" : "send_failed" };
  }

  const caption = approvedAssetDeterministicCaption(params.locale, resolution.asset.displayName);
  if (params.decision === "suggest_only") {
    await params.persistDraft("suggest_only", {
      suggestion: caption,
      proposedApprovedAssetId: resolution.asset.id,
    });
    return { handled: true, sent: false, decision: "suggest_only" };
  }

  const assetSend = await sendApprovedMarketingAsset({
    userId: params.userId,
    contactId: params.contact.id,
    conversationId: params.conversation.id,
    inboundMessageId: params.inboundMessageId,
    assetId: resolution.asset.id,
    caption,
    locale: params.locale,
    inboundText: params.inboundText,
    greetingTurn: false,
    generatedBy: "approved_asset",
    generationMeta: {
      reasonCode: "explicit_approved_asset",
      inboundMessageId: params.inboundMessageId,
      approvedAssetId: resolution.asset.id,
    },
  });
  if (assetSend.ok || assetSend.reason === "skip_guard:duplicate") {
    return { handled: true, sent: true, decision: "send_auto" };
  }
  return { handled: true, sent: false, decision: assetSend.reason || "send_failed" };
}

async function sendClarification(
  params: {
    userId: string;
    contact: Contact;
    conversation: Conversation;
    inboundMessageId: string;
  },
  caption: string,
): Promise<boolean> {
  const idempotencyKey = webchatAutoSendIdempotencyKey(params.userId, params.inboundMessageId);
  const guarded = await withAutomationSendGuard(
    {
      userId: params.userId,
      contactId: params.contact.id,
      conversationId: params.conversation.id,
      channel: "webchat",
      source: "ai_auto",
      idempotencyKey,
    },
    async () =>
      channelService.sendMessage({
        userId: params.userId,
        contactId: params.contact.id,
        content: caption,
        contentType: "text",
        forceChannel: "webchat",
        suppressFallback: true,
        generatedBy: "approved_asset",
        generationMeta: {
          reasonCode: "explicit_approved_asset_clarify",
          inboundMessageId: params.inboundMessageId,
        },
      }),
  );
  if (!guarded.ok) return guarded.reason === "duplicate";
  return Boolean(guarded.result.success);
}

export async function loadExplicitApprovedAssetSkipFlag(params: {
  userId: string;
  inboundText: string;
  locale?: string;
}): Promise<boolean> {
  try {
    const resolution = await resolveExplicitApprovedAssetForTurn(params);
    return shouldSkipChatbotForExplicitApprovedAsset(resolution);
  } catch {
    return false;
  }
}
