/** UTM medium for public marketing demo Calendly links and webhook routing. */
export const MARKETING_DEMO_CALENDLY_UTM_MEDIUM = "marketing_demo";

/** Calendly webhook path (append to APP_URL). Register on each sales demo Calendly org/account. */
export const MARKETING_DEMO_CALENDLY_WEBHOOK_PATH = "/api/webhooks/calendly/marketing-demo";

export const MARKETING_DEMO_BOOKING_NOTE_PREFIX = "whachat_demo_booking_id:";

export function formatMarketingDemoBookingNote(bookingId: string): string {
  return `${MARKETING_DEMO_BOOKING_NOTE_PREFIX}${bookingId.trim()}`;
}

export function readMarketingDemoBookingIdFromNotes(notes: string | null | undefined): string | undefined {
  if (!notes?.trim()) return undefined;
  const match = notes.match(/whachat_demo_booking_id:([0-9a-f-]{36})/i);
  return match?.[1];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function looksLikeDemoBookingId(value: string | undefined): boolean {
  return Boolean(value?.trim() && UUID_RE.test(value.trim()));
}

export type MarketingDemoCalendlyTracking = {
  demoBookingId: string;
  visitorEmail: string;
  visitorName: string;
  source?: string;
};

/**
 * Append Calendly invitee prefill + UTM tracking so marketing-demo webhooks can match demo_bookings.
 * utm_content = demoBookingId (primary key), utm_term = visitorEmail (fallback).
 */
export function appendMarketingDemoCalendlyParams(
  schedulingUrl: string,
  tracking: MarketingDemoCalendlyTracking,
): string {
  const raw = (schedulingUrl || "").trim();
  if (!raw || !tracking.demoBookingId) return raw;

  const demoBookingId = tracking.demoBookingId.trim();
  const visitorEmail = tracking.visitorEmail.trim();
  const visitorName = tracking.visitorName.trim();
  const source = (tracking.source || "web").trim();

  try {
    const url =
      raw.startsWith("http://") || raw.startsWith("https://") ? new URL(raw) : new URL(`https://${raw}`);

    if (visitorName) url.searchParams.set("name", visitorName);
    if (visitorEmail) url.searchParams.set("email", visitorEmail);

    url.searchParams.set("utm_source", "whachatcrm");
    url.searchParams.set("utm_medium", MARKETING_DEMO_CALENDLY_UTM_MEDIUM);
    url.searchParams.set("utm_content", demoBookingId);
    if (visitorEmail) url.searchParams.set("utm_term", visitorEmail);
    if (visitorName) url.searchParams.set("utm_campaign", visitorName.slice(0, 200));
    url.searchParams.set("utm_id", source);
    // Calendly passes a1 when the event type has a first custom question (optional backup match).
    url.searchParams.set("a1", demoBookingId);

    return url.toString();
  } catch {
    const join = raw.includes("?") ? "&" : "?";
    const parts = [
      "utm_source=whachatcrm",
      `utm_medium=${encodeURIComponent(MARKETING_DEMO_CALENDLY_UTM_MEDIUM)}`,
      `utm_content=${encodeURIComponent(demoBookingId)}`,
      visitorEmail ? `utm_term=${encodeURIComponent(visitorEmail)}` : "",
      visitorName ? `utm_campaign=${encodeURIComponent(visitorName.slice(0, 200))}` : "",
      source ? `utm_id=${encodeURIComponent(source)}` : "",
      visitorName ? `name=${encodeURIComponent(visitorName)}` : "",
      visitorEmail ? `email=${encodeURIComponent(visitorEmail)}` : "",
      `a1=${encodeURIComponent(demoBookingId)}`,
    ].filter(Boolean);
    return `${raw}${join}${parts.join("&")}`;
  }
}

export function readMarketingDemoBookingIdFromTracking(tracking: unknown): string | undefined {
  if (!tracking || typeof tracking !== "object") return undefined;
  const t = tracking as Record<string, unknown>;
  const medium = String(t.utm_medium ?? t.utmMedium ?? "").trim();
  if (medium !== MARKETING_DEMO_CALENDLY_UTM_MEDIUM) return undefined;
  const raw = t.utm_content ?? t.utmContent;
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  return raw.trim();
}

/**
 * Resolve demo_bookings.id from Calendly webhook tracking.
 * Prefer strict marketing_demo medium; fall back to utm_content alone (Calendly often omits utm_medium).
 */
export function resolveMarketingDemoBookingIdFromTracking(tracking: unknown): string | undefined {
  const strict = readMarketingDemoBookingIdFromTracking(tracking);
  if (strict) return strict;
  if (!tracking || typeof tracking !== "object") return undefined;
  const t = tracking as Record<string, unknown>;
  const medium = String(t.utm_medium ?? t.utmMedium ?? "").trim();
  if (medium && medium !== MARKETING_DEMO_CALENDLY_UTM_MEDIUM) return undefined;
  const raw = t.utm_content ?? t.utmContent;
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const id = raw.trim();
  return looksLikeDemoBookingId(id) ? id : undefined;
}

/** Read booking id from Calendly invitee custom answers (a1 / first question). */
export function readMarketingDemoBookingIdFromCalendlyBody(body: Record<string, unknown>): string | undefined {
  const payload = (body.payload as Record<string, unknown>) || body;
  const invitee = (payload.invitee as Record<string, unknown>) || payload;
  const qa = invitee.questions_and_answers;
  if (!Array.isArray(qa)) return undefined;
  for (const item of qa) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const answer = String(row.answer ?? "").trim();
    if (looksLikeDemoBookingId(answer)) return answer;
  }
  return undefined;
}

export function isMarketingDemoCalendlyTracking(tracking: unknown): boolean {
  if (!tracking || typeof tracking !== "object") return false;
  const t = tracking as Record<string, unknown>;
  return String(t.utm_medium ?? t.utmMedium ?? "").trim() === MARKETING_DEMO_CALENDLY_UTM_MEDIUM;
}
