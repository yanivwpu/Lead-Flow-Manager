/**
 * Agent / customer-facing booking links for RGE W3 and schedule_showing templates.
 *
 * NOT the same as WhachatCRM concierge onboarding Calendly (see growthEngineSetupService /
 * DEFAULT_RGE_SETUP_CALENDAR_URL / salesperson calendar_link) — those are for internal
 * launch setup sessions only.
 *
 * Priority for lead-facing scheduling URLs:
 * 1. User's connected Calendly integration (`calendlyPrimarySchedulingUrl`)
 * 2. RGE preferences manual link (`W3_bookingLink`)
 * 3. Env fallback `DEFAULT_RGE_CUSTOMER_BOOKING_URL`
 */
import { storage } from "./storage";
import {
  appendCalendlyW3TrackingParams,
  getCalendlyPublicSchedulingUrl,
  isUserCalendlyBookingConnected,
} from "./calendlyBookingConnected";

export const RGE_BOOKING_PROMPT_LOG = "[RGE Booking Prompt]";

export function logRgeBookingPrompt(event: string, payload: Record<string, unknown>): void {
  console.warn(RGE_BOOKING_PROMPT_LOG, event, payload);
}

const RGE_TEMPLATE_ID = "realtor-growth-engine";
const SEED_PLACEHOLDER_URL = "https://calendly.com/your-profile/showing";

export type RgeCustomerSchedulingResolution = {
  url: string;
  source: "calendly_integration" | "rge_preferences" | "env_fallback" | "none";
  calendlyIntegrationFound: boolean;
  calendlyConnected: boolean;
};

async function getRgePreferencesBookingLink(userId: string): Promise<string> {
  try {
    const prefs = await storage.getUserTemplateDataByKey(
      userId,
      RGE_TEMPLATE_ID,
      "preferences",
      "realtor_growth_engine_preferences",
    );
    const def = (prefs?.definition as Record<string, unknown> | null) || {};
    const raw = def.W3_bookingLink;
    if (typeof raw !== "string") return "";
    const u = raw.trim();
    return u.startsWith("http://") || u.startsWith("https://") ? u : "";
  } catch {
    return "";
  }
}

function normalizeHttpUrl(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const u = raw.trim();
  return u.startsWith("http://") || u.startsWith("https://") ? u : "";
}

export async function resolveRgeCustomerSchedulingUrl(
  userId: string,
  contactId?: string,
): Promise<RgeCustomerSchedulingResolution> {
  const integration = await storage.getIntegrationByUserAndType(userId, "calendly");
  const calendlyIntegrationFound = !!integration?.isActive;
  const calendlyConnected = await isUserCalendlyBookingConnected(userId);

  if (calendlyIntegrationFound) {
    logRgeBookingPrompt("calendlyIntegrationFound", {
      userId,
      calendlyConnected,
      hasPrimaryUrl: !!normalizeHttpUrl(
        (integration?.config as Record<string, unknown> | undefined)?.calendlyPrimarySchedulingUrl,
      ),
    });
  }

  let url = "";
  let source: RgeCustomerSchedulingResolution["source"] = "none";

  const calendlyUrl = await getCalendlyPublicSchedulingUrl(userId);
  if (calendlyUrl) {
    url = calendlyUrl;
    source = "calendly_integration";
  }

  if (!url) {
    const prefUrl = await getRgePreferencesBookingLink(userId);
    if (prefUrl) {
      url = prefUrl;
      source = "rge_preferences";
    }
  }

  if (!url) {
    const envUrl = normalizeHttpUrl(process.env.DEFAULT_RGE_CUSTOMER_BOOKING_URL);
    if (envUrl) {
      url = envUrl;
      source = "env_fallback";
    }
  }

  if (url && contactId) {
    url = appendCalendlyW3TrackingParams(url, contactId);
  }

  if (url) {
    logRgeBookingPrompt("schedulingUrlResolved", { userId, source, contactId: contactId ?? null });
  } else {
    logRgeBookingPrompt("schedulingUrlMissing", {
      userId,
      calendlyIntegrationFound,
      calendlyConnected,
      contactId: contactId ?? null,
    });
  }

  return { url, source, calendlyIntegrationFound, calendlyConnected };
}

/** Inject agent scheduling URL into RGE message template placeholders. */
export function injectRgeSchedulingTemplateVariables(body: string, schedulingUrl: string): string {
  const url = schedulingUrl.trim();
  if (!url) return body;

  const names = [
    "bookingLink",
    "booking_link",
    "calendar_link",
    "scheduling_link",
    "calendly_link",
    "schedulingLink",
    "calendarLink",
  ];

  let out = body;
  for (const name of names) {
    out = out.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, "gi"), url);
  }
  out = out.replace(new RegExp(SEED_PLACEHOLDER_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), url);
  return out;
}

export function messageTemplateExpectsSchedulingLink(templateKey: string, body: string): boolean {
  if (templateKey === "schedule_showing") return true;
  return (
    /\{\{\s*(booking|calendar|scheduling|calendly)[^}]*\}\}/i.test(body) ||
    /pick a time|book directly|schedule a showing|calendly\.com/i.test(body)
  );
}

export function outboundBodyContainsSchedulingUrl(body: string): boolean {
  return /https?:\/\/[^\s]+/i.test(body);
}
