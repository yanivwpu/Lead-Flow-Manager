import { AGENT_PAGE_FORM_ACCOUNT } from "./agentPageSchema";
import { isValidIdentityPhone } from "../webchatIdentityFields";

export function validatedAgentInquiryPhone(value: unknown): string | undefined {
  const digits = isValidIdentityPhone(value)?.replace(/\D/g, "");
  return digits && digits.length >= 7 && digits.length <= 15 ? digits : undefined;
}

export function isAgentInquiryThread(conversation: { channel?: string | null; channelAccountId?: string | null } | null | undefined): boolean {
  return conversation?.channel === "webchat" && conversation.channelAccountId === AGENT_PAGE_FORM_ACCOUNT;
}

export function agentInquiryLabel(contact: { sourceDetails?: unknown } | undefined): string | undefined {
  const details = contact?.sourceDetails as { agentPageForm?: boolean; leadSource?: unknown } | undefined;
  if (details?.agentPageForm !== true) return undefined;
  const source = details.leadSource;
  if (source === "MLS Property Listing") return "MLS Property Inquiry";
  if (typeof source === "string" && source.startsWith("Agent Page · ")) {
    return `Neighborhood Inquiry · ${source.slice("Agent Page · ".length)}`;
  }
  return "Agent Page Inquiry";
}

export function agentInquiryRecommendation(contact: {
  sourceDetails?: unknown; followUp?: string | null; followUpDate?: string | Date | null;
}): string | undefined {
  const details = contact.sourceDetails as { agentPageForm?: boolean; rgeNewLeadReviewRecommended?: unknown } | undefined;
  const title = details?.rgeNewLeadReviewRecommended;
  return details?.agentPageForm === true && !contact.followUp?.trim() && !contact.followUpDate && typeof title === "string"
    ? title : undefined;
}
