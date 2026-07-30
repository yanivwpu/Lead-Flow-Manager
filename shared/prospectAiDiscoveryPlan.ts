/**
 * Prospect AI discovery planning — target size, query/geo expansion, stop reasons.
 * Pure helpers (no I/O). Google Places pageSize max is 20; pagination is required for larger targets.
 */

export const PROSPECT_AI_DISCOVERY_TARGET_OPTIONS = [25, 50, 100, 250] as const;
export type ProspectAiDiscoveryTargetCount =
  (typeof PROSPECT_AI_DISCOVERY_TARGET_OPTIONS)[number];

export const PROSPECT_AI_DEFAULT_DISCOVERY_TARGET: ProspectAiDiscoveryTargetCount = 50;

export const PROSPECT_AI_LOCATION_EXPANSION_MODES = [
  "exact",
  "nearby",
  "metro",
] as const;
export type ProspectAiLocationExpansionMode =
  (typeof PROSPECT_AI_LOCATION_EXPANSION_MODES)[number];

export const PROSPECT_AI_DEFAULT_LOCATION_EXPANSION: ProspectAiLocationExpansionMode =
  "nearby";

/** Google Places Text Search (New) hard max pageSize. */
export const PROSPECT_AI_PLACES_PAGE_SIZE = 20;

/** Guardrails — prevent unbounded provider loops. */
export const PROSPECT_AI_DISCOVERY_MAX_PAGES_PER_QUERY = 3;
export const PROSPECT_AI_DISCOVERY_MAX_PROVIDER_CALLS = 25;
export const PROSPECT_AI_DISCOVERY_MAX_QUERY_VARIATIONS = 12;

export const PROSPECT_AI_DISCOVERY_STOP_REASONS = [
  "target_reached",
  "source_exhausted",
  "rate_limited",
  "timeout",
  "user_cancelled",
  "provider_error",
  "no_more_unique_results",
  "quota_exhausted",
  "max_provider_calls",
] as const;
export type ProspectAiDiscoveryStopReason =
  (typeof PROSPECT_AI_DISCOVERY_STOP_REASONS)[number];

export type ProspectAiDiscoveryQueryPlanItem = {
  textQuery: string;
  locationLabel: string;
  businessPhrase: string;
  rank: number;
};

export type ProspectAiDiscoveryPlan = {
  targetCount: ProspectAiDiscoveryTargetCount;
  locationExpansion: ProspectAiLocationExpansionMode;
  requestedLocation: string;
  expandedLocations: string[];
  queries: ProspectAiDiscoveryQueryPlanItem[];
};

export type ProspectAiDiscoveryExcludedSample = {
  name: string;
  disposition: "already_exists" | "rejected" | "needs_attention" | "possible_duplicate";
  reason: string | null;
  matchType?: string | null;
  existingRecordId?: string | null;
  existingRecordLabel?: string | null;
  providerPlaceId?: string | null;
  discoveryQuery?: string | null;
};

export type ProspectAiDiscoveryRunDiagnostics = {
  runId: string | null;
  targetCount: number;
  locationExpansion: ProspectAiLocationExpansionMode;
  expandedLocations: string[];
  queryVariationsAttempted: string[];
  pagesFetched: number;
  providerCalls: number;
  provider: string;
  /** Raw provider rows seen before filtering. */
  rawResults: number;
  /** Distinct provider identities considered after in-run collapse. */
  uniqueInRun: number;
  duplicatesInRun: number;
  alreadyInWorkspace: number;
  rejectedInvalid: number;
  rejectedClosed: number;
  rejectedQuality: number;
  rejectedRelevance: number;
  /** @deprecated Prefer usableNeedsAttention — kept for older UI. */
  needsAttention: number;
  /** Usable-but-uncertain rows that count toward target/quota. */
  usableNeedsAttention: number;
  /** Soft duplicate candidates — not saved, not charged. */
  possibleDuplicates: number;
  readyForReview: number;
  /** Net-new usable rows saved (ready + usable needs_attention). Counts toward quota. */
  saved: number;
  netNewUsable: number;
  /** Same as saved/netNewUsable — explicit quota units consumed by this run. */
  quotaConsumed: number;
  stopReason: ProspectAiDiscoveryStopReason;
  resultsPerQuery: Array<{
    textQuery: string;
    pages: number;
    returned: number;
    uniqueAdded: number;
  }>;
  /** Non-persisted samples (already exists / rejected / possible duplicates). */
  excludedSamples?: ProspectAiDiscoveryExcludedSample[];
};

export function normalizeDiscoveryTargetCount(
  value: unknown,
): ProspectAiDiscoveryTargetCount {
  const n = Number(value);
  if (
    (PROSPECT_AI_DISCOVERY_TARGET_OPTIONS as readonly number[]).includes(n)
  ) {
    return n as ProspectAiDiscoveryTargetCount;
  }
  return PROSPECT_AI_DEFAULT_DISCOVERY_TARGET;
}

export function normalizeLocationExpansionMode(
  value: unknown,
): ProspectAiLocationExpansionMode {
  const s = String(value || "")
    .trim()
    .toLowerCase();
  if ((PROSPECT_AI_LOCATION_EXPANSION_MODES as readonly string[]).includes(s)) {
    return s as ProspectAiLocationExpansionMode;
  }
  return PROSPECT_AI_DEFAULT_LOCATION_EXPANSION;
}

/** Normalize city/location label for metro lookup (lowercase, strip state suffix loosely). */
export function normalizeLocationKey(location: string): string {
  return String(location || "")
    .trim()
    .toLowerCase()
    .replace(/\s*,\s*[a-z]{2}\s*$/i, "")
    .replace(/\s+/g, " ");
}

/**
 * Optional metro/neighborhood expansions. Keys are normalized city names.
 * Generic — not Miami-only; unknown cities get exact (+ light metro label only).
 */
export const PROSPECT_AI_METRO_EXPANSIONS: Record<string, string[]> = {
  miami: ["Miami Beach", "Coral Gables", "Brickell", "Doral", "Hialeah"],
  "miami beach": ["Miami", "Surfside", "Bal Harbour"],
  austin: ["Round Rock", "Cedar Park", "Pflugerville"],
  "new york": ["Brooklyn", "Queens", "Manhattan", "Jersey City"],
  nyc: ["Brooklyn", "Queens", "Manhattan"],
  chicago: ["Evanston", "Oak Park", "Naperville"],
  "los angeles": ["Santa Monica", "Pasadena", "Glendale", "Long Beach"],
  la: ["Santa Monica", "Pasadena", "Glendale"],
  houston: ["Sugar Land", "The Woodlands", "Katy"],
  dallas: ["Plano", "Irving", "Arlington"],
  atlanta: ["Decatur", "Marietta", "Sandy Springs"],
  denver: ["Aurora", "Lakewood", "Boulder"],
  seattle: ["Bellevue", "Tacoma", "Redmond"],
  boston: ["Cambridge", "Somerville", "Brookline"],
  phoenix: ["Scottsdale", "Tempe", "Mesa"],
  "san francisco": ["Oakland", "Berkeley", "San Jose"],
  "san diego": ["La Jolla", "Chula Vista", "Carlsbad"],
  philadelphia: ["King of Prussia", "Cherry Hill"],
  "tampa": ["St. Petersburg", "Clearwater"],
  orlando: ["Winter Park", "Kissimmee"],
  "fort lauderdale": ["Hollywood", "Pompano Beach", "Davie"],
};

/**
 * Industry synonym seeds — matched when the user's businessType contains a key token.
 * Keep expansions within the same industry intent (no adjacent industries).
 */
export const PROSPECT_AI_INDUSTRY_SYNONYMS: Array<{
  match: RegExp;
  phrases: string[];
}> = [
  {
    match: /\breal\s*estate\b|\brealtor/i,
    phrases: [
      "real estate agents",
      "realtors",
      "real estate brokerages",
      "buyer agents",
      "listing agents",
      "luxury real estate agents",
      "residential real estate",
      "real estate teams",
      "real estate companies",
    ],
  },
  {
    match: /\bdent(al|ist)/i,
    phrases: ["dental clinics", "dentists", "dental offices", "orthodontists"],
  },
  {
    match: /\blaw\b|\battorney|\blawyer/i,
    phrases: ["law firms", "attorneys", "lawyers", "legal offices"],
  },
  {
    match: /\bplumb/i,
    phrases: ["plumbers", "plumbing companies", "plumbing contractors"],
  },
  {
    match: /\bhvac\b|\bair\s*condition/i,
    phrases: ["HVAC contractors", "air conditioning companies", "heating and cooling"],
  },
  {
    match: /\broof/i,
    phrases: ["roofing companies", "roofers", "roofing contractors"],
  },
  {
    match: /\bmedspa\b|\bmedical\s*spa|\baesthetic/i,
    phrases: ["med spas", "medical spas", "aesthetic clinics"],
  },
  {
    match: /\bgym\b|\bfitness/i,
    phrases: ["gyms", "fitness centers", "personal training studios"],
  },
];

export function expandBusinessPhrases(businessType: string): string[] {
  const raw = String(businessType || "").trim();
  if (!raw) return [];
  const out: string[] = [raw];
  for (const rule of PROSPECT_AI_INDUSTRY_SYNONYMS) {
    if (!rule.match.test(raw)) continue;
    for (const phrase of rule.phrases) {
      if (!out.some((p) => p.toLowerCase() === phrase.toLowerCase())) {
        out.push(phrase);
      }
    }
    break;
  }
  return out.slice(0, 9);
}

export function expandLocations(
  location: string,
  mode: ProspectAiLocationExpansionMode,
): string[] {
  const exact = String(location || "").trim();
  if (!exact) return [];
  if (mode === "exact") return [exact];

  const key = normalizeLocationKey(exact);
  const metro = PROSPECT_AI_METRO_EXPANSIONS[key] || [];
  const nearby = metro.slice(0, mode === "nearby" ? 4 : metro.length);
  const out = [exact];
  for (const loc of nearby) {
    if (!out.some((x) => x.toLowerCase() === loc.toLowerCase())) out.push(loc);
  }
  if (mode === "metro" && !out.some((x) => /metro|greater/i.test(x))) {
    out.push(`greater ${exact}`);
  }
  return out.slice(0, mode === "metro" ? 8 : 5);
}

/**
 * Build ordered query plan: exact industry+location first, then gradual broaden.
 * Dedupes near-identical text queries.
 */
export function buildProspectAiDiscoveryPlan(params: {
  businessType: string;
  location: string;
  targetCount?: unknown;
  locationExpansion?: unknown;
}): ProspectAiDiscoveryPlan {
  const targetCount = normalizeDiscoveryTargetCount(params.targetCount);
  const locationExpansion = normalizeLocationExpansionMode(params.locationExpansion);
  const businessPhrases = expandBusinessPhrases(params.businessType);
  const expandedLocations = expandLocations(params.location, locationExpansion);

  const queries: ProspectAiDiscoveryQueryPlanItem[] = [];
  const seen = new Set<string>();
  let rank = 0;

  const push = (businessPhrase: string, locationLabel: string) => {
    const textQuery = `${businessPhrase} in ${locationLabel}`.trim();
    const key = textQuery.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return;
    seen.add(key);
    queries.push({ textQuery, locationLabel, businessPhrase, rank: rank++ });
  };

  // Exact first
  if (businessPhrases[0] && expandedLocations[0]) {
    push(businessPhrases[0]!, expandedLocations[0]!);
  }
  // Same phrase, expanded locations
  for (const loc of expandedLocations.slice(1)) {
    push(businessPhrases[0]!, loc);
  }
  // Synonyms on primary location, then cross lightly
  for (const phrase of businessPhrases.slice(1)) {
    push(phrase, expandedLocations[0]!);
  }
  for (const phrase of businessPhrases.slice(1, 4)) {
    for (const loc of expandedLocations.slice(1, 3)) {
      push(phrase, loc);
    }
  }

  return {
    targetCount,
    locationExpansion,
    requestedLocation: String(params.location || "").trim(),
    expandedLocations,
    queries: queries.slice(0, PROSPECT_AI_DISCOVERY_MAX_QUERY_VARIATIONS),
  };
}

export function clampDiscoveryTargetToQuota(
  target: number,
  quotaRemaining: number,
): number {
  const t = Math.max(1, Math.floor(target) || 1);
  const q = Math.max(0, Math.floor(quotaRemaining) || 0);
  return Math.min(t, q);
}
