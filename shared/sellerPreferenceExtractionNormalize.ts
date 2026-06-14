import type { PreferenceField } from "./buyerPreferenceSchema";
import type { SellerPreferenceProfile, SellerTimeline } from "./sellerPreferenceSchema";
import { classifySellerIntent } from "./sellerIntent";

const MIN_CONF = 0.72;

function field<T>(value: T, evidence: string): PreferenceField<T> {
  return {
    value,
    source: "inferred",
    confidence: MIN_CONF,
    updatedAt: new Date().toISOString(),
    evidence: evidence.slice(0, 200),
  };
}

function parseMoney(raw: string): number | null {
  const s = raw.replace(/,/g, "").toLowerCase();
  const m = s.match(/\$?\s*([\d.]+)\s*(k|m|million)?/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (m[2] === "k") n *= 1000;
  if (m[2] === "m" || m[2] === "million") n *= 1_000_000;
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parseTimeline(text: string): SellerTimeline | null {
  const t = text.toLowerCase();
  if (/\b(asap|immediately|right away|this month)\b/.test(t)) return "asap";
  if (/\b(30\s*days?|within\s+a\s+month|next\s+month)\b/.test(t)) return "30d";
  if (/\b(60|90|two\s+months|three\s+months|few\s+months)\b/.test(t)) return "60_90d";
  if (/\b(just\s+looking|exploring|not\s+sure|browsing)\b/.test(t)) return "browsing";
  return null;
}

/** Heuristic seller profile patch from a single inbound line (Phase 1 — no LLM). */
export function heuristicSellerPatchFromText(
  text: string,
  existing?: SellerPreferenceProfile,
): Partial<SellerPreferenceProfile> {
  const t = (text || "").trim();
  if (!t) return {};

  const patch: Partial<SellerPreferenceProfile> = {};
  const intent = classifySellerIntent({
    inboundText: t,
    hasSellerProfile: existing ? existing.profileStatus !== "empty" : false,
    priorSellerIntent: (existing?.lastSellerIntent as never) || null,
  });
  if (intent) patch.lastSellerIntent = intent;

  const addressMatch = t.match(
    /\b(?:at|address\s+is|property\s+is\s+at|located\s+at)\s+(\d{1,6}\s+[A-Za-z0-9\s.'#-]{3,60})/i,
  );
  if (addressMatch) patch.propertyAddress = field(addressMatch[1].trim(), t);

  const cityMatch = t.match(/\b(?:in|near)\s+([A-Za-z][A-Za-z\s.'-]{2,40})(?:\s*,|\s+(?:fl|florida|tx|ca|ny)\b|$)/i);
  if (cityMatch) patch.city = field(cityMatch[1].trim(), t);

  const bedsMatch = t.match(/\b(\d)\s*(?:bed|br|bedroom)/i);
  if (bedsMatch) patch.beds = field(parseInt(bedsMatch[1], 10), t);

  const bathsMatch = t.match(/\b(\d+(?:\.\d+)?)\s*(?:bath|ba|bathroom)/i);
  if (bathsMatch) patch.baths = field(parseFloat(bathsMatch[1]), t);

  const sqftMatch = t.match(/\b(\d{1,3}(?:,\d{3})+|\d{3,5})\s*(?:sq\.?\s*ft|sqft|square\s*feet)/i);
  if (sqftMatch) patch.sqft = field(parseInt(sqftMatch[1].replace(/,/g, ""), 10), t);

  const timeline = parseTimeline(t);
  if (timeline) patch.timeline = field(timeline, t);

  const reasonMatch = t.match(
    /\b(?:because|since|reason\s+is|selling\s+because)\s+(.{4,120})/i,
  );
  if (reasonMatch) patch.reasonForSelling = field(reasonMatch[1].trim().replace(/[.?!]+$/, ""), t);
  else if (/\b(relocat|downsiz|upsiz|job\s+transfer|retir|divorc|inherit|investment\s+exit)\w*/i.test(t)) {
    patch.reasonForSelling = field(t.slice(0, 120), t);
  }

  if (/\b(move[- ]in\s+ready|updated|renovated|great\s+condition)\b/i.test(t)) {
    patch.condition = field("move_in_ready", t);
  } else if (/\b(needs?\s+work|fixer|as[- ]is|deferred)\b/i.test(t)) {
    patch.condition = field("needs_work", t);
  }

  const desired = t.match(/\b(?:asking|want|hoping|list\s+for|sell\s+for)\s+(?:around\s+)?(\$[\d,.]+[km]?|\d{3,3}(?:,\d{3})+)/i);
  if (desired) {
    const n = parseMoney(desired[1]);
    if (n) patch.desiredPrice = field(n, t);
  }

  const worth = t.match(/\b(?:worth|value)\s+(?:around\s+)?(\$[\d,.]+[km]?)/i);
  if (worth) {
    const n = parseMoney(worth[1]);
    if (n) patch.estimatedValue = field(n, t);
  }

  if (/\b(owner[- ]occupied|we\s+live\s+there|i\s+live\s+there)\b/i.test(t)) {
    patch.occupancyStatus = field("owner_occupied", t);
  } else if (/\b(tenant|rented|rental)\b/i.test(t)) {
    patch.occupancyStatus = field("tenant_occupied", t);
  } else if (/\b(vacant|empty)\b/i.test(t)) {
    patch.occupancyStatus = field("vacant", t);
  }

  if (/\b(mortgage|loan)\b/i.test(t)) {
    patch.mortgageBalanceKnown = field(!/\b(no|not\s+sure|unknown)\s+mortgage\b/i.test(t), t);
  }

  if (/\b(single[- ]family|sfh|detached)\b/i.test(t)) patch.propertyType = field("house", t);
  else if (/\bcondo\b/i.test(t)) patch.propertyType = field("condo", t);
  else if (/\btown\s*house\b/i.test(t)) patch.propertyType = field("townhouse", t);

  return patch;
}

export function mergeSellerPreferenceProfile(
  base: SellerPreferenceProfile,
  patch: Partial<SellerPreferenceProfile>,
): SellerPreferenceProfile {
  const merged: SellerPreferenceProfile = { ...base, ...patch, schemaVersion: 1 };
  const fieldKeys = [
    "propertyAddress",
    "city",
    "propertyType",
    "beds",
    "baths",
    "sqft",
    "timeline",
    "reasonForSelling",
    "estimatedValue",
    "desiredPrice",
    "mortgageBalanceKnown",
    "occupancyStatus",
    "condition",
  ] as const;

  let filled = 0;
  for (const key of fieldKeys) {
    const f = merged[key];
    if (f && typeof f === "object" && "value" in f && f.value != null && f.value !== "") filled++;
  }

  merged.profileStatus = filled >= 4 ? "ready" : filled >= 1 ? "partial" : "empty";
  merged.lastExtractedAt = new Date().toISOString();
  return merged;
}
