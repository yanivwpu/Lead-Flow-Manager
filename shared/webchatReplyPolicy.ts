/**
 * Web Chat CRM fallback policy.
 * Contact creation never implies a visitor-facing reply.
 * The only CRM auto-reply on this channel is a tenant-configured away message.
 */

export const WEBCHAT_HARDCODED_IDENTITY_PROMPT =
  "Thanks for reaching out! To help you best, could you share your name and the best phone number or email to reach you?";

const DEFAULT_AWAY =
  "Thanks for reaching out! We're currently away but will respond as soon as we're back.";

export type WebchatAwayUser = {
  businessHoursEnabled?: boolean | null;
  awayMessageEnabled?: boolean | null;
  awayMessage?: string | null;
  timezone?: string | null;
  businessDays?: unknown;
  businessHoursStart?: string | null;
  businessHoursEnd?: string | null;
};

export function isOutsideConfiguredBusinessHours(
  user: WebchatAwayUser,
  now: Date = new Date(),
): boolean {
  if (!user.businessHoursEnabled) return false;
  const tz = user.timezone || "America/New_York";
  const local = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const day = local.getDay();
  const time = local.toTimeString().slice(0, 5);
  const days = Array.isArray(user.businessDays) ? (user.businessDays as number[]) : [1, 2, 3, 4, 5];
  const start = user.businessHoursStart || "09:00";
  const end = user.businessHoursEnd || "17:00";
  return !days.includes(day) || time < start || time > end;
}

export function resolveWebchatConfiguredAwayReply(
  user: WebchatAwayUser,
  now: Date = new Date(),
): { send: true; text: string } | { send: false } {
  if (!user.businessHoursEnabled || !user.awayMessageEnabled) return { send: false };
  if (!isOutsideConfiguredBusinessHours(user, now)) return { send: false };
  const text = (user.awayMessage || "").trim() || DEFAULT_AWAY;
  return { send: true, text };
}

/** Greeting/identity CRM auto-replies are never used on Website Chat. */
export function webchatAllowsCrmGreetingOrIdentityFallback(): boolean {
  return false;
}
