/**
 * Full replacement clears stale hard filters and soft/area-specific preferences.
 * Run: npx tsx tests/buyer-preference-replacement-soft-clear.test.ts
 */
import { parseBuyerSearchCommand } from "../shared/buyerSearchCommand";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import {
  buildBuyerPreferenceSearchChips,
  buildBuyerPreferenceMetadataChips,
} from "../shared/buyerPreferenceDisplay";
import { extractBuyerMatchCriteria } from "../shared/inventory/inventoryMatchScoring";
import { resolveMatchingBudgetBounds } from "../shared/buyerPreferenceBudget";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const now = new Date().toISOString();
const inf = <T>(value: T, evidence = "test") => ({
  value,
  source: "inferred" as const,
  confidence: 0.9,
  updatedAt: now,
  evidence,
});

const contaminatedPrior = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), {
  transactionIntent: inf("buy"),
  priceMax: inf(899_000),
  propertyTypes: inf(["house"]),
  targetAreas: inf(["Pompano Beach", "Close to beach"]),
  pool: inf(true),
  bedsMin: inf(3),
  lowHoa: inf(true),
  walkability: inf(true),
  timeline: inf("asap"),
  financingStatus: inf("cash"),
  mustHaves: inf(["close to beach", "low hoa"]),
});

const rentPivot = mergeBuyerPreferenceProfile(contaminatedPrior, {
  transactionIntent: inf("rent", "rent intent in message"),
  priceMin: inf(2000),
  priceMax: inf(2500),
  bedsMin: inf(2),
  propertyTypes: inf(["condo"]),
  targetAreas: inf([], "anywhere clears area in message"),
}, undefined, {
  replaceArrayFields: ["targetAreas", "propertyTypes"],
  clearUnmentionedHardGates: true,
  currentMessagePatch: {
    transactionIntent: inf("rent"),
    priceMin: inf(2000),
    priceMax: inf(2500),
    bedsMin: inf(2),
    propertyTypes: inf(["condo"]),
    targetAreas: inf([]),
  },
});

const replacementMsg = "Show me homes for sale in Coral Springs under $400k";
const cmd = parseBuyerSearchCommand(replacementMsg, rentPivot);
assert(
  cmd.kind === "new_search" || cmd.kind === "transaction_pivot",
  `replacement pivot (got ${cmd.kind})`,
);
assert(cmd.clearUnmentionedHardGates === true, "clearUnmentionedHardGates");

const merged = mergeBuyerPreferenceProfile(rentPivot, cmd.patch, undefined, {
  replaceArrayFields: cmd.replaceArrayFields,
  clearUnmentionedHardGates: cmd.clearUnmentionedHardGates,
  currentMessagePatch: cmd.clearUnmentionedHardGates ? cmd.patch : undefined,
});

const criteria = extractBuyerMatchCriteria(merged);
const budget = resolveMatchingBudgetBounds(merged);
const searchChips = buildBuyerPreferenceSearchChips(merged);
const metadataChips = buildBuyerPreferenceMetadataChips(merged);

assert(budget.priceMax === 400_000, `priceMax 400k (got ${budget.priceMax})`);
assert(criteria.propertyTypes.includes("house"), "property type house");
assert(
  criteria.areas.some((a) => /coral springs/i.test(a)),
  `areas include Coral Springs (got ${criteria.areas.join(", ")})`,
);
assert(merged.pool == null, "pool cleared");
assert(merged.bedsMin == null, "bedsMin cleared");
assert(merged.lowHoa == null, "lowHoa cleared");
assert(merged.walkability == null, "walkability cleared");
assert(
  !criteria.areas.some((a) => /close to beach/i.test(a)),
  "close to beach area cleared",
);
assert(
  !searchChips.some((c) => /close to beach/i.test(c.value)),
  "no close to beach search chip",
);
assert(!searchChips.some((c) => c.id === "low-hoa"), "no low HOA search chip");
assert(!searchChips.some((c) => c.id === "timeline"), "timeline not a search chip");
assert(
  metadataChips.some((c) => c.id === "timeline" && c.value === "ASAP"),
  "timeline preserved as metadata chip",
);

console.log("buyer-preference-replacement-soft-clear.test.ts: OK");
