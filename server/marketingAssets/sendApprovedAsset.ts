/**
 * Server-owned Website Chat send of an approved marketing asset.
 * The model supplies only an asset id; this module validates tenant, enabled,
 * locale, inbound provenance, relevance, and current conversation ownership before dispatch.
 */

import { storage } from "../storage";
import { channelService } from "../channelService";
import { withAutomationSendGuard } from "../automationSendGuard";
import { getSendableMarketingAsset } from "./assetStore";
import { isMarketingAssetId, shouldAllowApprovedAssetSend } from "@shared/marketingAssets";
import { isCasualWebchatGreeting } from "@shared/webchatGreetingWelcome";
import { readConversationAiControl, webchatAutoSendIdempotencyKey } from "@shared/webchatAiPolicy";

export type SendApprovedAssetParams = {
  userId: string;
  contactId: string;
  conversationId: string;
  inboundMessageId: string;
  assetId: string;
  caption: string;
  locale: string;
  inboundText?: string;
  greetingTurn?: boolean;
  generatedBy?: string;
  generationMeta?: Record<string, unknown>;
};

export type SendApprovedAssetResult =
  | { ok: true; messageId?: string; skipped?: never; reason?: never }
  | { ok: false; skipped: true; reason: string };

export async function sendApprovedMarketingAsset(
  params: SendApprovedAssetParams,
): Promise<SendApprovedAssetResult> {
  if (!isMarketingAssetId(params.assetId)) {
    return { ok: false, skipped: true, reason: "invalid_asset_id" };
  }

  const conversation = await storage.getConversation(params.conversationId);
  if (
    !conversation ||
    conversation.userId !== params.userId ||
    conversation.contactId !== params.contactId ||
    conversation.channel !== "webchat"
  ) {
    return { ok: false, skipped: true, reason: "conversation_mismatch" };
  }

  const inbound = await storage.getMessage(params.inboundMessageId);
  if (
    !inbound ||
    inbound.userId !== params.userId ||
    inbound.conversationId !== conversation.id ||
    inbound.contactId !== params.contactId ||
    inbound.direction !== "inbound"
  ) {
    return { ok: false, skipped: true, reason: "inbound_provenance" };
  }

  const control = readConversationAiControl(conversation.aiControl);
  if (control.paused) {
    return { ok: false, skipped: true, reason: "takeover" };
  }

  const inboundText = String(params.inboundText || inbound.content || "").trim();
  const greetingTurn =
    params.greetingTurn === true || isCasualWebchatGreeting(inboundText);
  if (greetingTurn) {
    return { ok: false, skipped: true, reason: "greeting" };
  }

  const asset = await getSendableMarketingAsset({
    userId: params.userId,
    assetId: params.assetId,
    locale: params.locale || control.conversationLanguage || "en",
  });
  if (!asset.ok) {
    return { ok: false, skipped: true, reason: asset.reason };
  }

  if (
    !shouldAllowApprovedAssetSend({
      inboundText,
      greetingTurn: false,
      asset: {
        displayName: asset.row.displayName,
        topics: Array.isArray(asset.row.topics) ? asset.row.topics.map(String) : [],
        description: asset.row.description,
      },
    })
  ) {
    return { ok: false, skipped: true, reason: "not_relevant" };
  }

  const contentType = asset.row.kind === "document" ? "document" : "image";
  const { webchatVisitorMediaIsAvailable } = await import("../webchatVisitorMedia");
  const available = await webchatVisitorMediaIsAvailable({
    userId: params.userId,
    mediaUrl: asset.row.mediaUrl,
    mediaStorageKey: asset.row.mediaStorageKey,
    contentType,
  });
  if (!available) {
    return { ok: false, skipped: true, reason: "media_unavailable" };
  }

  const idempotencyKey = webchatAutoSendIdempotencyKey(params.userId, params.inboundMessageId);
  const guarded = await withAutomationSendGuard(
    {
      userId: params.userId,
      contactId: params.contactId,
      conversationId: conversation.id,
      channel: "webchat",
      source: "ai_auto",
      idempotencyKey,
    },
    async () =>
      channelService.sendMessage({
        userId: params.userId,
        contactId: params.contactId,
        content: params.caption || "",
        contentType,
        mediaUrl: asset.row.mediaUrl,
        mediaType: contentType,
        mediaFilename: asset.row.originalFilename,
        mediaStorageKey: asset.row.mediaStorageKey,
        mediaMimeType: asset.row.mimeType,
        mediaSize: asset.row.mediaSize,
        forceChannel: "webchat",
        suppressFallback: true,
        generatedBy: params.generatedBy || "ai_brain",
        generationMeta: {
          ...(params.generationMeta || {}),
          approvedAssetId: asset.row.id,
          inboundMessageId: params.inboundMessageId,
        },
      }),
  );
  if (!guarded.ok) {
    return { ok: false, skipped: true, reason: `skip_guard:${guarded.reason}` };
  }
  if (!guarded.result.success) {
    return { ok: false, skipped: true, reason: "send_failed" };
  }
  return { ok: true, messageId: guarded.result.messageId };
}
