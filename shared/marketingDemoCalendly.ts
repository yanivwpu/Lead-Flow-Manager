/** UTM medium for public marketing demo Calendly links and webhook routing. */
export const MARKETING_DEMO_CALENDLY_UTM_MEDIUM = "marketing_demo";

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

export function isMarketingDemoCalendlyTracking(tracking: unknown): boolean {
  if (!tracking || typeof tracking !== "object") return false;
  const t = tracking as Record<string, unknown>;
  return String(t.utm_medium ?? t.utmMedium ?? "").trim() === MARKETING_DEMO_CALENDLY_UTM_MEDIUM;
}
