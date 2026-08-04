/**
 * Classify inbound email as website form + safe diagnostics (no body logging).
 */

import type { NormalizedEmailMessage } from "@shared/emailChannel";
import {
  classifyWebsiteFormEmail,
  formatWebsiteFormAiContext,
  formatWebsiteFormInboxPreview,
  type WebsiteFormSourceMetadata,
} from "@shared/websiteFormEmail";
import { resolveEmailReplyTarget } from "@shared/emailReplyTarget";

export function classifyNormalizedInboundEmail(params: {
  normalized: NormalizedEmailMessage;
  mailboxEmail: string;
}): {
  formMeta: WebsiteFormSourceMetadata | null;
  replyTarget: ReturnType<typeof resolveEmailReplyTarget>;
} {
  const { normalized, mailboxEmail } = params;
  const replyTarget = resolveEmailReplyTarget({
    fromEmail: normalized.from.email,
    fromName: normalized.from.name,
    replyToEmail: normalized.replyTo?.email,
    replyToName: normalized.replyTo?.name,
    mailboxEmail,
  });

  if (normalized.direction !== "inbound") {
    return { formMeta: null, replyTarget };
  }

  const formMeta = classifyWebsiteFormEmail({
    subject: normalized.subject,
    textBody: normalized.textBody,
    htmlBody: normalized.htmlBody,
    from: normalized.from,
    replyTo: normalized.replyTo,
    mailboxEmail,
    selectedHeaders: normalized.selectedHeaders,
  });

  return { formMeta, replyTarget };
}

export function logWebsiteFormClassification(params: {
  workspaceUserId: string;
  formMeta: WebsiteFormSourceMetadata | null;
  replyTarget: ReturnType<typeof resolveEmailReplyTarget>;
  contactId?: string | null;
  contactDecision?: string | null;
}) {
  console.info(
    JSON.stringify({
      tag: "[WebsiteFormEmail]",
      event: "classify",
      workspaceUserId: params.workspaceUserId,
      classified: Boolean(params.formMeta),
      confidence: params.formMeta?.classificationConfidence ?? null,
      signals: params.formMeta?.classificationSignals ?? [],
      replyTargetSource: params.replyTarget.source,
      replyTargetDomain: params.replyTarget.email?.split("@")[1] || null,
      visitorEmailDomain: params.formMeta?.visitorEmail?.split("@")[1] || null,
      hasVisitorName: Boolean(params.formMeta?.visitorName),
      hasVisitorMessage: Boolean(params.formMeta?.visitorMessage),
      contactId: params.contactId ?? null,
      contactDecision: params.contactDecision ?? null,
      // Never log body / full addresses of visitors in production logs beyond domain.
    }),
  );
}

export function messageContentForInbound(params: {
  formMeta: WebsiteFormSourceMetadata | null;
  fallbackText: string;
}): string {
  if (!params.formMeta) return params.fallbackText;
  // Prefer AI-friendly natural text; raw body remains on email_message_details.
  return formatWebsiteFormAiContext(params.formMeta);
}

export function conversationPreviewForInbound(params: {
  formMeta: WebsiteFormSourceMetadata | null;
  fallback: string;
}): string {
  if (!params.formMeta) return params.fallback.slice(0, 100);
  return formatWebsiteFormInboxPreview(params.formMeta);
}
