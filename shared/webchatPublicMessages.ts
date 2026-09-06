/**
 * Public widget poll payload: machine-readable, no tenant secrets.
 */

export type PublicWebchatMessage = {
  id: string;
  direction: "inbound" | "outbound";
  content: string | null;
  contentType: string;
  mediaUrl: string | null;
  createdAt: string | Date | null;
  status: string | null;
  templateVariables: { chatbotButtons?: unknown } | null;
};

export type PublicWebchatMessageSource = {
  id: string;
  direction: string | null;
  content?: string | null;
  contentType?: string | null;
  mediaUrl?: string | null;
  createdAt?: string | Date | null;
  status?: string | null;
  templateVariables?: { chatbotButtons?: unknown } | null;
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

function isPublicDirection(value: unknown): value is "inbound" | "outbound" {
  return value === "inbound" || value === "outbound";
}

/** Failed outbound is inbox-only; visitors never see undelivered agent/system rows. */
export function isPublicWebchatMessageVisible(message: PublicWebchatMessageSource): boolean {
  if (!isPublicDirection(message.direction)) return false;
  return message.direction !== "outbound" || message.status !== "failed";
}

export function toPublicWebchatMessage(message: PublicWebchatMessageSource): PublicWebchatMessage | null {
  if (!isPublicWebchatMessageVisible(message)) return null;
  const buttons = message.templateVariables?.chatbotButtons;
  return {
    id: message.id,
    direction: message.direction,
    content: message.content ?? null,
    contentType: message.contentType || "text",
    mediaUrl: message.mediaUrl ?? null,
    createdAt: message.createdAt ?? null,
    status: message.status ?? null,
    templateVariables: Array.isArray(buttons) ? { chatbotButtons: buttons } : null,
  };
}

export function toPublicWebchatMessages(messages: PublicWebchatMessageSource[]): PublicWebchatMessage[] {
  const out: PublicWebchatMessage[] = [];
  for (const message of messages) {
    const mapped = toPublicWebchatMessage(message);
    if (mapped) out.push(mapped);
  }
  return out;
}
