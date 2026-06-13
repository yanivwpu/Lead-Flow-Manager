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
  buyerGeoConstraintSchema,
} from "./buyerPreferenceSchema";
import {
  detectShowMeAllPropertyTypeRelaxation,
  RESIDENTIAL_RENTAL_PROPERTY_TYPES,
  SHOW_ME_ALL_PROPERTY_RELAX_EVIDENCE,
} from "./buyerPreferencePropertyTypeRelax";
import { parseGeoConstraintsFromText } from "./inventory/buyerGeoConstraints";

const PATCH_FIELD_KEYS = [
  "targetAreas",
  "priceMin",
  "priceMax",
  "bedsMin",
  "bedsMax",
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
  "transactionIntent",
  "financingStatus",
  "mustHaves",
  "dealBreakers",
  "geoConstraints",
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

/** Map SFH / single family labels to canonical `house`. */
export function normalizePropertyTypeToken(
  raw: string,
): "condo" | "house" | "townhouse" | "multi_family" | "land" | null {
  const s = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (/\b(sfh|single[\s-]?family(?:\s+home)?)\b/.test(s)) return "house";
  if (s.includes("condo")) return "condo";
  if (s.includes("apartment")) return "condo";
  if (s.includes("town")) return "townhouse";
  if (s.includes("multi")) return "multi_family";
  if (s.includes("land")) return "land";
  if (s.includes("house") || s.includes("home")) return "house";
  return null;
}

function normalizePropertyTypes(values: string[]): Array<"condo" | "house" | "townhouse" | "multi_family" | "land"> {
  const out: Array<"condo" | "house" | "townhouse" | "multi_family" | "land"> = [];
  for (const raw of values) {
    const norm = normalizePropertyTypeToken(raw);
    if (norm) out.push(norm);
  }
  return [...new Set(out)];
}

function extractPropertyTypesFromText(lower: string): Array<"condo" | "house" | "townhouse" | "multi_family" | "land"> {
  const types: Array<"condo" | "house" | "townhouse" | "multi_family" | "land"> = [];
  if (/\bcondo(?:minium)?s?\b/i.test(lower)) types.push("condo");
  if (/\bapartments?\b/i.test(lower)) types.push("condo");
  if (/\btownhouse|town[\s-]?house\b/i.test(lower)) types.push("townhouse");
  if (/\b(sfh|single[\s-]?family(?:\s+home)?)\b/i.test(lower)) types.push("house");
  else if (/\b(house|home)\b/i.test(lower) && !/\btown[\s-]?house\b/i.test(lower)) types.push("house");
  if (/\bmulti[\s-]?family\b/i.test(lower)) types.push("multi_family");
  if (/\bland\b/i.test(lower)) types.push("land");
  return [...new Set(types)];
}

function trimAreaLabel(area: string): string {
  return area
    .replace(/\s+(with|and|between|under|up to|around|from|max|at least|at east|who|that|which|for|near)\b.*$/i, "")
    .replace(/\s+(between|under|up to|around|from|max)\b.*$/i, "")
    .replace(/\s+\$\s*.*$/i, "")
    .trim();
}

/** Known South Florida city tokens — prefer over greedy "in …" capture. */
const KNOWN_AREA_CITY_RE =
  /\b(?:in|near|around)\s+(pompano(?:\s+beach)?|boca(?:\s+raton)?|fort\s+lauderdale|hollywood|deerfield(?:\s+beach)?|coral\s+springs|miami(?:\s+beach)?|delray(?:\s+beach)?)\b/i;

function extractAreasFromText(text: string, lower: string): string[] {
  const areaHits: string[] = [];

  const knownCity = text.match(KNOWN_AREA_CITY_RE);
  if (knownCity?.[1]) {
    const raw = knownCity[1].replace(/\s+/g, " ").trim();
    const label =
      raw.toLowerCase() === "pompano"
        ? "Pompano Beach"
        : raw
            .split(/\s+/)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(" ");
    if (label && !areaHits.some((a) => a.toLowerCase() === label.toLowerCase())) {
      areaHits.push(label);
    }
  }

  const geoM = text.match(
    /\b((?:east|west|north|south)\s+of\s+(?:the\s+)?[^.?]+?(?:\s+in\s+[A-Za-z][A-Za-z\s]+)?)/i,
  );
  if (geoM?.[1]) {
    const geo = trimAreaLabel(geoM[1]);
    if (geo && !areaHits.some((a) => a.toLowerCase() === geo.toLowerCase())) {
      areaHits.push(geo);
    }
  }

  if (areaHits.length === 0) {
    for (const m of text.matchAll(/\b(?:in|near|around)\s+([A-Za-z][A-Za-z\s]{0,28}?)(?=\s+(?:with|and|between|up to|who|that|which|,|\.|$))/g)) {
      const area = trimAreaLabel(m[1]?.trim() || "");
      if (!area) continue;
      if (!areaHits.some((a) => a.toLowerCase() === area.toLowerCase())) {
        areaHits.push(area);
      }
    }
  }

  const brickell = lower.match(/\bbrickell\b/);
  if (brickell && !areaHits.some((a) => a.toLowerCase() === "brickell")) {
    areaHits.push("Brickell");
  }

  if (/\b(?:close to|near|walking distance to)\s+(?:the\s+)?beach\b/i.test(lower)) {
    const label = "Close to beach";
    if (!areaHits.some((a) => a.toLowerCase() === label.toLowerCase())) {
      areaHits.push(label);
    }
  }

  return areaHits.slice(0, 6);
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

  if (key === "bedsMin" || key === "bathsMin" || key === "bedsMax") {
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

  if (key === "transactionIntent") {
    let tv: unknown = raw;
    const fo = toFieldObject(raw);
    if (fo) tv = fo.value;
    const s = String(tv ?? "").toLowerCase();
    let norm: "buy" | "rent" | "unknown" | undefined;
    if (/\b(rent|rental|lease|leasing|for\s+rent|tenant)\b/.test(s)) norm = "rent";
    else if (/\b(buy|purchase|for\s+sale|homes?\s+for\s+sale)\b/.test(s)) norm = "buy";
    else if (s === "unknown") norm = "unknown";
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

  if (key === "geoConstraints") {
    let items: unknown[] = [];
    if (Array.isArray(raw)) items = raw;
    else {
      const fo = toFieldObject(raw);
      if (fo && Array.isArray(fo.value)) items = fo.value as unknown[];
    }
    const parsed = items
      .map((item) => buyerGeoConstraintSchema.safeParse(item))
      .filter((r) => r.success)
      .map((r) => r.data);
    if (!parsed.length) return undefined;
    return toFieldObject(parsed, { evidence: "geo constraint mentioned" });
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

/** Heuristic patch from the latest inbound message only (fast-path). */
export function heuristicPatchFromInboundText(inboundText: string): BuyerPreferenceExtractionPatch {
  return heuristicPatchFromTranscript(inboundText, { latestUserLineOnly: true });
}

/** Regex/heuristic fallback when LLM JSON does not validate. */
export function heuristicPatchFromTranscript(
  transcript: string,
  options?: { latestUserLineOnly?: boolean },
): BuyerPreferenceExtractionPatch {
  let text = transcript || "";
  if (options?.latestUserLineOnly) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const userLines = lines.filter((l) => /^user\s*:/i.test(l));
    if (userLines.length > 0) {
      text = userLines[userLines.length - 1].replace(/^user\s*:\s*/i, "");
    }
  }

  const lower = text.toLowerCase();
  const now = nowIso();
  const inf = (confidence: number, evidence: string) => ({
    source: "inferred" as const,
    confidence,
    updatedAt: now,
    evidence,
  });
  const patch: BuyerPreferenceExtractionPatch = {};

  const geoHits = parseGeoConstraintsFromText(text);
  if (geoHits.length) {
    patch.geoConstraints = { value: geoHits, ...inf(0.9, "geo constraint in message") };
  }

  const areaHits = extractAreasFromText(text, lower);
  for (const g of geoHits) {
    const city = g.cityContext?.trim();
    if (city && !areaHits.some((a) => a.toLowerCase() === city.toLowerCase())) {
      areaHits.push(city);
    }
  }
  if (areaHits.length) {
    patch.targetAreas = { value: areaHits, ...inf(0.8, "area in message") };
  }

  const bedBathSlash = lower.match(/(\d+)\s*\/\s*(\d+(?:\.\d+)?)/);
  const isBedBathCorrection =
    /\b(too big|too many bed|instead|only|is better|better|rather than|too large)\b/i.test(lower);
  const tooBigBedM = lower.match(/(\d+)\s*beds?\s+(?:is|are)\s+too\s+big/i);
  const tooManyBeds = /\btoo many bed(?:room)?s?\b/i.test(lower);

  const types = extractPropertyTypesFromText(lower);
  const relaxPropertyTypes = detectShowMeAllPropertyTypeRelaxation(text);
  if (relaxPropertyTypes) {
    patch.propertyTypes = {
      value: [...RESIDENTIAL_RENTAL_PROPERTY_TYPES],
      ...inf(0.9, SHOW_ME_ALL_PROPERTY_RELAX_EVIDENCE),
    };
  } else {
    if (
      !types.length &&
      bedBathSlash &&
      /\bpool\b/i.test(lower) &&
      (/\bshow me\b/i.test(lower) || /\blooking for\b/i.test(lower))
    ) {
      types.push("house");
    }
    if (types.length) {
      patch.propertyTypes = { value: types, ...inf(0.82, "property type in message") };
    }
  }

  const applyBedBathCorrection = (beds: number, baths: number, evidence: string) => {
    patch.bedsMin = { value: beds, ...inf(0.93, evidence) };
    patch.bedsMax = { value: beds, ...inf(0.93, evidence) };
    patch.bathsMin = { value: baths, ...inf(0.93, evidence) };
  };

  if (bedBathSlash && (isBedBathCorrection || tooBigBedM || tooManyBeds)) {
    applyBedBathCorrection(
      parseInt(bedBathSlash[1], 10),
      parseFloat(bedBathSlash[2]),
      "beds correction in message",
    );
  } else if (tooBigBedM) {
    const rejected = parseInt(tooBigBedM[1], 10);
    const maxBeds = Math.max(1, rejected - 1);
    patch.bedsMax = { value: maxBeds, ...inf(0.9, "beds too big correction") };
    patch.bedsMin = { value: maxBeds, ...inf(0.9, "beds too big correction") };
    if (bedBathSlash) {
      patch.bathsMin = {
        value: parseFloat(bedBathSlash[2]),
        ...inf(0.9, "beds too big correction"),
      };
    }
  } else if (tooManyBeds && bedBathSlash) {
    applyBedBathCorrection(
      parseInt(bedBathSlash[1], 10),
      parseFloat(bedBathSlash[2]),
      "beds correction in message",
    );
  } else if (bedBathSlash) {
    patch.bedsMin = { value: parseInt(bedBathSlash[1], 10), ...inf(0.86, "beds in message") };
    patch.bathsMin = { value: parseFloat(bedBathSlash[2]), ...inf(0.86, "baths in message") };
  } else {
    const atLeastBedM =
      lower.match(/\b(?:at\s+least|at\s+east|minimum|min)\s+(\d+)\s*[- ]?\s*bed/) ??
      lower.match(/\b(?:at\s+least|at\s+east|minimum|min)\s+(\d+)\s+bedrooms?\b/);
    if (atLeastBedM) {
      patch.bedsMin = {
        value: parseInt(atLeastBedM[1], 10),
        ...inf(0.88, "at least beds in message"),
      };
    }
    const bedM = !atLeastBedM ? lower.match(/(\d+)\s*[- ]?\s*bed/) : null;
    if (bedM) {
      patch.bedsMin = { value: parseInt(bedM[1], 10), ...inf(0.72, "beds in message") };
    }
    const bathM = lower.match(/(\d+(?:\.\d+)?)\s*[- ]?\s*bath/);
    if (bathM) {
      patch.bathsMin = { value: parseFloat(bathM[1]), ...inf(0.72, "baths in message") };
    }
  }

  if (/\bpool\b/i.test(lower)) {
    patch.pool = { value: true, ...inf(0.7, "pool in message") };
  }
  if (/\b(rent|rentals?|renting|lease|leasing|for\s+rent|tenant)\b/i.test(lower)) {
    patch.transactionIntent = { value: "rent", ...inf(0.88, "rent intent in message") };
  } else if (
    /\b(homes?\s+for\s+sale|for\s+sale|buy|buying|purchase|looking to buy|looking for a home|cash buyer|can buy)\b/i.test(
      lower,
    ) ||
    (/\bshow me\b/i.test(lower) &&
      !relaxPropertyTypes &&
      /(?:\$\s*[\d,.]+(?:\s*(?:k|m|million|mil))?|\b[\d,.]+\s*(?:million|mil)\b)/i.test(lower))
  ) {
    patch.transactionIntent = { value: "buy", ...inf(0.88, "buy intent in message") };
  }
  if (/\bmodern\b/i.test(lower)) {
    patch.modernStyle = { value: true, ...inf(0.68, "modern in message") };
  }

  const isBuyHomeContext =
    /\b(cash buyer|buy(?:er|ing)?|purchase|for sale|sfh|single[\s-]?family|home(?:s)?\s+for\s+sale|looking for a home)\b/i.test(
      lower,
    ) && !/\b(for\s+rent|rentals?|rental|lease|renting)\b/i.test(lower);

  const parseBudgetAmount = (amount: string, suffix?: string): number | null => {
    const cleaned = amount.replace(/,/g, "");
    let n = parseFloat(cleaned);
    if (!Number.isFinite(n) || n <= 0) return null;
    const s = (suffix || "").toLowerCase();
    if (s === "k") n *= 1000;
    if (s === "m" || s === "million" || s === "mil") n *= 1_000_000;
    if (!suffix && isBuyHomeContext && n >= 100 && n <= 2_500) {
      n *= 1000;
    }
    return Math.round(n);
  };

  const normalizedForBudget = text.replace(/,/g, "");
  const betweenRangeM = normalizedForBudget.match(
    /\bbetween\s+\$?\s*([\d.]+)\s*(k|m|million|mil)?\s*(?:and|-|–|to)\s+\$?\s*([\d.]+)\s*(k|m|million|mil)?/i,
  );
  const dashRangeM = normalizedForBudget.match(
    /\$\s*([\d.]+)\s*(k|m|million|mil)?\s*(?:-|–|to)\s*\$?\s*([\d.]+)\s*(k|m|million|mil)?/i,
  );
  const verbalRangeM = lower.match(
    /\bbetween\s+([\d.]+)\s*(k|m|million|mil)\s+(?:and|to|-)\s+([\d.]+)\s*(k|m|million|mil)\b/i,
  );
  const verbalToM = lower.match(
    /\b([\d.]+)\s*(k|m|million|mil)\s+(?:to|-)\s+([\d.]+)\s*(k|m|million|mil)\b/i,
  );

  const parseUpToBudgetFromText = (): number | null => {
    const matches = [
      ...lower.matchAll(/\bup\s+to\s+(\$?\s*[\d,.]+)\s*(k|m|million|mil)?/gi),
    ];
    for (const m of matches) {
      const fragment = m[0];
      const tail = lower.slice((m.index ?? 0) + fragment.length, (m.index ?? 0) + fragment.length + 16);
      if (
        /\b(?:sq\.?\s*ft|sqft|square\s*feet)\b/i.test(fragment) ||
        /\b(?:sq\.?\s*ft|sqft|square\s*feet)\b/i.test(tail)
      ) {
        continue;
      }
      const amountMatch = fragment.match(/([\d,.]+)\s*(k|m|million|mil)?/i);
      if (!amountMatch) continue;
      const hasMoneyMarker = fragment.includes("$") || !!amountMatch[2];
      if (!hasMoneyMarker) continue;
      const amount = parseBudgetAmount(amountMatch[1], amountMatch[2]);
      if (amount != null) return amount;
    }
    return null;
  };

  const rangeMatch = betweenRangeM ?? dashRangeM ?? verbalRangeM ?? verbalToM;
  if (rangeMatch) {
    const minAmount = parseBudgetAmount(rangeMatch[1], rangeMatch[2]);
    const maxAmount = parseBudgetAmount(rangeMatch[3], rangeMatch[4]);
    if (minAmount != null && maxAmount != null && minAmount <= maxAmount) {
      patch.priceMin = {
        value: minAmount,
        ...inf(0.92, "budget range in message"),
      };
      patch.priceMax = {
        value: maxAmount,
        ...inf(0.92, "budget range in message"),
      };
    }
  } else {
    const upToBudgetAmount = parseUpToBudgetFromText();
    const budgetM = normalizedForBudget.match(/(?:\$|budget\s*)([\d.]+)\s*(k|m|million|mil)?/i);
    if (upToBudgetAmount != null) {
      patch.priceMax = {
        value: upToBudgetAmount,
        ...inf(0.9, "up to budget in message"),
      };
    } else if (budgetM) {
      const amount = parseBudgetAmount(budgetM[1], budgetM[2]);
      if (amount != null) {
        patch.priceMax = {
          value: amount,
          ...inf(0.78, "budget in message"),
        };
      }
    }
  }

  const upToSqftM = lower.match(
    /\bup\s+to\s+(\d{1,3}(?:,\d{3})+|\d+)\s*(?:sq\.?\s*ft|sqft|square\s*feet)\b/i,
  );
  if (upToSqftM) {
    const sqftMax = parseInt(upToSqftM[1].replace(/,/g, ""), 10);
    if (Number.isFinite(sqftMax) && sqftMax > 0) {
      patch.mustHaves = {
        value: [`sqft_max:${sqftMax}`],
        ...inf(0.9, "max sqft in message"),
      };
    }
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
