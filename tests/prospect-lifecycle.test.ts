/**
 * Prospect AI lifecycle — archive / restore / trash / discovery / campaign safety.
 * Run: npx tsx --test tests/prospect-lifecycle.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getProspectArchiveBlockReason,
  inferProspectArchiveReason,
  isProspectLifecycleHiddenFromActiveReview,
  isProspectLifecycleRestorable,
  parseProspectLifecycleStatus,
  resolveBulkArchiveReason,
  PROSPECT_ARCHIVE_REASONS,
} from "../shared/prospectLifecycle";
import { countsTowardDiscoveryTarget } from "../shared/prospectAiDiscoveryQuality";
import { matchesProspectReviewWorkFilter } from "../shared/prospectAiReviewState";

test("lifecycle parse + restorable / hidden helpers", () => {
  assert.equal(parseProspectLifecycleStatus(undefined), "active");
  assert.equal(parseProspectLifecycleStatus("archived"), "archived");
  assert.equal(isProspectLifecycleHiddenFromActiveReview("archived"), true);
  assert.equal(isProspectLifecycleHiddenFromActiveReview("active"), false);
  assert.equal(isProspectLifecycleRestorable("archived"), true);
  assert.equal(isProspectLifecycleRestorable("trashed"), true);
  assert.equal(isProspectLifecycleRestorable("deleted"), false);
  assert.ok(PROSPECT_ARCHIVE_REASONS.includes("not_qualified"));
});

test("campaign safety: ready ok, queued blocks, sending blocks, cancelQueue clears queued", () => {
  assert.equal(getProspectArchiveBlockReason(null), null);
  assert.equal(getProspectArchiveBlockReason("sent"), null);
  assert.equal(getProspectArchiveBlockReason("queued"), "campaign_queued");
  assert.equal(getProspectArchiveBlockReason("paused"), "campaign_queued");
  assert.equal(
    getProspectArchiveBlockReason("queued", { cancelQueue: true }),
    null,
  );
  assert.equal(getProspectArchiveBlockReason("sending"), "campaign_sending");
  assert.equal(
    getProspectArchiveBlockReason("sending", { cancelQueue: true }),
    "campaign_sending",
  );
});

test("bulk reason modes: infer / one_reason / no_reason", () => {
  assert.equal(
    resolveBulkArchiveReason({
      mode: "no_reason",
      inference: { notQualified: true },
    }),
    null,
  );
  assert.equal(
    resolveBulkArchiveReason({
      mode: "one_reason",
      oneReason: "wrong_industry",
      inference: {},
    }),
    "wrong_industry",
  );
  assert.equal(
    inferProspectArchiveReason({ notQualified: true }),
    "not_qualified",
  );
  assert.equal(
    inferProspectArchiveReason({
      notQualified: true,
      outsideTargetArea: true,
    }),
    "unspecified",
  );
  assert.equal(inferProspectArchiveReason({}), "unspecified");
});

test("Review filters: archived hidden from All Active; visible in Archived", () => {
  const archived = {
    analysisStatus: "completed",
    reviewStatus: "pending",
    lifecycleStatus: "archived",
  };
  const active = {
    analysisStatus: "completed",
    reviewStatus: "needs_review",
    needsReview: true,
    lifecycleStatus: "active",
  };
  assert.equal(matchesProspectReviewWorkFilter(archived as never, "all"), false);
  assert.equal(matchesProspectReviewWorkFilter(archived as never, "archived"), true);
  assert.equal(matchesProspectReviewWorkFilter(active as never, "all"), true);
  assert.equal(matchesProspectReviewWorkFilter(active as never, "archived"), false);
});

test("discovery already_archived does not consume quota", () => {
  assert.equal(
    countsTowardDiscoveryTarget({ disposition: "already_archived" }),
    false,
  );
  assert.equal(countsTowardDiscoveryTarget({ disposition: "already_exists" }), false);
  assert.equal(countsTowardDiscoveryTarget({ disposition: "ready" }), true);
});

test("migration 0077 + startup patch + API + UI wiring", () => {
  const sql = readFileSync(
    join(process.cwd(), "migrations/0077_prospect_intelligence_lifecycle.sql"),
    "utf8",
  );
  assert.ok(sql.includes("lifecycle_status"));
  assert.ok(sql.includes("archived_at"));
  assert.ok(sql.includes("trashed_at"));
  assert.ok(sql.includes("deleted_at"));

  const patches = readFileSync(
    join(process.cwd(), "server/startupSchemaPatches.ts"),
    "utf8",
  );
  assert.ok(patches.includes("0077_prospect_intelligence_lifecycle"));

  const routes = readFileSync(
    join(process.cwd(), "server/routes/prospectIntelligence.ts"),
    "utf8",
  );
  assert.ok(routes.includes("bulk-archive"));
  assert.ok(routes.includes("bulk-restore"));
  assert.ok(routes.includes("bulk-trash"));
  assert.ok(routes.includes("bulk-delete-permanent"));
  assert.ok(routes.includes("/archive"));
  assert.ok(routes.includes("/restore"));

  const service = readFileSync(
    join(process.cwd(), "server/prospectImport/prospectLifecycleService.ts"),
    "utf8",
  );
  assert.ok(service.includes("canManageWorkspaceOffers"));
  assert.ok(service.includes("campaign_sending"));
  assert.ok(!service.includes("delete from contacts") && !service.includes("deleteContact"));

  const orch = readFileSync(
    join(process.cwd(), "server/prospectAI/discoveryOrchestrator.ts"),
    "utf8",
  );
  assert.ok(orch.includes("already_archived"));
  assert.ok(orch.includes("alreadyArchived"));

  const panel = readFileSync(
    join(process.cwd(), "client/src/components/settings/ProspectIntelligencePanel.tsx"),
    "utf8",
  );
  assert.ok(panel.includes("pi-bulk-archive"));
  assert.ok(panel.includes("pi-bulk-restore"));
  assert.ok(panel.includes("ArchiveProspectsDialog"));

  const discover = readFileSync(
    join(process.cwd(), "client/src/pages/ProspectAI.tsx"),
    "utf8",
  );
  assert.ok(discover.includes("Already Archived"));
  assert.ok(discover.includes("prospect-discover-restore-archived"));
});
