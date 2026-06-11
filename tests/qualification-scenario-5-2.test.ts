import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import { assessBuyerQualification, formatQualificationContextForAi } from "../shared/buyerQualification";

const msg = "Show me 5/2 with pool in Pompano Beach between $1M-$1.5M";
const patch = heuristicPatchFromInboundText(msg);
const profile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), patch);
const qNoMatches = assessBuyerQualification({ profile, leadType: "buyer", inboundText: msg });
const q = assessBuyerQualification({
  profile,
  leadType: "buyer",
  inboundText: msg,
  matchCount: 3,
});

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(q.inventoryMode, "inventory mode with matches");
assert(q.level === "high", "HIGH with matches");
assert(!q.suggestedQuestion.toLowerCase().includes("widen"), "no widen in suggestion");
assert(/strong fit|best matches|top options|several homes/i.test(q.suggestedQuestion), "inventory CTA");

console.log(JSON.stringify({ level: q.level, inventoryMode: q.inventoryMode, suggested: q.suggestedQuestion, missing: q.missing, noMatchLevel: qNoMatches.level, profile: {
  areas: profile.targetAreas?.value,
  beds: profile.bedsMin?.value,
  baths: profile.bathsMin?.value,
  priceMin: profile.priceMin?.value,
  priceMax: profile.priceMax?.value,
  pool: profile.pool?.value,
  types: profile.propertyTypes?.value,
}}, null, 2));
console.log("---");
console.log(formatQualificationContextForAi(q));
