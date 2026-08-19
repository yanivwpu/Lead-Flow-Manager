/**
 * Paid automation execution policy.
 * Data/config is retained; execution is re-checked at send time.
 */

export const ENTITLEMENT_SKIP_DEFER_MS = 6 * 60 * 60 * 1000;

export const ENTITLEMENT_BLOCKED_REASON = "entitlement_blocked";

export type PaidAutomationFeature =
  | "campaign"
  | "drip"
  | "workflow"
  | "chatbot"
  | "flow_job"
  | "no_reply_job"
  | "timer_job"
  | "prospect_outreach"
  | "follow_up"
  | "whatsapp_extra";

export type QueuedJobEntitlementAction =
  | "execute"
  | "defer_keep_active"
  | "skip_terminal"
  | "pause_queue_keep_items";

/**
 * Campaigns / drips: defer nextRun without advancing the step.
 * On upgrade, the current unsent step runs once — no backlog blast of missed steps.
 *
 * Flow / no-reply / timer jobs: skip-terminal (do not fire a stale delay later).
 * Underlying workflow/flow rows stay stored; new events after upgrade can run.
 *
 * Prospect outreach: pause workspace queue settings; leave queued rows intact.
 * Resume is explicit so upgrade does not dump the queue.
 */
export function queuedJobEntitlementAction(
  feature: PaidAutomationFeature,
  entitled: boolean,
): QueuedJobEntitlementAction {
  if (entitled) return "execute";
  switch (feature) {
    case "campaign":
    case "drip":
    case "follow_up":
      return "defer_keep_active";
    case "prospect_outreach":
      return "pause_queue_keep_items";
    default:
      return "skip_terminal";
  }
}

export function nextEntitlementDeferAt(now = new Date()): Date {
  return new Date(now.getTime() + ENTITLEMENT_SKIP_DEFER_MS);
}

export function paidAutomationAllowedFromLimits(
  limits: { workflowsEnabled?: boolean } | null | undefined,
): boolean {
  return !!limits?.workflowsEnabled;
}

export function chatbotExecutionAllowedFromLimits(
  limits: { chatbotEnabled?: boolean } | null | undefined,
): boolean {
  return !!limits?.chatbotEnabled;
}

export function followUpsAllowedFromLimits(
  limits: { followUpsEnabled?: boolean } | null | undefined,
): boolean {
  return !!limits?.followUpsEnabled;
}

/** Workspace owner is the Free seat. Extra memberships are retained, not deleted. */
export const FREE_PLAN_TEAM_SEAT_POLICY = {
  retainedSeat: "workspace_owner" as const,
  extraMembers: "retain_membership_do_not_delete" as const,
  extraMemberAccessWhileFree: "not_enforced_pending_member_session_model" as const,
};

/**
 * Canonical primary WhatsApp is users.twilioWhatsappNumber (Twilio) or
 * users.metaPhoneNumberId (Meta). Extra registered_phones stay stored.
 * When maxWhatsappNumbers is 1, extras are entitlement-inactive for outbound.
 */
export function extraWhatsAppOutboundAllowed(params: {
  maxWhatsappNumbers: number;
  isPrimaryNumber: boolean;
}): boolean {
  if (params.isPrimaryNumber) return true;
  if (params.maxWhatsappNumbers < 0) return true;
  return params.maxWhatsappNumbers > 1;
}

export function normalizeWhatsAppAddress(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .replace(/^whatsapp:/i, "")
    .replace(/[^\d+]/g, "");
}

export function isPrimaryWhatsAppNumber(
  primary: string | null | undefined,
  candidate: string | null | undefined,
): boolean {
  const a = normalizeWhatsAppAddress(primary);
  const b = normalizeWhatsAppAddress(candidate);
  if (!a || !b) return !b;
  return a === b;
}

export function countDistinctWhatsAppNumbers(
  primary: string | null | undefined,
  registered: Array<string | null | undefined>,
): number {
  const set = new Set<string>();
  const p = normalizeWhatsAppAddress(primary);
  if (p) set.add(p);
  for (const row of registered) {
    const n = normalizeWhatsAppAddress(row);
    if (n) set.add(n);
  }
  return set.size;
}
