import { classifySellerIntent } from "@shared/sellerIntent";
import { normalizeBuyerPreferenceProfile } from "@shared/buyerPreferenceSchema";
import { hasVehicleContext, hasDirectPropertySearchEvidence } from "@shared/aiDomainEligibility";
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
        inventoryContactEligibility({rgeInstalled: true, inboundText: message.content})) return true;
  }
  return contactHistoryHasEvidence(contact, (text) => inventoryContactEligibility({
    rgeInstalled: true,
    inboundText: text,
  }));
}

async function contactHistoryHasEvidence(contact: Contact, accepts: (text: string) => boolean): Promise<boolean> {
  const bundle = await storage.getContactWithConversations(contact.id);
  for (const conversation of bundle?.conversations ?? []) {
    if (conversation.userId !== contact.userId) continue;
    // Search older pages too, retaining context across adjacent inbound turns and page boundaries.
    let newerTurns: string[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = await storage.getMessages(conversation.id, 100, offset);
      const turns = page.filter((m) => m.direction === "inbound").map((m) => m.content || "");
      if (turns.some(accepts)) return true;
      const adjacentTurns = [...turns, ...newerTurns];
      for (let i = 0; i < adjacentTurns.length; i++) {
        const coherentSearch = adjacentTurns.slice(i, i + 8).join(" ");
        if (hasDirectPropertySearchEvidence(coherentSearch) && accepts(coherentSearch)) return true;
      }
      newerTurns = adjacentTurns.slice(0, 7);
      if (page.length < 100) break;
    }
  }
  return false;
}

/** RGE workflows also serve sellers; inventory remains buyer-only. */
export async function isRgeContactEligible(contact: Contact): Promise<boolean> {
  if (await isInventoryContactEligible(contact, contact.buyerPreferenceProfile)) return true;
  return contactHistoryHasEvidence(contact, (text) =>
    !hasVehicleContext(text) && (
      (/\b(?:home|house|property|condo|apartment|real estate|cma|listing consultation)\b/i.test(text) &&
        classifySellerIntent({ inboundText: text }) != null) ||
      /\b(?:connect|refer|referral|introduce)\b.{0,60}\b(?:mortgage|lender|real estate|realtor|title company)\b/i.test(text)
    ));
}

/** Only automatic real-estate lead enrollment/nurture, not every workflow installed by RGE. */
export function requiresRgeContactIntent(workflow: { triggerConditions?: unknown; actions?: unknown }): boolean {
  const conditions = workflow.triggerConditions as { templateId?: string; templateKey?: string } | null;
  if (conditions?.templateId !== "realtor-growth-engine") return false;
  return ["W1", "W4", "W5", "W6"].includes(conditions.templateKey || "") ||
    (Array.isArray(workflow.actions) && workflow.actions.some((action) =>
      action.type === "send_message_template" && action.templateKey === "re_engagement"));
}

export function requiresBuyerPropertyIntent(workflow: { triggerConditions?: unknown; actions?: unknown }): boolean {
  if ((workflow.triggerConditions as { templateId?: string } | null)?.templateId !== "realtor-growth-engine") return false;
  return Array.isArray(workflow.actions) && workflow.actions.some((action) =>
    action.type === "send_message_template" && action.templateKey === "re_engagement");
}
