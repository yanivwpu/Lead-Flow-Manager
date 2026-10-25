import assert from "node:assert/strict";
import { createBacklinkReviewQueue, draftBacklinkOutreach, type BacklinkResearchRecord } from "../server/seo/backlinkResearch";
const base: BacklinkResearchRecord = {
  sourceUrl:"https://example.org/whatsapp-guide",targetUrl:"https://www.whachatcrm.com/realtor-growth-engine",
  topic:"realtor",evidence:"An editorial overview of CRM automation for residential agents.",
  contactPermission:"explicit",placement:"editorial",verifiedAt:"2026-10-25T12:00:00Z",
  sourceKind:"manual_research",sourceReference:"Reviewed example.org article on 2026-10-25",
  intent:"editorial_opportunity",sourceRelevant:true,targetLive:true,independentEditorialFit:true
};
const queue=createBacklinkReviewQueue([base,{...base,sourceUrl:base.sourceUrl+"?utm_source=tracker"},{...base,sourceUrl:"https://another.example.net/list",contactPermission:"opted_out"}]);
assert.equal(queue.length,2);
assert.equal(queue[0].reviewStatus,"needs_review");
assert.equal(queue[0].score,100);
assert.equal(queue[1].reviewStatus,"rejected");
assert.ok(queue[1].reasons.includes("contact_opted_out"));
assert.deepEqual(draftBacklinkOutreach(queue[0],"Relevant editorial suggestion: your guide may benefit from our verified automation overview."),{
  candidateSource:base.sourceUrl,content:"Relevant editorial suggestion: your guide may benefit from our verified automation overview.",approved:false,sent:false
});
assert.throws(()=>draftBacklinkOutreach(queue[1],"Relevant editorial suggestion: your guide may benefit from our verified automation overview."));
console.log("Backlink research screening checks passed");
