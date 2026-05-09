/**
 * Retargeting / Campaigns list — unified CRM conversation + contact (no legacy `chats` row required).
 */
export type RetargetEligibleContactRow = {
  conversationId: string;
  contactId: string;
  name: string;
  avatar: string | null;
  whatsappPhone: string;
  channel: string;
  windowExpiresAt: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  daysSinceLastMessage: number;
};
