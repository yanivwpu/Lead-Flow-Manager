/**
 * Phase A: inventory signal fast-path, SFH normalization, replace-merge semantics.
 * Run: npx tsx tests/buyer-preference-fastpath.test.ts
 */
import { normalizePropertyTypeToken } from "../shared/buyerPreferenceExtractionNormalize";
import {
  heuristicPatchFromInboundText,
  heuristicPatchFromTranscript,
} from "../shared/buyerPreferenceExtractionNormalize";
import {
  detectPreferenceArrayReplacements,
  hasInventoryPreferenceSignals,
} from "../shared/buyerPreferenceInventorySignals";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const sfhMessage =
  "Do you have any SFH with pool East of the Federal Hwy in Pompano?";

assert(hasInventoryPreferenceSignals(sfhMessage), "SFH + pool + location triggers inventory signals");
assert(
  detectPreferenceArrayReplacements(sfhMessage).includes("propertyTypes"),
  "property type replacement when SFH mentioned",
);
assert(
  detectPreferenceArrayReplacements(sfhMessage).includes("targetAreas"),
  "area replacement when location mentioned",
);

for (const label of ["SFH", "Single Family", "Single Family Home", "single-family home"]) {
  assert(normalizePropertyTypeToken(label) === "house", `${label} → house`);
}

const heuristic = heuristicPatchFromInboundText(sfhMessage);
assert(
  heuristic.propertyTypes?.value?.includes("house"),
  "heuristic extracts SFH as house",
);
assert(heuristic.pool?.value === true, "heuristic extracts pool");
assert(
  (heuristic.targetAreas?.value?.length ?? 0) > 0,
  "heuristic extracts target area",
);

const transcript =
  "user: I want a condo in Brickell\nassistant: Great!\nuser: Do you have any SFH with pool East of the Federal Hwy in Pompano?";
const fromTranscript = heuristicPatchFromTranscript(transcript, { latestUserLineOnly: true });
assert(
  fromTranscript.propertyTypes?.value?.includes("house"),
  "latest user line heuristic prefers SFH over earlier condo",
);
assert(
  !fromTranscript.propertyTypes?.value?.includes("condo"),
  "latest user line does not carry earlier condo",
);

const existing = {
  ...emptyBuyerPreferenceProfile(),
  propertyTypes: {
    value: ["condo"],
    source: "explicit" as const,
    confidence: 1,
    updatedAt: new Date().toISOString(),
  },
  targetAreas: {
    value: ["Brickell"],
    source: "explicit" as const,
    confidence: 1,
    updatedAt: new Date().toISOString(),
  },
};

const unionMerged = mergeBuyerPreferenceProfile(existing, {
  propertyTypes: {
    value: ["house"],
    source: "inferred",
    confidence: 0.8,
    updatedAt: new Date().toISOString(),
  },
  targetAreas: {
    value: ["Pompano"],
    source: "inferred",
    confidence: 0.8,
    updatedAt: new Date().toISOString(),
  },
});
assert(
  unionMerged.propertyTypes?.value?.includes("condo") &&
    unionMerged.propertyTypes?.value?.includes("house"),
  "default merge unions property types",
);

const replaceMerged = mergeBuyerPreferenceProfile(
  existing,
  {
    propertyTypes: {
      value: ["house"],
      source: "inferred",
      confidence: 0.8,
      updatedAt: new Date().toISOString(),
    },
    targetAreas: {
      value: ["East of the Federal Hwy in Pompano"],
      source: "inferred",
      confidence: 0.8,
      updatedAt: new Date().toISOString(),
    },
  },
  undefined,
  { replaceArrayFields: ["propertyTypes", "targetAreas"] },
);
assert(
  replaceMerged.propertyTypes?.value?.join() === "house",
  "replace merge drops prior condo when customer changes type",
);
assert(
  !replaceMerged.targetAreas?.value?.includes("Brickell"),
  "replace merge drops prior area when customer changes location",
);

assert(!hasInventoryPreferenceSignals("thanks"), "trivial thanks has no inventory signals");

console.log("buyer-preference-fastpath.test.ts: OK");
