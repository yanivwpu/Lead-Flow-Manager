/**
 * Full replacement search clears stale pool/beds from prior queries.
 * Run: npx tsx tests/buyer-search-replacement-reset.test.ts
 */
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import {
  isFullReplacementSearch,
  parseBuyerSearchCommand,
} from "../shared/buyerSearchCommand";
import { extractBuyerMatchCriteria } from "../shared/inventory/inventoryMatchScoring";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const now = new Date().toISOString();
const priorProfile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), {
  pool: { value: true, source: "inferred", confidence: 0.9, updatedAt: now, evidence: "pool required" },
  bedsMin: { value: 3, source: "inferred", confidence: 0.88, updatedAt: now, evidence: "beds in message" },
  priceMax: { value: 899_000, source: "inferred", confidence: 0.9, updatedAt: now, evidence: "up to budget" },
  propertyTypes: { value: ["house"], source: "inferred", confidence: 0.9, updatedAt: now, evidence: "sfh" },
  targetAreas: { value: ["Pompano Beach"], source: "inferred", confidence: 0.9, updatedAt: now, evidence: "area" },
  transactionIntent: { value: "buy", source: "inferred", confidence: 0.9, updatedAt: now, evidence: "buy" },
});

const msg600 =
  "Show SFH for sale in pompano up to $600k";

const cmd600 = parseBuyerSearchCommand(msg600, priorProfile);
assert(cmd600.kind === "new_search", `replacement classified as new_search (got ${cmd600.kind})`);
assert(cmd600.clearUnmentionedHardGates === true, "clearUnmentionedHardGates flag set");
assert(isFullReplacementSearch(msg600, cmd600.patch, priorProfile), "isFullReplacementSearch");

const merged600 = mergeBuyerPreferenceProfile(priorProfile, cmd600.patch, undefined, {
  replaceArrayFields: cmd600.replaceArrayFields,
  clearUnmentionedHardGates: cmd600.clearUnmentionedHardGates,
});
const criteria600 = extractBuyerMatchCriteria(merged600);

assert(merged600.pool == null, "pool cleared on replacement");
assert(criteria600.hardRequirePool === false, "hardRequirePool false");
assert(merged600.bedsMin == null, "bedsMin cleared when not mentioned");
assert(criteria600.bedsMin == null, "criteria bedsMin null");
assert(merged600.priceMax?.value === 600_000, `priceMax 600k (got ${merged600.priceMax?.value})`);
assert(
  merged600.propertyTypes?.value?.join() === "house",
  `propertyTypes house (got ${merged600.propertyTypes?.value?.join()})`,
);
assert(
  merged600.targetAreas?.value?.some((a) => /pompano/i.test(a)) === true,
  "Pompano area",
);
assert(criteria600.transactionIntent === "buy", "buy intent");

const msgPoolOpt =
  "Show SFH for sale in pompano with or without pool up to $600k";
const cmdPoolOpt = parseBuyerSearchCommand(msgPoolOpt, priorProfile);
const mergedPoolOpt = mergeBuyerPreferenceProfile(priorProfile, cmdPoolOpt.patch, undefined, {
  replaceArrayFields: cmdPoolOpt.replaceArrayFields,
  clearUnmentionedHardGates: cmdPoolOpt.clearUnmentionedHardGates,
});
const criteriaPoolOpt = extractBuyerMatchCriteria(mergedPoolOpt);

assert(mergedPoolOpt.pool == null, "pool optional clears pool field");
assert(criteriaPoolOpt.hardRequirePool === false, "pool optional -> hardRequirePool false");
assert(cmdPoolOpt.patch.pool?.value === false, "patch marks pool optional");

const msgAlso =
  "Show SFH for sale in pompano up to $600k also with pool";
const cmdAlso = parseBuyerSearchCommand(msgAlso, priorProfile);
assert(cmdAlso.kind !== "new_search" || !cmdAlso.clearUnmentionedHardGates, "also with pool keeps refinement");
const mergedAlso = mergeBuyerPreferenceProfile(priorProfile, cmdAlso.patch, undefined, {
  replaceArrayFields: cmdAlso.replaceArrayFields,
  clearUnmentionedHardGates: cmdAlso.clearUnmentionedHardGates,
});
assert(
  mergedAlso.pool?.value === true || extractBuyerMatchCriteria(mergedAlso).hardRequirePool,
  "also with pool keeps pool requirement",
);

const patch600 = heuristicPatchFromInboundText(msg600);
assert(patch600.pool == null, "600k message patch has no pool");
assert(patch600.bedsMin == null, "600k message patch has no bedsMin");

console.log("buyer-search-replacement-reset.test.ts: OK");
