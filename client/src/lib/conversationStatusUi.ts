/**
 * Conversation status (Open / Pending / Resolved / Closed) — text-only styling.
 * Shared by inbox header and CRM status select for Stripe-style consistency.
 */
export const CONVERSATION_STATUS_ROWS = [
  { value: "open" as const, label: "Open", textClass: "text-gray-800" },
  { value: "pending" as const, label: "Pending", textClass: "text-amber-700/90" },
  { value: "resolved" as const, label: "Resolved", textClass: "text-blue-600/90" },
  { value: "closed" as const, label: "Closed", textClass: "text-gray-500" },
] as const;

export type ConversationStatusValue = (typeof CONVERSATION_STATUS_ROWS)[number]["value"];

export function getConversationStatusRow(status: string | undefined) {
  return CONVERSATION_STATUS_ROWS.find((s) => s.value === status) ?? CONVERSATION_STATUS_ROWS[0];
}
