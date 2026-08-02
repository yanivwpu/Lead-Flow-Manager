/**
 * Workspace Intelligence Snapshot — Phase 1 (assemble + client snapshot + cache).
 * Run: npx tsx tests/workspace-intelligence.test.ts
 */
import assert from "node:assert/strict";
import {
  assembleWorkspaceIntelligence,
  buildKnowledgeBrief,
  derivePrimaryOfferings,
  hasAiBrainIntelligence,
  toWorkspaceIntelligenceSnapshot,
  workspaceIntelligenceFingerprint,
} from "../shared/workspaceIntelligence";
import { assembleProspectAiWorkspaceContext } from "../server/prospectImport/prospectAiWorkspaceContext";
import {
  clearWorkspaceIntelligenceCacheForTests,
  getCachedWorkspaceIntelligenceSnapshot,
  invalidateWorkspaceIntelligenceCache,
  setCachedWorkspaceIntelligenceSnapshot,
} from "../server/workspaceIntelligenceCache";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("Brain wins over Profile for offer context", () => {
  const intel = assembleWorkspaceIntelligence({
    knowledge: {
      businessName: "Canvas Real Estate",
      aboutText: "Florida real estate agent.",
      servicesProducts: "Local guide, magazine, business directory",
      websiteKnowledgeSummary: "Affordable Pompano helps visitors discover local businesses.",
      industry: "Travel & Tourism",
      faqs: [{ question: "How do I list?", answer: "Submit a listing request." }],
    },
  });
  assert.equal(intel.aiBrainIsPrimary, true);
  assert.equal(intel.primarySource, "ai_brain");
  assert.match(intel.executiveSummary || "", /Affordable Pompano|directory/i);
  assert.ok(intel.knowledgeBrief);
  assert.ok(intel.knowledgeBrief!.length <= 500);
  assert.ok(intel.primaryOfferings.length >= 1);
  assert.equal(intel.industry, "Travel & Tourism");
});

run("Profile fallback when Brain empty", () => {
  const intel = assembleWorkspaceIntelligence({
    knowledge: {
      businessName: "Northstar Clinic",
      aboutText: "We help clinics book more consultations.",
      displayName: "Northstar",
    },
  });
  assert.equal(intel.primarySource, "business_profile");
  assert.equal(intel.aiBrainIsPrimary, false);
  assert.equal(intel.faqs.length, 0);
  assert.match(intel.executiveSummary || "", /clinics|Northstar/i);
});

run("Generic when neither Brain nor Profile", () => {
  const intel = assembleWorkspaceIntelligence({ knowledge: null });
  assert.equal(intel.configured, false);
  assert.equal(intel.primarySource, "generic");
});

run("Settings + Growth Engines land on snapshot", () => {
  const intel = assembleWorkspaceIntelligence({
    knowledge: {
      businessName: "Acme",
      industry: "Real Estate",
      servicesProducts: "Buyer and seller representation",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    settings: {
      aiPersona: "friendly",
      aiMode: "suggest_only",
      leadQualificationEnabled: true,
      handoffKeywords: ["human"],
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    },
    growthEngines: { rgeInstalled: true, installedTemplateIds: ["realtor-growth-engine"] },
  });
  assert.equal(intel.persona, "friendly");
  assert.equal(intel.growthEngines.rgeInstalled, true);
  assert.equal(intel.capabilities.realtorGrowthEngineInstalled, true);

  const snap = toWorkspaceIntelligenceSnapshot(intel);
  assert.ok(snap.version);
  assert.ok(snap.cacheFingerprint);
  assert.equal(snap.bookingLinkConfigured, false);
  // Client snapshot must not expose full website dump field
  assert.equal("websiteKnowledgeSummary" in snap, false);
  assert.equal(snap.persona, "friendly");
  assert.deepEqual(snap.growthEngines.installedTemplateIds, ["realtor-growth-engine"]);
});

run("knowledgeBrief truncates long website summaries", () => {
  const long = "A".repeat(800);
  const brief = buildKnowledgeBrief({ websiteKnowledgeSummary: long, maxLen: 500 });
  assert.ok(brief);
  assert.ok(brief!.length <= 500);
  assert.ok(brief!.endsWith("…"));
});

run("derivePrimaryOfferings splits services text", () => {
  const offerings = derivePrimaryOfferings("Local guides\nBusiness directory\nMagazine ads");
  assert.ok(offerings.includes("Local guides"));
  assert.ok(offerings.includes("Business directory"));
});

run("Prospect assembler shares Brain > Profile hierarchy", () => {
  assert.equal(hasAiBrainIntelligence({ industry: "saas" }), true);
  const prospect = assembleProspectAiWorkspaceContext({
    businessName: "Canvas",
    aboutText: "Florida realtor",
    servicesProducts: "WhachatCRM inbox",
    websiteKnowledgeSummary: "Unified WhatsApp CRM",
  });
  assert.equal(prospect.aiBrainIsPrimary, true);
  assert.equal(prospect.fallbackUsed, "ai_brain");
  assert.match(prospect.executiveSummary || "", /Unified WhatsApp|WhachatCRM/i);
});

run("Cache hit by fingerprint; invalidate clears", () => {
  clearWorkspaceIntelligenceCacheForTests();
  const intel = assembleWorkspaceIntelligence({
    knowledge: {
      industry: "Travel & Tourism",
      servicesProducts: "Directory",
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    },
  });
  const fp = workspaceIntelligenceFingerprint(intel);
  const snap = toWorkspaceIntelligenceSnapshot(intel);
  setCachedWorkspaceIntelligenceSnapshot("user-a", fp, snap);
  assert.equal(getCachedWorkspaceIntelligenceSnapshot("user-a", fp)?.businessName, snap.businessName);
  assert.equal(getCachedWorkspaceIntelligenceSnapshot("user-a", "other-fp"), null);
  invalidateWorkspaceIntelligenceCache("user-a");
  assert.equal(getCachedWorkspaceIntelligenceSnapshot("user-a", fp), null);
});

run("Cross-workspace cache isolation", () => {
  clearWorkspaceIntelligenceCacheForTests();
  const a = toWorkspaceIntelligenceSnapshot(
    assembleWorkspaceIntelligence({
      knowledge: { businessName: "Workspace A", industry: "a", servicesProducts: "A" },
    }),
  );
  const b = toWorkspaceIntelligenceSnapshot(
    assembleWorkspaceIntelligence({
      knowledge: { businessName: "Workspace B", industry: "b", servicesProducts: "B" },
    }),
  );
  setCachedWorkspaceIntelligenceSnapshot("uid-a", a.cacheFingerprint, a);
  setCachedWorkspaceIntelligenceSnapshot("uid-b", b.cacheFingerprint, b);
  assert.equal(
    getCachedWorkspaceIntelligenceSnapshot("uid-a", a.cacheFingerprint)?.businessName,
    "Workspace A",
  );
  assert.equal(
    getCachedWorkspaceIntelligenceSnapshot("uid-b", b.cacheFingerprint)?.businessName,
    "Workspace B",
  );
  invalidateWorkspaceIntelligenceCache("uid-a");
  assert.equal(getCachedWorkspaceIntelligenceSnapshot("uid-a", a.cacheFingerprint), null);
  assert.equal(
    getCachedWorkspaceIntelligenceSnapshot("uid-b", b.cacheFingerprint)?.businessName,
    "Workspace B",
  );
});

console.log("\nworkspace-intelligence.test.ts: all assertions passed");
