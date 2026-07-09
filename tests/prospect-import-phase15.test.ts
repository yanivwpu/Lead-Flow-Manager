/**
 * Prospect Import Phase 1.5 — focused unit + optional DB integration tests.
 * Run: npx tsx tests/prospect-import-phase15.test.ts
 */
import assert from "node:assert/strict";
import {
  assembleProspectPreviewResult,
  buildPreviewStats,
  markPreviewDuplicates,
  buildProspectDedupIndex,
} from "../server/prospectImport/prospectImportDedup";
import {
  evaluateContactUndoEligibility,
  getContactsCreatedByImportJob,
  resolveUndoJobStatus,
} from "../server/prospectImport/prospectImportUndo";
import {
  canAccessProspectImportTools,
  parseProspectImportAllowedEmails,
} from "../shared/prospectImportAccess";
import {
  PROSPECT_IMPORT_PRESET_TEMPLATES,
  PROSPECT_IMPORT_PROVIDER_LABELS,
} from "../shared/prospectImport";
import { prospectImportMeta, testContact } from "./helpers/prospectImportTestFixtures";
import { isDbTestWriteAllowed } from "./helpers/dbTestGuard";

const JOB_A = "job-aaaa-1111";
const JOB_B = "job-bbbb-2222";

function testPreviewStats() {
  const destinationContacts = [
    testContact({ id: "c-ghl", ghlId: "ghl-existing-1", email: "dup@email.com", phone: "+15551110001" }),
    testContact({ id: "c-email", email: "shared@email.com", phone: "+15552220002" }),
    testContact({ id: "c-phone", email: "unique@email.com", phone: "+15553330003" }),
  ];

  const rows = [
    {
      externalId: "ghl-existing-1",
      name: "Dup by GHL ID",
      email: "other@email.com",
      phone: "+15559990001",
      tags: ["Agency"],
    },
    {
      externalId: "ghl-new-1",
      name: "Dup by email",
      email: "shared@email.com",
      phone: "+15558880002",
      tags: ["Agency"],
    },
    {
      externalId: "ghl-new-2",
      name: "Dup by phone",
      email: "fresh@email.com",
      phone: "+15553330003",
      tags: ["Shopify"],
    },
    {
      externalId: "ghl-new-3",
      name: "Brand new",
      email: "brandnew@email.com",
      phone: "+15554440004",
      tags: ["Affiliate"],
    },
    {
      externalId: "ghl-new-4",
      name: "Missing email",
      phone: "+15555550005",
      tags: [],
    },
    {
      externalId: "ghl-new-5",
      name: "Missing phone",
      email: "nophone@email.com",
      tags: [],
    },
  ];

  const beforeJson = JSON.stringify(destinationContacts);
  const preview = assembleProspectPreviewResult({
    rows,
    destinationContacts,
    skippedByFilters: 12,
    totalFound: 500,
    truncated: true,
  });
  const afterJson = JSON.stringify(destinationContacts);

  assert.equal(beforeJson, afterJson, "preview must not mutate destination contacts");
  assert.equal(preview.stats.dryRun, true, "preview stats flagged as dry run");
  assert.equal(preview.stats.totalMatching, 6, "matching count");
  assert.equal(preview.stats.willImportNew, 3, "new contacts (brand new + missing email + missing phone)");
  assert.equal(preview.stats.alreadyExists, 3, "duplicate count");
  assert.equal(preview.stats.duplicatesByGhlId, 1, "dup by GHL ID");
  assert.equal(preview.stats.duplicatesByEmail, 1, "dup by email");
  assert.equal(preview.stats.duplicatesByPhone, 1, "dup by phone");
  assert.equal(preview.stats.missingEmail, 1, "missing email");
  assert.equal(preview.stats.missingPhone, 1, "missing phone");
  assert.equal(preview.stats.skippedByFilters, 12, "skipped by filters");
  assert.equal(preview.stats.estimatedFinalImport, 3, "estimated final import (skip mode)");

  const updateStats = buildPreviewStats(preview.contacts, {
    skippedByFilters: 12,
    updateMissingFieldsOnly: true,
  });
  assert.equal(updateStats.estimatedFinalImport, 6, "estimated final import (update missing mode)");

  const index = buildProspectDedupIndex(destinationContacts);
  const marked = markPreviewDuplicates(rows, index);
  assert.equal(marked.filter((c) => c.duplicateReason === "ghlContactId").length, 1);
  assert.equal(marked.filter((c) => c.duplicateReason === "email").length, 1);
  assert.equal(marked.filter((c) => c.duplicateReason === "phone").length, 1);

  console.log("  preview stats + dry-run purity: OK");
}

function testUndoSafety() {
  const preExisting = testContact({
    id: "pre-existing",
    email: "old@client.com",
    source: "manual",
    pipelineStage: "Lead",
  });

  const createdByJobA = testContact({
    id: "created-a",
    ...prospectImportMeta(JOB_A, { createdByImportJob: true, ghlContactId: "ghl-a" }),
    pipelineStage: "Imported",
  });

  const updatedDupOnly = testContact({
    id: "updated-dup",
    ...prospectImportMeta(JOB_A, { createdByImportJob: false, ghlContactId: "ghl-dup" }),
    pipelineStage: "Imported",
  });

  const otherJob = testContact({
    id: "other-job",
    ...prospectImportMeta(JOB_B, { createdByImportJob: true }),
    pipelineStage: "Imported",
  });

  const all = [preExisting, createdByJobA, updatedDupOnly, otherJob];
  const jobAContacts = getContactsCreatedByImportJob(all, JOB_A);
  assert.deepEqual(
    jobAContacts.map((c) => c.id),
    ["created-a"],
    "undo targets only contacts created by that import job",
  );
  assert.ok(
    !jobAContacts.some((c) => c.id === "pre-existing"),
    "undo must not include pre-existing contacts",
  );
  assert.ok(
    !jobAContacts.some((c) => c.id === "updated-dup"),
    "undo must not include duplicates updated without createdByImportJob",
  );

  assert.equal(
    evaluateContactUndoEligibility(createdByJobA, false).canDelete,
    true,
    "Imported contact without messages is deletable",
  );

  const withMessages = evaluateContactUndoEligibility(createdByJobA, true);
  assert.equal(withMessages.canDelete, false);
  assert.match(withMessages.reason ?? "", /messages/i);

  const customer = testContact({
    id: "customer",
    pipelineStage: "Customer",
    ...prospectImportMeta(JOB_A),
  });
  assert.equal(evaluateContactUndoEligibility(customer, false).canDelete, false);
  assert.match(evaluateContactUndoEligibility(customer, false).reason ?? "", /Customer/);

  const partner = testContact({
    id: "partner",
    pipelineStage: "Partner",
    ...prospectImportMeta(JOB_A),
  });
  assert.equal(evaluateContactUndoEligibility(partner, false).canDelete, false);

  const contacted = testContact({
    id: "contacted",
    pipelineStage: "Contacted",
    ...prospectImportMeta(JOB_A),
  });
  assert.equal(evaluateContactUndoEligibility(contacted, false).canDelete, false);
  assert.match(evaluateContactUndoEligibility(contacted, false).reason ?? "", /Contacted/);

  assert.equal(resolveUndoJobStatus(0), "undone");
  assert.equal(resolveUndoJobStatus(2), "partial");

  console.log("  undo safety rules: OK");
}

function testTemplatesAndPresets() {
  assert.ok(PROSPECT_IMPORT_PRESET_TEMPLATES.length >= 5, "built-in preset templates available");
  const names = PROSPECT_IMPORT_PRESET_TEMPLATES.map((t) => t.templateName);
  assert.ok(names.includes("Agency Prospects"), "Agency Prospects preset");
  assert.ok(names.includes("Affiliate Recruiting"), "Affiliate Recruiting preset");
  assert.ok(names.includes("Shopify Merchants"), "Shopify Merchants preset");
  assert.ok(names.includes("Digital Marketing"), "Digital Marketing preset");
  assert.ok(names.includes("Real Estate"), "Real Estate preset");

  for (const preset of PROSPECT_IMPORT_PRESET_TEMPLATES) {
    assert.equal(preset.provider, "gohighlevel");
    assert.ok(preset.filters && typeof preset.filters === "object");
    assert.ok(PROSPECT_IMPORT_PROVIDER_LABELS[preset.provider]);
  }

  console.log("  built-in templates: OK");
}

async function testTemplatesDbIntegration() {
  const { prepareDbTestEnvironment, teardownTestUser } = await import("./helpers/dbTestGuard.js");
  prepareDbTestEnvironment("prospect-import-templates");

  const { db } = await import("../drizzle/db");
  const { users } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  const {
    saveProspectImportTemplate,
    listProspectImportTemplates,
    deleteProspectImportTemplate,
  } = await import("../server/prospectImport/prospectImportTemplates");

  const [owner] = await db
    .insert(users)
    .values({
      email: `prospect-import-owner-${Date.now()}@test.local`,
      password: "test",
      name: "Import Owner",
    })
    .returning();
  const [other] = await db
    .insert(users)
    .values({
      email: `prospect-import-other-${Date.now()}@test.local`,
      password: "test",
      name: "Other User",
    })
    .returning();

  try {
    const saved = await saveProspectImportTemplate({
      userId: owner.id,
      templateName: "Agency Outreach July 2026",
      provider: "gohighlevel",
      filters: { tags: ["Agency"], importLimit: 250, search: "marketing" },
      defaultInternalTag: "Imported-Agency",
      defaultImportReason: "Agency recruitment",
      defaultImportLimit: 250,
    });

    assert.equal(saved.templateName, "Agency Outreach July 2026");
    assert.deepEqual(saved.filters.tags, ["Agency"]);
    assert.equal(saved.filters.importLimit, 250);
    assert.equal(saved.defaultInternalTag, "Imported-Agency");
    assert.equal(saved.defaultImportReason, "Agency recruitment");

    const listed = await listProspectImportTemplates(owner.id);
    assert.ok(listed.some((t) => t.id === saved.id), "saved template appears in list");

    const denied = await deleteProspectImportTemplate(other.id, saved.id);
    assert.equal(denied, false, "other user cannot delete owned template");

    const removed = await deleteProspectImportTemplate(owner.id, saved.id);
    assert.equal(removed, true, "owner can delete own template");

    const afterDelete = await listProspectImportTemplates(owner.id);
    assert.ok(!afterDelete.some((t) => t.id === saved.id), "template removed after delete");

    assert.ok(PROSPECT_IMPORT_PRESET_TEMPLATES.length >= 5, "built-in presets still available after DB ops");

    console.log("  template save/load/delete (DB): OK");
  } finally {
    await teardownTestUser(owner.id, "prospect-import-templates-owner");
    await teardownTestUser(other.id, "prospect-import-templates-other");
  }
}

async function testUndoDbIntegration() {
  const { prepareDbTestEnvironment, teardownTestUser } = await import("./helpers/dbTestGuard.js");
  prepareDbTestEnvironment("prospect-import-undo");

  const { db } = await import("../drizzle/db");
  const { users, contacts, prospectImportJobs, conversations, messages } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  const { storage } = await import("../server/storage");
  const { executeProspectImportUndo } = await import("../server/prospectImport/prospectImportUndo");

  const [destUser] = await db
    .insert(users)
    .values({
      email: `prospect-import-dest-${Date.now()}@test.local`,
      password: "test",
      name: "Dest User",
    })
    .returning();
  const [adminUser] = await db
    .insert(users)
    .values({
      email: `prospect-import-admin-${Date.now()}@test.local`,
      password: "test",
      name: "Admin User",
    })
    .returning();

  const jobId = `test-job-${Date.now()}`;

  try {
    await db.insert(prospectImportJobs).values({
      id: jobId,
      destinationUserId: destUser.id,
      initiatedByUserId: adminUser.id,
      provider: "gohighlevel",
      batchName: "Test Undo Batch",
      status: "completed",
      undoStatus: "none",
      filters: {},
      importOptions: { internalTag: "Imported-GHL", batchName: "Test Undo Batch" },
      resultImported: 2,
      progressTotal: 2,
      progressCurrent: 2,
      completedAt: new Date(),
    });

    const preExisting = await storage.createContact({
      userId: destUser.id,
      name: "Pre-existing Client",
      email: "preexisting@test.local",
      source: "manual",
      pipelineStage: "Lead",
    });

    const deletable = await storage.createContact({
      userId: destUser.id,
      name: "Imported Deletable",
      email: "deletable@test.local",
      source: "import",
      pipelineStage: "Imported",
      sourceDetails: {
        prospectImportProvider: "gohighlevel",
        prospectImport: {
          ghlContactId: "ghl-del",
          importJobId: jobId,
          createdByImportJob: true,
          importedAt: new Date().toISOString(),
        },
      },
    });

    const blockedStage = await storage.createContact({
      userId: destUser.id,
      name: "Imported Contacted",
      email: "contacted@test.local",
      source: "import",
      pipelineStage: "Contacted",
      sourceDetails: {
        prospectImportProvider: "gohighlevel",
        prospectImport: {
          ghlContactId: "ghl-stage",
          importJobId: jobId,
          createdByImportJob: true,
          importedAt: new Date().toISOString(),
        },
      },
    });

    const [conv] = await db
      .insert(conversations)
      .values({
        userId: destUser.id,
        contactId: blockedStage.id,
        channel: "whatsapp",
        status: "open",
      })
      .returning();

    const withMessages = await storage.createContact({
      userId: destUser.id,
      name: "Imported With Messages",
      email: "messages@test.local",
      source: "import",
      pipelineStage: "Imported",
      sourceDetails: {
        prospectImportProvider: "gohighlevel",
        prospectImport: {
          ghlContactId: "ghl-msg",
          importJobId: jobId,
          createdByImportJob: true,
          importedAt: new Date().toISOString(),
        },
      },
    });

    const [msgConv] = await db
      .insert(conversations)
      .values({
        userId: destUser.id,
        contactId: withMessages.id,
        channel: "whatsapp",
        status: "open",
      })
      .returning();

    await db.insert(messages).values({
      conversationId: msgConv.id,
      contactId: withMessages.id,
      userId: destUser.id,
      direction: "outbound",
      content: "Hello",
      status: "sent",
    });

    const result = await executeProspectImportUndo({
      jobId,
      undoneByUserId: adminUser.id,
    });

    assert.equal(result.deleted, 1, "only one deletable contact removed");
    assert.equal(result.blocked, 2, "contacted + messages contacts blocked");
    assert.equal(result.undoStatus, "partial");

    const jobRows = await db.select().from(prospectImportJobs).where(eq(prospectImportJobs.id, jobId)).limit(1);
    const job = jobRows[0];
    assert.equal(job.undoStatus, "partial");
    assert.ok(job.undoneAt, "undoneAt set");
    assert.equal(job.undoneByUserId, adminUser.id);

    assert.ok(await storage.getContact(preExisting.id), "pre-existing contact remains");
    assert.equal(await storage.getContact(deletable.id), undefined, "deletable import contact removed");
    assert.ok(await storage.getContact(blockedStage.id), "pipeline-blocked contact remains");
    assert.ok(await storage.getContact(withMessages.id), "message-blocked contact remains");

    await db.delete(messages).where(eq(messages.conversationId, conv.id));
    await db.delete(conversations).where(eq(conversations.id, conv.id));

    console.log("  undo execute + job status (DB): OK");
  } finally {
    await db.delete(prospectImportJobs).where(eq(prospectImportJobs.id, jobId));
    await teardownTestUser(destUser.id, "prospect-import-undo-dest");
    await teardownTestUser(adminUser.id, "prospect-import-undo-admin");
  }
}

function testAccessControl() {
  const prev = process.env.PROSPECT_IMPORT_ALLOWED_EMAILS;
  process.env.PROSPECT_IMPORT_ALLOWED_EMAILS = "allowed@test.local,admin@test.local";

  try {
    assert.equal(
      canAccessProspectImportTools({ id: "u1", email: "customer@example.com" }),
      false,
      "regular customer cannot access",
    );
    assert.equal(
      canAccessProspectImportTools({ id: "u2", email: "allowed@test.local" }),
      true,
      "allowlisted email can access",
    );
    assert.equal(
      canAccessProspectImportTools(
        { id: "u3", email: "anyone@example.com" },
        { isAdmin: true },
      ),
      true,
      "platform admin can access",
    );
    assert.equal(parseProspectImportAllowedEmails().includes("allowed@test.local"), true);
  } finally {
    if (prev === undefined) delete process.env.PROSPECT_IMPORT_ALLOWED_EMAILS;
    else process.env.PROSPECT_IMPORT_ALLOWED_EMAILS = prev;
  }

  console.log("  access control (shared helper): OK");
}

function simulateProspectImportRouteAccess(
  user: { id: string; email?: string | null } | null,
  session?: { isAdmin?: boolean },
  authenticated = true,
): number {
  if (!authenticated || !user) return 401;
  if (!canAccessProspectImportTools(user, session)) return 403;
  return 200;
}

async function testRouteAccessControl() {
  const prev = process.env.PROSPECT_IMPORT_ALLOWED_EMAILS;
  process.env.PROSPECT_IMPORT_ALLOWED_EMAILS = "allowed@test.local";

  try {
    assert.equal(
      simulateProspectImportRouteAccess({ id: "cust-1", email: "customer@example.com" }),
      403,
      "customer blocked from protected route",
    );
    assert.equal(
      simulateProspectImportRouteAccess({ id: "allow-1", email: "allowed@test.local" }),
      200,
      "allowlisted user passes route gate",
    );
    assert.equal(
      simulateProspectImportRouteAccess(
        { id: "admin-1", email: "nobody@example.com" },
        { isAdmin: true },
      ),
      200,
      "platform admin passes route gate",
    );
    assert.equal(simulateProspectImportRouteAccess(null), 401, "unauthenticated request blocked");
  } finally {
    if (prev === undefined) delete process.env.PROSPECT_IMPORT_ALLOWED_EMAILS;
    else process.env.PROSPECT_IMPORT_ALLOWED_EMAILS = prev;
  }

  console.log("  access control (route gate): OK");
}

async function main() {
  testPreviewStats();
  testUndoSafety();
  testTemplatesAndPresets();
  testAccessControl();
  await testRouteAccessControl();

  if (isDbTestWriteAllowed()) {
    await testTemplatesDbIntegration();
    await testUndoDbIntegration();
  } else {
    console.log("  DB integration: skipped (set TEST_DATABASE_URL or ALLOW_DB_TEST_WRITES=1)");
  }

  console.log("prospect-import-phase15.test.ts: OK");
}

await main();
