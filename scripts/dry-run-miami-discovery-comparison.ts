/**
 * DRY-RUN only — no Google API calls, no DB writes, no production prospects.
 * Compares Phase 1 raw/placeId targeting vs Phase 2 net-new usable simulation.
 * Run: npx tsx scripts/dry-run-miami-discovery-comparison.ts
 */
import {
  PROSPECT_AI_PLACES_PAGE_SIZE,
  buildProspectAiDiscoveryPlan,
  clampDiscoveryTargetToQuota,
} from "../shared/prospectAiDiscoveryPlan";
import {
  countsTowardDiscoveryTarget,
  evaluateDiscoveryQuality,
  evaluateDiscoveryRelevance,
} from "../shared/prospectAiDiscoveryQuality";
import {
  buildIdentityKeys,
  classifyIdentityOverlap,
} from "../shared/prospectAiDiscoveryMatch";

type SimPlace = {
  id: string;
  name: string;
  website?: string;
  phone?: string;
  address?: string;
  businessStatus?: string;
  types?: string[];
};

/** Synthetic Miami real-estate-shaped fixture (not live Google data). */
function miamiFixture(): SimPlace[] {
  const rows: SimPlace[] = [];
  for (let i = 0; i < 40; i++) {
    rows.push({
      id: `miami-new-${i}`,
      name: `Miami Agent ${i}`,
      website: `https://miamiagent${i}.com`,
      phone: `305555${String(1000 + i).slice(-4)}`,
      address: `${100 + i} Brickell Ave, Miami, FL`,
      businessStatus: "OPERATIONAL",
      types: ["real_estate_agency"],
    });
  }
  // In-run duplicates (same place / same domain+phone)
  rows.push({
    id: `miami-new-3`,
    name: "Miami Agent 3 LLC",
    website: "https://miamiagent3.com",
    phone: "3055551003",
    address: "103 Brickell Ave, Miami, FL",
    types: ["real_estate_agency"],
  });
  rows.push({
    id: `miami-alt-3`,
    name: "Miami Agent 3",
    website: "https://miamiagent3.com",
    phone: "3055551003",
    address: "103 Brickell Avenue, Miami, FL",
    types: ["real_estate_agency"],
  });
  // Already in workspace (simulated)
  rows.push({
    id: `crm-known-1`,
    name: "Known CRM Realty",
    website: "https://knowncrm.com",
    phone: "3055559999",
    address: "1 Flagler St, Miami, FL",
    types: ["real_estate_agency"],
  });
  rows.push({
    id: `crm-known-2`,
    name: "Prior Discovery Co",
    website: "https://priordiscov.com",
    phone: "3055558888",
    address: "2 Flagler St, Miami, FL",
    types: ["real_estate_agency"],
  });
  // Closed / directory / mismatch
  rows.push({
    id: `closed-1`,
    name: "Closed Brokers",
    businessStatus: "CLOSED_PERMANENTLY",
    types: ["real_estate_agency"],
  });
  rows.push({
    id: `dir-1`,
    name: "Yelp Scoop",
    website: "https://www.yelp.com/biz/foo",
    types: ["real_estate_agency"],
  });
  rows.push({
    id: `title-1`,
    name: "Miami Title Pros",
    website: "https://miamititle.com",
    types: ["title_company"],
  });
  // Uncertain category
  rows.push({
    id: `unc-1`,
    name: "Sunshine Partners LLC",
    website: "https://sunshinepartners.example",
    phone: "3055557777",
    address: "9 Ocean Dr, Miami Beach, FL",
    types: ["establishment"],
  });
  // Distinct franchise branches (must not merge)
  rows.push({
    id: `branch-a`,
    name: "RE/MAX Prestige",
    phone: "3055556001",
    address: "10 Brickell Ave, Miami, FL",
    types: ["real_estate_agency"],
  });
  rows.push({
    id: `branch-b`,
    name: "RE/MAX Prestige",
    phone: "3055556002",
    address: "20 Miracle Mile, Coral Gables, FL",
    types: ["real_estate_agency"],
  });
  return rows;
}

function simulatePhase2(raw: SimPlace[], target: number, knownPlaceIds: Set<string>) {
  let duplicatesInRun = 0;
  let alreadyInWorkspace = 0;
  let rejectedClosed = 0;
  let rejectedQuality = 0;
  let rejectedRelevance = 0;
  let usableNeedsAttention = 0;
  let possibleDuplicates = 0;
  const usable: SimPlace[] = [];
  const keys: ReturnType<typeof buildIdentityKeys>[] = [];

  for (const row of raw) {
    const q = evaluateDiscoveryQuality({
      name: row.name,
      providerPlaceId: row.id,
      website: row.website,
      businessStatus: row.businessStatus || "OPERATIONAL",
      types: row.types,
      phone: row.phone,
      address: row.address,
    });
    if (q.disposition === "rejected") {
      if (q.reason === "permanently_closed") rejectedClosed += 1;
      else rejectedQuality += 1;
      continue;
    }
    const rel = evaluateDiscoveryRelevance({
      requestedBusinessType: "real estate agents",
      name: row.name,
      types: row.types,
    });
    if (rel.disposition === "rejected") {
      rejectedRelevance += 1;
      continue;
    }
    if (knownPlaceIds.has(row.id)) {
      alreadyInWorkspace += 1;
      continue;
    }
    const k = buildIdentityKeys({
      name: row.name,
      providerPlaceId: row.id,
      website: row.website,
      phone: row.phone,
      address: row.address,
    });
    let collapsed = false;
    let softDup = false;
    for (let i = 0; i < usable.length; i++) {
      const overlap = classifyIdentityOverlap(k, keys[i]!);
      if (overlap?.autoCollapse) {
        duplicatesInRun += 1;
        collapsed = true;
        break;
      }
      if (overlap && !overlap.autoCollapse) softDup = true;
    }
    if (collapsed) continue;
    if (softDup) {
      possibleDuplicates += 1;
      continue;
    }
    const disposition =
      q.disposition === "needs_attention" || rel.disposition === "needs_attention"
        ? "needs_attention"
        : "ready";
    const attentionReason = q.reason || rel.reason || null;
    if (!countsTowardDiscoveryTarget({ disposition, attentionReason })) {
      possibleDuplicates += 1;
      continue;
    }
    usable.push(row);
    keys.push(k);
    if (disposition === "needs_attention") usableNeedsAttention += 1;
    if (usable.length >= target) break;
  }

  return {
    raw: raw.length,
    duplicatesInRun,
    alreadyInWorkspace,
    rejectedClosed,
    rejectedQuality,
    rejectedRelevance,
    usableNeedsAttention,
    possibleDuplicates,
    netNewUsable: usable.length,
    readyForReview: usable.length - usableNeedsAttention,
    expectedQuotaConsumed: usable.length,
    stopReason: usable.length >= target ? "target_reached" : "source_exhausted",
  };
}

function main() {
  const businessType = "real estate agents";
  const location = "Miami";
  const target = 50;
  const quotaRemaining = 100;
  const plan = buildProspectAiDiscoveryPlan({
    businessType,
    location,
    targetCount: target,
    locationExpansion: "nearby",
  });
  const effectiveTarget = clampDiscoveryTargetToQuota(target, quotaRemaining);
  const fixture = miamiFixture();
  const known = new Set(["crm-known-1", "crm-known-2"]);

  const phase1 = {
    note: "Phase 1 counts placeId-unique operational rows toward target (no CRM/quality gates).",
    raw: fixture.length,
    placeIdUnique: new Set(fixture.map((r) => r.id)).size,
    targetResult: Math.min(effectiveTarget, new Set(fixture.map((r) => r.id)).size),
  };

  const phase2 = simulatePhase2(fixture, effectiveTarget, known);

  console.log(
    JSON.stringify(
      {
        note: "DRY-RUN simulation — no provider calls, no DB writes.",
        criteria: { businessType, location, target, locationExpansion: "nearby" },
        plan: {
          expandedLocations: plan.expandedLocations,
          queryVariations: plan.queries.length,
          pageSize: PROSPECT_AI_PLACES_PAGE_SIZE,
        },
        phase1Logic: phase1,
        phase2Simulation: phase2,
        postDeploymentTestPlan: [
          "1. target 50, nearby mode, selected radius — run Discover once",
          "2. Inspect search summary funnel (raw / dups / workspace / rejected / net-new)",
          "3. Verify Already Exists matches known CRM / prior Prospect AI rows",
          "4. Send net-new Ready (+ optional Needs Attention) to Review",
          "5. Qualify / enrich in Review",
          "6. Build a 20–30 prospect campaign",
          "7. Verify send order, pauses, retries, and completion",
        ],
      },
      null,
      2,
    ),
  );
}

main();
