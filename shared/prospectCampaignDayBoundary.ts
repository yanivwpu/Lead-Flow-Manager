/**
 * Workspace-aware calendar day boundary for Prospect Campaigns metrics.
 *
 * Production bug: `new Date(); setHours(0,0,0,0)` uses the *server* timezone.
 * On Railway (UTC), after 20:00 America/New_York, "Sent Today" resets while the
 * user's Campaign History still shows Aug N local sends — undercounting badly.
 */

export const PROSPECT_CAMPAIGN_DEFAULT_TIMEZONE = "America/New_York";

export function normalizeIanaTimeZone(raw: string | null | undefined): string {
  const tz = String(raw || "").trim();
  if (!tz) return PROSPECT_CAMPAIGN_DEFAULT_TIMEZONE;
  try {
    // Throws RangeError for invalid IANA ids in modern Node/Intl.
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return PROSPECT_CAMPAIGN_DEFAULT_TIMEZONE;
  }
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const v = parts.find((p) => p.type === type)?.value;
    return Number(v);
  };
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * UTC Date for 00:00:00.000 on the calendar day of `now` in `timeZone`.
 * Example: America/New_York on 2026-08-06 (EDT) → 2026-08-06T04:00:00.000Z
 */
export function startOfDayInTimeZone(
  timeZone: string | null | undefined,
  now: Date = new Date(),
): Date {
  const tz = normalizeIanaTimeZone(timeZone);
  const { year, month, day } = zonedParts(now, tz);

  // Desired wall clock: year-month-day 00:00:00 in tz.
  // Refine a UTC guess until zoned parts match that midnight.
  let guessMs = Date.UTC(year, month - 1, day, 12, 0, 0, 0); // noon UTC of that YMD as first probe
  for (let i = 0; i < 4; i++) {
    const p = zonedParts(new Date(guessMs), tz);
    const asUtcMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, 0);
    const desiredUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    guessMs += desiredUtcMs - asUtcMs;
  }
  return new Date(guessMs);
}

/** Calendar YYYY-MM-DD in the given IANA zone. */
export function calendarDateInTimeZone(
  timeZone: string | null | undefined,
  instant: Date,
): string {
  const tz = normalizeIanaTimeZone(timeZone);
  const p = zonedParts(instant, tz);
  const y = String(p.year).padStart(4, "0");
  const m = String(p.month).padStart(2, "0");
  const d = String(p.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Count queue rows that count toward Sent Today for a workspace day.
 * Requires status=sent and a non-null sentAt on/after workspace midnight.
 */
export function countProspectSentToday(params: {
  items: Array<{ queueStatus?: string | null; sentAt?: Date | string | null }>;
  timeZone: string | null | undefined;
  now?: Date;
}): number {
  const dayStart = startOfDayInTimeZone(params.timeZone, params.now ?? new Date());
  let n = 0;
  for (const item of params.items) {
    if (String(item.queueStatus || "").toLowerCase() !== "sent") continue;
    if (!item.sentAt) continue;
    const sentAt = item.sentAt instanceof Date ? item.sentAt : new Date(item.sentAt);
    if (Number.isNaN(sentAt.getTime())) continue;
    if (sentAt >= dayStart) n += 1;
  }
  return n;
}
