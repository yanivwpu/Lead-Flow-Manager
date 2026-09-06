/**
 * Webchat post-inbound CRM workflow dispatch (new_chat + keyword) — same tenant only.
 */

import type { Contact, Conversation } from "@shared/schema";
import { detectHighConfidenceBookingIntent } from "@shared/bookingIntent";
import {
  dispatchInboundMessagingAutomation,
  resolveLegacyChatForContact,
} from "./automationEventDispatcher";

export async function dispatchWebchatInboundWorkflows(params: {
  userId: string;
  contact: Contact;
  conversation: Conversation;
  messageBody: string;
  isNewConversation: boolean;
  chatbotWillFire: boolean;
}): Promise<void> {
  if (params.contact.userId !== params.userId) return;
  if (params.conversation.userId !== params.userId) return;
  const bookingIntent = detectHighConfidenceBookingIntent(params.messageBody);
  const updatedChat = await resolveLegacyChatForContact(params.contact, params.userId);
  if (!updatedChat || updatedChat.userId !== params.userId) return;
  await dispatchInboundMessagingAutomation({
    userId: params.userId,
    isNewChat: params.isNewConversation,
    updatedChat,
    messageBody: params.messageBody,
    contact: params.contact,
    conversationId: params.conversation.id,
    skipKeywordWorkflows: params.chatbotWillFire && !bookingIntent,
  });
}
