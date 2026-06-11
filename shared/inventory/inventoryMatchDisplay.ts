import type { QualificationLevel } from "../buyerQualification";

export type InventoryMatchAiSummaryInput = {
  matchCount: number;
  matches: Array<{
    listing: {
      city: string | null;
      state?: string | null;
    };
  }>;
  /** Fallback when matched listings lack city data */
  buyerAreas?: string[];
  qualificationLevel?: QualificationLevel;
};

function titleCaseArea(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatLocationPhrase(
  matches: InventoryMatchAiSummaryInput["matches"],
  buyerAreas: string[] | undefined,
): string {
  const cityCounts = new Map<string, number>();
  for (const m of matches) {
    const city = m.listing.city?.trim();
    if (!city) continue;
    const key = titleCaseArea(city);
    cityCounts.set(key, (cityCounts.get(key) ?? 0) + 1);
  }

  const sorted = Array.from(cityCounts.entries()).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) {
    const areas = (buyerAreas ?? []).map((a) => titleCaseArea(a.trim())).filter(Boolean);
    return areas.length > 0 ? areas.slice(0, 2).join(" or ") : "their target area";
  }
  if (sorted.length === 1) return sorted[0][0];

  const primary = sorted[0][0];
  const secondary = sorted.slice(1, 3).map(([city]) => city);
  return secondary.length > 0 ? `${primary} (and ${secondary.join(", ")})` : primary;
}

/** Compact inventory context for AI Brain / suggest-reply prompts. */
export function formatInventoryMatchSummaryForAi(input: InventoryMatchAiSummaryInput): string {
  const level = input.qualificationLevel ?? "medium";

  if (level !== "high") {
    if (input.matchCount > 0) {
      return `Matching inventory (internal — do NOT mention match counts to buyer yet):
- Listings align with current criteria in ${formatLocationPhrase(input.matches, input.buyerAreas)} but buyer qualification is ${level.toUpperCase()}
- Continue qualifying with ONE question before offering to send listings`;
    }
    return "";
  }

  if (input.matchCount <= 0 || input.matches.length === 0) return "";

  const location = formatLocationPhrase(input.matches, input.buyerAreas);

  return `Matching inventory (internal — buyer qualification is HIGH):
- A few homes in ${location} align with current criteria (do NOT state an exact number)
- You may offer to send the best matches or set up a showing — never paste addresses or URLs
- Sound like a local agent: "a few homes look strong", "I've got a couple good options", "let me send the best matches" — never "compile a selection" or "for your convenience"`;
}
