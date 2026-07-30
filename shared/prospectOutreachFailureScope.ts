/**
 * Prospect Campaign send-failure scope — row vs campaign vs transient.
 * Prevents prospect-specific blockers from globally pausing Ready to Send.
 */

export type ProspectOutreachFailureScope = "prospect" | "campaign" | "transient";

const SENDER_NOT_CONNECTED_RE = /^sender_not_connected\b/i;

/** Machine reasons that are always prospect/row scoped. */
const PROSPECT_REASON_RE =
  /^(missing_identity|missing_message_snapshot|suppressed|opted_out|already_outreach_sent|already_replied|already_contacted|already_in_campaign|duplicate_queued|duplicate_recipient|dedup_key_collision|not_qualified|not_approved|needs_review|analysis_incomplete|qualification_failed|enrichment_in_progress|enrichment_required|enrichment_failed|not_enabled_for_bulk|unsupported_for_cold_outreach|existing_conversation_only|template_required|missing_consent|policy_blocked|contact_not_found|permanent:)/i;

const TRANSIENT_RE =
  /\b(429|rate\s*limit|timeout|temporar|try again|503|502|econnreset|etimedout|backend error|unavailable)\b/i;

const CAMPAIGN_LIMIT_RE = /\b(hourly email send limit|daily email send limit)\b/i;

const CAMPAIGN_AUTH_RE =
  /\b(oauth|unauthorized|401|403|token.?refresh|decrypt|mailbox_disconnected|no_mailbox|needs_reconnect|not connected|reconnect|No connected email mailbox)\b/i;

export function isSenderNotConnectedFailure(reason: string | null | undefined): boolean {
  return SENDER_NOT_CONNECTED_RE.test(String(reason || "").trim());
}

/**
 * Classify a send/eligibility failure for campaign control decisions.
 * Unknown errors default to prospect-scoped so one bad row cannot pause the campaign.
 */
export function classifyProspectOutreachFailureScope(
  reason: string | null | undefined,
): ProspectOutreachFailureScope {
  const raw = String(reason || "").trim();
  if (!raw) return "prospect";

  if (isSenderNotConnectedFailure(raw)) return "campaign";
  if (CAMPAIGN_LIMIT_RE.test(raw)) return "campaign";
  if (PROSPECT_REASON_RE.test(raw)) return "prospect";
  if (TRANSIENT_RE.test(raw) && !CAMPAIGN_LIMIT_RE.test(raw)) return "transient";
  if (CAMPAIGN_AUTH_RE.test(raw)) return "campaign";

  return "prospect";
}

export function shouldGloballyPauseProspectCampaign(
  reason: string | null | undefined,
): boolean {
  return classifyProspectOutreachFailureScope(reason) === "campaign";
}

export function isProspectScopedOutreachFailure(
  reason: string | null | undefined,
): boolean {
  return classifyProspectOutreachFailureScope(reason) === "prospect";
}

export function isTransientOutreachFailure(reason: string | null | undefined): boolean {
  return classifyProspectOutreachFailureScope(reason) === "transient";
}

/** Bounded backoff for transient send failures (ms). */
export function prospectTransientRetryDelayMs(attemptNumber: number): number {
  const n = Math.max(1, Math.min(6, attemptNumber || 1));
  return Math.min(15 * 60_000, 30_000 * 2 ** (n - 1));
}
