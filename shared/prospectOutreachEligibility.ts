/**
 * Channel-agnostic prospect outreach eligibility resolver.
 * Distinguishes technically available / connected / policy eligible / bulk-enabled.
 * Pure helpers — callers supply connection & consent state.
 */

import { isValidProspectEmail, isValidProspectPhone } from "./prospectContactEnrichment";
import { normalizeOutreachStatus } from "./prospectOutreachLifecycle";
import {
  PROSPECT_BULK_SEND_ENABLED_CHANNELS,
  type ProspectChannelEligibility,
  type ProspectOutreachChannel,
  type ProspectOutreachEligibilityReason,
  type ProspectOutreachEligibilityResult,
  type ProspectOutreachPreferredChannel,
  normalizeRecipientIdentity,
} from "./prospectBulkOutreach";

export type ProspectOutreachEligibilityInput = {
  reviewStatus?: string | null;
  outreachStatus?: string | null;
  outreachSentAt?: string | Date | null;
  repliedAt?: string | Date | null;
  analysisStatus?: string | null;
  needsReview?: boolean | null;
  email?: string | null;
  phone?: string | null;
  whatsappId?: string | null;
  facebookId?: string | null;
  instagramId?: string | null;
  /** Connected mailbox available for email. */
  emailConnected?: boolean;
  /** Twilio / SMS provider connected. */
  smsConnected?: boolean;
  /** WhatsApp workspace connected. */
  whatsappConnected?: boolean;
  facebookConnected?: boolean;
  instagramConnected?: boolean;
  /** Existing Messenger / IG conversation eligible for reply window. */
  hasMessengerConversation?: boolean;
  hasInstagramConversation?: boolean;
  /** Explicit messaging consent for SMS/WhatsApp cold outreach. */
  smsConsent?: boolean;
  whatsappConsent?: boolean;
  suppressed?: boolean;
  optedOut?: boolean;
  /** Already has active/successful queue item for same channel+recipient. */
  alreadyQueued?: boolean;
  preferredChannel?: ProspectOutreachPreferredChannel;
  /** Channels allowed for bulk send this phase (defaults to production list). */
  bulkEnabledChannels?: readonly ProspectOutreachChannel[];
  /** When true, allow queue even if review not approved (rare; default false). */
  allowUnapproved?: boolean;
};

function channelResult(
  channel: ProspectOutreachChannel,
  partial: Omit<ProspectChannelEligibility, "channel">,
): ProspectChannelEligibility {
  return { channel, ...partial };
}

function emailEligibility(input: ProspectOutreachEligibilityInput): ProspectChannelEligibility {
  const hasEmail = isValidProspectEmail(input.email);
  const connected = Boolean(input.emailConnected);
  const bulkEnabled = (input.bulkEnabledChannels ?? PROSPECT_BULK_SEND_ENABLED_CHANNELS).includes(
    "email",
  );

  if (input.suppressed || input.optedOut) {
    return channelResult("email", {
      eligible: false,
      technicallyAvailable: hasEmail,
      connected,
      policyEligible: false,
      reason: input.suppressed ? "suppressed" : "opted_out",
    });
  }
  if (!hasEmail) {
    return channelResult("email", {
      eligible: false,
      technicallyAvailable: false,
      connected,
      policyEligible: false,
      reason: "missing_identity",
      detail: "missing_email",
    });
  }
  if (!connected) {
    return channelResult("email", {
      eligible: false,
      technicallyAvailable: true,
      connected: false,
      policyEligible: false,
      reason: "sender_not_connected",
    });
  }
  if (!bulkEnabled) {
    return channelResult("email", {
      eligible: false,
      technicallyAvailable: true,
      connected: true,
      policyEligible: true,
      reason: "not_enabled_for_bulk",
    });
  }
  return channelResult("email", {
    eligible: true,
    technicallyAvailable: true,
    connected: true,
    policyEligible: true,
    reason: "eligible",
  });
}

/**
 * Phone alone ≠ SMS eligible. Requires provider + consent hooks.
 * Cold SMS is not enabled for bulk in Phase 2.
 */
function smsEligibility(input: ProspectOutreachEligibilityInput): ProspectChannelEligibility {
  const hasPhone = isValidProspectPhone(input.phone);
  const connected = Boolean(input.smsConnected);
  const bulkEnabled = (input.bulkEnabledChannels ?? PROSPECT_BULK_SEND_ENABLED_CHANNELS).includes(
    "sms",
  );

  if (input.suppressed || input.optedOut) {
    return channelResult("sms", {
      eligible: false,
      technicallyAvailable: hasPhone,
      connected,
      policyEligible: false,
      reason: input.suppressed ? "suppressed" : "opted_out",
    });
  }
  if (!hasPhone) {
    return channelResult("sms", {
      eligible: false,
      technicallyAvailable: false,
      connected,
      policyEligible: false,
      reason: "missing_identity",
      detail: "missing_phone",
    });
  }
  if (!connected) {
    return channelResult("sms", {
      eligible: false,
      technicallyAvailable: true,
      connected: false,
      policyEligible: false,
      reason: "sender_not_connected",
    });
  }
  if (input.smsConsent !== true) {
    return channelResult("sms", {
      eligible: false,
      technicallyAvailable: true,
      connected: true,
      policyEligible: false,
      reason: "missing_consent",
      detail: "sms_consent_required",
    });
  }
  if (!bulkEnabled) {
    return channelResult("sms", {
      eligible: false,
      technicallyAvailable: true,
      connected: true,
      policyEligible: true,
      reason: "not_enabled_for_bulk",
    });
  }
  return channelResult("sms", {
    eligible: true,
    technicallyAvailable: true,
    connected: true,
    policyEligible: true,
    reason: "eligible",
  });
}

/**
 * WhatsApp number alone does NOT make cold WhatsApp eligible.
 * Requires connection, consent/opt-in, and bulk enablement (template path later).
 */
function whatsappEligibility(input: ProspectOutreachEligibilityInput): ProspectChannelEligibility {
  const hasIdentity = Boolean(
    String(input.whatsappId || "").trim() || isValidProspectPhone(input.phone),
  );
  const connected = Boolean(input.whatsappConnected);
  const bulkEnabled = (input.bulkEnabledChannels ?? PROSPECT_BULK_SEND_ENABLED_CHANNELS).includes(
    "whatsapp",
  );

  if (input.suppressed || input.optedOut) {
    return channelResult("whatsapp", {
      eligible: false,
      technicallyAvailable: hasIdentity,
      connected,
      policyEligible: false,
      reason: input.suppressed ? "suppressed" : "opted_out",
    });
  }
  if (!hasIdentity) {
    return channelResult("whatsapp", {
      eligible: false,
      technicallyAvailable: false,
      connected,
      policyEligible: false,
      reason: "missing_identity",
    });
  }
  if (!connected) {
    return channelResult("whatsapp", {
      eligible: false,
      technicallyAvailable: true,
      connected: false,
      policyEligible: false,
      reason: "sender_not_connected",
    });
  }
  if (input.whatsappConsent !== true) {
    return channelResult("whatsapp", {
      eligible: false,
      technicallyAvailable: true,
      connected: true,
      policyEligible: false,
      reason: "missing_consent",
      detail: "whatsapp_opt_in_required",
    });
  }
  // Cold bulk WhatsApp needs approved templates — not enabled in Phase 2.
  if (!bulkEnabled) {
    return channelResult("whatsapp", {
      eligible: false,
      technicallyAvailable: true,
      connected: true,
      policyEligible: false,
      reason: "template_required",
      detail: "cold_whatsapp_requires_approved_template",
    });
  }
  return channelResult("whatsapp", {
    eligible: true,
    technicallyAvailable: true,
    connected: true,
    policyEligible: true,
    reason: "eligible",
  });
}

/**
 * Messenger identity alone ≠ unrestricted bulk messaging.
 * Existing-conversation / reply-window only.
 */
function facebookEligibility(input: ProspectOutreachEligibilityInput): ProspectChannelEligibility {
  const hasIdentity = Boolean(String(input.facebookId || "").trim());
  const connected = Boolean(input.facebookConnected);
  const hasConv = Boolean(input.hasMessengerConversation);
  const bulkEnabled = (input.bulkEnabledChannels ?? PROSPECT_BULK_SEND_ENABLED_CHANNELS).includes(
    "facebook",
  );

  if (!hasIdentity) {
    return channelResult("facebook", {
      eligible: false,
      technicallyAvailable: false,
      connected,
      policyEligible: false,
      reason: "missing_identity",
    });
  }
  if (!connected) {
    return channelResult("facebook", {
      eligible: false,
      technicallyAvailable: true,
      connected: false,
      policyEligible: false,
      reason: "sender_not_connected",
    });
  }
  if (!hasConv) {
    return channelResult("facebook", {
      eligible: false,
      technicallyAvailable: true,
      connected: true,
      policyEligible: false,
      reason: "unsupported_for_cold_outreach",
      detail: "messenger_existing_conversation_only",
    });
  }
  if (!bulkEnabled) {
    return channelResult("facebook", {
      eligible: false,
      technicallyAvailable: true,
      connected: true,
      policyEligible: true,
      reason: "existing_conversation_only",
    });
  }
  return channelResult("facebook", {
    eligible: true,
    technicallyAvailable: true,
    connected: true,
    policyEligible: true,
    reason: "eligible",
  });
}

function instagramEligibility(input: ProspectOutreachEligibilityInput): ProspectChannelEligibility {
  const hasIdentity = Boolean(String(input.instagramId || "").trim());
  const connected = Boolean(input.instagramConnected);
  const hasConv = Boolean(input.hasInstagramConversation);
  const bulkEnabled = (input.bulkEnabledChannels ?? PROSPECT_BULK_SEND_ENABLED_CHANNELS).includes(
    "instagram",
  );

  if (!hasIdentity) {
    return channelResult("instagram", {
      eligible: false,
      technicallyAvailable: false,
      connected,
      policyEligible: false,
      reason: "missing_identity",
    });
  }
  if (!connected) {
    return channelResult("instagram", {
      eligible: false,
      technicallyAvailable: true,
      connected: false,
      policyEligible: false,
      reason: "sender_not_connected",
    });
  }
  if (!hasConv) {
    return channelResult("instagram", {
      eligible: false,
      technicallyAvailable: true,
      connected: true,
      policyEligible: false,
      reason: "unsupported_for_cold_outreach",
      detail: "instagram_existing_conversation_only",
    });
  }
  if (!bulkEnabled) {
    return channelResult("instagram", {
      eligible: false,
      technicallyAvailable: true,
      connected: true,
      policyEligible: true,
      reason: "existing_conversation_only",
    });
  }
  return channelResult("instagram", {
    eligible: true,
    technicallyAvailable: true,
    connected: true,
    policyEligible: true,
    reason: "eligible",
  });
}

function lifecycleGate(
  input: ProspectOutreachEligibilityInput,
): ProspectOutreachEligibilityReason | null {
  const outreach = normalizeOutreachStatus(input.outreachStatus, {
    outreachSentAt: input.outreachSentAt,
    repliedAt: input.repliedAt,
  });
  if (outreach === "replied") return "already_replied";
  if (outreach === "outreach_sent") return "already_outreach_sent";

  const analysis = String(input.analysisStatus || "").toLowerCase();
  if (analysis && analysis !== "completed" && analysis !== "needs_review") {
    return "analysis_incomplete";
  }

  const review = String(input.reviewStatus || "pending").toLowerCase();
  if (input.needsReview === true || review === "needs_review") return "needs_review";
  if (!input.allowUnapproved && review !== "approved") return "not_approved";

  if (input.alreadyQueued) return "duplicate_queued";
  if (input.suppressed) return "suppressed";
  if (input.optedOut) return "opted_out";
  return null;
}

const CHANNEL_PRIORITY: ProspectOutreachChannel[] = [
  "email",
  "sms",
  "whatsapp",
  "facebook",
  "instagram",
];

function pickChannel(
  channels: Record<ProspectOutreachChannel, ProspectChannelEligibility>,
  preferred: ProspectOutreachPreferredChannel,
): ProspectOutreachChannel | null {
  if (preferred !== "auto") {
    const ch = preferred as ProspectOutreachChannel;
    if (channels[ch]?.eligible) return ch;
    return null; // do not silently fall back to a prohibited channel
  }
  for (const ch of CHANNEL_PRIORITY) {
    if (channels[ch]?.eligible) return ch;
  }
  return null;
}

/**
 * Resolve per-channel eligibility and preferred selection for queueing / sending.
 */
export function resolveProspectOutreachEligibility(
  input: ProspectOutreachEligibilityInput,
): ProspectOutreachEligibilityResult {
  const channels: Record<ProspectOutreachChannel, ProspectChannelEligibility> = {
    email: emailEligibility(input),
    sms: smsEligibility(input),
    whatsapp: whatsappEligibility(input),
    facebook: facebookEligibility(input),
    instagram: instagramEligibility(input),
  };

  const gate = lifecycleGate(input);
  if (gate) {
    // Lifecycle / suppression blocks all channels for bulk queue.
    for (const ch of CHANNEL_PRIORITY) {
      channels[ch] = {
        ...channels[ch],
        eligible: false,
        reason: gate,
      };
    }
    return {
      channels,
      selectedChannel: null,
      anyEligible: false,
      summaryReason: gate,
    };
  }

  const preferred = input.preferredChannel || "auto";
  const selectedChannel = pickChannel(channels, preferred);
  return {
    channels,
    selectedChannel,
    anyEligible: selectedChannel != null,
    summaryReason: selectedChannel
      ? "eligible"
      : resolveNoChannelSummaryReason(channels, preferred),
  };
}

/**
 * When Auto/preferred selects nothing, surface the real channel rejection —
 * never mask sender_not_connected / missing_identity as not_enabled_for_bulk.
 */
function resolveNoChannelSummaryReason(
  channels: Record<ProspectOutreachChannel, ProspectChannelEligibility>,
  preferred: ProspectOutreachPreferredChannel,
): ProspectOutreachEligibilityReason {
  if (preferred !== "auto") {
    const ch = preferred as ProspectOutreachChannel;
    return channels[ch]?.reason || "not_enabled_for_bulk";
  }
  // Production bulk path is Email-first — prefer its concrete reason for Auto.
  const emailReason = channels.email?.reason;
  if (emailReason && emailReason !== "eligible") return emailReason;
  for (const ch of CHANNEL_PRIORITY) {
    const reason = channels[ch]?.reason;
    if (reason && reason !== "eligible" && reason !== "not_enabled_for_bulk") {
      return reason;
    }
  }
  return "not_enabled_for_bulk";
}

export function resolveRecipientForChannel(
  channel: ProspectOutreachChannel,
  input: { email?: string | null; phone?: string | null; whatsappId?: string | null },
): string | null {
  if (channel === "email") {
    return isValidProspectEmail(input.email)
      ? normalizeRecipientIdentity("email", input.email)
      : null;
  }
  if (channel === "sms") {
    return isValidProspectPhone(input.phone)
      ? normalizeRecipientIdentity("sms", input.phone)
      : null;
  }
  if (channel === "whatsapp") {
    const id = String(input.whatsappId || input.phone || "").trim();
    return id ? normalizeRecipientIdentity("whatsapp", id) : null;
  }
  return null;
}

/** Skip when already outreach_sent / replied unless force reanalyze requested. */
export function shouldSkipDefaultBulkReanalyze(input: {
  outreachStatus?: string | null;
  outreachSentAt?: string | Date | null;
  repliedAt?: string | Date | null;
  force?: boolean;
}): boolean {
  if (input.force) return false;
  const outreach = normalizeOutreachStatus(input.outreachStatus, input);
  return outreach === "outreach_sent" || outreach === "replied";
}
