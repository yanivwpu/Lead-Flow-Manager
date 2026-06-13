/**
 * RGE Inventory Intelligence — buyer preference memory (Phase 1).
 */
import type { Contact } from "@shared/schema";
import {
  type BuyerPreferenceExtractionPatch,
  type BuyerPreferenceProfile,
} from "@shared/buyerPreferenceSchema";
import {
  heuristicPatchFromTranscript,
  normalizeLlmExtractionPatch,
  patchFieldCount,
} from "@shared/buyerPreferenceExtractionNormalize";
import {
  hasInventoryPreferenceSignals,
  logBuyerPreferenceFastPath,
  type PreferenceArrayReplaceKey,
} from "@shared/buyerPreferenceInventorySignals";
import {
  applyInboundSearchCommandOverrides,
  parseBuyerSearchCommand,
} from "@shared/buyerSearchCommand";
import { formatSearchCommandLog } from "@shared/buyerSearchCommandDebug";
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

function debugBuyerPreferenceLog(event: string, payload: Record<string, unknown>): void {
  if (process.env.DEBUG_BUYER_PREFS !== "1") return;
  console.log(JSON.stringify({ tag: "[BuyerPreference]", event, ...payload }));
}

/** @internal Re-export for channel/workflow skip logging. */
export function debugLogBuyerPreference(
  event: string,
  payload: Record<string, unknown>,
): void {
  debugBuyerPreferenceLog(event, payload);
}

function logTrigger(
  event: "extraction_triggered" | "extraction_skipped" | "extraction_started" | "extraction_completed",
  payload: Record<string, unknown>,
): void {
  debugBuyerPreferenceLog(event, payload);
}

function logPersistence(contactId: string, step: string, data: Record<string, unknown>): void {
  debugBuyerPreferenceLog(`persist_${step}`, { contactId, ...data });
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
): Promise<{ ok: boolean; reason: string; debug?: Record<string, unknown> }> {
  const rgeInstalled = await isRgeInstalledForUser(userId);
  if (rgeInstalled) {
    return { ok: true, reason: "rge_installed", debug: { rgeInstalled: true } };
  }
  const bk = await storage.getAiBusinessKnowledge(userId);
  const industry = bk?.industry ?? null;
  if (isRealEstateIndustry(industry)) {
    return {
      ok: true,
      reason: "real_estate_workspace",
      debug: { rgeInstalled: false, industry },
    };
  }
  const isBuyer = contactLeadTypeIsBuyer(contact);
  if (isBuyer) {
    return {
      ok: true,
      reason: "buyer_lead_type",
      debug: { rgeInstalled: false, industry, leadType: "buyer" },
    };
  }
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  return {
    ok: false,
    reason: "not_eligible",
    debug: {
      rgeInstalled: false,
      industry,
      leadType: cf.leadType ?? null,
    },
  };
}

export function readBuyerPreferenceProfile(contact: Contact): BuyerPreferenceProfile {
  const raw = (contact as Contact & { buyerPreferenceProfile?: unknown }).buyerPreferenceProfile;
  return normalizeForDisplay(raw);
}

export function readBuyerPreferenceProfileRaw(contact: Contact): unknown {
  return (contact as Contact & { buyerPreferenceProfile?: unknown }).buyerPreferenceProfile ?? {};
}

/** Reload normalized buyer profile from DB — canonical source of truth after persist. */
export async function loadPersistedBuyerPreferenceProfile(
  contactId: string,
): Promise<BuyerPreferenceProfile | null> {
  const contact = await storage.getContact(contactId);
  if (!contact) return null;
  return readBuyerPreferenceProfile(contact);
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
  logPersistence(contactId, "db_update_payload", {
    profileStatus: profile.profileStatus,
    fieldKeys: Object.keys(profile).filter(
      (k) => !["schemaVersion", "profileStatus", "lastExtractedAt", "lastInboundAt"].includes(k),
    ),
    payloadBytes: JSON.stringify(profile).length,
  });

  const updated = await storage.updateContactBuyerPreferenceProfile(
    contactId,
    profile as Record<string, unknown>,
    { skipAutomationHooks: true },
  );

  if (updated) {
    const saved = readBuyerPreferenceProfileRaw(updated);
    logPersistence(contactId, "db_saved_profile", {
      savedKeys: Object.keys((saved as object) || {}).length,
      savedFieldKeys: Object.keys((saved as object) || {}).filter(
        (k) => !["schemaVersion", "profileStatus", "lastExtractedAt", "lastInboundAt"].includes(k),
      ),
    });
  }
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

function triggerInventoryMatchRefresh(userId: string, contactId: string): void {
  logBuyerPreferenceFastPath("inventory_refresh_triggered", { contactId, userId });
  void import("./presence").then(({ notifyUser }) =>
    notifyUser(userId, {
      type: "buyer_preferences_updated",
      contactId,
    }),
  );
}

export async function mergeAndPersistBuyerPreferences(
  contact: Contact,
  patch: BuyerPreferenceExtractionPatch,
  meta?: {
    conversationId?: string;
    messageId?: string;
    logActivity?: boolean;
    replaceArrayFields?: PreferenceArrayReplaceKey[];
    triggerInventoryRefresh?: boolean;
  },
): Promise<BuyerPreferenceProfile> {
  const patchKeys = patchFieldCount(patch);
  if (patchKeys === 0) {
    debugBuyerPreferenceLog("llm_patch_empty", { contactId: contact.id, skipped: true });
    return (
      (await loadPersistedBuyerPreferenceProfile(contact.id)) ??
      readBuyerPreferenceProfile(contact)
    );
  }

  const freshContact = (await storage.getContact(contact.id)) ?? contact;
  const current = readBuyerPreferenceProfile(freshContact);
  const mergeOptions = meta?.replaceArrayFields?.length
    ? { replaceArrayFields: meta.replaceArrayFields }
    : undefined;
  const merged = mergeBuyerPreferenceProfile(
    current,
    patch,
    {
      lastExtractedAt: new Date().toISOString(),
      lastInboundAt: new Date().toISOString(),
    },
    mergeOptions,
  );

  logPersistence(contact.id, "merged_before_save", {
    patchKeys,
    patchFields: Object.keys(patch),
    mergedStatus: merged.profileStatus,
    replaceArrayFields: meta?.replaceArrayFields ?? [],
    mergedFieldKeys: Object.keys(merged).filter(
      (k) => !["schemaVersion", "profileStatus", "lastExtractedAt", "lastInboundAt"].includes(k),
    ),
  });

  await persistBuyerPreferenceProfile(contact.id, merged, {
    logActivity: meta?.logActivity,
    userId: contact.userId,
    conversationId: meta?.conversationId,
  });

  if (meta?.triggerInventoryRefresh !== false) {
    triggerInventoryMatchRefresh(contact.userId, contact.id);
  }

  return (
    (await loadPersistedBuyerPreferenceProfile(contact.id)) ?? merged
  );
}

/**
 * Fast-path extract → persist → reload from DB.
 * Use before AI reply generation so suggest-reply and matching share persisted state.
 */
export async function syncBuyerPreferencesForInboundMessage(input: {
  contact: Contact;
  inboundText: string;
  conversationId?: string;
  messageId?: string;
}): Promise<BuyerPreferenceProfile> {
  const command = parseBuyerSearchCommand(
    input.inboundText,
    readBuyerPreferenceProfile(input.contact),
  );
  if (command.skipProfileUpdate) {
    debugBuyerPreferenceLog("search_command_followup_skip", {
      contactId: input.contact.id,
      explanation: command.explanation,
    });
    return (
      (await loadPersistedBuyerPreferenceProfile(input.contact.id)) ??
      readBuyerPreferenceProfile(input.contact)
    );
  }
  if (hasInventoryPreferenceSignals(input.inboundText)) {
    await runFastPathHeuristicPreferenceUpdate(input.contact, input.inboundText, {
      conversationId: input.conversationId,
      messageId: input.messageId,
    });
  }
  return (
    (await loadPersistedBuyerPreferenceProfile(input.contact.id)) ??
    readBuyerPreferenceProfile(input.contact)
  );
}

/** @deprecated Alias — use syncBuyerPreferencesForInboundMessage. */
export async function ensureFastPathBuyerPreferences(
  contact: Contact,
  inboundText: string,
  meta?: { conversationId?: string; messageId?: string },
): Promise<BuyerPreferenceProfile> {
  return syncBuyerPreferencesForInboundMessage({
    contact,
    inboundText,
    conversationId: meta?.conversationId,
    messageId: meta?.messageId,
  });
}

async function runFastPathHeuristicPreferenceUpdate(
  contact: Contact,
  inboundText: string,
  meta?: { conversationId?: string; messageId?: string },
): Promise<boolean> {
  if (!hasInventoryPreferenceSignals(inboundText)) return false;

  const freshContact = (await storage.getContact(contact.id)) ?? contact;
  const current = readBuyerPreferenceProfile(freshContact);
  const command = parseBuyerSearchCommand(inboundText, current);

  if (command.skipProfileUpdate) {
    logBuyerPreferenceFastPath("preference_change_skipped", {
      contactId: contact.id,
      userId: contact.userId,
      kind: command.kind,
      explanation: command.explanation,
    });
    return false;
  }

  if (patchFieldCount(command.patch) === 0) return false;

  logBuyerPreferenceFastPath("preference_change_detected", {
    contactId: contact.id,
    userId: contact.userId,
    textLen: inboundText.length,
    commandKind: command.kind,
    signals: command.signals,
    replaceArrayFields: command.replaceArrayFields,
    explanation: formatSearchCommandLog(command),
  });

  const merged = await mergeAndPersistBuyerPreferences(freshContact, command.patch, {
    conversationId: meta?.conversationId,
    messageId: meta?.messageId,
    logActivity: false,
    replaceArrayFields: command.replaceArrayFields,
    triggerInventoryRefresh: true,
  });

  logBuyerPreferenceFastPath("profile_updated", {
    contactId: contact.id,
    userId: contact.userId,
    profileStatus: merged.profileStatus,
    commandKind: command.kind,
    patchFields: Object.keys(command.patch),
    replaceArrayFields: command.replaceArrayFields,
  });

  return true;
}

async function loadConversationForExtraction(
  contactId: string,
  limit = 16,
): Promise<Array<{ role: string; content: string }>> {
  const bundle = await storage.getContactWithConversations(contactId);
  const conversations = bundle?.conversations ?? [];
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

  const rawText = response || "{}";
  let raw: unknown;
  try {
    raw = JSON.parse(rawText) as unknown;
  } catch {
    debugBuyerPreferenceLog("llm_json_parse_failed", {
      contactId: contact.id,
      rawPreview: rawText.slice(0, 400),
    });
    raw = {};
  }

  logPersistence(contact.id, "llm_raw", {
    rawPreview: JSON.stringify(raw).slice(0, 1200),
    rawKeys: raw && typeof raw === "object" ? Object.keys(raw as object) : [],
  });

  let patch = normalizeLlmExtractionPatch(raw);
  logPersistence(contact.id, "normalized_patch", {
    patchKeys: patchFieldCount(patch),
    patchFields: Object.keys(patch),
  });

  if (patchFieldCount(patch) === 0) {
    const heuristic = heuristicPatchFromTranscript(transcript);
    const heuristicKeys = patchFieldCount(heuristic);
    if (heuristicKeys > 0) {
      debugBuyerPreferenceLog("llm_patch_heuristic_fallback", {
        contactId: contact.id,
        heuristicKeys,
        fields: Object.keys(heuristic),
      });
      patch = heuristic;
    } else {
      debugBuyerPreferenceLog("llm_patch_empty_after_normalize", {
        contactId: contact.id,
        transcriptChars: transcript.length,
      });
    }
  }

  return patch;
}

export async function runBuyerPreferenceExtraction(
  userId: string,
  contactId: string,
  options?: {
    conversationId?: string;
    messageId?: string;
    inboundText?: string;
    triggerSource?: string;
  },
): Promise<void> {
  const triggerSource = options?.triggerSource ?? "unknown";

  const contact = await storage.getContact(contactId);
  if (!contact || contact.userId !== userId) {
    logTrigger("extraction_skipped", {
      contactId,
      userId,
      triggerSource,
      reason: !contact ? "contact_not_found" : "contact_user_mismatch",
    });
    return;
  }

  const gate = await shouldRunBuyerPreferencePipeline(userId, contact);
  if (!gate.ok) {
    logTrigger("extraction_skipped", {
      contactId,
      userId,
      triggerSource,
      reason: gate.reason,
      ...gate.debug,
    });
    return;
  }

  const text = (options?.inboundText || "").trim();
  if (text.length > 0) {
    const followupCommand = parseBuyerSearchCommand(text, readBuyerPreferenceProfile(contact));
    if (followupCommand.skipProfileUpdate) {
      logTrigger("extraction_skipped", {
        contactId,
        userId,
        triggerSource,
        reason: "search_command_followup",
        explanation: followupCommand.explanation,
      });
      return;
    }
  }
  if (text.length > 0 && text.length < 12 && TRIVIAL_INBOUND_RE.test(text)) {
    logTrigger("extraction_skipped", {
      contactId,
      userId,
      triggerSource,
      reason: "trivial_inbound_text",
      textLen: text.length,
    });
    return;
  }

  const history = await loadConversationForExtraction(contactId);
  if (!history.length && !text) {
    logTrigger("extraction_skipped", {
      contactId,
      userId,
      triggerSource,
      reason: "no_conversation_history",
      textLen: text.length,
    });
    return;
  }

  logTrigger("extraction_started", {
    contactId,
    userId,
    triggerSource,
    gateReason: gate.reason,
    textLen: text.length,
    historyMessages: history.length,
    ...gate.debug,
  });

  try {
    const freshForExisting = (await storage.getContact(contactId)) || contact;
    const existing = readBuyerPreferenceProfile(freshForExisting);
    let patch = await extractPreferencesWithLlm(freshForExisting, history, existing);
    if (text) {
      const command = applyInboundSearchCommandOverrides(patch, text, existing);
      debugBuyerPreferenceLog("search_command_applied", {
        contactId,
        kind: command.kind,
        lockedFields: command.lockedFields,
        explanation: command.explanation,
      });
    }
    if (patchFieldCount(patch) === 0) {
      logTrigger("extraction_completed", {
        contactId,
        userId,
        triggerSource,
        outcome: "empty_patch",
        gateReason: gate.reason,
      });
      return;
    }

    const fresh = (await storage.getContact(contactId)) || contact;
    const replaceArrayFields = text
      ? parseBuyerSearchCommand(text, readBuyerPreferenceProfile(fresh)).replaceArrayFields
      : [];
    const merged = await mergeAndPersistBuyerPreferences(fresh, patch, {
      conversationId: options?.conversationId,
      messageId: options?.messageId,
      logActivity: true,
      replaceArrayFields,
    });
    logTrigger("extraction_completed", {
      contactId,
      userId,
      triggerSource,
      outcome: "persisted",
      gateReason: gate.reason,
      profileStatus: merged.profileStatus,
      patchKeys: patchFieldCount(patch),
    });
  } catch (err) {
    logTrigger("extraction_completed", {
      contactId,
      userId,
      triggerSource,
      outcome: "error",
      error: err instanceof Error ? err.message : String(err),
    });
    debugBuyerPreferenceLog("extract_failed", {
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
  /** Where the schedule call originated (channelService, workflowEngine, …). */
  triggerSource?: string;
}): void {
  const {
    userId,
    contactId,
    conversationId,
    messageId,
    inboundText,
    w2FieldUpdates,
    triggerSource = "schedule",
  } = params;
  const text = (inboundText || "").trim();

  if (text.length > 0 && text.length < 12 && TRIVIAL_INBOUND_RE.test(text)) {
    logTrigger("extraction_skipped", {
      contactId,
      userId,
      triggerSource,
      reason: "trivial_inbound_text",
      textLen: text.length,
    });
    return;
  }

  const inventoryFastPath = hasInventoryPreferenceSignals(text);
  const now = Date.now();
  const last = lastExtractionByContact.get(contactId) || 0;
  const debounceRemainingMs = DEBOUNCE_MS - (now - last);
  if (!inventoryFastPath && now - last < DEBOUNCE_MS) {
    logTrigger("extraction_skipped", {
      contactId,
      userId,
      triggerSource,
      reason: "debounce",
      debounceRemainingMs,
      textLen: text.length,
    });
    return;
  }

  logTrigger("extraction_triggered", {
    contactId,
    userId,
    triggerSource,
    textLen: text.length,
    inventoryFastPath,
    hasW2FieldUpdates: !!(w2FieldUpdates && Object.keys(w2FieldUpdates).length > 0),
    conversationId,
    messageId,
  });

  setImmediate(() => {
    void (async () => {
      const contact = await storage.getContact(contactId);
      if (!contact) {
        logTrigger("extraction_skipped", {
          contactId,
          userId,
          triggerSource,
          reason: "contact_not_found",
        });
        return;
      }

      const gate = await shouldRunBuyerPreferencePipeline(userId, contact);
      if (!gate.ok) {
        logTrigger("extraction_skipped", {
          contactId,
          userId,
          triggerSource,
          reason: gate.reason,
          ...gate.debug,
        });
        return;
      }

      // Only arm debounce once we know extraction will run (gate passed).
      lastExtractionByContact.set(contactId, Date.now());

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

      if (inventoryFastPath && text) {
        await runFastPathHeuristicPreferenceUpdate(contact, text, {
          conversationId,
          messageId,
        });
      }

      await runBuyerPreferenceExtraction(userId, contactId, {
        conversationId,
        messageId,
        inboundText: text,
        triggerSource,
      });
    })().catch((err) => {
      debugBuyerPreferenceLog("schedule_error", {
        contactId,
        triggerSource,
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
