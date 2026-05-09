/**
 * Single source of truth for Meta-style conversation reply windows (WhatsApp CSW buffer,
 * Instagram/Facebook 24h windows) — used by inbox window-status API and retargeting eligibility.
 */

/** Channels where Meta enforces a messaging window (matches `/api/conversations/:id/window-status`). */
export const META_REPLY_WINDOW_CHANNELS = ["whatsapp", "instagram", "facebook"] as const;
export type MetaReplyWindowChannel = (typeof META_REPLY_WINDOW_CHANNELS)[number];

/** WhatsApp: free-form messaging ends 1h before `windowExpiresAt` (customer service window edge). */
export const WHATSAPP_FREE_FORM_BUFFER_MS = 60 * 60 * 1000;

export type ConversationReplyWindowComputation = {
  /** Channel participates in Meta window rules */
  hasRestriction: boolean;
  /** Agent may send free-form (non-template) messages within the computed deadline */
  freeFormActive: boolean;
  /** Same condition as inbox “Reply window expired” + template reopen path: restricted, window known, free-form closed */
  templateReopenEligible: boolean;
  windowExpiresAt: Date | null;
  /** Last instant free-form is allowed (after WhatsApp buffer); equals windowExpiresAt for IG/FB */
  effectiveFreeFormDeadline: Date | null;
  /** Hours until free-form closes; 0 when inactive */
  hoursRemainingFreeForm: number;
};

function parseWindowExpiry(raw: Date | string | null | undefined): Date | null {
  if (raw == null) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Aligns with `GET /api/conversations/:id/window-status` free-form / expiry semantics.
 */
export function computeConversationReplyWindowStatus(args: {
  channel: string;
  windowExpiresAt: Date | string | null | undefined;
  now?: Date;
}): ConversationReplyWindowComputation {
  const now = args.now ?? new Date();
  const channel = (args.channel || "").toLowerCase();
  const hasRestriction = (META_REPLY_WINDOW_CHANNELS as readonly string[]).includes(channel);

  if (!hasRestriction) {
    return {
      hasRestriction: false,
      freeFormActive: true,
      templateReopenEligible: false,
      windowExpiresAt: null,
      effectiveFreeFormDeadline: null,
      hoursRemainingFreeForm: Number.POSITIVE_INFINITY,
    };
  }

  const windowExpiresAt = parseWindowExpiry(args.windowExpiresAt);

  if (!windowExpiresAt) {
    return {
      hasRestriction: true,
      freeFormActive: false,
      templateReopenEligible: false,
      windowExpiresAt: null,
      effectiveFreeFormDeadline: null,
      hoursRemainingFreeForm: 0,
    };
  }

  let effectiveFreeFormDeadline: Date;
  if (channel === "whatsapp") {
    effectiveFreeFormDeadline = new Date(windowExpiresAt.getTime() - WHATSAPP_FREE_FORM_BUFFER_MS);
  } else {
    effectiveFreeFormDeadline = windowExpiresAt;
  }

  const freeFormActive = effectiveFreeFormDeadline > now;
  const msLeft = effectiveFreeFormDeadline.getTime() - now.getTime();
  const hoursRemainingFreeForm = Math.max(0, msLeft / (1000 * 60 * 60));

  const templateReopenEligible = hasRestriction && !freeFormActive;

  return {
    hasRestriction: true,
    freeFormActive,
    templateReopenEligible,
    windowExpiresAt,
    effectiveFreeFormDeadline,
    hoursRemainingFreeForm,
  };
}
