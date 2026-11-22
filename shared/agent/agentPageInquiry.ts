import { AGENT_PAGE_FORM_ACCOUNT } from "./agentPageSchema";

export const AGENT_INQUIRY_PHONE_ERROR = "Enter a valid phone number, including the country code for international numbers.";

export function validatedAgentInquiryPhone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const phone = value.trim();
  if (!phone || phone.length > 40) return undefined;
  const grouped = phone.replace(/\(([0-9]{1,6})\)/g, "$1");
  const hasPlus = grouped.startsWith("+");
  const nationalOrInternational = hasPlus ? grouped.slice(1) : grouped;
  if (!/^[0-9]/.test(nationalOrInternational) || !/[0-9]$/.test(nationalOrInternational) ||
      /[^0-9 .-]/.test(nationalOrInternational)) return undefined;
  let digits = nationalOrInternational.replace(/\D/g, "");
  const hasInternationalPrefix = !hasPlus && digits.startsWith("00");
  if (hasInternationalPrefix) digits = digits.slice(2);
  if ((hasPlus || hasInternationalPrefix) && digits.startsWith("0")) return undefined;
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length >= 7 && digits.length <= 15 ? digits : undefined;
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
