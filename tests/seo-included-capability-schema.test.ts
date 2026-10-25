import assert from "node:assert/strict";
import { buildCanonicalOfferJsonLd } from "../shared/pricingEntitlements";
const base="https://www.whachatcrm.com";
const pricing=buildCanonicalOfferJsonLd("/pricing",base+"/pricing",base) as {"@graph":Array<Record<string,unknown>>};
assert.ok(pricing);
assert.ok(pricing["@graph"].every(x=>x["@type"]==="SoftwareApplication"));
assert.ok(pricing["@graph"].every(x=>Array.isArray(x.offers)&&(x.offers as unknown[]).length>0));
assert.equal(buildCanonicalOfferJsonLd("/realtor-growth-engine",base+"/realtor-growth-engine",base),null);
console.log("Included capability product schema checks passed");
