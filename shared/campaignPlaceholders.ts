/**
 * Preset campaign placeholders — CRM `{{name}}` style (not Meta `{{1}}` body indices).
 * Meta-approved WhatsApp sends use `buildMetaLibraryTemplateSendComponents` + numbered maps.
 */

import type { Contact } from "./schema";
import {
  collectRequiredLibraryTemplatePlaceholders,
  type TemplateRowForMetaSend,
} from "./metaTemplateSend";

const PLACEHOLDER_TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Sample defaults for new preset campaigns (never `{{token}}` self-references). */
const PRESET_PLACEHOLDER_SEED_VALUES: Record<string, string> = {
  discount_percent: "20",
  hours_left: "24",
  offer_link: "https://example.com",
  cart_link: "https://example.com/cart",
  discount_code: "SAVE20",
  promo_code: "SAVE20",
  promotion_details: "Limited-time offer on subscription plans",
  expiry_date: "Dec 31, 2026",
  product_list: "Item A, Item B",
  property_name: "Sample Property",
  location: "Miami, FL",
  price: "$450,000",
  clinic_name: "Sample Clinic",
  appointment_time: "10:00 AM",
  doctor_name: "Dr. Smith",
  destination: "Paris",
  travel_date: "Aug 15, 2026",
  departure_time: "8:30 AM",
};

export const CAMPAIGN_PLACEHOLDER_DEFAULTS_HELPER =
  "These values are used when the contact does not have a matching custom field.";

export function isPlaceholderSelfReference(key: string, value: string): boolean {
  const t = value.trim();
  return t === `{{${key}}}` || t === `{{ ${key} }}`;
}

/** Build initial placeholder defaults when creating a campaign from a preset blueprint. */
export function buildNewCampaignPlaceholderDefaults(placeholderKeys: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of placeholderKeys) {
    result[key] = PRESET_PLACEHOLDER_SEED_VALUES[key] ?? "";
  }
  return result;
}

/** Replace legacy `{{key}}` stored defaults with real sample values for display/editing. */
export function normalizeCampaignPlaceholderDefaults(
  defaults: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!defaults || typeof defaults !== "object") return out;
  for (const [k, v] of Object.entries(defaults)) {
    const s = v == null ? "" : String(v);
    out[k] = isPlaceholderSelfReference(k, s) ? (PRESET_PLACEHOLDER_SEED_VALUES[k] ?? "") : s;
  }
  return out;
}

export function getPlaceholderDefaultInputHint(key: string): string {
  const seed = PRESET_PLACEHOLDER_SEED_VALUES[key];
  if (seed) return `e.g. ${seed}`;
  if (key === "name") return "Uses contact name when empty";
  return "";
}

export function buildSampleCampaignPreviewContact(
  overrides?: Partial<Pick<Contact, "name" | "phone" | "email" | "customFields">>,
): Contact {
  return {
    id: "preview",
    name: overrides?.name ?? "Alex",
    phone: overrides?.phone ?? "+15551234567",
    email: overrides?.email ?? "alex@example.com",
    customFields: overrides?.customFields ?? {},
  } as Contact;
}

export type CampaignMessagePreviewStep = {
  delay: string;
  type: string;
  rendered: string;
};

export function previewCampaignMessageSteps(
  messages: unknown[],
  placeholderDefaults: Record<string, unknown> | null | undefined,
  contact: Contact,
): CampaignMessagePreviewStep[] {
  const rows = parsePresetCampaignMessagesArray(messages);
  return rows.map((raw) => {
    const m = raw as { delay?: string; content?: string; type?: string };
    return {
      delay: String(m.delay ?? "0"),
      type: typeof m.type === "string" ? m.type : "text",
      rendered: interpolateCampaignBody(typeof m.content === "string" ? m.content : "", placeholderDefaults, contact),
    };
  });
}

function trimStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function splitDisplayName(displayName: string): { first: string; last: string } {
  const t = (displayName || "").trim();
  if (!t) return { first: "", last: "" };
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0]!, last: "" };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

/** Safe short greeting when name-like tokens are missing (never leak raw `{{…}}`). */
export function safeCampaignGreetingFallback(contact: Contact, map: Record<string, string>): string {
  const name = (contact.name || "").trim();
  if (name) return name.split(/\s+/)[0] || name;
  const ph = trimStr(map.phone || contact.phone);
  if (ph) return ph;
  return "there";
}

function isNameLikePlaceholderKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k === "name" ||
    k === "firstname" ||
    k === "lastname" ||
    k === "first_name" ||
    k === "last_name" ||
    k === "full_name" ||
    k === "fullname" ||
    k === "display_name" ||
    k === "contact.name" ||
    k === "contact_name" ||
    k.endsWith(".name")
  );
}

/**
 * Canonical lowercase keys → resolved string values for CRM campaign interpolation.
 * Supports aliases: `name`, `first_name`, `contact.name`, `phone`, etc.
 */
export function buildCrmPlaceholderValueMap(
  contact: Contact,
  defaults: Record<string, unknown> | null | undefined
): Record<string, string> {
  const display = (contact.name || "").trim();
  const { first, last } = splitDisplayName(display);
  const phone = trimStr(contact.phone);
  const email = trimStr(contact.email);

  const values: Record<string, string> = {};

  const set = (key: string, val: string) => {
    const k = key.trim().toLowerCase();
    if (!k) return;
    values[k] = val;
  };

  set("name", display);
  set("contact.name", display);
  set("contact_name", display);
  set("display_name", display);
  set("fullname", display);
  set("full_name", display);
  set("first_name", first || display);
  set("firstname", first || display);
  set("last_name", last);
  set("lastname", last);
  set("phone", phone);
  set("mobile", phone);
  set("whatsapp", phone);
  set("contact.phone", phone);
  set("email", email);
  set("contact.email", email);

  if (defaults && typeof defaults === "object") {
    for (const [k, v] of Object.entries(defaults)) {
      if (v == null) continue;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        set(k, String(v));
      }
    }
  }

  const cf =
    contact.customFields && typeof contact.customFields === "object" && !Array.isArray(contact.customFields)
      ? (contact.customFields as Record<string, unknown>)
      : {};
  for (const [k, v] of Object.entries(cf)) {
    if (typeof v === "string" || typeof v === "number") {
      set(k, String(v));
      set(`contact.${k}`, String(v));
    }
  }

  return values;
}

/**
 * Interpolate `{{ … }}` tokens in free-form / CRM campaign copy.
 * Keys are matched case-insensitively; unresolved tokens are stripped or name-fallback (never left raw).
 */
export function interpolateCampaignBody(
  template: string,
  defaults: Record<string, unknown> | null | undefined,
  contact: Contact
): string {
  const map = buildCrmPlaceholderValueMap(contact, defaults);
  const safeGreeting = safeCampaignGreetingFallback(contact, map);

  let out = template;
  PLACEHOLDER_TOKEN_RE.lastIndex = 0;
  out = out.replace(PLACEHOLDER_TOKEN_RE, (_, rawKey: string) => {
    const k = String(rawKey).trim().toLowerCase();
    const dot = k.indexOf(".");
    const bare = dot >= 0 ? k.slice(dot + 1) : k;
    const v = map[k] ?? map[bare] ?? (dot >= 0 ? map[k.slice(0, dot)] : undefined);
    if (v != null && String(v).trim() !== "") return String(v);
    if (isNameLikePlaceholderKey(k)) return safeGreeting;
    return "";
  });

  PLACEHOLDER_TOKEN_RE.lastIndex = 0;
  const residual: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = PLACEHOLDER_TOKEN_RE.exec(out)) !== null) {
    residual.push(m[0]);
  }
  if (residual.length > 0) {
    console.warn(
      `[CAMPAIGN_INTERPOLATE_UNRESOLVED] ${JSON.stringify({
        contactId: contact.id,
        tokens: residual,
      })}`
    );
    PLACEHOLDER_TOKEN_RE.lastIndex = 0;
    out = out.replace(PLACEHOLDER_TOKEN_RE, (_, rawKey: string) => {
      const k = String(rawKey).trim().toLowerCase();
      if (isNameLikePlaceholderKey(k)) return safeGreeting;
      return "";
    });
  }

  return out;
}

/**
 * Build Meta `variableValues` (keys like `{{1}}` / `1`) for a synced library template row, using CRM + campaign defaults.
 * Used when a campaign step sets `whatsappTemplateName` but omits `whatsappTemplateComponents`.
 */
export function buildMetaVariableValuesForCampaignTemplate(
  template: TemplateRowForMetaSend,
  contact: Contact,
  placeholderDefaults: Record<string, unknown> | null | undefined
): Record<string, string> {
  const crm = buildCrmPlaceholderValueMap(contact, placeholderDefaults);
  const defs = placeholderDefaults && typeof placeholderDefaults === "object" ? placeholderDefaults : {};
  const phs = collectRequiredLibraryTemplatePlaceholders(template);
  const vv: Record<string, string> = {};

  for (let i = 0; i < phs.length; i++) {
    const ph = phs[i]!;
    const n = ph.replace(/\D/g, "");
    let val =
      trimStr(defs[ph as keyof typeof defs]) ||
      trimStr(defs[`{{${n}}}` as keyof typeof defs]) ||
      trimStr(defs[n as keyof typeof defs]);

    if (!val) {
      if (phs.length === 1) {
        val = trimStr(crm["first_name"]) || trimStr(crm["name"]) || trimStr(crm["phone"]) || "";
      } else if (i === 0) {
        val = trimStr(crm["first_name"]) || trimStr(crm["name"]) || "";
      } else if (i === 1) {
        val =
          trimStr(crm["cart_link"]) ||
          trimStr(crm["link"]) ||
          trimStr(defs["cart_link"]) ||
          trimStr(defs["link"]) ||
          "";
      } else {
        val = "";
      }
    }

    vv[ph] = val;
    if (n) vv[n] = val;
  }

  return vv;
}

/**
 * Collect `{{placeholder}}` keys from preset campaign message bodies (order not preserved across steps).
 */
export function extractPlaceholderKeysFromCampaignMessages(messages: unknown[]): string[] {
  const keys = new Set<string>();
  for (const raw of messages) {
    const content =
      raw &&
      typeof raw === "object" &&
      typeof (raw as { content?: unknown }).content === "string"
        ? (raw as { content: string }).content
        : "";
    PLACEHOLDER_TOKEN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PLACEHOLDER_TOKEN_RE.exec(content)) !== null) {
      keys.add(m[1].trim());
    }
  }
  return Array.from(keys).sort();
}

/** True if `content` still contains CRM-style `{{token}}` after interpolation (should be empty before customer send). */
export function campaignBodyHasUnresolvedPlaceholders(content: string): boolean {
  PLACEHOLDER_TOKEN_RE.lastIndex = 0;
  return PLACEHOLDER_TOKEN_RE.test(content);
}

/**
 * Normalize preset campaign `messages` from DB/API (jsonb may arrive as array, JSON string, or legacy object).
 */
export function parsePresetCampaignMessagesArray(messages: unknown): unknown[] {
  if (Array.isArray(messages)) return messages;
  if (typeof messages === "string") {
    try {
      const parsed = JSON.parse(messages) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  if (messages && typeof messages === "object") {
    const o = messages as Record<string, unknown>;
    const keys = Object.keys(o)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => Number(a) - Number(b));
    if (keys.length > 0) return keys.map((k) => o[k]!);
  }
  return [];
}

export function getPresetCampaignStepCount(messages: unknown): number {
  return parsePresetCampaignMessagesArray(messages).length;
}
