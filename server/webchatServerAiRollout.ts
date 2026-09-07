/**
 * Unattended Web Chat Auto AI rollout.
 *
 * Fail-closed unless production opts in:
 * - WEBCHAT_SERVER_AI_AUTO=1|true enables every entitled Auto tenant.
 * - Unset / empty / 0 / false / off does not enable globally.
 * - WEBCHAT_SERVER_AI_AUTO_ALLOWLIST is a comma-separated workspace users.id list.
 *   Listed tenants may run unattended Auto even when the global flag is unset.
 *   Empty allowlist admits nobody via allowlist.
 */

export function isWebchatServerAiRolloutEnabled(): boolean {
  const v = (process.env.WEBCHAT_SERVER_AI_AUTO || "").trim().toLowerCase();
  return v === "1" || v === "true";
}

export function isWebchatServerAiAllowlisted(userId: string): boolean {
  const raw = process.env.WEBCHAT_SERVER_AI_AUTO_ALLOWLIST || "";
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return false;
  return ids.includes(userId);
}

/** Unattended path may run when globally enabled or this workspace is allowlisted. */
export function isWebchatServerAiUnattendedEligible(userId: string): boolean {
  return isWebchatServerAiRolloutEnabled() || isWebchatServerAiAllowlisted(userId);
}
