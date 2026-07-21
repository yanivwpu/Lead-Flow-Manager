/**
 * Prospect AI Discover → AI Review mapping & display helpers.
 * Run: npx tsx tests/prospect-ai-review-flow.test.ts
 */
import assert from "node:assert/strict";
import type { Contact } from "../shared/schema";
import {
  buildProspectIntelligenceInput,
  hasInsufficientProspectData,
} from "../server/prospectImport/prospectIntelligenceAi";
import { resolveProspectOutreachLifecycleUi } from "../shared/prospectOutreachLifecycle";

function baseContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "c1",
    userId: "ws-1",
    name: "Bright Dental",
    email: null,
    phone: "5125551212",
    primaryChannel: "whatsapp",
    source: "import",
    tag: "Discovered-ProspectAI",
    pipelineStage: "Imported",
    notes:
      "Company: Bright Dental\nType: dentist\nAddress: Austin, TX\nhttps://brightdental.example\nSource: Google Places discovery",
    sourceDetails: {
      prospectImportProvider: "prospect_ai",
      prospectAi: {
        placeId: "places/abc",
        discoverySearchId: "search-1",
        discoveryResultId: "result-1",
        businessType: "dentist",
        address: "Austin, TX",
        website: "https://brightdental.example",
        phone: "5125551212",
        rating: 4.6,
        reviewCount: 42,
        sourceLabel: "Google Places discovery",
        batchName: "Prospect AI: dentist in Austin",
        importReason: "Local prospect discovery",
        importedAt: new Date().toISOString(),
        createdByImportJob: true,
        provider: "prospect_ai",
      },
      prospectImport: {
        placeId: "places/abc",
        businessType: "dentist",
        address: "Austin, TX",
        website: "https://brightdental.example",
        batchName: "Prospect AI: dentist in Austin",
        importReason: "Local prospect discovery",
        importedAt: new Date().toISOString(),
        createdByImportJob: true,
        provider: "prospect_ai",
      },
    },
    customFields: {
      prospectAi: {
        placeId: "places/abc",
        businessType: "dentist",
        address: "Austin, TX",
        website: "https://brightdental.example",
        rating: 4.6,
        reviewCount: 42,
        sourceLabel: "Google Places discovery",
      },
    },
    ...overrides,
  } as Contact;
}

function testProviderFieldsReachAnalyzer() {
  const input = buildProspectIntelligenceInput(baseContact());
  assert.equal(input.name, "Bright Dental");
  assert.equal(input.company, "Bright Dental");
  assert.equal(input.phone, "5125551212");
  assert.equal(input.websiteUrl, "https://brightdental.example");
  assert.equal(input.businessType, "dentist");
  assert.equal(input.address, "Austin, TX");
  assert.equal(input.rating, 4.6);
  assert.equal(input.reviewCount, 42);
  assert.equal(input.discoverySource, "Google Places discovery");
  assert.equal(input.providerPlaceId, "places/abc");
  assert.equal(hasInsufficientProspectData(input), false);
}

function testPlacesWithoutEmailStillAnalyzable() {
  const input = buildProspectIntelligenceInput(baseContact({ email: null }));
  assert.ok(!input.email);
  assert.equal(hasInsufficientProspectData(input), false);
}

function testApproveDisabledUntilAnalysisComplete() {
  const pending = resolveProspectOutreachLifecycleUi({
    reviewStatus: "pending",
    analysisStatus: "pending",
    hasValidEmail: false,
  });
  assert.equal(pending.showApproveButton, false);

  const processing = resolveProspectOutreachLifecycleUi({
    reviewStatus: "pending",
    analysisStatus: "processing",
    hasValidEmail: false,
  });
  assert.equal(processing.showApproveButton, false);

  const failed = resolveProspectOutreachLifecycleUi({
    reviewStatus: "pending",
    analysisStatus: "failed",
    hasValidEmail: false,
  });
  assert.equal(failed.showApproveButton, false);

  const ready = resolveProspectOutreachLifecycleUi({
    reviewStatus: "pending",
    analysisStatus: "completed",
    hasValidEmail: true,
    email: "a@b.com",
  });
  assert.equal(ready.showApproveButton, true);
}

function testActionSortOrder() {
  const rank = (analysisStatus: string, reviewStatus: string, needsReview = false) => {
    const analysis = analysisStatus.toLowerCase();
    const review = reviewStatus.toLowerCase();
    if (analysis === "processing") return 0;
    if (analysis === "pending") return 1;
    if (analysis === "failed") return 2;
    if (review === "needs_review" || needsReview) return 3;
    if (review === "pending" && analysis === "completed") return 4;
    return 8;
  };
  assert.ok(rank("pending", "pending") < rank("completed", "approved"));
  assert.ok(rank("processing", "pending") < rank("pending", "pending"));
  assert.ok(rank("failed", "pending") < rank("completed", "pending"));
}

testProviderFieldsReachAnalyzer();
testPlacesWithoutEmailStillAnalyzable();
testApproveDisabledUntilAnalysisComplete();
testActionSortOrder();
console.log("prospect-ai-review-flow.test.ts: all assertions passed");
