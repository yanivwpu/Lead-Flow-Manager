/**
 * Server-controlled rollout for unattended webchat AI Brain replies.
 * Empty allowlist = nobody (fail closed until a SaaS account is listed).
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
