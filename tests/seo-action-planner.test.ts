/** Run: npx tsx tests/seo-action-planner.test.ts */
import assert from "node:assert/strict";
import { assertSafePublicUrl, filterCompetitorResults, HostRateLimiter, isPublicAddress, safeFetchHtml, type PinnedTransport } from "../server/seo/competitorResearch";
import { contentFingerprint, mayTransitionSeoAction, recommendationIdempotencyKey, selectStaleCheckCandidates, validateRecommendationOutput } from "../server/seo/actionPlanner";
import { aggregateNormalizedMetricRows, clusterAndScoreOpportunities, processCandidatesUntil } from "../server/seo/opportunityPlanner";
const resolvePublic=async()=>[{address:"93.184.216.34",family:4}] as any;
await assert.rejects(()=>assertSafePublicUrl("http://127.0.0.1/private"));
await assert.rejects(()=>assertSafePublicUrl("file:///etc/passwd"));
assert.equal((await assertSafePublicUrl("https://example.com/page",resolvePublic)).hostname,"example.com");
assert.deepEqual(filterCompetitorResults([{url:"https://whachatcrm.com/a"},{url:"https://competitor.test/a"}], ["whachatcrm.com"]).map(r=>r.url),["https://competitor.test/a"]);
assert.deepEqual(filterCompetitorResults([{url:"https://one.test"},{url:"https://two.test"}], [], ["two.test"]).map(r=>r.url),["https://two.test"]);
const pinned=(response:{status?:number;headers?:Record<string,string>;body?:string;remoteAddress?:string}={}):PinnedTransport=>async(_url,addresses)=>({status:response.status??200,headers:new Headers(response.headers??{"content-type":"text/html"}),body:(async function*(){yield new TextEncoder().encode(response.body??"x")})(),remoteAddress:response.remoteAddress??addresses[0].address});
await assert.rejects(()=>safeFetchHtml("https://example.com",{resolver:resolvePublic,transport:pinned({headers:{"content-type":"application/json"}})}),/INVALID_CONTENT_TYPE/);
await assert.rejects(()=>safeFetchHtml("https://example.com",{resolver:resolvePublic,transport:pinned({headers:{"content-type":"text/html","content-length":"2000000"}})}),/RESPONSE_TOO_LARGE/);
await assert.rejects(()=>safeFetchHtml("https://example.com",{resolver:resolvePublic,robotsAllowed:async()=>false,transport:pinned()}),/ROBOTS_DISALLOWED/);
const limiter=new HostRateLimiter(10);const waits:number[]=[];let time=100;await limiter.wait(new URL("https://example.com"),()=>time,async n=>{waits.push(n);time+=n});await limiter.wait(new URL("https://example.com"),()=>time,async n=>{waits.push(n);time+=n});assert.deepEqual(waits,[10]);
const rows=[{query:"whatsapp crm software",page:"https://whachatcrm.com/",clicks:4,impressions:400,position:8},{query:"crm software for whatsapp",page:"https://whachatcrm.com/",clicks:1,impressions:150,position:12}];
const scored=clusterAndScoreOpportunities(rows,[]);assert.equal(scored.length,1);assert.equal(scored[0].queryCluster.length,2);assert.ok(scored[0].priorityScore>0&&scored[0].confidenceScore<=1);
const normalizedCollisions=aggregateNormalizedMetricRows([
 {query:"  WhatsApp CRM ",page:"https://EXAMPLE.com/page/",clicks:2,impressions:20,position:2},
 {query:"whatsapp crm",page:"https://example.com/page?utm_source=test#part",clicks:3,impressions:30,position:8},
 {query:"WHATSAPP CRM",page:"https://example.com/page?gclid=x",clicks:1,impressions:0,position:99},
]);assert.equal(normalizedCollisions.length,1);assert.deepEqual({clicks:normalizedCollisions[0].clicks,impressions:normalizedCollisions[0].impressions,position:normalizedCollisions[0].position},{clicks:6,impressions:50,position:5.6});assert.equal(normalizedCollisions[0].sourceQueries.length,3);assert.equal(normalizedCollisions[0].sourcePages.length,3);
assert.equal(aggregateNormalizedMetricRows([{query:"ZERO",page:"/zero/",clicks:0,impressions:0,position:12},{query:"zero",page:"/zero",clicks:0,impressions:0,position:3}])[0].position,0,"zero-impression identities use the documented zero-position fallback");
assert.equal(clusterAndScoreOpportunities([{query:"Threshold",page:"/p/",clicks:4,impressions:25,position:8},{query:"threshold",page:"/p?utm_source=x",clicks:1,impressions:25,position:8}],[])[0].current.impressions,50,"eligibility is evaluated after normalized metric aggregation");
const processed:string[]=[];const isolated=await processCandidatesUntil(["poisoned","valid-one","valid-two"],2,async candidate=>{if(candidate==="poisoned")throw new Error("malformed proposal");processed.push(candidate);return true;},()=>processed.push("skipped"));assert.deepEqual(processed,["skipped","valid-one","valid-two"]);assert.deepEqual(isolated,{successes:2,attempted:3},"a poisoned proposal cannot abort the run or consume the success limit");
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
assert.match(actionServiceSource, /processCandidatesUntil[\s\S]+skippedByCategory[\s\S]+recommendationsSkipped\+\+/, "one malformed opportunity is skipped rather than aborting the run");
assert.doesNotMatch(actionServiceSource.match(/function actionIdentity[^\n]+/)?.[0]??"",/buildProposal|validateRecommendationOutput/,"identity calculation cannot validate a proposal");
assert.match(actionServiceSource,/processCandidatesUntil\(eligible,MAX_OPPORTUNITIES,[\s\S]+const proposal=buildProposal\(item\)/,"proposal construction occurs inside the isolated per-candidate worker");
assert.match(actionServiceSource,/createAnalysisLeaseHeartbeat[\s\S]+lease_expires_at>NOW\(\)[\s\S]+SEO analysis completion was fenced/,"analysis heartbeats and completion are token/status/expiry fenced");
assert.match(actionServiceSource,/loadStaleCheckQueue\(propertyId\)[\s\S]+reconcileStaleOpenActions[\s\S]+loadPlannerMetrics/,"stale reconciliation is independent of current ranking keys");
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
assert.match(actionServiceSource,/SEO_COMPETING_PAGES_PER_QUERY=8[\s\S]+selected_queries[\s\S]+Math\.floor\(candidateLimit\/SEO_COMPETING_PAGES_PER_QUERY\)[\s\S]+page_rank<=\$\{SEO_COMPETING_PAGES_PER_QUERY\}[\s\S]+LIMIT \$\{candidateLimit\}/);
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

// Cannibalization owns classification before decline/striking/CTR and retains both periods.
const {normalizeSeoPageIdentity,excludeOpenActionCandidates}=await import("../server/seo/opportunityPlanner");
const multiDecline=clusterAndScoreOpportunities([
 metric(2,80,10,"shared crm query","https://example.com/a"),metric(1,60,12,"crm query shared","https://example.com/b")
],[metric(20,200,5,"shared crm query","https://example.com/a"),metric(10,150,6,"crm query shared","https://example.com/b")]);
assert.equal(multiDecline[0].type,"cannibalization");assert.equal((multiDecline[0].evidence.decline as {qualifies:boolean}).qualifies,true);assert.equal(multiDecline[0].competingPages.length,2);assert.equal(multiDecline[0].competingPages[0].previous.impressions>0,true);
const multiStriking=clusterAndScoreOpportunities([metric(5,100,8,"shared crm query","/a"),metric(4,90,9,"crm query shared","/b")],[]);assert.equal(multiStriking[0].type,"cannibalization");
const multiLowCtr=clusterAndScoreOpportunities([metric(1,100,2,"shared crm query","/a"),metric(1,100,2,"crm query shared","/b")],[]);assert.equal(multiLowCtr[0].type,"cannibalization");
const healthyMultiPage=clusterAndScoreOpportunities([metric(20,100,1,"healthy shared query","/a"),metric(18,90,1,"healthy shared query","/b")],[]);assert.equal(healthyMultiPage[0].type,"cannibalization","all current pages survive eligibility even when each row is healthy");assert.equal((healthyMultiPage[0].evidence.currentVisiblePages as unknown[]).length,2);
const harmless=clusterAndScoreOpportunities([metric(5,100,8,"same query","https://EXAMPLE.com/page/"),metric(4,90,9,"same query","https://example.com/page?utm_source=x#part")],[]);assert.notEqual(harmless[0].type,"cannibalization");assert.equal(harmless[0].competingPages.length,1);assert.equal(normalizeSeoPageIdentity("https://EXAMPLE.com/page/?utm_source=x#x"),"https://example.com/page");
assert.equal(cannibalized[0].recommendedPrimaryPage,null,"equal evidence is explicitly ambiguous");assert.equal(multiDecline[0].recommendedPrimaryPage,"https://example.com/a","stronger evidence supports a possible primary");

// Open identities are removed before the creation limit; closed identities are absent from the supplied open set.
const rankedKeys=Array.from({length:25},(_,i)=>({key:`k${i}`,rank:i}));
assert.deepEqual(excludeOpenActionCandidates(rankedKeys,new Set(rankedKeys.slice(0,10).map(x=>x.key))).eligible.slice(0,10).map(x=>x.key),rankedKeys.slice(10,20).map(x=>x.key),"top-ten open actions cannot starve the next ten");
assert.equal(excludeOpenActionCandidates(rankedKeys,new Set(["k0","k2"])).excluded,2);assert.equal(excludeOpenActionCandidates(rankedKeys,new Set()).eligible.length,25,"closed actions do not block new work");
assert.match(actionServiceSource,/maxPerRun:SEO_PLANNER_CANDIDATE_LIMIT/);assert.match(actionServiceSource,/loadOpenActions[\s\S]+excludeOpenActionCandidates[\s\S]+processCandidatesUntil\(eligible,MAX_OPPORTUNITIES/);assert.match(actionServiceSource,/raceConditionConflicts\+\+/,"post-filter uniqueness races are counted and iteration continues");
assert.match(actionServiceSource,/current_visible_pages>1/,"SQL eligibility retains healthy multi-page current queries");
assert.match(actionServiceSource,/JOIN selected_queries[\s\S]+n\.current_impressions>0[\s\S]+page_rank<=\$\{SEO_COMPETING_PAGES_PER_QUERY\}/,"selected query clusters receive a per-query bounded current-page expansion");

// Durable refresh claims are persisted, fenced, reclaimable only after expiry, and network work is outside transactions.
const leaseMigration=readFileSync(new URL("../migrations/0098_seo_action_refresh_leases.sql",import.meta.url),"utf8");assert.match(leaseMigration,/refresh_lease_token/);assert.doesNotMatch(leaseMigration,/UPDATE seo_actions/);assert.doesNotMatch(leaseMigration,/DELETE FROM/i);
assert.match(actionServiceSource,/SEO_ACTION_REFRESH_LEASE_DEFAULT_MS=5\*60_000/);assert.match(actionServiceSource,/refresh_lease_expires_at/);assert.match(actionServiceSource,/FOR UPDATE[\s\S]+recoveredExpiredClaim/);assert.match(actionServiceSource,/refresh_lease_expires_at>NOW\(\) FOR UPDATE/);assert.match(actionServiceSource,/refreshLeaseToken:null[\s\S]+refreshFailureCategory:"REFRESH_FAILED"/);assert.match(startup,/0098_seo_action_refresh_leases/);

// Historical pages explain migrations but only concurrent current visibility triggers cannibalization.
const migratedStable=clusterAndScoreOpportunities([metric(10,100,5,"migration query","https://example.com/new")],[metric(10,100,5,"migration query","https://example.com/old")]);assert.notEqual(migratedStable[0]?.type,"cannibalization");
const migratedDecline=clusterAndScoreOpportunities([metric(2,50,8,"migration decline","https://example.com/new")],[metric(20,200,5,"migration decline","https://example.com/old")]);assert.equal(migratedDecline[0].type,"decline");assert.equal((migratedDecline[0].evidence.historicalPages as unknown[]).length,1);
const currentAndHistory=clusterAndScoreOpportunities([metric(3,80,8,"multi current query","https://example.com/a"),metric(2,70,9,"current query multi","https://example.com/b")],[metric(9,100,5,"multi current query","https://example.com/old")]);assert.equal(currentAndHistory[0].type,"cannibalization");assert.equal((currentAndHistory[0].evidence.currentVisiblePages as unknown[]).length,2);assert.equal((currentAndHistory[0].evidence.historicalPages as unknown[]).length,1);
const languages=clusterAndScoreOpportunities([metric(3,80,8,"localized crm query","https://example.com/en/page"),metric(2,70,9,"crm query localized","https://example.com/es/page")],[]);assert.equal(languages[0].type,"cannibalization");

// Opportunities are append-only evidence snapshots; versions own their immutable evidence.
const immutableMigration=readFileSync(new URL("../migrations/0099_seo_immutable_evidence.sql",import.meta.url),"utf8");assert.match(immutableMigration,/evidence_snapshot jsonb/);assert.match(immutableMigration,/DROP INDEX IF EXISTS seo_opportunities_property_cluster_uidx/);assert.doesNotMatch(immutableMigration,/DELETE FROM/i);assert.match(actionServiceSource,/persistOpportunity[\s\S]+\.values\([\s\S]+\.returning\(\)/);assert.doesNotMatch(actionServiceSource,/persistOpportunity[\s\S]{0,1200}onConflictDoUpdate/);assert.match(actionServiceSource,/evidenceSnapshot:immutableEvidence/);assert.match(actionServiceSource,/v\.evidence_snapshot->'currentMetrics'/);assert.match(startup,/0099_seo_immutable_evidence/);

// Open proposed/approved actions receive bounded, fingerprint-fenced stale reconciliation.
assert.match(actionServiceSource,/SEO_STALE_CHECK_LIMIT=10/);assert.match(actionServiceSource,/status:'revision_required'/);assert.match(actionServiceSource,/previousFingerprint[\s\S]+currentFingerprint[\s\S]+pageSnapshotId/);assert.match(actionServiceSource,/staleChecksAttempted[\s\S]+staleChecksUnchanged[\s\S]+staleChecksMarked[\s\S]+staleChecksFailed/);assert.match(actionServiceSource,/originalContentFingerprint,action\.contentFingerprint/);assert.match(actionServiceSource,/status} IN \('proposed','approved'\)/);assert.match(actionServiceSource,/\["proposed","revision_required"\]/,"stale actions can regenerate but cannot approve directly");

// Patch 0100 recovers only expired leases or conservatively old lease-less rows and restores durable return state.
const recoveryMigration=readFileSync(new URL("../migrations/0100_seo_refresh_return_and_stale_rotation.sql",import.meta.url),"utf8");
assert.match(recoveryMigration,/refresh_lease_token IS NOT NULL AND a\.refresh_lease_expires_at<=NOW\(\)/);
assert.match(recoveryMigration,/refresh_lease_token IS NULL[\s\S]+updated_at<=NOW\(\)-INTERVAL '30 minutes'/);
assert.match(recoveryMigration,/refresh_return_status IN \('proposed','revision_required'\)/);
assert.doesNotMatch(recoveryMigration,/WHERE status='researching';/);
assert.match(recoveryMigration,/claimTokenHash/);
assert.match(startup,/0100_seo_refresh_return_and_stale_rotation/);
assert.match(actionServiceSource,/refreshReturnStatus:returnStatus/);
assert.match(actionServiceSource,/status:claim\.returnStatus[\s\S]+refreshReturnStatus:null/);
assert.match(actionServiceSource,/toStatus:claim\.returnStatus/);
assert.match(actionServiceSource,/to==="approved"&&action\.staleAt/);

// Persistent stale_checked_at rotation advances beyond ten and backs off failures.
const rotationNow=new Date("2026-09-21T12:00:00Z");
const rotation=Array.from({length:25},(_,i)=>({id:`a${String(i).padStart(2,"0")}`,status:"proposed",staleCheckedAt:null as Date|null,staleCheckRetryAt:null as Date|null}));
const firstRotation=selectStaleCheckCandidates(rotation,rotationNow,10);assert.deepEqual(firstRotation.map(x=>x.id),rotation.slice(0,10).map(x=>x.id));firstRotation.forEach(x=>x.staleCheckedAt=rotationNow);
const secondRotation=selectStaleCheckCandidates(rotation,new Date(rotationNow.getTime()+1),10);assert.deepEqual(secondRotation.map(x=>x.id),rotation.slice(10,20).map(x=>x.id));secondRotation.forEach(x=>x.staleCheckedAt=new Date(rotationNow.getTime()+1));
const thirdRotation=selectStaleCheckCandidates(rotation,new Date(rotationNow.getTime()+2),10);assert.ok(rotation.every(row=>[...firstRotation,...secondRotation,...thirdRotation].includes(row)),"repeated bounded runs eventually check all actions");
rotation[0].staleCheckRetryAt=new Date(rotationNow.getTime()+60_000);assert.ok(!selectStaleCheckCandidates(rotation,rotationNow,10).some(x=>x.id===rotation[0].id),"failing page backs off");
rotation.push({id:"a-new",status:"proposed",staleCheckedAt:null,staleCheckRetryAt:null});assert.ok(selectStaleCheckCandidates(rotation,rotationNow,10).some(x=>x.id==="a-new"),"new unchecked action receives timely checking");
assert.match(actionServiceSource,/staleCheckedAt:now,staleCheckRetryAt:null/);assert.match(actionServiceSource,/SEO_STALE_RETRY_MS=15\*60_000/);

// revision_required reserves the original identity until refresh succeeds or the action is explicitly closed.
const identityReservationMigration=readFileSync(new URL("../migrations/0101_seo_revision_identity_reservation.sql",import.meta.url),"utf8");
assert.match(identityReservationMigration,/CREATE UNIQUE INDEX IF NOT EXISTS seo_actions_reserved_idempotency_uidx[\s\S]+revision_required/);
assert.ok(identityReservationMigration.indexOf("CREATE UNIQUE INDEX")<identityReservationMigration.indexOf("DROP INDEX"),"replacement uniqueness is established before the old index is removed");
assert.match(startup,/0101_seo_revision_identity_reservation/);assert.match(actionServiceSource,/status IN \('detected','researching','proposed','approved','revision_required'\) DO NOTHING/);assert.match(actionServiceSource,/loadOpenActions[\s\S]+revision_required/);
const startup0101=startup.match(/tag: "0101_seo_revision_identity_reservation",\s+sql: `([\s\S]*?)`/)?.[1]??"";const normalizeStatements=(value:string)=>value.split(";").map(statement=>statement.replace(/\s+/g," ").trim().toLowerCase()).filter(Boolean);assert.deepEqual(normalizeStatements(startup0101),normalizeStatements(identityReservationMigration),"migration and startup provisioning remain equivalent");
