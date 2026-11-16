import { classifySellerIntent } from "@shared/sellerIntent";
import { normalizeBuyerPreferenceProfile } from "@shared/buyerPreferenceSchema";
import { hasStrongRealEstateLeadEvidence, hasVehicleContext } from "@shared/aiDomainEligibility";
import type { Contact } from "@shared/schema";
import { hasConfirmedBuyerEnrollment, inventoryContactEligibility } from "@shared/inventoryContactEligibility";
import { storage } from "../storage";

/** Caller must establish tenant ownership before loading conversation evidence. */
export async function isInventoryContactEligible(contact: Contact, profile?: unknown): Promise<boolean> {
  if (hasConfirmedBuyerEnrollment(profile ?? contact.buyerPreferenceProfile)) return true;
  // Older genuine buyer messages may fall outside the recent history window.
  // Resolve saved references to actual inbound messages; never trust extracted evidence text.
  const saved = normalizeBuyerPreferenceProfile(profile ?? contact.buyerPreferenceProfile);
  const messageIds = new Set(Object.values(saved).flatMap((field) =>
    field && typeof field === "object" && "messageId" in field && typeof field.messageId === "string" ? [field.messageId] : [],
  ));
  for (const messageId of messageIds) {
    const message = await storage.getMessage(messageId);
    if (!message || message.direction !== "inbound") continue;
    const conversation = await storage.getConversation(message.conversationId);
    if (conversation?.contactId === contact.id && conversation.userId === contact.userId &&
        hasStrongRealEstateLeadEvidence(message.content)) return true;
  }
  const bundle = await storage.getContactWithConversations(contact.id);
  const conversations = bundle?.conversations ?? [];
  const histories = await Promise.all(conversations.map(async (conversation) => {
    if (conversation.userId !== contact.userId) return [];
    return (await storage.getMessages(conversation.id, 100))
      .filter((message) => message.direction === "inbound")
      .map((message) => message.content || "");
  }));
  return inventoryContactEligibility({
    rgeInstalled: true, // capability is checked separately by each entry point
    conversationText: histories.flat().join("\n"),
    buyerPreferenceProfile: profile,
  });
}

/** RGE workflows also serve sellers; inventory remains buyer-only. */
export async function isRgeContactEligible(contact: Contact): Promise<boolean> {
  if (await isInventoryContactEligible(contact, contact.buyerPreferenceProfile)) return true;
  const bundle = await storage.getContactWithConversations(contact.id);
  for (const conversation of bundle?.conversations ?? []) {
    if (conversation.userId !== contact.userId) continue;
    const messages = await storage.getMessages(conversation.id, 100);
    if (messages.some((m) => m.direction === "inbound" &&
      !hasVehicleContext(m.content || "") &&
      /\b(?:home|house|property|condo|apartment|real estate|cma|listing consultation)\b/i.test(m.content || "") &&
      classifySellerIntent({ inboundText: m.content || "" }) != null)) return true;
  }
  return false;
}

export function isRgeWorkflow(workflow: { triggerConditions?: unknown }): boolean {
  const conditions = workflow.triggerConditions as { templateId?: string } | null;
  return conditions?.templateId === "realtor-growth-engine";
}
