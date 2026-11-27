import type { TFunction } from "i18next";

/**
 * Conversation status (Open / Pending / Resolved / Closed) — text-only styling.
 * Shared by inbox header and CRM status select for Stripe-style consistency.
 */
export const CONVERSATION_STATUS_ROWS = [
  { value: "open" as const, textClass: "text-gray-800" },
  { value: "pending" as const, textClass: "text-amber-700/90" },
  { value: "resolved" as const, textClass: "text-blue-600/90" },
  { value: "closed" as const, textClass: "text-gray-500" },
] as const;

export type ConversationStatusValue = (typeof CONVERSATION_STATUS_ROWS)[number]["value"];

export function getConversationStatusRow(status: string | undefined) {
  return CONVERSATION_STATUS_ROWS.find((s) => s.value === status) ?? CONVERSATION_STATUS_ROWS[0];
}

export function conversationStatusLabel(t: TFunction, status: ConversationStatusValue) {
  switch (status) {
    case "open": return t("inboxUi.conversationOpen");
    case "pending": return t("inboxUi.conversationPending");
    case "resolved": return t("inboxUi.conversationResolved");
    case "closed": return t("inboxUi.conversationClosed");
  }
}
