/**
 * Prospect AI discovery Phase 2 — net-new target, layered dedupe, quality/relevance, quota fairness.
 * Run: npx tsx tests/prospect-ai-discovery-phase2.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildIdentityKeys,
  classifyIdentityOverlap,
  looksLikeDistinctBranchOrAgent,
} from "../shared/prospectAiDiscoveryMatch";
import {
  countsTowardDiscoveryTarget,
  evaluateDiscoveryQuality,
  evaluateDiscoveryRelevance,
  isPossibleDuplicateReason,
  isUsableNeedsAttentionReason,
  normalizePhoneDigits,
  normalizeWebsiteDomain,
} from "../shared/prospectAiDiscoveryQuality";
import {
  discoverySearchErrorForDisplay,
  parseDiscoveryDiagnostics,
  serializeDiscoveryDiagnostics,
} from "../shared/prospectAiDiscoveryDiagnostics";
import { clampDiscoveryTargetToQuota } from "../shared/prospectAiDiscoveryPlan";
import { runProspectAiDiscoveryOrchestrator } from "../server/prospectAI/discoveryOrchestrator";
import type { DiscoveryWorkspaceIndex } from "../server/prospectAI/discoveryWorkspaceIndex";
import { findWorkspaceMatch } from "../server/prospectAI/discoveryWorkspaceIndex";

function place(
  id: string,
  name: string,
  extras: Record<string, unknown> = {},
) {
  return {
    id: `places/${id}`,
    displayName: { text: name },
    businessStatus: "OPERATIONAL",
    formattedAddress: "100 Main St, Miami, FL 33101",
    types: ["real_estate_agency"],
    ...extras,
  };
}

function mockFetch(pages: Array<unknown[]>) {
  let call = 0;
  return async (url: string | URL) => {
    if (String(url).includes("geocode")) {
      return new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }), {
        status: 200,
      });
    }
    const idx = Math.min(call, pages.length - 1);
    call += 1;
    const places = pages[idx] || [];
    return new Response(
      JSON.stringify({
        places,
        nextPageToken: call < pages.length ? `tok-${call}` : undefined,
      }),
      { status: 200 },
    );
  };
}

{
  // Quality: closed / directory / missing identity; missing email OK
  assert.equal(
    evaluateDiscoveryQuality({
      name: "Closed Biz",
      providerPlaceId: "x",
      businessStatus: "CLOSED_PERMANENTLY",
    }).reason,
    "permanently_closed",
  );
  assert.equal(
    evaluateDiscoveryQuality({
      name: "Yelp Listing",
      providerPlaceId: "x",
      website: "https://www.yelp.com/biz/foo",
    }).reason,
    "directory_or_aggregator",
  );
  assert.equal(
    evaluateDiscoveryQuality({ name: "", providerPlaceId: "x" }).reason,
    "invalid_business_identity",
  );
  const okMissingEmail = evaluateDiscoveryQuality({
    name: "ABC Realty",
    providerPlaceId: "p1",
    website: "https://abcrealty.com",
  });
  assert.equal(okMissingEmail.disposition, "ready");
  assert.equal(
    evaluateDiscoveryQuality({
      name: "Agent",
      providerPlaceId: "p2",
      website: "https://facebook.com/agentpage",
    }).disposition,
    "needs_attention",
  );
}

{
  // Relevance: obvious mismatch vs uncertain
  const mismatch = evaluateDiscoveryRelevance({
    requestedBusinessType: "real estate agents",
    name: "Miami Title Co",
    types: ["title_company"],
  });
  assert.equal(mismatch.disposition, "rejected");
  assert.equal(mismatch.reason, "industry_mismatch");

  const uncertain = evaluateDiscoveryRelevance({
    requestedBusinessType: "real estate agents",
    name: "Sunshine Partners",
    types: ["point_of_interest", "establishment"],
  });
  assert.equal(uncertain.disposition, "needs_attention");
  assert.equal(uncertain.reason, "uncertain_category");
}

{
  // Layered identity + branch protection
  assert.equal(normalizeWebsiteDomain("https://www.Example.com/path"), "example.com");
  assert.equal(normalizePhoneDigits("+1 (305) 555-1212"), "3055551212");

  const a = buildIdentityKeys({
    name: "ABC Realty LLC",
    providerPlaceId: "p1",
    website: "https://abcrealty.com",
    phone: "3055551212",
    address: "100 Main St, Miami, FL",
  });
  const b = buildIdentityKeys({
    name: "ABC Realty",
    website: "https://abcrealty.com",
    phone: "(305) 555-1212",
    address: "100 Main Street, Miami, FL",
  });
  const overlap = classifyIdentityOverlap(a, b);
  assert.ok(overlap?.autoCollapse);

  const branchA = buildIdentityKeys({
    name: "RE/MAX",
    phone: "3051111111",
    address: "100 Brickell Ave, Miami, FL",
  });
  const branchB = buildIdentityKeys({
    name: "RE/MAX",
    phone: "3052222222",
    address: "200 Coral Way, Coral Gables, FL",
  });
  assert.equal(looksLikeDistinctBranchOrAgent(branchA, branchB), true);
  assert.equal(classifyIdentityOverlap(branchA, branchB), null);

  const agentA = buildIdentityKeys({
    name: "Jane Smith",
    phone: "3053333333",
    address: "1 Brokerage Blvd, Miami, FL",
    website: "https://janesmith.com",
  });
  const agentB = buildIdentityKeys({
    name: "John Smith",
    phone: "3054444444",
    address: "1 Brokerage Blvd, Miami, FL",
    website: "https://johnsmith.com",
  });
  assert.equal(classifyIdentityOverlap(agentA, agentB), null);
}

{
  // Workspace match by place / domain+phone
  const index: DiscoveryWorkspaceIndex = {
    byPlaceId: new Map([
      ["known-place", { recordId: "c1", recordKind: "crm_contact", label: "Known Co" }],
    ]),
    entries: [
      {
        recordId: "c2",
        recordKind: "prospect_ai_contact",
        label: "Domain Match LLC",
        keys: buildIdentityKeys({
          name: "Domain Match LLC",
          website: "https://domainmatch.com",
          phone: "3059998888",
          address: "9 Oak St, Miami, FL",
        }),
      },
    ],
  };
  const byPlace = findWorkspaceMatch(
    index,
    buildIdentityKeys({ name: "X", providerPlaceId: "known-place" }),
  );
  assert.equal(byPlace?.recordId, "c1");
  const byDomainPhone = findWorkspaceMatch(
    index,
    buildIdentityKeys({
      name: "Domain Match",
      website: "https://domainmatch.com",
      phone: "3059998888",
      address: "9 Oak Street, Miami, FL",
    }),
  );
  assert.ok(byDomainPhone?.match.autoCollapse);
}

{
  // Orchestrator: in-run dup + workspace + closed do not count toward target
  process.env.GOOGLE_PLACES_API_KEY = "test-key-not-real";
  const workspaceIndex: DiscoveryWorkspaceIndex = {
    byPlaceId: new Map([
      ["existing-1", { recordId: "crm-1", recordKind: "crm_contact", label: "Existing Realty" }],
    ]),
    entries: [],
  };

  const pages = [
    [
      place("new-1", "Fresh Agents", {
        websiteUri: "https://freshagents.com",
        nationalPhoneNumber: "3051110001",
      }),
      place("new-1", "Fresh Agents Dup"), // same placeId → in-run dup
      place("existing-1", "Existing Realty"),
      place("closed-1", "Gone LLC", { businessStatus: "CLOSED_PERMANENTLY" }),
      place("dir-1", "Directory Page", { websiteUri: "https://yelp.com/biz/x" }),
      place("title-1", "Title Shop", { types: ["title_company"] }),
      place("new-2", "Second Team", {
        websiteUri: "https://secondteam.com",
        nationalPhoneNumber: "3051110002",
        // no email — still usable
      }),
      place("new-2b", "Second Team LLC", {
        websiteUri: "https://secondteam.com",
        nationalPhoneNumber: "3051110002",
        formattedAddress: "55 Biscayne, Miami, FL",
      }),
    ],
  ];

  const result = await runProspectAiDiscoveryOrchestrator({
    businessType: "real estate agents",
    location: "Miami",
    targetCount: 25,
    locationExpansion: "exact",
    quotaRemaining: 100,
    fetchFn: mockFetch(pages) as typeof fetch,
    workspaceIndex,
  });

  assert.ok(result.diagnostics.rawResults >= 8);
  assert.ok(result.diagnostics.duplicatesInRun >= 1);
  assert.ok(result.diagnostics.alreadyInWorkspace >= 1);
  assert.ok(result.diagnostics.rejectedClosed >= 1);
  assert.ok(result.diagnostics.rejectedQuality >= 1);
  assert.ok(result.diagnostics.rejectedRelevance >= 1);
  // Only net-new usable saved
  assert.equal(result.prospects.length, result.diagnostics.netNewUsable);
  assert.ok(result.prospects.length >= 2);
  assert.ok(result.prospects.every((p) => p.providerPlaceId !== "existing-1"));
  assert.ok(result.prospects.some((p) => !p.email)); // missing email remains usable
  // Diagnostics reconcile: raw >= sum of buckets (loosely)
  const accounted =
    result.diagnostics.duplicatesInRun +
    result.diagnostics.alreadyInWorkspace +
    result.diagnostics.rejectedClosed +
    result.diagnostics.rejectedInvalid +
    result.diagnostics.rejectedQuality +
    result.diagnostics.rejectedRelevance +
    result.diagnostics.netNewUsable;
  assert.ok(
    accounted <= result.diagnostics.rawResults + 2,
    `accounted ${accounted} vs raw ${result.diagnostics.rawResults}`,
  );
}

{
  // Pagination continues until net-new target (not raw)
  process.env.GOOGLE_PLACES_API_KEY = "test-key-not-real";
  let calls = 0;
  const fetchFn = async (url: string | URL) => {
    if (String(url).includes("geocode")) {
      return new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }), {
        status: 200,
      });
    }
    calls += 1;
    // Each page: 10 dups of same place + 5 new → only 5 net-new per page
    const places = [
      ...Array.from({ length: 10 }, () => place("same-dup", "Same Dup Inc")),
      ...Array.from({ length: 5 }, (_, i) =>
        place(`page${calls}-n${i}`, `New ${calls}-${i}`, {
          websiteUri: `https://new${calls}${i}.com`,
          nationalPhoneNumber: `30555${calls}${i}000`.slice(0, 10),
        }),
      ),
    ];
    return new Response(
      JSON.stringify({ places, nextPageToken: calls < 6 ? `t${calls}` : undefined }),
      { status: 200 },
    );
  };
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
  assert.ok(calls >= 5, `expected pagination for net-new target, calls=${calls}`);
  assert.ok(result.diagnostics.duplicatesInRun >= 10);
}

{
  // Cancel between pages
  process.env.GOOGLE_PLACES_API_KEY = "test-key-not-real";
  let calls = 0;
  let cancelled = false;
  const fetchFn = async (url: string | URL) => {
    if (String(url).includes("geocode")) {
      return new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }), {
        status: 200,
      });
    }
    calls += 1;
    if (calls >= 2) cancelled = true;
    const places = Array.from({ length: 20 }, (_, i) =>
      place(`c${calls}-${i}`, `Cancel Biz ${calls}-${i}`),
    );
    return new Response(JSON.stringify({ places, nextPageToken: "more" }), { status: 200 });
  };
  const result = await runProspectAiDiscoveryOrchestrator({
    businessType: "gyms",
    location: "Denver",
    targetCount: 100,
    locationExpansion: "exact",
    quotaRemaining: 500,
    fetchFn: fetchFn as typeof fetch,
    isCancelled: () => cancelled,
  });
  assert.equal(result.diagnostics.stopReason, "user_cancelled");
  assert.ok(result.prospects.length > 0);
  assert.ok(result.prospects.length < 100);
}

{
  // Usable needs-attention counts; possible duplicates do not
  assert.equal(isUsableNeedsAttentionReason("uncertain_category"), true);
  assert.equal(isUsableNeedsAttentionReason("social_profile_as_website"), true);
  assert.equal(isPossibleDuplicateReason("likely_duplicate"), true);
  assert.equal(
    countsTowardDiscoveryTarget({
      disposition: "needs_attention",
      attentionReason: "uncertain_category",
    }),
    true,
  );
  assert.equal(
    countsTowardDiscoveryTarget({
      disposition: "needs_attention",
      attentionReason: "likely_duplicate",
    }),
    false,
  );
  assert.equal(
    countsTowardDiscoveryTarget({ disposition: "possible_duplicate", attentionReason: "likely_duplicate" }),
    false,
  );
}

{
  // Soft in-run overlap → possible duplicate (not saved / not charged); search continues to target
  process.env.GOOGLE_PLACES_API_KEY = "test-key-not-real";
  let calls = 0;
  const fetchFn = async (url: string | URL) => {
    if (String(url).includes("geocode")) {
      return new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }), {
        status: 200,
      });
    }
    calls += 1;
    if (calls === 1) {
      // First page: one real + one soft-dup (same domain, different phone/street → likely/branch)
      return new Response(
        JSON.stringify({
          places: [
            place("soft-a", "Brand Office A", {
              websiteUri: "https://sharedbrand.com",
              nationalPhoneNumber: "3051110001",
              formattedAddress: "10 A St, Miami, FL",
            }),
            place("soft-b", "Brand Office B", {
              websiteUri: "https://sharedbrand.com",
              nationalPhoneNumber: "3051110002",
              formattedAddress: "20 B St, Coral Gables, FL",
            }),
            ...Array.from({ length: 18 }, (_, i) =>
              place(`fill-${i}`, `Fill Agent ${i}`, {
                websiteUri: `https://fill${i}.com`,
                nationalPhoneNumber: `305222${String(1000 + i).slice(-4)}`,
              }),
            ),
          ],
          nextPageToken: "more",
        }),
        { status: 200 },
      );
    }
    const places = Array.from({ length: 20 }, (_, i) =>
      place(`more-${calls}-${i}`, `More Agent ${calls}-${i}`, {
        websiteUri: `https://more${calls}${i}.com`,
        nationalPhoneNumber: `305333${String(calls * 100 + i).padStart(4, "0")}`,
      }),
    );
    return new Response(
      JSON.stringify({ places, nextPageToken: calls < 3 ? `t${calls}` : undefined }),
      { status: 200 },
    );
  };

  const result = await runProspectAiDiscoveryOrchestrator({
    businessType: "real estate agents",
    location: "Miami",
    targetCount: 25,
    locationExpansion: "exact",
    quotaRemaining: 100,
    fetchFn: fetchFn as typeof fetch,
  });

  assert.ok(result.diagnostics.possibleDuplicates >= 1, "expected possible duplicate");
  assert.equal(
    result.prospects.some((p) => p.providerPlaceId === "soft-b"),
    false,
    "possible duplicate must not be saved",
  );
  assert.equal(result.diagnostics.quotaConsumed, result.prospects.length);
  assert.equal(result.diagnostics.netNewUsable, result.prospects.length);
  assert.ok(
    !result.prospects.some((p) => isPossibleDuplicateReason(p.attentionReason)),
    "saved rows must not be possible-duplicate reasons",
  );
  assert.equal(result.prospects.length, 25);
  assert.equal(result.diagnostics.stopReason, "target_reached");
  assert.ok(calls >= 2, "must continue searching after possible duplicates");
  // Summary reconciliation: saved = ready + usable needs attention
  assert.equal(
    result.diagnostics.readyForReview + result.diagnostics.usableNeedsAttention,
    result.diagnostics.netNewUsable,
  );
  assert.equal(result.diagnostics.quotaConsumed, result.diagnostics.netNewUsable);
}

{
  // uncertain_category still counts when otherwise usable
  process.env.GOOGLE_PLACES_API_KEY = "test-key-not-real";
  const fetchFn = async (url: string | URL) => {
    if (String(url).includes("geocode")) {
      return new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }), {
        status: 200,
      });
    }
    return new Response(
      JSON.stringify({
        places: [
          place("unc-1", "Sunshine Partners LLC", {
            types: ["establishment", "point_of_interest"],
            websiteUri: "https://sunshinepartners.example",
            nationalPhoneNumber: "3054441212",
          }),
        ],
      }),
      { status: 200 },
    );
  };
  const result = await runProspectAiDiscoveryOrchestrator({
    businessType: "real estate agents",
    location: "Miami",
    targetCount: 25,
    locationExpansion: "exact",
    quotaRemaining: 50,
    fetchFn: fetchFn as typeof fetch,
  });
  assert.equal(result.prospects.length, 1);
  assert.equal(result.prospects[0]?.disposition, "needs_attention");
  assert.equal(result.prospects[0]?.attentionReason, "uncertain_category");
  assert.equal(result.diagnostics.usableNeedsAttention, 1);
  assert.equal(result.diagnostics.quotaConsumed, 1);
  assert.equal(result.diagnostics.possibleDuplicates, 0);
}

{
  // Quota clamp uses remaining net-new slots
  assert.equal(clampDiscoveryTargetToQuota(50, 12), 12);
}

{
  // Diagnostics serialize/parse; never shown as error
  const diag = {
    runId: "s1",
    targetCount: 50,
    locationExpansion: "nearby" as const,
    expandedLocations: ["Miami"],
    queryVariationsAttempted: ["real estate agents in Miami"],
    pagesFetched: 3,
    providerCalls: 3,
    provider: "google_places",
    rawResults: 60,
    uniqueInRun: 40,
    duplicatesInRun: 10,
    alreadyInWorkspace: 5,
    rejectedInvalid: 1,
    rejectedClosed: 2,
    rejectedQuality: 1,
    rejectedRelevance: 1,
    needsAttention: 4,
    usableNeedsAttention: 4,
    possibleDuplicates: 5,
    readyForReview: 36,
    saved: 40,
    netNewUsable: 40,
    quotaConsumed: 40,
    stopReason: "target_reached" as const,
    resultsPerQuery: [],
    excludedSamples: [],
  };
  const raw = serializeDiscoveryDiagnostics(diag);
  const parsed = parseDiscoveryDiagnostics(raw);
  assert.equal(parsed?.netNewUsable, 40);
  assert.equal(parsed?.quotaConsumed, 40);
  assert.equal(parsed?.possibleDuplicates, 5);
  assert.equal(parsed?.usableNeedsAttention, 4);
  assert.equal(discoverySearchErrorForDisplay("completed", raw), null);
  assert.ok(discoverySearchErrorForDisplay("failed", "real boom"));
}

{
  // No campaign enrollment / contact creation in discover path
  const serviceSrc = readFileSync(
    join(import.meta.dirname, "..", "server/prospectAI/prospectAIService.ts"),
    "utf8",
  );
  const discoverSlice = serviceSrc.slice(
    serviceSrc.indexOf("export async function discoverProspects"),
    serviceSrc.indexOf("function buildContactNotes"),
  );
  assert.ok(!/createContact|campaignEnrollment|enroll/i.test(discoverSlice));
  assert.ok(discoverSlice.includes("acquireDiscoveryRunLock"));
  assert.ok(discoverSlice.includes("serializeDiscoveryDiagnostics"));
  assert.ok(discoverSlice.includes("loadDiscoveryWorkspaceIndex"));

  const ui = readFileSync(
    join(import.meta.dirname, "..", "client/src/pages/ProspectAI.tsx"),
    "utf8",
  );
  assert.ok(ui.includes("prospect-discover-groups"));
  assert.ok(ui.includes("prospect-ai-discover-cancel"));
  assert.ok(ui.includes("Ready for Review"));
  assert.ok(!ui.includes("Usable Needs Attention"));
  assert.ok(ui.includes("Possible Duplicates"));
  assert.ok(ui.includes("Already Exists"));
  assert.ok(ui.includes("Quota consumed"));
  assert.ok(ui.includes("Review notes after send") || ui.includes("Review note"));
}

console.log("prospect-ai-discovery-phase2.test.ts: all assertions passed");
