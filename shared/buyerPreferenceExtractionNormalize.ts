/**
 * Normalize raw LLM / legacy JSON into BuyerPreferenceExtractionPatch.
 * Field-level parsing so one bad field does not drop the entire patch.
 */
import {
  type BuyerPreferenceExtractionPatch,
  buyerPreferenceExtractionPatchSchema,
  preferenceSourceSchema,
  financingStatusSchema,
  timelinePreferenceSchema,
} from "./buyerPreferenceSchema";

const PATCH_FIELD_KEYS = [
  "targetAreas",
  "priceMin",
  "priceMax",
  "bedsMin",
  "bathsMin",
  "propertyTypes",
  "investmentIntent",
  "waterfront",
  "pool",
  "gatedCommunity",
  "parking",
  "petFriendly",
  "shortTermRentalAllowed",
  "modernStyle",
  "lowHoa",
  "walkability",
  "schoolPriority",
  "timeline",
  "financingStatus",
  "mustHaves",
  "dealBreakers",
] as const;

function nowIso(): string {
  return new Date().toISOString();
}

function unwrapPayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  for (const nest of ["preferences", "buyerPreferences", "profile", "data", "result"]) {
    const inner = o[nest];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return { ...(inner as Record<string, unknown>), ...o };
    }
  }
  return o;
}

function parseSource(v: unknown): "explicit" | "inferred" {
  const s = String(v ?? "inferred").toLowerCase();
  const parsed = preferenceSourceSchema.safeParse(s);
  return parsed.success ? parsed.data : "inferred";
}

function parseConfidence(v: unknown, source: "explicit" | "inferred"): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.min(1, Math.max(0, v));
  }
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
  }
  return source === "explicit" ? 0.9 : 0.65;
}

function parseMoney(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  const s = String(v ?? "").replace(/,/g, "").toLowerCase();
  const m = s.match(/\$?\s*([\d.]+)\s*(k|m|million|mil)?/i);
  if (!m) return undefined;
  let n = parseFloat(m[1]);
  if (m[2] === "k") n *= 1000;
  if (m[2] === "m" || m[2] === "million" || m[2] === "mil") n *= 1_000_000;
  return Math.round(n);
}

function normalizePropertyTypes(values: string[]): Array<"condo" | "house" | "townhouse" | "multi_family" | "land"> {
  const out: Array<"condo" | "house" | "townhouse" | "multi_family" | "land"> = [];
  for (const raw of values) {
    const s = raw.toLowerCase().replace(/\s+/g, "_");
    if (s.includes("condo")) out.push("condo");
    else if (s.includes("town")) out.push("townhouse");
    else if (s.includes("multi")) out.push("multi_family");
    else if (s.includes("land")) out.push("land");
    else if (s.includes("house") || s.includes("home")) out.push("house");
  }
  return [...new Set(out)];
}

function normalizeTimelineValue(v: unknown): "asap" | "30d" | "60_90d" | "browsing" | "unknown" | undefined {
  const s = String(v ?? "").toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (!s) return undefined;
  if (s === "asap" || s.includes("asap") || s.includes("immediately")) return "asap";
  if (s === "30d" || s.includes("30_day")) return "30d";
  if (s === "60_90d" || s.includes("60_90") || s.includes("60-90")) return "60_90d";
  if (s.includes("brows")) return "browsing";
  if (timelinePreferenceSchema.safeParse(s).success) {
    return timelinePreferenceSchema.parse(s);
  }
  return undefined;
}

function normalizeFinancingValue(v: unknown): "cash" | "pre_approved" | "exploring" | "unknown" | undefined {
  const s = String(v ?? "").toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (!s) return undefined;
  if (s.includes("cash")) return "cash";
  if (s.includes("pre") && s.includes("approv")) return "pre_approved";
  if (s.includes("preapproved")) return "pre_approved";
  if (s.includes("mortgage") || s.includes("loan") || s.includes("financ")) return "exploring";
  if (financingStatusSchema.safeParse(s).success) {
    return financingStatusSchema.parse(s);
  }
  return undefined;
}

function toFieldObject(
  value: unknown,
  defaults?: { source?: "explicit" | "inferred"; confidence?: number; evidence?: string },
): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value) && "value" in (value as object)) {
    const o = value as Record<string, unknown>;
    const source = parseSource(o.source ?? defaults?.source);
    return {
      value: o.value,
      source,
      confidence: parseConfidence(o.confidence, source),
      updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : nowIso(),
      evidence:
        typeof o.evidence === "string"
          ? o.evidence.slice(0, 200)
          : defaults?.evidence?.slice(0, 200),
    };
  }
  const source = defaults?.source ?? "inferred";
  return {
    value,
    source,
    confidence: defaults?.confidence ?? (source === "explicit" ? 0.9 : 0.65),
    updatedAt: nowIso(),
    evidence: defaults?.evidence?.slice(0, 200),
  };
}

function normalizeFieldEntry(
  key: (typeof PATCH_FIELD_KEYS)[number],
  raw: unknown,
): unknown {
  if (raw == null) return undefined;

  if (key === "targetAreas") {
    if (Array.isArray(raw)) {
      const areas = raw.map(String).map((s) => s.trim()).filter(Boolean);
      if (!areas.length) return undefined;
      return toFieldObject(areas, { evidence: "areas mentioned" });
    }
    const fo = toFieldObject(raw);
    if (fo && Array.isArray(fo.value)) {
      const areas = (fo.value as unknown[]).map(String).map((s) => s.trim()).filter(Boolean);
      if (!areas.length) return undefined;
      return { ...fo, value: areas };
    }
    if (typeof raw === "string" && raw.trim()) {
      return toFieldObject([raw.trim()], { evidence: "areas mentioned" });
    }
    return undefined;
  }

  if (key === "priceMin" || key === "priceMax") {
    if (typeof raw === "number") {
      return toFieldObject(raw, { evidence: "budget mentioned" });
    }
    const fo = toFieldObject(raw);
    if (fo) {
      const n = parseMoney(fo.value);
      if (n != null) return { ...fo, value: n };
    }
    if (typeof raw === "string") {
      const n = parseMoney(raw);
      if (n != null) return toFieldObject(n, { evidence: "budget mentioned" });
    }
    return undefined;
  }

  if (key === "bedsMin" || key === "bathsMin") {
    let n: number | undefined;
    if (typeof raw === "number") n = raw;
    else if (typeof raw === "string") {
      const m = raw.match(/([\d.]+)/);
      if (m) n = parseFloat(m[1]);
    } else {
      const fo = toFieldObject(raw);
      if (fo && typeof fo.value === "number") n = fo.value;
      else if (fo && typeof fo.value === "string") {
        const m = String(fo.value).match(/([\d.]+)/);
        if (m) n = parseFloat(m[1]);
      }
    }
    if (n != null && Number.isFinite(n) && n > 0) {
      return toFieldObject(Math.round(n), { evidence: key === "bedsMin" ? "beds mentioned" : "baths mentioned" });
    }
    return undefined;
  }

  if (key === "propertyTypes") {
    let list: string[] = [];
    if (Array.isArray(raw)) list = raw.map(String);
    else if (typeof raw === "string") list = [raw];
    else {
      const fo = toFieldObject(raw);
      if (fo && Array.isArray(fo.value)) list = (fo.value as unknown[]).map(String);
      else if (fo && typeof fo.value === "string") list = [fo.value];
    }
    const types = normalizePropertyTypes(list);
    if (!types.length) return undefined;
    return toFieldObject(types, { evidence: "property type mentioned" });
  }

  if (key === "timeline") {
    let tv: unknown = raw;
    const fo = toFieldObject(raw);
    if (fo) tv = fo.value;
    const norm = normalizeTimelineValue(tv);
    if (!norm) return undefined;
    const base = fo ?? toFieldObject(norm)!;
    return { ...base, value: norm };
  }

  if (key === "financingStatus") {
    let fv: unknown = raw;
    const fo = toFieldObject(raw);
    if (fo) fv = fo.value;
    const norm = normalizeFinancingValue(fv);
    if (!norm) return undefined;
    const base = fo ?? toFieldObject(norm)!;
    return { ...base, value: norm };
  }

  if (
    key === "investmentIntent" ||
    key === "waterfront" ||
    key === "pool" ||
    key === "gatedCommunity" ||
    key === "parking" ||
    key === "petFriendly" ||
    key === "shortTermRentalAllowed" ||
    key === "modernStyle" ||
    key === "lowHoa" ||
    key === "walkability" ||
    key === "schoolPriority"
  ) {
    let boolVal: boolean | undefined;
    if (typeof raw === "boolean") boolVal = raw;
    else if (typeof raw === "string") {
      boolVal = /^(true|yes|1)$/i.test(raw);
    } else {
      const fo = toFieldObject(raw);
      if (fo && typeof fo.value === "boolean") boolVal = fo.value;
    }
    if (boolVal === undefined) return undefined;
    return toFieldObject(boolVal, { evidence: `${key} mentioned` });
  }

  if (key === "mustHaves" || key === "dealBreakers") {
    let items: string[] = [];
    if (Array.isArray(raw)) items = raw.map(String);
    else if (typeof raw === "string") items = raw.split(/[,;]/).map((s) => s.trim());
    else {
      const fo = toFieldObject(raw);
      if (fo && Array.isArray(fo.value)) items = (fo.value as unknown[]).map(String);
    }
    items = items.map((s) => s.trim()).filter(Boolean);
    if (!items.length) return undefined;
    return toFieldObject(items, { evidence: `${key} mentioned` });
  }

  return undefined;
}

/** Map loose LLM keys onto canonical patch keys. */
function applyAliases(mapped: Record<string, unknown>): void {
  if (mapped.areas && !mapped.targetAreas) mapped.targetAreas = mapped.areas;
  if (mapped.area && !mapped.targetAreas) mapped.targetAreas = mapped.area;
  if (mapped.location && !mapped.targetAreas) mapped.targetAreas = mapped.location;
  if (mapped.neighborhood && !mapped.targetAreas) mapped.targetAreas = mapped.neighborhood;

  if (mapped.budget != null && mapped.priceMax == null && mapped.priceMin == null) {
    mapped.priceMax = mapped.budget;
  }
  if (mapped.budgetMax && !mapped.priceMax) mapped.priceMax = mapped.budgetMax;
  if (mapped.budgetMin && !mapped.priceMin) mapped.priceMin = mapped.budgetMin;

  if (mapped.financing && !mapped.financingStatus) mapped.financingStatus = mapped.financing;
  if (mapped.preApproved != null && !mapped.financingStatus) {
    mapped.financingStatus =
      mapped.preApproved === true || mapped.preApproved === "yes" ? "pre_approved" : mapped.preApproved;
  }

  if (mapped.beds && !mapped.bedsMin) mapped.bedsMin = mapped.beds;
  if (mapped.bedrooms && !mapped.bedsMin) mapped.bedsMin = mapped.bedrooms;
  if (mapped.baths && !mapped.bathsMin) mapped.bathsMin = mapped.baths;

  if (mapped.propertyType && !mapped.propertyTypes) mapped.propertyTypes = mapped.propertyType;
  if (mapped.type && !mapped.propertyTypes) mapped.propertyTypes = mapped.type;

  if (mapped.modern && !mapped.modernStyle) mapped.modernStyle = mapped.modern;
  if (mapped.style && !mapped.modernStyle && String(mapped.style).toLowerCase().includes("modern")) {
    mapped.modernStyle = true;
  }
}

export function normalizeLlmExtractionPatch(raw: unknown): BuyerPreferenceExtractionPatch {
  const unwrapped = unwrapPayload(raw);
  const mapped: Record<string, unknown> = { ...unwrapped };
  applyAliases(mapped);

  const patch: Record<string, unknown> = {};
  for (const key of PATCH_FIELD_KEYS) {
    if (mapped[key] !== undefined) {
      const norm = normalizeFieldEntry(key, mapped[key]);
      if (norm !== undefined) patch[key] = norm;
    }
  }

  const parsed = buyerPreferenceExtractionPatchSchema.safeParse(patch);
  if (parsed.success) return parsed.data;

  // Last resort: return field objects that individually validate
  const loose: BuyerPreferenceExtractionPatch = {};
  for (const [key, val] of Object.entries(patch)) {
    const single = buyerPreferenceExtractionPatchSchema.safeParse({ [key]: val });
    if (single.success && single.data[key as keyof BuyerPreferenceExtractionPatch]) {
      loose[key as keyof BuyerPreferenceExtractionPatch] = single.data[
        key as keyof BuyerPreferenceExtractionPatch
      ] as never;
    }
  }
  return loose;
}

/** Regex/heuristic fallback when LLM JSON does not validate. */
export function heuristicPatchFromTranscript(transcript: string): BuyerPreferenceExtractionPatch {
  const text = transcript || "";
  const lower = text.toLowerCase();
  const now = nowIso();
  const inf = (confidence: number, evidence: string) => ({
    source: "inferred" as const,
    confidence,
    updatedAt: now,
    evidence,
  });
  const patch: BuyerPreferenceExtractionPatch = {};

  const areaHits: string[] = [];
  const brickell = lower.match(/\bbrickell\b/);
  if (brickell) areaHits.push("Brickell");
  for (const m of text.matchAll(/\b(?:in|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g)) {
    if (m[1] && !areaHits.some((a) => a.toLowerCase() === m[1].toLowerCase())) {
      areaHits.push(m[1]);
    }
  }
  if (areaHits.length) {
    patch.targetAreas = { value: areaHits.slice(0, 6), ...inf(0.75, "area in message") };
  }

  const types: Array<"condo" | "house" | "townhouse" | "multi_family" | "land"> = [];
  if (/\bcondo\b/i.test(lower)) types.push("condo");
  if (/\b(townhouse|town house)\b/i.test(lower)) types.push("townhouse");
  if (/\b(house|home)\b/i.test(lower)) types.push("house");
  if (types.length) {
    patch.propertyTypes = { value: types, ...inf(0.7, "property type in message") };
  }

  const bedM = lower.match(/(\d+)\s*[- ]?\s*bed/);
  if (bedM) {
    patch.bedsMin = { value: parseInt(bedM[1], 10), ...inf(0.72, "beds in message") };
  }

  if (/\bpool\b/i.test(lower)) {
    patch.pool = { value: true, ...inf(0.7, "pool in message") };
  }
  if (/\bmodern\b/i.test(lower)) {
    patch.modernStyle = { value: true, ...inf(0.68, "modern in message") };
  }

  const budgetM = lower.match(/(?:\$|budget\s*)([\d.]+)\s*(k|m|million)?/i);
  if (budgetM) {
    let n = parseFloat(budgetM[1]);
    if (budgetM[2] === "k") n *= 1000;
    if (budgetM[2] === "m" || budgetM[2] === "million") n *= 1_000_000;
    patch.priceMax = { value: Math.round(n), ...inf(0.78, "budget in message") };
  }

  if (/\bpre[- ]?approved\b/i.test(lower)) {
    patch.financingStatus = { value: "pre_approved", ...inf(0.8, "financing in message") };
  } else if (/\bcash\b/i.test(lower)) {
    patch.financingStatus = { value: "cash", ...inf(0.75, "financing in message") };
  }

  if (/\basap\b/i.test(lower)) {
    patch.timeline = { value: "asap", ...inf(0.72, "timeline in message") };
  }

  return patch;
}

export function patchFieldCount(patch: BuyerPreferenceExtractionPatch): number {
  return Object.keys(patch).length;
}
