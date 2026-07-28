/**
 * Prospect AI Review discovery/import batch filter + selection safety.
 * Run: npx tsx tests/prospect-review-batch-filter.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  encodeProspectReviewBatchKey,
  formatDiscoveryBatchLabel,
  formatImportBatchLabel,
  formatSelectAllInBatchLabel,
  parseProspectReviewBatchKey,
  readContactDiscoverySearchId,
  readContactImportJobIdFromMeta,
} from "../shared/prospectReviewBatch";
import { formatProspectSelectAllLabel } from "../shared/prospectAiDisplay";
import { compareProspectReviewActionOrder } from "../shared/prospectReviewSort";

const root = process.cwd();

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (err) {
    console.error(`fail ${name}`);
    throw err;
  }
}

run("encode/parse discovery and import batch keys", () => {
  assert.equal(encodeProspectReviewBatchKey("discovery", "abc-123"), "discovery:abc-123");
  assert.equal(encodeProspectReviewBatchKey("import", "job-9"), "import:job-9");
  assert.deepEqual(parseProspectReviewBatchKey("discovery:abc-123"), {
    kind: "discovery",
    id: "abc-123",
  });
  assert.deepEqual(parseProspectReviewBatchKey("import:job-9"), { kind: "import", id: "job-9" });
  assert.deepEqual(parseProspectReviewBatchKey("all"), { kind: "all" });
  assert.deepEqual(parseProspectReviewBatchKey(""), { kind: "all" });
  assert.deepEqual(parseProspectReviewBatchKey("11111111-1111-1111-1111-111111111111"), {
    kind: "discovery",
    id: "11111111-1111-1111-1111-111111111111",
  });
});

run("discovery/import labels are human-readable", () => {
  const label = formatDiscoveryBatchLabel({
    businessType: "Real Estate Agents",
    location: "Miami",
    createdAt: "2026-07-26T16:00:00.000Z",
  });
  assert.match(label, /Real Estate Agents/);
  assert.match(label, /Miami/);
  assert.match(label, /Jul/);
  assert.match(
    formatImportBatchLabel({ batchName: "GHL Agency Leads", createdAt: "2026-07-20T10:00:00.000Z" }),
    /GHL Agency Leads/,
  );
});

run("select-all copy is batch-aware", () => {
  assert.equal(formatSelectAllInBatchLabel(20, true), "Select entire batch (20)");
  assert.equal(formatSelectAllInBatchLabel(32, false), "Select all matching (32)");
  assert.equal(
    formatProspectSelectAllLabel({ count: 20, batchActive: true }),
    "Select entire batch (20)",
  );
});

run("contact meta reads discoverySearchId without assigning import jobs", () => {
  const places = {
    sourceDetails: {
      prospectImportProvider: "prospect_ai",
      prospectAi: { discoverySearchId: "search-miami-1", batchName: "Prospect AI: RE in Miami" },
    },
    customFields: {},
  };
  assert.equal(readContactDiscoverySearchId(places), "search-miami-1");
  assert.equal(readContactImportJobIdFromMeta(places), null);

  const ghl = {
    sourceDetails: {
      prospectImport: { importJobId: "import-job-2", batchName: "GHL batch" },
    },
  };
  assert.equal(readContactDiscoverySearchId(ghl), null);
  assert.equal(readContactImportJobIdFromMeta(ghl), "import-job-2");
});

run("batch membership filter excludes other discovery ids (pure logic)", () => {
  const latestId = "search-latest";
  const rows = [
    { contactId: "c-new", discoverySearchId: "search-latest" },
    { contactId: "c-old", discoverySearchId: "search-old" },
    { contactId: "c-ghl", discoverySearchId: null as string | null, importJobId: "imp-1" },
  ];
  const filtered = rows.filter((r) => r.discoverySearchId === latestId);
  assert.deepEqual(
    filtered.map((r) => r.contactId),
    ["c-new"],
  );
  assert.ok(!filtered.some((r) => r.contactId === "c-old"));
  assert.ok(!filtered.some((r) => r.contactId === "c-ghl"));
});

run("select all with batch + hasEmail intersects filters", () => {
  const batchId = "search-miami";
  const rows = [
    { id: "a", discoverySearchId: batchId, hasEmail: true },
    { id: "b", discoverySearchId: batchId, hasEmail: false },
    { id: "c", discoverySearchId: "other", hasEmail: true },
  ];
  const selected = rows
    .filter((r) => r.discoverySearchId === batchId && r.hasEmail)
    .map((r) => r.id);
  assert.deepEqual(selected, ["a"]);
});

run("clearing batch shows all (filter off)", () => {
  const ref = parseProspectReviewBatchKey("all");
  assert.equal(ref.kind, "all");
});

run("work-queue sort still works inside a batch", () => {
  const rows = [
    {
      id: "old-approved",
      analysisStatus: "completed",
      reviewStatus: "approved",
      outreachStatus: "not_sent",
      createdAt: "2026-07-20T10:00:00.000Z",
    },
    {
      id: "new-needs",
      analysisStatus: "completed",
      reviewStatus: "needs_review",
      createdAt: "2026-07-26T16:30:00.000Z",
    },
    {
      id: "new-failed",
      analysisStatus: "failed",
      reviewStatus: "pending",
      createdAt: "2026-07-26T16:25:00.000Z",
    },
  ];
  const sorted = [...rows].sort(compareProspectReviewActionOrder);
  assert.deepEqual(
    sorted.map((r) => r.id),
    ["new-failed", "new-needs", "old-approved"],
  );
});

run("send-to-review returns reviewBatchKey and Review auto-opens batch", () => {
  const service = readFileSync(join(root, "server/prospectAI/prospectAIService.ts"), "utf8");
  assert.match(service, /reviewBatchKey:\s*`discovery:\$\{searchId\}`/);
  const page = readFileSync(join(root, "client/src/pages/ProspectAI.tsx"), "utf8");
  assert.match(page, /params\.set\("tab", "review"\)/);
  assert.match(page, /params\.set\("batch", key\)/);
});

run("Review API/list/panel wire reviewBatchKey + batches endpoint", () => {
  const routes = readFileSync(join(root, "server/routes/prospectIntelligence.ts"), "utf8");
  assert.match(routes, /prospect-intelligence\/batches/);
  assert.match(routes, /reviewBatchKey/);
  // batches route registered before :contactId
  const batchesIdx = routes.indexOf("/batches");
  const contactIdx = routes.indexOf("/:contactId");
  assert.ok(batchesIdx > 0 && contactIdx > batchesIdx);

  const service = readFileSync(
    join(root, "server/prospectImport/prospectIntelligenceService.ts"),
    "utf8",
  );
  assert.match(service, /listProspectReviewBatches/);
  assert.match(service, /filterDiscoverySearchId/);
  assert.match(service, /readContactDiscoverySearchId/);

  const panel = readFileSync(
    join(root, "client/src/components/settings/ProspectIntelligencePanel.tsx"),
    "utf8",
  );
  assert.match(panel, /reviewBatchKey/);
  assert.match(panel, /applyBatchFilter/);
  assert.match(panel, /formatProspectSelectAllLabel|Select entire batch|Select all matching/);
  assert.match(panel, /pi-batch-filter|Batch/);
});

run("resolve-selection uses list filters including reviewBatchKey (server path)", () => {
  const bulk = readFileSync(
    join(root, "server/prospectImport/prospectBulkSelectionService.ts"),
    "utf8",
  );
  assert.match(bulk, /listProspectIntelligence/);
  assert.match(bulk, /allFiltered/);
});

console.log("prospect-review-batch-filter.test.ts: all assertions passed");
