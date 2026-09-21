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
for (const tag of ["0093_seo_intelligence", "0094_seo_snapshot_bounded_key", "0095_seo_action_planner", "0096_seo_action_refresh_snapshots", "0097_seo_action_orphan_repair"]) assert.match(startup, new RegExp(tag));
assert.match(startup, /SEO schema patch failed; database details redacted/);
assert.match(phase2bMigration, /UNIQUE\(action_id, version\)/, "concurrent refresh cannot create duplicate versions");
assert.equal(proposedMetaDescriptionForQuery("x".repeat(SEO_META_DESCRIPTION_MAX)).length, SEO_META_DESCRIPTION_MAX, "at-limit input produces an exactly valid destination value");
const unsafePrimary = clusterAndScoreOpportunities([{query:"whatsapp crm software",page:"",clicks:1,impressions:100,position:8}],[]);
assert.equal(unsafePrimary[0].targetPage, null, "unsafe missing-page evidence is represented for a sanitized skip rather than silently reassigned");
assert.equal(unsafePrimary[0].competingPages.length, 1);

// Opportunity predicates: no fallback low-CTR classification.
const metric=(clicks:number,impressions:number,position:number,query="query",page="/page")=>({query,page,clicks,impressions,position});
assert.equal(clusterAndScoreOpportunities([metric(20,100,1)],[]).length,0,"position-one healthy CTR is not an opportunity");
assert.equal(clusterAndScoreOpportunities([metric(1,100,1)],[])[0].type,"low_ctr","position-one weak CTR qualifies");
assert.equal(clusterAndScoreOpportunities([metric(10,100,8)],[])[0].type,"striking_distance","positions 4-20 remain striking distance even with healthy CTR");
assert.equal(clusterAndScoreOpportunities([metric(0,49,1)],[]).length,0,"low-impression noise is excluded");
assert.equal(clusterAndScoreOpportunities([metric(0,0,1)],[]).length,0,"zero impressions are excluded");
assert.equal(clusterAndScoreOpportunities([metric(7.2,100,1)],[]).length,0,"CTR exactly at the sixty-percent tolerance is healthy");
assert.equal(clusterAndScoreOpportunities([metric(7.21,100,1)],[]).length,0,"CTR above tolerance is healthy");
assert.equal(clusterAndScoreOpportunities([metric(7.19,100,1)],[])[0].type,"low_ctr","CTR below tolerance qualifies");
assert.equal(clusterAndScoreOpportunities([metric(1,50,1,"crm software","/p"),metric(2,50,1,"software crm","/p")],[])[0].current.ctr,.03,"cluster CTR uses aggregate raw clicks and impressions");

// Current/previous union retains meaningful prior-only and below-threshold declines.
const vanished=clusterAndScoreOpportunities([], [metric(20,200,6,"vanished query","/stable")]);
assert.equal(vanished[0].type,"decline");assert.deepEqual(vanished[0].current,{clicks:0,impressions:0,ctr:0,position:0});assert.equal(vanished[0].previous.impressions,200);assert.equal(vanished[0].targetPage,"/stable");
const belowThreshold=clusterAndScoreOpportunities([metric(1,20,7,"falling query","/stable")],[metric(10,100,5,"falling query","/stable")]);assert.equal(belowThreshold[0].type,"decline");assert.equal(belowThreshold[0].current.impressions,20);
assert.equal(clusterAndScoreOpportunities([], [metric(1,20,6,"tiny vanished","/tiny")]).length,0,"insignificant disappearance is excluded");
assert.equal(clusterAndScoreOpportunities([metric(1,100,1,"new weak","/new")],[])[0].type,"low_ctr","new current query needs no prior row");
const relatedVanished=clusterAndScoreOpportunities([], [metric(9,100,7,"whatsapp crm software","/stable"),metric(8,90,8,"crm software whatsapp","/stable")]);assert.equal(relatedVanished.length,1);assert.equal(relatedVanished[0].previous.clicks,17);assert.equal(relatedVanished[0].current.clicks,0);

// Production selection is hard-bounded in SQL before in-process clustering.
assert.match(actionServiceSource,/export const SEO_PLANNER_CANDIDATE_LIMIT=2_000/);
assert.match(actionServiceSource,/COUNT\(\*\) OVER\(\) eligible_count/);
assert.match(actionServiceSource,/ORDER BY priority_evidence DESC,previous_impressions DESC,current_impressions DESC,natural_key_hash ASC LIMIT \$\{candidateLimit\}/);
assert.doesNotMatch(actionServiceSource,/result\.rows[\s\S]*\.slice\(0,candidateLimit\)/,"the hard cap is not an application-memory slice");
const huge=Array.from({length:100_000},(_,i)=>metric(i===99_999?0:7,100,1,`query ${i}`,`/p/${i}`));
const sqlBoundedStrongest=huge.filter(r=>r.clicks/r.impressions<.12*.6).sort((a,b)=>(.12-b.clicks/b.impressions)*b.impressions-(.12-a.clicks/a.impressions)*a.impressions).slice(0,2_000);
assert.equal(sqlBoundedStrongest.length,2_000,"a realistic eligible set is bounded before clustering");assert.equal(sqlBoundedStrongest[0].query,"query 99999","the strongest candidate survives the safety cap");

// Initial action/version/evidence/event share one database transaction; malformed history is quarantined, not deleted.
assert.match(actionServiceSource,/createInitialActionAtomically[\s\S]+return db\.transaction\(async tx=>[\s\S]+INSERT INTO seo_actions[\s\S]+tx\.insert\(seoActionVersions\)[\s\S]+INSERT INTO seo_action_evidence[\s\S]+tx\.insert\(seoActionEvents\)/);
assert.match(actionServiceSource,/ON CONFLICT \(property_id,idempotency_key\)[\s\S]+DO NOTHING RETURNING id/);
assert.match(actionServiceSource,/LEFT JOIN seo_action_versions/,"malformed rows are visible with diagnostics rather than hidden by an inner join");
const repairMigration=readFileSync(new URL("../migrations/0097_seo_action_orphan_repair.sql",import.meta.url),"utf8");assert.match(repairMigration,/ORPHANED_INITIAL_VERSION_REPAIRED/);assert.doesNotMatch(repairMigration,/DELETE FROM/i);
assert.match(startup,/0097_seo_action_orphan_repair/);
