/**
 * Preset campaign enrollment — channel compatibility and user-facing block reasons.
 * Shared by server routes and Inbox UI.
 */

import { CHANNEL_INFO, type Channel } from "./schema";

export type CampaignContactLike = {
  phone?: string | null;
  whatsappId?: string | null;
  instagramId?: string | null;
  facebookId?: string | null;
  telegramId?: string | null;
  primaryChannel?: string | null;
  lastIncomingChannel?: string | null;
  source?: string | null;
  tag?: string | null;
  customFields?: unknown;
};

export type PresetCampaignLike = {
  channel?: string | null;
  status?: string | null;
  messages?: unknown;
  name?: string | null;
};

export type CampaignEnrollBlockCode =
  | "campaign_draft"
  | "campaign_paused"
  | "campaign_completed"
  | "campaign_inactive"
  | "channel_mismatch"
  | "missing_contact_channel_id"
  | "channel_not_connected"
  | "no_campaign_steps"
  | "already_enrolled"
  | "contact_opt_out";

export type CampaignEnrollEligibility = {
  eligible: boolean;
  code?: CampaignEnrollBlockCode;
  /** Short UI string, e.g. "Cannot enroll: campaign requires WhatsApp" */
  userMessage?: string;
};

const MESSAGING_CHANNELS = new Set<string>([
  "whatsapp",
  "instagram",
  "facebook",
  "sms",
  "webchat",
  "telegram",
]);

function normChannel(value?: string | null): Channel | null {
  const v = (value || "").trim().toLowerCase();
  if (!v || !(v in CHANNEL_INFO)) return null;
  return v as Channel;
}

export function campaignChannelLabel(channel?: string | null): string {
  const ch = normChannel(channel || "whatsapp") || "whatsapp";
  return CHANNEL_INFO[ch]?.label || ch;
}

/** Best outreach channel for this Inbox thread / contact. */
export function inferContactConversationChannel(
  contact: CampaignContactLike,
  conversationChannel?: string | null,
): Channel | null {
  const fromConversation = normChannel(conversationChannel);
  if (fromConversation && MESSAGING_CHANNELS.has(fromConversation)) {
    return fromConversation;
  }

  const fromContact =
    normChannel(contact.lastIncomingChannel) || normChannel(contact.primaryChannel);
  if (fromContact && MESSAGING_CHANNELS.has(fromContact)) {
    return fromContact;
  }

  if (contact.instagramId) return "instagram";
  if (contact.facebookId) return "facebook";
  if (contact.telegramId) return "telegram";
  if (contact.phone || contact.whatsappId) return "whatsapp";
  if (
    contact.lastIncomingChannel === "webchat" ||
    contact.primaryChannel === "webchat" ||
    contact.source === "webchat"
  ) {
    return "webchat";
  }

  return null;
}

export function contactHasChannelIdentifier(
  contact: CampaignContactLike,
  channel: Channel,
): boolean {
  if (channel === "whatsapp") return !!(contact.phone || contact.whatsappId);
  if (channel === "instagram") return !!contact.instagramId;
  if (channel === "facebook") return !!contact.facebookId;
  if (channel === "sms") return !!contact.phone;
  if (channel === "telegram") return !!contact.telegramId;
  if (channel === "webchat") {
    return (
      contact.lastIncomingChannel === "webchat" ||
      contact.primaryChannel === "webchat" ||
      contact.source === "webchat"
    );
  }
  return false;
}

function campaignStatusBlocksEnroll(status?: string | null): CampaignEnrollEligibility | null {
  switch ((status || "draft").toLowerCase()) {
    case "draft":
      return {
        eligible: false,
        code: "campaign_draft",
        userMessage: "Cannot enroll: campaign is Draft",
      };
    case "paused":
      return {
        eligible: false,
        code: "campaign_paused",
        userMessage: "Cannot enroll: campaign is Paused",
      };
    case "completed":
      return {
        eligible: false,
        code: "campaign_completed",
        userMessage: "Cannot enroll: campaign is Completed",
      };
    case "active":
    case "active_pending":
      return null;
    default:
      return {
        eligible: false,
        code: "campaign_inactive",
        userMessage: `Cannot enroll: campaign is ${status || "inactive"}`,
      };
  }
}

export function evaluatePresetCampaignEnrollability(params: {
  contact: CampaignContactLike;
  campaign: PresetCampaignLike;
  /** Channel of the open Inbox conversation — drives compatibility filtering */
  conversationChannel?: string | null;
  /** When false, enrollment will fail at send time (Integrations not connected) */
  channelConnected?: boolean;
  alreadyEnrolled?: boolean;
  contactOptOut?: boolean;
  optOutReason?: string;
}): CampaignEnrollEligibility {
  const { contact, campaign } = params;

  if (params.contactOptOut) {
    return {
      eligible: false,
      code: "contact_opt_out",
      userMessage: params.optOutReason || "Cannot enroll: contact opted out",
    };
  }

  if (params.alreadyEnrolled) {
    return {
      eligible: false,
      code: "already_enrolled",
      userMessage: "Already enrolled in this campaign",
    };
  }

  const statusBlock = campaignStatusBlocksEnroll(campaign.status);
  if (statusBlock) return statusBlock;

  const messages = Array.isArray(campaign.messages) ? campaign.messages : [];
  if (messages.length === 0) {
    return {
      eligible: false,
      code: "no_campaign_steps",
      userMessage: "Cannot enroll: campaign has no steps",
    };
  }

  const campaignChannel = normChannel(campaign.channel || "whatsapp") || "whatsapp";
  const contactChannel = inferContactConversationChannel(contact, params.conversationChannel);

  if (contactChannel && campaignChannel !== contactChannel) {
    return {
      eligible: false,
      code: "channel_mismatch",
      userMessage: `Cannot enroll: campaign requires ${campaignChannelLabel(campaignChannel)}`,
    };
  }

  if (!contactHasChannelIdentifier(contact, campaignChannel)) {
    return {
      eligible: false,
      code: "missing_contact_channel_id",
      userMessage: `Cannot enroll: contact has no ${campaignChannelLabel(campaignChannel)} ID`,
    };
  }

  if (params.channelConnected === false) {
    return {
      eligible: false,
      code: "channel_not_connected",
      userMessage: `Cannot enroll: ${campaignChannelLabel(campaignChannel)} is not connected`,
    };
  }

  return { eligible: true };
}

/** Human-readable enrollment card subtitle. */
export function formatCampaignEnrollmentSubtitle(input: {
  status: string;
  currentStepIndex: number;
  totalSteps?: number | null;
  failureReason?: string | null;
  campaignStatus?: string | null;
}): string {
  const total = typeof input.totalSteps === "number" ? input.totalSteps : 0;
  const idx = input.currentStepIndex;
  const humanStep =
    total > 0 ? Math.min(Math.max(0, idx) + 1, total) : Math.max(1, idx + 1);

  switch (input.status) {
    case "active":
      return total > 0 ? `Active · Step ${humanStep} of ${total}` : "Active";
    case "paused":
      return total > 0 ? `Paused · Step ${humanStep} of ${total}` : "Paused";
    case "failed": {
      const reason = shortenEnrollmentFailureReason(input.failureReason);
      if (reason) return reason;
      return "Failed · needs review";
    }
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return input.status;
  }
}

/** Map provider / step errors to short Inbox copy. */
export function shortenEnrollmentFailureReason(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  const lower = t.toLowerCase();

  if (/reply window|24.?hour|outside the.*window/i.test(t)) {
    return "Cannot send: outside reply window";
  }
  if (/not connected|connect it under integrations/i.test(t)) {
    return "Cannot send: channel not connected";
  }
  if (/no phone|no instagram|no whatsapp|identifier/i.test(t)) {
    return "Cannot send: missing contact channel ID";
  }
  if (/template/i.test(lower) && /window|required/i.test(lower)) {
    return "Cannot send: WhatsApp template required";
  }
  if (/automation send blocked|opt.?out|duplicate/i.test(lower)) {
    return `Cannot send: ${t.slice(0, 80)}`;
  }

  if (t.length <= 72) return `Cannot send: ${t}`;
  return `Cannot send: ${t.slice(0, 69)}…`;
}

export function sortCampaignsForContact<T extends PresetCampaignLike & { id: string }>(
  campaigns: T[],
  contact: CampaignContactLike,
  conversationChannel?: string | null,
): T[] {
  const contactChannel = inferContactConversationChannel(contact, conversationChannel);
  return [...campaigns].sort((a, b) => {
    const aMatch =
      !contactChannel ||
      (normChannel(a.channel || "whatsapp") || "whatsapp") === contactChannel;
    const bMatch =
      !contactChannel ||
      (normChannel(b.channel || "whatsapp") || "whatsapp") === contactChannel;
    if (aMatch !== bMatch) return aMatch ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "");
  });
}
