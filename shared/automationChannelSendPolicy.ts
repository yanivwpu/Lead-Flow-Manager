/**
 * Automation channel send policy for workflow / no-reply nurture.
 * Centralizes Meta reply-window decisions; does not invent Meta templates.
 */

import {
  computeConversationReplyWindowStatus,
  META_REPLY_WINDOW_CHANNELS,
  type MetaReplyWindowChannel,
} from "./conversationReplyWindow";

export type AutomationChannelSendDecision =
  | {
      decision: "free_form";
      freeFormActive: boolean;
      windowExpiresAt: Date | null;
      effectiveFreeFormDeadline: Date | null;
    }
  | {
      decision: "template";
      reason: "meta_window_closed_template_configured";
      freeFormActive: false;
      windowExpiresAt: Date | null;
      effectiveFreeFormDeadline: Date | null;
      whatsappTemplateName: string;
      whatsappTemplateLanguage?: string;
    }
  | {
      decision: "skip";
      reason: "meta_window_closed_template_required";
      freeFormActive: false;
      windowExpiresAt: Date | null;
      effectiveFreeFormDeadline: Date | null;
    };

export type AutomationChannelSendPolicyInput = {
  channel: string;
  windowExpiresAt: Date | string | null | undefined;
  now?: Date;
  /**
   * Optional approved WhatsApp (Meta) template mapping on the workflow action.
   * When free-form is closed and this is set, decision is `template`.
   * Do not invent names — only use explicitly configured values.
   */
  whatsappTemplateName?: string | null;
  whatsappTemplateLanguage?: string | null;
};

function isMetaChannel(channel: string): channel is MetaReplyWindowChannel {
  return (META_REPLY_WINDOW_CHANNELS as readonly string[]).includes(channel);
}

/**
 * Decide whether an automation free-form send is allowed, a configured Meta
 * template should be used, or the send must be skipped.
 *
 * Email / SMS / webchat / other non-Meta: always free_form.
 * WhatsApp / Instagram / Facebook: use computeConversationReplyWindowStatus
 * (WhatsApp includes the existing safety buffer; IG/FB do not).
 */
export function evaluateAutomationChannelSendPolicy(
  input: AutomationChannelSendPolicyInput,
): AutomationChannelSendDecision {
  const channel = String(input.channel || "").trim().toLowerCase();
  const window = computeConversationReplyWindowStatus({
    channel,
    windowExpiresAt: input.windowExpiresAt,
    now: input.now,
  });

  if (!window.hasRestriction || !isMetaChannel(channel)) {
    return {
      decision: "free_form",
      freeFormActive: true,
      windowExpiresAt: window.windowExpiresAt,
      effectiveFreeFormDeadline: window.effectiveFreeFormDeadline,
    };
  }

  if (window.freeFormActive) {
    return {
      decision: "free_form",
      freeFormActive: true,
      windowExpiresAt: window.windowExpiresAt,
      effectiveFreeFormDeadline: window.effectiveFreeFormDeadline,
    };
  }

  const tpl =
    typeof input.whatsappTemplateName === "string" ? input.whatsappTemplateName.trim() : "";
  // Template reopen is WhatsApp-oriented in product; IG/FB also skip free-form when closed.
  if (channel === "whatsapp" && tpl) {
    return {
      decision: "template",
      reason: "meta_window_closed_template_configured",
      freeFormActive: false,
      windowExpiresAt: window.windowExpiresAt,
      effectiveFreeFormDeadline: window.effectiveFreeFormDeadline,
      whatsappTemplateName: tpl,
      whatsappTemplateLanguage:
        typeof input.whatsappTemplateLanguage === "string" && input.whatsappTemplateLanguage.trim()
          ? input.whatsappTemplateLanguage.trim()
          : "en",
    };
  }

  return {
    decision: "skip",
    reason: "meta_window_closed_template_required",
    freeFormActive: false,
    windowExpiresAt: window.windowExpiresAt,
    effectiveFreeFormDeadline: window.effectiveFreeFormDeadline,
  };
}
