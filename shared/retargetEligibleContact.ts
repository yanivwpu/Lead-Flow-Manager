/**
 * Re-engagement list — unified CRM `conversations` + `contacts` (no legacy `chats` row required).
 * WhatsApp, Messenger (`facebook`), Instagram DM (`instagram`).
 */
export type RetargetEligibleContactRow = {
  conversationId: string;
  contactId: string;
  name: string;
  avatar: string | null;
  channel: string;
  /** Channel-specific identifier for display (phone, PSID, IG user id, etc.). */
  displayHandle: string;
  /** Set for WhatsApp rows — same as `displayHandle` when channel is whatsapp (template/aux APIs). */
  whatsappPhone: string;
  windowExpiresAt: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  daysSinceLastMessage: number;
};
