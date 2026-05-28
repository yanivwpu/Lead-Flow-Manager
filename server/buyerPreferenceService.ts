/**
 * RGE Inventory Intelligence — buyer preference memory (Phase 1).
 */
import type { Contact } from "@shared/schema";
import {
  type BuyerPreferenceExtractionPatch,
  type BuyerPreferenceProfile,
  buyerPreferenceExtractionPatchSchema,
  emptyBuyerPreferenceProfile,
  normalizeBuyerPreferenceProfile,
} from "@shared/buyerPreferenceSchema";
import { mergeBuyerPreferenceProfile } from "@shared/buyerPreferenceMerge";
import { formatBuyerPreferenceSummaryForAi, normalizeForDisplay } from "@shared/buyerPreferenceDisplay";
import { aiProvider } from "./aiProvider";
import { storage } from "./storage";
import { channelService } from "./channelService";

const RGE_TEMPLATE_ID = "realtor-growth-engine";
const DEBOUNCE_MS = 7 * 60 * 1000;
const TRIVIAL_INBOUND_RE =
  /^(test|hi|hey|hello|yo|sup|hola|ping|check|checking|thanks|thank you|ok|okay|yes|no|sure)[\s!?.]*$/i;

const lastExtractionByContact = new Map<string, number>();

function log(event: string, payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ tag: "[BuyerPreference]", event, ...payload }));
}

export function isRealEstateIndustry(industry: string | null | undefined): boolean {
  const s = (industry || "").toLowerCase();
  return (
    s.includes("real estate") ||
    s.includes("realestate") ||
    s.includes("realtor") ||
    s.includes("property")
  );
}

export async function isRgeInstalledForUser(userId: string): Promise<boolean> {
  const install = await storage.getTemplateInstall(userId, RGE_TEMPLATE_ID);
  return !!install && install.installStatus !== "uninstalled";
}

export function contactLeadTypeIsBuyer(contact: Contact): boolean {
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  const lt = String(cf.leadType || "").toLowerCase();
  return lt === "buyer";
}

export async function shouldRunBuyerPreferencePipeline(
  userId: string,
  contact: Contact,
): Promise<{ ok: boolean; reason: string }> {
  if (await isRgeInstalledForUser(userId)) {
    return { ok: true, reason: "rge_installed" };
  }
  const bk = await storage.getAiBusinessKnowledge(userId);
  if (isRealEstateIndustry(bk?.industry)) {
    return { ok: true, reason: "real_estate_workspace" };
  }
  if (contactLeadTypeIsBuyer(contact)) {
    return { ok: true, reason: "buyer_lead_type" };
  }
  return { ok: false, reason: "not_eligible" };
}

export function readBuyerPreferenceProfile(contact: Contact): BuyerPreferenceProfile {
  const raw = (contact as Contact & { buyerPreferenceProfile?: unknown }).buyerPreferenceProfile;
  return normalizeForDisplay(raw);
}

export function readBuyerPreferenceProfileRaw(contact: Contact): unknown {
  return (contact as Contact & { buyerPreferenceProfile?: unknown }).buyerPreferenceProfile ?? {};
}

export { formatBuyerPreferenceSummaryForAi };

function parseBudgetToNumber(raw: string): { min?: number; max?: number } {
  const s = raw.replace(/,/g, "").toLowerCase();
  const out: { min?: number; max?: number } = {};
  const upTo = s.match(/(?:up to|under|max|below)\s*\$?\s*([\d.]+)\s*(k|m|million)?/i);
  if (upTo) {
    let n = parseFloat(upTo[1]);
    if (upTo[2] === "k") n *= 1000;
    if (upTo[2] === "m" || upTo[2] === "million") n *= 1_000_000;
    out.max = Math.round(n);
  }
  const from = s.match(/(?:from|at least|over)\s*\$?\s*([\d.]+)\s*(k|m|million)?/i);
  if (from) {
    let n = parseFloat(from[1]);
    if (from[2] === "k") n *= 1000;
    if (from[2] === "m" || from[2] === "million") n *= 1_000_000;
    out.min = Math.round(n);
  }
  const plain = s.match(/\$?\s*([\d.]+)\s*(k|m|million)?/i);
  if (plain && !out.min && !out.max) {
    let n = parseFloat(plain[1]);
    if (plain[2] === "k") n *= 1000;
    if (plain[2] === "m" || plain[2] === "million") n *= 1_000_000;
    out.max = Math.round(n);
  }
  return out;
}

function mapW2Timeline(
  timeline: string,
  now: string,
): NonNullable<BuyerPreferenceExtractionPatch["timeline"]> | undefined {
  const t = timeline.toLowerCase();
  const inf = (confidence: number, value: "asap" | "30d" | "60_90d" | "browsing" | "unknown") => ({
    value,
    source: "inferred" as const,
    confidence,
    updatedAt: now,
  });
  if (t === "asap") return inf(0.72, "asap");
  if (t === "60-90d") return inf(0.7, "60_90d");
  if (t === "browsing") return inf(0.65, "browsing");
  return undefined;
}

/** Bridge W2 custom_fields updates into preference profile (low-friction, no LLM). */
export function buildW2BridgePatch(
  fieldUpdates: Record<string, unknown>,
): BuyerPreferenceExtractionPatch {
  const now = new Date().toISOString();
  const patch: BuyerPreferenceExtractionPatch = {};
  const inf = (confidence: number) =>
    ({ source: "inferred" as const, confidence, updatedAt: now });

  if (typeof fieldUpdates.budgetRange === "string") {
    const { min, max } = parseBudgetToNumber(fieldUpdates.budgetRange);
    if (min != null) patch.priceMin = { value: min, ...inf(0.7) };
    if (max != null) patch.priceMax = { value: max, ...inf(0.75) };
  }
  if (typeof fieldUpdates.timeline === "string") {
    const mapped = mapW2Timeline(fieldUpdates.timeline, now);
    if (mapped) patch.timeline = mapped;
  }
  if (fieldUpdates.financingType === "cash" || fieldUpdates.preApproved === "yes") {
    patch.financingStatus = {
      value: fieldUpdates.financingType === "cash" ? "cash" : "pre_approved",
      ...inf(0.8),
    };
  } else if (fieldUpdates.financingType === "unknown") {
    patch.financingStatus = { value: "exploring", ...inf(0.55) };
  }
  if (fieldUpdates.appointmentIntent === "showing_requested") {
    patch.timeline = { value: "asap", source: "inferred", confidence: 0.68, updatedAt: now };
  }
  return patch;
}

export async function persistBuyerPreferenceProfile(
  contactId: string,
  profile: BuyerPreferenceProfile,
  options?: { logActivity?: boolean; userId?: string; conversationId?: string },
): Promise<Contact | undefined> {
  const updated = await storage.updateContact(
    contactId,
    { buyerPreferenceProfile: profile } as Partial<Contact>,
    { skipAutomationHooks: true },
  );
  if (options?.logActivity && options.userId) {
    await channelService.logActivity(
      options.userId,
      contactId,
      options.conversationId,
      "buyer_preference_updated",
      {
        profileStatus: profile.profileStatus,
        summary: formatBuyerPreferenceSummaryForAi(profile).slice(0, 500),
      },
    );
  }
  return updated;
}

export async function mergeAndPersistBuyerPreferences(
  contact: Contact,
  patch: BuyerPreferenceExtractionPatch,
  meta?: { conversationId?: string; messageId?: string; logActivity?: boolean },
): Promise<BuyerPreferenceProfile> {
  const current = readBuyerPreferenceProfile(contact);
  const merged = mergeBuyerPreferenceProfile(current, patch, {
    lastExtractedAt: new Date().toISOString(),
    lastInboundAt: new Date().toISOString(),
  });
  await persistBuyerPreferenceProfile(contact.id, merged, {
    logActivity: meta?.logActivity,
    userId: contact.userId,
    conversationId: meta?.conversationId,
  });
  return merged;
}

async function loadConversationForExtraction(
  contactId: string,
  limit = 16,
): Promise<Array<{ role: string; content: string }>> {
  const conversations = await storage.getConversationsByContact(contactId);
  const sorted = [...conversations].sort((a, b) => {
    const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bt - at;
  });
  const primary = sorted[0];
  if (!primary) return [];
  const messages = await storage.getMessages(primary.id, limit);
  return messages.map((m) => ({
    role: m.direction === "inbound" ? "user" : "assistant",
    content: m.content || "",
  }));
}

async function extractPreferencesWithLlm(
  contact: Contact,
  conversation: Array<{ role: string; content: string }>,
  existing: BuyerPreferenceProfile,
): Promise<BuyerPreferenceExtractionPatch> {
  const transcript = conversation
    .filter((m) => (m.content || "").trim().length > 0)
    .slice(-14)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const system = `You extract structured home-buyer preferences for a real estate CRM.
Return JSON only matching this shape (omit unknown fields):
{
  "targetAreas": { "value": ["Brickell"], "source": "explicit"|"inferred", "confidence": 0.0-1.0, "updatedAt": "ISO", "evidence": "short quote" },
  "priceMin": { "value": number, ... },
  "priceMax": { "value": number, ... },
  "bedsMin": { "value": number, ... },
  "bathsMin": { "value": number, ... },
  "propertyTypes": { "value": ["condo"|"house"|"townhouse"|"multi_family"|"land"], ... },
  "timeline": { "value": "asap"|"30d"|"60_90d"|"browsing"|"unknown", ... },
  "financingStatus": { "value": "cash"|"pre_approved"|"exploring"|"unknown", ... },
  "pool": { "value": true|false, ... },
  "waterfront": { "value": true|false, ... },
  "modernStyle": { "value": true|false, ... },
  "lowHoa": { "value": true|false, ... },
  "gatedCommunity": { "value": true|false, ... },
  "parking": { "value": true|false, ... },
  "petFriendly": { "value": true|false, ... },
  "investmentIntent": { "value": true|false, ... },
  "mustHaves": { "value": ["string"], ... },
  "dealBreakers": { "value": ["string"], ... }
}
Rules:
- explicit = clearly stated; inferred = weak implication only (confidence <= 0.65).
- Do not invent fields. evidence required when adding a field.
- Prefer updating only fields supported by the latest messages.`;

  const user = `Existing profile JSON:\n${JSON.stringify(existing)}\n\nConversation:\n${transcript}`;

  const response = await aiProvider.complete(
    "extraction",
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { jsonMode: true, maxTokens: 900 },
  );

  const raw = JSON.parse(response || "{}") as unknown;
  const now = new Date().toISOString();

  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const mapped: Record<string, unknown> = { ...obj };

  // Defensive alias mapping — model outputs sometimes drift from the requested camelCase keys.
  if (mapped.areas && !mapped.targetAreas) mapped.targetAreas = mapped.areas;
  if (mapped.area && !mapped.targetAreas) mapped.targetAreas = mapped.area;
  if (mapped.budget && !mapped.priceMax && !mapped.priceMin) {
    mapped.priceMax = typeof mapped.budget === "number" ? { value: mapped.budget } : mapped.budget;
  }
  if (mapped.financing && !mapped.financingStatus) mapped.financingStatus = mapped.financing;

  // Coerce common primitive outputs into field objects
  const coerceFieldObject = (key: string, value: unknown) => {
    if (value && typeof value === "object" && "value" in (value as any)) return value;
    return { value };
  };
  if (Array.isArray(mapped.targetAreas)) mapped.targetAreas = coerceFieldObject("targetAreas", mapped.targetAreas);
  if (typeof mapped.priceMin === "number") mapped.priceMin = coerceFieldObject("priceMin", mapped.priceMin);
  if (typeof mapped.priceMax === "number") mapped.priceMax = coerceFieldObject("priceMax", mapped.priceMax);
  if (typeof mapped.bedsMin === "number") mapped.bedsMin = coerceFieldObject("bedsMin", mapped.bedsMin);
  if (typeof mapped.bathsMin === "number") mapped.bathsMin = coerceFieldObject("bathsMin", mapped.bathsMin);
  if (Array.isArray(mapped.propertyTypes)) mapped.propertyTypes = coerceFieldObject("propertyTypes", mapped.propertyTypes);
  if (typeof mapped.timeline === "string") mapped.timeline = coerceFieldObject("timeline", mapped.timeline);
  if (typeof mapped.financingStatus === "string") mapped.financingStatus = coerceFieldObject("financingStatus", mapped.financingStatus);
  if (typeof mapped.pool === "boolean") mapped.pool = coerceFieldObject("pool", mapped.pool);
  if (typeof mapped.modernStyle === "boolean") mapped.modernStyle = coerceFieldObject("modernStyle", mapped.modernStyle);
  if (Array.isArray(mapped.mustHaves)) mapped.mustHaves = coerceFieldObject("mustHaves", mapped.mustHaves);

  // Ensure updatedAt exists when field objects omit it
  for (const [k, v] of Object.entries(mapped)) {
    if (!v || typeof v !== "object") continue;
    const vv = v as Record<string, unknown>;
    if (!("value" in vv)) continue;
    if (!("updatedAt" in vv)) vv.updatedAt = now;
    // Default missing fields so valid extractions persist (model often omits these)
    if (!("source" in vv)) vv.source = "inferred";
    if (!("confidence" in vv)) vv.confidence = vv.source === "explicit" ? 0.9 : 0.65;
    // If model mistakenly returned primitives for known keys, coerce where safe
    if ((k === "targetAreas" || k === "propertyTypes" || k === "mustHaves" || k === "dealBreakers") && Array.isArray(vv.value)) {
      vv.value = vv.value.map((x) => String(x).trim()).filter(Boolean);
    }
  }

  const parsed = buyerPreferenceExtractionPatchSchema.safeParse(mapped);
  if (!parsed.success) {
    log("llm_patch_invalid", {
      contactId: contact.id,
      issueCount: parsed.error.issues.length,
      issues: parsed.error.issues.slice(0, 6).map((i) => ({ path: i.path, code: i.code })),
    });
    return {};
  }
  return parsed.data;
}

export async function runBuyerPreferenceExtraction(
  userId: string,
  contactId: string,
  options?: { conversationId?: string; messageId?: string; inboundText?: string },
): Promise<void> {
  const contact = await storage.getContact(contactId);
  if (!contact || contact.userId !== userId) return;

  const gate = await shouldRunBuyerPreferencePipeline(userId, contact);
  if (!gate.ok) return;

  const text = (options?.inboundText || "").trim();
  if (text.length > 0 && text.length < 12 && TRIVIAL_INBOUND_RE.test(text)) {
    return;
  }

  const history = await loadConversationForExtraction(contactId);
  if (!history.length && !text) return;

  try {
    const existing = readBuyerPreferenceProfile(contact);
    const patch = await extractPreferencesWithLlm(contact, history, existing);
    const merged = await mergeAndPersistBuyerPreferences(contact, patch, {
      conversationId: options?.conversationId,
      messageId: options?.messageId,
      logActivity: true,
    });
    log("extracted", {
      userId,
      contactId,
      reason: gate.reason,
      profileStatus: merged.profileStatus,
    });
  } catch (err) {
    log("extract_failed", {
      userId,
      contactId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function scheduleBuyerPreferenceExtraction(params: {
  userId: string;
  contactId: string;
  conversationId?: string;
  messageId?: string;
  inboundText?: string;
  w2FieldUpdates?: Record<string, unknown>;
}): void {
  const { userId, contactId, conversationId, messageId, inboundText, w2FieldUpdates } = params;
  const text = (inboundText || "").trim();
  if (text.length > 0 && text.length < 12 && TRIVIAL_INBOUND_RE.test(text)) {
    return;
  }

  const now = Date.now();
  const last = lastExtractionByContact.get(contactId) || 0;
  if (now - last < DEBOUNCE_MS) {
    return;
  }
  lastExtractionByContact.set(contactId, now);

  setImmediate(() => {
    void (async () => {
      const contact = await storage.getContact(contactId);
      if (!contact) return;
      const gate = await shouldRunBuyerPreferencePipeline(userId, contact);
      if (!gate.ok) return;

      if (w2FieldUpdates && Object.keys(w2FieldUpdates).length > 0) {
        const bridge = buildW2BridgePatch(w2FieldUpdates);
        if (Object.keys(bridge).length > 0) {
          await mergeAndPersistBuyerPreferences(contact, bridge, {
            conversationId,
            messageId,
            logActivity: false,
          });
        }
      }

      await runBuyerPreferenceExtraction(userId, contactId, {
        conversationId,
        messageId,
        inboundText: text,
      });
    })().catch((err) => {
      log("schedule_error", {
        contactId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });
}

/** Light manual edits from Inbox UI (explicit source, confidence 1). */
export function buildExplicitPatchFromSimpleBody(
  body: Record<string, unknown>,
): BuyerPreferenceExtractionPatch {
  const now = new Date().toISOString();
  const explicit = <T>(value: T) => ({
    value,
    source: "explicit" as const,
    confidence: 1,
    updatedAt: now,
  });
  const patch: BuyerPreferenceExtractionPatch = {};

  if (Array.isArray(body.targetAreas)) {
    const areas = body.targetAreas.map(String).map((s) => s.trim()).filter(Boolean);
    if (areas.length) patch.targetAreas = explicit(areas);
  }
  if (typeof body.priceMax === "number" && Number.isFinite(body.priceMax)) {
    patch.priceMax = explicit(body.priceMax);
  }
  if (typeof body.priceMin === "number" && Number.isFinite(body.priceMin)) {
    patch.priceMin = explicit(body.priceMin);
  }
  if (typeof body.bedsMin === "number" && Number.isFinite(body.bedsMin)) {
    patch.bedsMin = explicit(body.bedsMin);
  }
  if (typeof body.bathsMin === "number" && Number.isFinite(body.bathsMin)) {
    patch.bathsMin = explicit(body.bathsMin);
  }
  if (Array.isArray(body.propertyTypes) && body.propertyTypes.length) {
    patch.propertyTypes = explicit(
      body.propertyTypes as NonNullable<BuyerPreferenceExtractionPatch["propertyTypes"]>["value"],
    );
  }
  if (typeof body.timeline === "string" && body.timeline) {
    patch.timeline = explicit(body.timeline as NonNullable<BuyerPreferenceExtractionPatch["timeline"]>["value"]);
  }
  if (typeof body.financingStatus === "string" && body.financingStatus) {
    patch.financingStatus = explicit(
      body.financingStatus as NonNullable<BuyerPreferenceExtractionPatch["financingStatus"]>["value"],
    );
  }
  if (Array.isArray(body.mustHaves)) {
    const items = body.mustHaves.map(String).map((s) => s.trim()).filter(Boolean);
    if (items.length) patch.mustHaves = explicit(items);
  }
  return patch;
}

export async function applyManualBuyerPreferencePatch(
  userId: string,
  contactId: string,
  patch: BuyerPreferenceExtractionPatch,
): Promise<BuyerPreferenceProfile | null> {
  const contact = await storage.getContact(contactId);
  if (!contact || contact.userId !== userId) return null;

  const now = new Date().toISOString();
  const explicitPatch: BuyerPreferenceExtractionPatch = {};
  for (const [key, field] of Object.entries(patch)) {
    if (!field || typeof field !== "object" || !("value" in field)) continue;
    explicitPatch[key as keyof BuyerPreferenceExtractionPatch] = {
      ...(field as object),
      source: "explicit",
      confidence: 1,
      updatedAt: now,
    } as never;
  }

  return mergeAndPersistBuyerPreferences(contact, explicitPatch, { logActivity: true });
}
