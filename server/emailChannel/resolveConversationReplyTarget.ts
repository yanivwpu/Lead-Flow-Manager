/**
 * Resolve the reply To address for an email conversation from stored inbound details.
 */

import { storage } from "../storage";
import { getEmailMessageDetail } from "./mailboxStore";
import {
  resolveEmailReplyTarget,
  resolveOutboundEmailTo,
  type ResolvedEmailReplyTarget,
} from "@shared/emailReplyTarget";
import {
  classifyWebsiteFormEmail,
  isWebsiteFormSourceMetadata,
  type WebsiteFormSourceMetadata,
} from "@shared/websiteFormEmail";
import { normalizeEmailAddress } from "@shared/emailChannel";

export type ConversationReplyResolution = {
  replyTarget: ResolvedEmailReplyTarget;
  formMeta: WebsiteFormSourceMetadata | null;
  notificationFromEmail: string | null;
  detailMessageId: string | null;
};

/** On-read classification when source_metadata was not persisted (historical messages). */
export function formMetaFromEmailDetail(detail: {
  subject?: string | null;
  textBody?: string | null;
  htmlBody?: string | null;
  fromAddress?: string | null;
  replyToAddress?: string | null;
  replyToName?: string | null;
  sourceType?: string | null;
  sourceMetadata?: unknown;
  selectedHeaders?: unknown;
} | null | undefined, mailboxEmail?: string | null): WebsiteFormSourceMetadata | null {
  if (!detail) return null;
  if (isWebsiteFormSourceMetadata(detail.sourceMetadata)) {
    return detail.sourceMetadata;
  }
  if (detail.sourceType === "website_form" && detail.sourceMetadata && typeof detail.sourceMetadata === "object") {
    const meta = detail.sourceMetadata as WebsiteFormSourceMetadata;
    if (meta.sourceType === "website_form") return meta;
  }
  return classifyWebsiteFormEmail({
    subject: detail.subject,
    textBody: detail.textBody,
    htmlBody: detail.htmlBody,
    from: detail.fromAddress
      ? { email: detail.fromAddress, name: null }
      : null,
    replyTo: detail.replyToAddress
      ? { email: detail.replyToAddress, name: detail.replyToName || null }
      : null,
    mailboxEmail: mailboxEmail || null,
    selectedHeaders:
      detail.selectedHeaders && typeof detail.selectedHeaders === "object"
        ? (detail.selectedHeaders as Record<string, string>)
        : null,
  });
}

export async function resolveConversationReplyTarget(params: {
  conversationId: string;
  mailboxEmail?: string | null;
  contactEmail?: string | null;
}): Promise<ConversationReplyResolution> {
  const msgs = await storage.getMessages(params.conversationId, 40);
  const inbound = [...msgs].reverse().find((m) => m.direction === "inbound");
  if (!inbound) {
    const fallback = resolveEmailReplyTarget({
      fromEmail: params.contactEmail,
      mailboxEmail: params.mailboxEmail,
    });
    return {
      replyTarget: fallback,
      formMeta: null,
      notificationFromEmail: null,
      detailMessageId: null,
    };
  }

  const detail = await getEmailMessageDetail(inbound.id);
  const formMeta = formMetaFromEmailDetail(detail, params.mailboxEmail);
  const replyTarget = resolveEmailReplyTarget({
    fromEmail: detail?.fromAddress || params.contactEmail,
    replyToEmail: detail?.replyToAddress || formMeta?.replyTargetEmail,
    replyToName: detail?.replyToName || formMeta?.replyTargetName,
    mailboxEmail: params.mailboxEmail,
  });

  return {
    replyTarget,
    formMeta,
    notificationFromEmail: detail?.fromAddress || formMeta?.notificationFromEmail || null,
    detailMessageId: inbound.id,
  };
}

export async function resolveOutboundToForContactSend(params: {
  conversationId?: string | null;
  mailboxEmail: string;
  contactEmail?: string | null;
  clientTo?: string[] | null;
}): Promise<{
  to: string[];
  source: string;
  blockedClientOverride: boolean;
  replyTarget: ResolvedEmailReplyTarget;
  formMeta: WebsiteFormSourceMetadata | null;
}> {
  let resolution: ConversationReplyResolution | null = null;
  if (params.conversationId) {
    resolution = await resolveConversationReplyTarget({
      conversationId: params.conversationId,
      mailboxEmail: params.mailboxEmail,
      contactEmail: params.contactEmail,
    });
  }

  const replyTarget =
    resolution?.replyTarget ||
    resolveEmailReplyTarget({
      fromEmail: params.contactEmail,
      mailboxEmail: params.mailboxEmail,
    });

  const outbound = resolveOutboundEmailTo({
    clientTo: params.clientTo,
    contactEmail: params.contactEmail,
    replyTarget,
    mailboxEmail: params.mailboxEmail,
    notificationFromEmail: resolution?.notificationFromEmail,
  });

  if (outbound.to.length === 0 && normalizeEmailAddress(params.contactEmail)) {
    return {
      to: [normalizeEmailAddress(params.contactEmail)!],
      source: "contact_fallback",
      blockedClientOverride: outbound.blockedClientOverride,
      replyTarget,
      formMeta: resolution?.formMeta || null,
    };
  }

  console.info(
    JSON.stringify({
      tag: "[EmailReplyTarget]",
      event: "outbound_to_resolved",
      source: outbound.source,
      blockedClientOverride: outbound.blockedClientOverride,
      replyTargetSource: replyTarget.source,
      toDomain: outbound.to[0]?.split("@")[1] || null,
      formClassified: Boolean(resolution?.formMeta),
    }),
  );

  return {
    ...outbound,
    replyTarget,
    formMeta: resolution?.formMeta || null,
  };
}
