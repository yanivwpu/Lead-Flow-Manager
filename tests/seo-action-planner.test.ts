/** Run: npx tsx tests/seo-action-planner.test.ts */
import assert from "node:assert/strict";
import { assertSafePublicUrl, filterCompetitorResults, HostRateLimiter, safeFetchHtml } from "../server/seo/competitorResearch";
import { contentFingerprint, mayTransitionSeoAction, recommendationIdempotencyKey, validateRecommendationOutput } from "../server/seo/actionPlanner";
import { clusterAndScoreOpportunities } from "../server/seo/opportunityPlanner";
const resolvePublic=async()=>[{address:"93.184.216.34",family:4}] as any;
await assert.rejects(()=>assertSafePublicUrl("http://127.0.0.1/private"));
await assert.rejects(()=>assertSafePublicUrl("file:///etc/passwd"));
assert.equal((await assertSafePublicUrl("https://example.com/page",resolvePublic)).hostname,"example.com");
assert.deepEqual(filterCompetitorResults([{url:"https://whachatcrm.com/a"},{url:"https://competitor.test/a"}], ["whachatcrm.com"]).map(r=>r.url),["https://competitor.test/a"]);
assert.deepEqual(filterCompetitorResults([{url:"https://one.test"},{url:"https://two.test"}], [], ["two.test"]).map(r=>r.url),["https://two.test"]);
const htmlResponse=(body:string,headers:Record<string,string>={"content-type":"text/html"})=>new Response(body,{status:200,headers});
await assert.rejects(()=>safeFetchHtml("https://example.com",{resolver:resolvePublic,fetchImpl:async()=>htmlResponse("x",{"content-type":"application/json"})}),/INVALID_CONTENT_TYPE/);
await assert.rejects(()=>safeFetchHtml("https://example.com",{resolver:resolvePublic,fetchImpl:async()=>htmlResponse("x",{"content-type":"text/html","content-length":"2000000"})}),/RESPONSE_TOO_LARGE/);
await assert.rejects(()=>safeFetchHtml("https://example.com",{resolver:resolvePublic,robotsAllowed:async()=>false}),/ROBOTS_DISALLOWED/);
const limiter=new HostRateLimiter(10);const waits:number[]=[];let time=100;await limiter.wait(new URL("https://example.com"),()=>time,async n=>{waits.push(n);time+=n});await limiter.wait(new URL("https://example.com"),()=>time,async n=>{waits.push(n);time+=n});assert.deepEqual(waits,[10]);
const rows=[{query:"whatsapp crm software",page:"https://whachatcrm.com/",clicks:4,impressions:400,position:8},{query:"crm software for whatsapp",page:"https://whachatcrm.com/",clicks:1,impressions:150,position:12}];
const scored=clusterAndScoreOpportunities(rows,[]);assert.equal(scored.length,1);assert.equal(scored[0].queryCluster.length,2);assert.ok(scored[0].priorityScore>0&&scored[0].confidenceScore<=1);
const proposal={actionType:"title_tag",proposedTitle:"A useful WhatsApp CRM workflow guide",insertionLocation:"head title",explanation:"Search performance supports a clearer and more relevant title.",expectedBenefit:"Improve qualified click-through potential.",confidence:.8,risk:"low",automaticExecutionEligible:false,rollbackConcept:"Restore the fingerprinted prior title.",evidenceIds:["e1"]};
assert.equal(validateRecommendationOutput(proposal).actionType,"title_tag");assert.throws(()=>validateRecommendationOutput({...proposal,proposedTitle:"Guaranteed #1 WhatsApp CRM"}),/unsupported/);
const copied="these twelve exact competitor words must never appear together inside our generated recommendation text";assert.throws(()=>validateRecommendationOutput({...proposal,proposedTitle:"Safe original title",proposedContent:copied},[copied]),/overlaps/);
assert.equal(contentFingerprint({title:"one"}),contentFingerprint({title:"one"}));assert.notEqual(contentFingerprint({title:"one"}),contentFingerprint({title:"two"}));
assert.equal(recommendationIdempotencyKey("p","/",["B","a"],"title"),recommendationIdempotencyKey("p","/",["a","b"],"title"));
assert.equal(mayTransitionSeoAction("proposed","approved"),true);assert.equal(mayTransitionSeoAction("approved","executing"),false,"Phase 2B cannot execute");
console.log("SEO action planner tests passed");
const {readFileSync}=await import("node:fs");const migration=readFileSync(new URL("../migrations/0095_seo_action_planner.sql",import.meta.url),"utf8");const startup=readFileSync(new URL("../server/startupSchemaPatches.ts",import.meta.url),"utf8");for(const table of ["seo_analysis_runs","seo_opportunities","seo_page_snapshots","seo_competitor_config","seo_competitor_snapshots","seo_actions","seo_action_versions","seo_action_evidence","seo_action_events"]){assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));assert.match(startup,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),`${table} has startup/migration parity`);}assert.doesNotMatch(migration,/seo_search_snapshots\([^)]*(query|page)/,"Phase 2B does not restore an unbounded snapshot index");

// Metadata construction bounds untrusted GSC text by Unicode code point and word boundary.
const { proposedMetaDescriptionForQuery, SEO_META_DESCRIPTION_MAX } = await import("../server/seo/actionPlanner");
for (const query of ["short query", "x".repeat(SEO_META_DESCRIPTION_MAX), "x".repeat(SEO_META_DESCRIPTION_MAX + 1), "日本語の非常に長い検索語".repeat(30), "😀".repeat(1_000), "a|b::c\0d", "word ".repeat(100_000)]) {
  const description = proposedMetaDescriptionForQuery(query);
  assert.ok([...description].length <= SEO_META_DESCRIPTION_MAX, "metadata always fits the destination schema");
  assert.ok(description.length >= 30);
  assert.equal(validateRecommendationOutput({ ...proposal, actionType: "meta_description", proposedTitle: null, proposedMetaDescription: description }).proposedMetaDescription, description);
}
assert.doesNotMatch(proposedMetaDescriptionForQuery("word ".repeat(100)), /wor…:/, "long queries truncate at a word boundary");

// Canonical-page clustering is the production scorer's source of truth and retains exact clicks.
const clustered = clusterAndScoreOpportunities([
  { query: "whatsapp crm software", page: "https://whachatcrm.com/a", clicks: 7, impressions: 400, position: 8 },
  { query: "crm software for whatsapp", page: "https://whachatcrm.com/a", clicks: 3, impressions: 150, position: 12 },
], []);
assert.equal(clustered.length, 1);
assert.equal(clustered[0].current.clicks, 10);
assert.deepEqual(clustered[0].queryCluster, ["crm software for whatsapp", "whatsapp crm software"]);
const cannibalized = clusterAndScoreOpportunities([
  { query: "whatsapp crm software", page: "https://whachatcrm.com/b", clicks: 5, impressions: 100, position: 9 },
  { query: "crm software whatsapp", page: "https://whachatcrm.com/a", clicks: 5, impressions: 100, position: 9 },
], []);
assert.equal(cannibalized[0].type, "cannibalization");
assert.equal(cannibalized[0].targetPage, "https://whachatcrm.com/a", "equal metrics use stable URL tie-breaking");
assert.equal(cannibalized[0].competingPages.length, 2);
assert.equal(clusterAndScoreOpportunities([{query:"q",page:"/missing",clicks:0,impressions:0,position:0}],[]).length,0,"missing evidence cannot invent a primary page");

const { parseSeoPage, fingerprintSeoPage, isSnapshotStale } = await import("../server/seo/firstPartyPage");
const baseHtml = `<html><head><title> CRM   Page </title><meta name="description" content="Useful CRM page"><link rel="canonical" href="https://example.com/crm"><script type="application/ld+json">{"b":2,"a":1}</script></head><body class="build-123"><h1>WhatsApp CRM</h1><h2>Workflow</h2><p>Useful copy</p><a href="/pricing">Pricing</a><script>volatile()</script></body></html>`;
const normalized = parseSeoPage(baseHtml, "https://example.com/crm");
assert.equal(normalized.title, "CRM Page");
assert.deepEqual(normalized.internalLinks, ["/pricing"]);
assert.equal(fingerprintSeoPage(normalized), fingerprintSeoPage(parseSeoPage(baseHtml.replace("build-123", "build-999").replace("volatile()", "otherVolatile()"), "https://example.com/crm")), "irrelevant markup is ignored");
const changed = parseSeoPage(baseHtml.replace("Useful copy", "Materially changed copy"), "https://example.com/crm");
assert.notEqual(fingerprintSeoPage(normalized), fingerprintSeoPage(changed));
assert.equal(isSnapshotStale(fingerprintSeoPage(normalized), changed), true);

const actionServiceSource = readFileSync(new URL("../server/seo/actionService.ts", import.meta.url), "utf8");
assert.match(actionServiceSource, /loadPlannerMetrics[\s\S]+clusterAndScoreOpportunities\(metrics\.current,metrics\.previous/, "production analysis routes raw metrics through the cluster scorer");
assert.match(actionServiceSource, /catch\(error\)[\s\S]+skippedByCategory[\s\S]+recommendationsSkipped\+\+/, "one malformed opportunity is skipped rather than aborting the run");
assert.match(actionServiceSource, /pageSnapshotId:snapshot\.id/, "recommendation versions reference the actual page snapshot");
assert.match(actionServiceSource, /status:"researching"[\s\S]+version:next[\s\S]+status:"proposed"/, "refresh claims, versions, and restores the action");
assert.match(actionServiceSource, /Refresh failed; prior proposal restored/, "refresh failure remains recoverable");

const phase2bMigration = readFileSync(new URL("../migrations/0095_seo_action_planner.sql", import.meta.url), "utf8");
const refreshMigration = readFileSync(new URL("../migrations/0096_seo_action_refresh_snapshots.sql", import.meta.url), "utf8");
assert.match(refreshMigration, /page_snapshot_id varchar REFERENCES seo_page_snapshots\(id\)/);
assert.match(startup, /seoIntelligencePatchesReady\(patchResults\)/);
for (const tag of ["0093_seo_intelligence", "0094_seo_snapshot_bounded_key", "0095_seo_action_planner", "0096_seo_action_refresh_snapshots"]) assert.match(startup, new RegExp(tag));
assert.match(startup, /SEO schema patch failed; database details redacted/);
assert.match(phase2bMigration, /UNIQUE\(action_id, version\)/, "concurrent refresh cannot create duplicate versions");
assert.equal(proposedMetaDescriptionForQuery("x".repeat(SEO_META_DESCRIPTION_MAX)).length, SEO_META_DESCRIPTION_MAX, "at-limit input produces an exactly valid destination value");
const unsafePrimary = clusterAndScoreOpportunities([{query:"whatsapp crm software",page:"",clicks:1,impressions:100,position:8}],[]);
assert.equal(unsafePrimary[0].targetPage, "", "unsafe missing-page evidence is represented for a sanitized skip rather than silently reassigned");
assert.equal(unsafePrimary[0].competingPages.length, 1);
