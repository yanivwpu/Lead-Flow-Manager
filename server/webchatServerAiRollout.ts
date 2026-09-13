/**
 * Unattended Web Chat Auto AI rollout.
 *
 * Fail-closed unless production opts in:
 * - WEBCHAT_SERVER_AI_AUTO=1|true enables every entitled Auto tenant.
 * - Unset / empty / 0 / false / off does not enable globally.
 * - WEBCHAT_SERVER_AI_AUTO_ALLOWLIST is a comma-separated workspace users.id list.
 *   Listed tenants may run unattended Auto even when the global flag is unset.
 *   Empty allowlist admits nobody via allowlist.
 *
 * This is a global emergency/rollout switch. It is not tenant aiMode and not
 * the static/away auto-reply setting. Never log env values or allowlist ids.
 */

export const WEBCHAT_SERVER_AI_AUTO_FLAG = "WEBCHAT_SERVER_AI_AUTO";
export const WEBCHAT_SERVER_AI_AUTO_ALLOWLIST_FLAG = "WEBCHAT_SERVER_AI_AUTO_ALLOWLIST";

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

export function readWebchatServerAiRollout(userId?: string): {
  flagName: typeof WEBCHAT_SERVER_AI_AUTO_FLAG;
  allowlistName: typeof WEBCHAT_SERVER_AI_AUTO_ALLOWLIST_FLAG;
  rolloutEnabled: boolean;
  allowlisted: boolean;
  unattendedEligible: boolean;
} {
  const rolloutEnabled = isWebchatServerAiRolloutEnabled();
  const allowlisted = userId ? isWebchatServerAiAllowlisted(userId) : false;
  return {
    flagName: WEBCHAT_SERVER_AI_AUTO_FLAG,
    allowlistName: WEBCHAT_SERVER_AI_AUTO_ALLOWLIST_FLAG,
    rolloutEnabled,
    allowlisted,
    unattendedEligible: rolloutEnabled || allowlisted,
  };
}

/** Browser-safe subset — never includes env names or values. */
export function publicWebchatServerAiRollout(userId?: string): {
  rolloutEnabled: boolean;
  allowlisted: boolean;
  unattendedEligible: boolean;
} {
  const { rolloutEnabled, allowlisted, unattendedEligible } = readWebchatServerAiRollout(userId);
  return { rolloutEnabled, allowlisted, unattendedEligible };
}
