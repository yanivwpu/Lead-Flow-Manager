/**
 * Buyer Search Command regression matrix (30+ phrases).
 * Run: npx tsx tests/buyer-search-command-matrix.test.ts
 */
import { parseBuyerSearchCommand, applyBuyerSearchCommandToPatch } from "../shared/buyerSearchCommand";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import { SHOW_ME_ALL_PROPERTY_RELAX_EVIDENCE } from "../shared/buyerPreferencePropertyTypeRelax";
import { describeActiveSearchFilters } from "../shared/buyerSearchCommandDebug";
import { resolveMatchingBudgetBounds } from "../shared/buyerPreferenceBudget";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const now = new Date().toISOString();
const inf = <T>(value: T, evidence: string) => ({
  value,
  source: "inferred" as const,
  confidence: 0.9,
  updatedAt: now,
  evidence,
});

const relaxedRentProfile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), {
  transactionIntent: inf("rent", "rent intent in message"),
  propertyTypes: inf(["house", "condo", "townhouse", "multi_family"], SHOW_ME_ALL_PROPERTY_RELAX_EVIDENCE),
  targetAreas: inf(["Pompano"], "area in message"),
  bedsMin: inf(3, "beds in message"),
  bathsMin: inf(2, "baths in message"),
  priceMin: inf(3000, "budget range in message"),
  priceMax: inf(3400, "budget range in message"),
});

type Case = {
  phrase: string;
  profile?: typeof relaxedRentProfile;
  kind: ReturnType<typeof parseBuyerSearchCommand>["kind"];
  check?: (cmd: ReturnType<typeof parseBuyerSearchCommand>, merged?: ReturnType<typeof mergeBuyerPreferenceProfile>) => void;
};

const matrix: Case[] = [
  {
    phrase: "Show me SFH for rent in Pompano up to $3000",
    profile: relaxedRentProfile,
    kind: "narrow_search",
    check: (cmd, merged) => {
      assert(cmd.patch.propertyTypes?.value?.join() === "house", "SFH -> house");
      assert(cmd.patch.priceMax?.value === 3000, "cap 3000");
      assert(merged!.priceMin == null, "clear priceMin");
      assert(merged!.transactionIntent?.value === "rent", "rent");
    },
  },
  {
    phrase: "Show me all the 3/2 in Pompano between $3000 and $3400",
    profile: relaxedRentProfile,
    kind: "broaden_search",
    check: (cmd) => {
      assert(cmd.patch.propertyTypes?.value?.includes("condo") === true, "broad types");
      assert(cmd.patch.priceMin?.value === 3000 && cmd.patch.priceMax?.value === 3400, "range");
    },
  },
  {
    phrase: "5 beds is too big, show me 4/2",
    profile: mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), {
      bedsMin: inf(5, "beds in message"),
      bedsMax: inf(5, "beds correction in message"),
    }),
    kind: "correction",
    check: (cmd) => {
      assert(cmd.patch.bedsMin?.value === 4, "beds 4");
      assert(cmd.patch.bedsMax?.value === 4, "beds max 4");
      assert(cmd.patch.bathsMin?.value === 2, "baths 2");
    },
  },
  {
    phrase: "Homes for sale up to $850k close to the beach",
    profile: relaxedRentProfile,
    kind: "transaction_pivot",
    check: (cmd, merged) => {
      assert(cmd.patch.transactionIntent?.value === "buy", "buy");
      assert(cmd.patch.priceMax?.value === 850_000, "850k");
      assert(merged!.transactionIntent?.value === "buy", "merged buy");
    },
  },
  {
    phrase: "Do you have any other listings?",
    profile: relaxedRentProfile,
    kind: "followup_request",
    check: (cmd) => {
      assert(cmd.skipProfileUpdate === true, "skip update");
      assert(Object.keys(cmd.patch).length === 0, "empty patch");
    },
  },
  { phrase: "Looking for a condo in Brickell under $500k", kind: "new_search", check: (c) => assert(c.patch.propertyTypes?.value?.[0] === "condo", "condo") },
  { phrase: "Townhouse for rent in Fort Lauderdale", kind: "new_search", check: (c) => assert(c.patch.propertyTypes?.value?.includes("townhouse") === true, "townhouse") },
  { phrase: "Apartment for rent in Miami up to $2500", kind: "new_search", check: (c) => assert(c.patch.propertyTypes?.value?.includes("condo") === true, "apartment->condo") },
  { phrase: "Single family home for sale in Boca up to $1.2m", kind: "new_search", check: (c) => assert(c.patch.transactionIntent?.value === "buy", "buy sfh") },
  { phrase: "Show me condos in Pompano", profile: relaxedRentProfile, kind: "narrow_search", check: (c) => assert(c.patch.propertyTypes?.value?.join() === "condo", "condo only") },
  { phrase: "Rent a 3/2 with pool in Deerfield up to $3200", kind: "new_search", check: (c) => assert(c.patch.pool?.value === true, "pool") },
  { phrase: "No pool please, under $400k in Coral Springs", kind: "new_search" },
  { phrase: "East of Federal Hwy in Pompano 3 bed", kind: "new_search", check: (c) => assert((c.patch.geoConstraints?.value?.length ?? 0) > 0, "geo") },
  { phrase: "Old Pompano area rentals under $2800", kind: "new_search", check: (c) => assert(c.signals.includes("old_pompano"), "old pompano signal") },
  { phrase: "Close to the beach in Pompano for rent", kind: "new_search", check: (c) => assert(c.signals.includes("beach"), "beach") },
  { phrase: "Show me all 2/2 under $2000 in Hollywood", kind: "broaden_search" },
  { phrase: "SFH only in Lighthouse Point max $5000/mo", profile: relaxedRentProfile, kind: "narrow_search", check: (c) => assert(c.patch.propertyTypes?.value?.join() === "house", "sfh narrow") },
  { phrase: "Actually I want to buy instead, up to $600k", profile: relaxedRentProfile, kind: "transaction_pivot" },
  { phrase: "Switching to rent — 2 bed condo in Miami Beach $2500-$3000", profile: mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), { transactionIntent: inf("buy", "buy intent in message") }), kind: "transaction_pivot" },
  { phrase: "Between $400k and $550k in Parkland with pool", kind: "new_search", check: (c) => assert(c.signals.includes("between_budget"), "between") },
  { phrase: "Up to $750k in Weston", kind: "new_search", check: (c) => assert(c.signals.includes("up_to_budget"), "up to") },
  { phrase: "3/2 in Pompano", profile: relaxedRentProfile, kind: "refine_search", check: (c) => assert(c.patch.bedsMin?.value === 3, "3 bed") },
  { phrase: "Too many bedrooms — show me 3/2 instead", profile: mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), { bedsMin: inf(5) }), kind: "correction" },
  { phrase: "4 beds is too big, 3/2 is better", kind: "correction", check: (c) => assert(c.patch.bedsMin?.value === 3, "correct beds") },
  { phrase: "Any more options?", profile: relaxedRentProfile, kind: "followup_request" },
  { phrase: "What else do you have in Pompano?", profile: relaxedRentProfile, kind: "followup_request" },
  { phrase: "Send me more listings", profile: relaxedRentProfile, kind: "followup_request" },
  { phrase: "Multi family for rent in Oakland Park", kind: "new_search", check: (c) => assert(c.patch.propertyTypes?.value?.includes("multi_family") === true, "multi") },
  { phrase: "Show me townhomes for rent in Coconut Creek up to $3500", kind: "new_search" },
  { phrase: "Homes for sale in Pompano with pool up to $850k", profile: relaxedRentProfile, kind: "transaction_pivot" },
  { phrase: "Rentals in Pompano 3/2 $3000-$3400", kind: "new_search", check: (c) => assert(c.patch.transactionIntent?.value === "rent", "rent") },
  { phrase: "Do you have SFH with pool East of Federal Hwy in Pompano?", kind: "new_search", check: (c) => assert(c.signals.includes("sfh"), "sfh") },
  { phrase: "Show me all condos in Pompano 2/2", kind: "new_search", check: (c) => assert(c.patch.propertyTypes?.value?.join() === "condo", "specific all condos not broaden") },
  { phrase: "Looking for land in rural Broward", kind: "new_search", check: (c) => assert(c.patch.propertyTypes?.value?.includes("land") === true, "land") },
  { phrase: "Pre-approved buyer, 4 bed house in Parkland up to $900k", kind: "new_search" },
  { phrase: "Cash buyer condo Brickell asap", kind: "new_search" },
];

let passed = 0;
for (const row of matrix) {
  const cmd = parseBuyerSearchCommand(row.phrase, row.profile ?? emptyBuyerPreferenceProfile());
  assert(cmd.kind === row.kind, `"${row.phrase}" kind ${cmd.kind} !== ${row.kind}`);
  if (row.check) {
    let merged;
    if (row.profile && !cmd.skipProfileUpdate && Object.keys(cmd.patch).length > 0) {
      merged = mergeBuyerPreferenceProfile(row.profile, cmd.patch, undefined, {
        replaceArrayFields: cmd.replaceArrayFields,
      });
    }
    row.check(cmd, merged);
  }
  passed++;
}

assert(matrix.length >= 30, `matrix has ${matrix.length} cases`);

const llmPatch = {
  propertyTypes: inf(["condo", "townhouse"], "llm guess"),
  priceMin: inf(3000, "llm old range"),
  priceMax: inf(3400, "llm old range"),
};
const sfhCmd = parseBuyerSearchCommand("Show me SFH for rent in Pompano up to $3000", relaxedRentProfile);
applyBuyerSearchCommandToPatch(llmPatch, sfhCmd);
assert(llmPatch.propertyTypes?.value?.join() === "house", "LLM types overridden");
assert(llmPatch.priceMax?.value === 3000, "LLM max overridden");
assert((llmPatch as { priceMin?: unknown }).priceMin === undefined, "LLM min cleared");

const mergedSfh = mergeBuyerPreferenceProfile(relaxedRentProfile, sfhCmd.patch, undefined, {
  replaceArrayFields: sfhCmd.replaceArrayFields,
});
const filters = describeActiveSearchFilters(mergedSfh);
assert(filters.includes("Rent"), "debug rent");
assert(filters.includes("SFH") || filters.includes("house"), "debug types");
const budget = resolveMatchingBudgetBounds(mergedSfh);
assert(budget.priceMax === 3000 && budget.priceMin == null, "debug budget cap");

console.log(`buyer-search-command-matrix.test.ts: OK (${passed} phrases)`);
