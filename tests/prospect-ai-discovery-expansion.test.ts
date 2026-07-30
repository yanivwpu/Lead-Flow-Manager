/**
 * Prospect AI discovery expansion, pagination orchestration, guardrails.
 * Run: npx tsx tests/prospect-ai-discovery-expansion.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROSPECT_AI_DISCOVERY_MAX_PROVIDER_CALLS,
  PROSPECT_AI_PLACES_PAGE_SIZE,
  buildProspectAiDiscoveryPlan,
  clampDiscoveryTargetToQuota,
  expandBusinessPhrases,
  expandLocations,
  normalizeDiscoveryTargetCount,
  normalizeLocationExpansionMode,
} from "../shared/prospectAiDiscoveryPlan";
import { runProspectAiDiscoveryOrchestrator } from "../server/prospectAI/discoveryOrchestrator";

{
  assert.equal(normalizeDiscoveryTargetCount(50), 50);
  assert.equal(normalizeDiscoveryTargetCount(999), 50);
  assert.equal(normalizeLocationExpansionMode("exact"), "exact");
  assert.equal(normalizeLocationExpansionMode("bogus"), "nearby");
}

{
  const phrases = expandBusinessPhrases("real estate agents");
  assert.ok(phrases[0] === "real estate agents");
  assert.ok(phrases.some((p) => /realtor/i.test(p)));
  assert.ok(!phrases.some((p) => /dentist|plumb/i.test(p)));
}

{
  const exact = expandLocations("Miami, FL", "exact");
  assert.deepEqual(exact, ["Miami, FL"]);
  const nearby = expandLocations("Miami, FL", "nearby");
  assert.ok(nearby[0] === "Miami, FL");
  assert.ok(nearby.length > 1);
  assert.ok(nearby.some((l) => /Beach|Gables|Brickell|Doral/i.test(l)));
}

{
  const plan = buildProspectAiDiscoveryPlan({
    businessType: "real estate agents",
    location: "Miami",
    targetCount: 50,
    locationExpansion: "nearby",
  });
  assert.equal(plan.targetCount, 50);
  assert.ok(plan.queries.length >= 3);
  assert.equal(plan.queries[0]?.textQuery.toLowerCase().includes("miami"), true);
  // No near-duplicate queries
  const keys = new Set(plan.queries.map((q) => q.textQuery.toLowerCase()));
  assert.equal(keys.size, plan.queries.length);
}

{
  assert.equal(clampDiscoveryTargetToQuota(100, 40), 40);
  assert.equal(clampDiscoveryTargetToQuota(50, 500), 50);
}

{
  // Mock Places: page1=20, page2=10 with token, unique ids; second query adds more
  let calls = 0;
  const fetchFn = async (_url: string | URL, init?: RequestInit) => {
    calls += 1;
    const body = JSON.parse(String(init?.body || "{}")) as {
      textQuery?: string;
      pageToken?: string;
    };
    if (String(_url).includes("geocode")) {
      return new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }), {
        status: 200,
      });
    }
    const page = body.pageToken ? 2 : 1;
    const count = page === 1 ? 20 : 8;
    const places = Array.from({ length: count }, (_, i) => ({
      id: `places/${body.textQuery?.slice(0, 8) || "q"}-p${page}-${i}`,
      displayName: { text: `Biz ${page}-${i}` },
      formattedAddress: "Miami, FL",
      businessStatus: "OPERATIONAL",
    }));
    return new Response(
      JSON.stringify({
        places,
        nextPageToken: page === 1 ? "token-2" : undefined,
      }),
      { status: 200 },
    );
  };

  process.env.GOOGLE_PLACES_API_KEY = "test-key-not-real";
  const result = await runProspectAiDiscoveryOrchestrator({
    businessType: "real estate agents",
    location: "Miami",
    targetCount: 50,
    locationExpansion: "nearby",
    quotaRemaining: 100,
    fetchFn: fetchFn as typeof fetch,
  });

  assert.ok(result.prospects.length >= 28, `expected multi-page unique, got ${result.prospects.length}`);
  assert.ok(result.diagnostics.pagesFetched >= 2);
  assert.ok(result.diagnostics.providerCalls >= 2);
  assert.ok(result.diagnostics.providerCalls <= PROSPECT_AI_DISCOVERY_MAX_PROVIDER_CALLS);
  assert.ok(
    result.diagnostics.stopReason === "target_reached" ||
      result.diagnostics.stopReason === "no_more_unique_results" ||
      result.diagnostics.stopReason === "source_exhausted",
  );
  assert.equal(PROSPECT_AI_PLACES_PAGE_SIZE, 20);
}

{
  // Target stop — stop once unique count reached
  let calls = 0;
  const fetchFn = async (_url: string | URL, init?: RequestInit) => {
    if (String(_url).includes("geocode")) {
      return new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }), {
        status: 200,
      });
    }
    calls += 1;
    const places = Array.from({ length: 20 }, (_, i) => ({
      id: `places/stop-${calls}-${i}`,
      displayName: { text: `Stop ${calls}-${i}` },
      businessStatus: "OPERATIONAL",
    }));
    return new Response(JSON.stringify({ places, nextPageToken: "more" }), { status: 200 });
  };
  process.env.GOOGLE_PLACES_API_KEY = "test-key-not-real";
  const result = await runProspectAiDiscoveryOrchestrator({
    businessType: "dentists",
    location: "Austin",
    targetCount: 25,
    locationExpansion: "exact",
    quotaRemaining: 500,
    fetchFn: fetchFn as typeof fetch,
  });
  assert.equal(result.prospects.length, 25);
  assert.equal(result.diagnostics.stopReason, "target_reached");
  assert.ok(calls >= 2, "target 25 requires more than one page of 20");
}

{
  const src = readFileSync(
    join(import.meta.dirname, "..", "server/prospectAI/prospectAIService.ts"),
    "utf8",
  );
  assert.ok(src.includes("runProspectAiDiscoveryOrchestrator"));
  assert.ok(src.includes("diagnostics:"));
  const ui = readFileSync(
    join(import.meta.dirname, "..", "client/src/pages/ProspectAI.tsx"),
    "utf8",
  );
  assert.ok(ui.includes("prospect-ai-target-count"));
  assert.ok(ui.includes("prospect-ai-location-expansion"));
  assert.ok(ui.includes("prospect-discover-diagnostics"));
}

console.log("prospect-ai-discovery-expansion.test.ts: all assertions passed");
