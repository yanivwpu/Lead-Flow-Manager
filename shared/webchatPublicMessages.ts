/**
 * Public widget poll payload: machine-readable, no tenant secrets.
 * Stored media URLs are never passed through; visitors receive signed proxy URLs only.
 */

import { isWebchatDeliverableMediaContentType, isWebchatDocumentContentType } from "./webchatDocumentPolicy";
import {
  sanitizeWebchatFormDefinition,
  WEBCHAT_FORM_PUBLIC_SUBMITTED_CONTENT,
} from "./webchatStructuredForm";

export type PublicWebchatMessage = {
  id: string;
  direction: "inbound" | "outbound";
  content: string | null;
  contentType: string;
  mediaUrl: string | null;
  mediaFilename: string | null;
  createdAt: string | Date | null;
  status: string | null;
  templateVariables: { chatbotButtons?: unknown; webchatForm?: unknown } | null;
};

export type PublicWebchatMessageSource = {
  id: string;
  direction: string | null;
  content?: string | null;
  contentType?: string | null;
  mediaUrl?: string | null;
  mediaFilename?: string | null;
  createdAt?: string | Date | null;
  status?: string | null;
  templateVariables?: {
    chatbotButtons?: unknown;
    webchatForm?: unknown;
    webchatFormSubmission?: unknown;
  } | null;
  userId?: unknown;
  contactId?: unknown;
  conversationId?: unknown;
  generatedBy?: unknown;
  generationMeta?: unknown;
  errorMessage?: unknown;
  errorCode?: unknown;
  externalMessageId?: unknown;
  sentByUserId?: unknown;
};

export type PublicWebchatMediaUrlRewriter = (
  message: PublicWebchatMessageSource,
) => string | null | undefined;

function isPublicDirection(value: unknown): value is "inbound" | "outbound" {
  return value === "inbound" || value === "outbound";
}

function safePublicMediaFilename(
  contentType: string,
  filename: string | null | undefined,
): string | null {
  if (!isWebchatDocumentContentType(contentType)) return null;
  const raw = String(filename || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop() || "";
  const safe = raw.replace(/[^\w\u0590-\u05FF\u00C0-\u024F .-]/g, "_").trim().slice(0, 120);
  return safe || "document.pdf";
}

/** Failed outbound is inbox-only; visitors never see undelivered agent/system rows. */
export function isPublicWebchatMessageVisible(message: PublicWebchatMessageSource): boolean {
  if (!isPublicDirection(message.direction)) return false;
  return message.direction !== "outbound" || message.status !== "failed";
}

export function toPublicWebchatMessage(
  message: PublicWebchatMessageSource,
  rewriteMediaUrl?: PublicWebchatMediaUrlRewriter,
): PublicWebchatMessage | null {
  if (!isPublicWebchatMessageVisible(message)) return null;
  const contentType = message.contentType || "text";
  const buttons = message.templateVariables?.chatbotButtons;
  const form = sanitizeWebchatFormDefinition(message.templateVariables?.webchatForm);
  let mediaUrl: string | null = null;
  if (isWebchatDeliverableMediaContentType(contentType) && rewriteMediaUrl) {
    const rewritten = rewriteMediaUrl(message);
    mediaUrl = typeof rewritten === "string" && rewritten.trim() ? rewritten.trim() : null;
  }
  const isFormResult = contentType === "form_result";
  const templateVariables =
    Array.isArray(buttons) || form
      ? {
          ...(Array.isArray(buttons) ? { chatbotButtons: buttons } : {}),
          ...(form ? { webchatForm: form } : {}),
        }
      : null;
  return {
    id: message.id,
    direction: message.direction as "inbound" | "outbound",
    content: isFormResult ? WEBCHAT_FORM_PUBLIC_SUBMITTED_CONTENT : message.content ?? null,
    contentType,
    mediaUrl,
    mediaFilename: safePublicMediaFilename(contentType, message.mediaFilename),
    createdAt: message.createdAt ?? null,
    status: message.status ?? null,
    templateVariables,
  };
}

export function toPublicWebchatMessages(
  messages: PublicWebchatMessageSource[],
  rewriteMediaUrl?: PublicWebchatMediaUrlRewriter,
): PublicWebchatMessage[] {
  const out: PublicWebchatMessage[] = [];
  for (const message of messages) {
    const mapped = toPublicWebchatMessage(message, rewriteMediaUrl);
    if (mapped) out.push(mapped);
  }
  return out;
}
