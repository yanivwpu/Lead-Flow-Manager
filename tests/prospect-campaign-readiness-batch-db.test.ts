/** Exercise the production batch loader against PostgreSQL (PGlite), with external
 * mailbox probes stubbed. No database, credentials, or network access is required. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import { contacts, prospectIntelligence, prospectAiOutcomes, prospectOutreachQueueItems } from "../shared/schema";
import { buildQueueDedupKey, PROSPECT_OUTREACH_DEFAULT_SETTINGS } from "../shared/prospectBulkOutreach";
import { PROSPECT_MESSAGE_CREATION_DEFAULTS } from "../shared/prospectMessageCreation";
import type { batchEvaluateProspectCampaignReadiness as EvaluateBatch } from "../server/prospectImport/prospectCampaignReadinessService";

const pg = new PGlite();
const sqlQueries: string[] = [];
const db = drizzle(pg, { logger: { logQuery(query) { sqlQueries.push(query); } } });
const schema = { contacts, prospectIntelligence, prospectAiOutcomes, prospectOutreachQueueItems };
const state = {
  db, schema, settings: { ...PROSPECT_OUTREACH_DEFAULT_SETTINGS },
  probes: 0,
};
(globalThis as any).__readinessTest = state;
await mkdir("work", { recursive: true });
const scratch = await mkdtemp(join(process.cwd(), "work", "campaign-readiness-test-"));
try {
  // Generate the needed tables from the actual Drizzle schema; omit unrelated foreign
  // keys so the fixture stays focused on reads, without a new application migration.
  for (const table of Object.values(schema)) {
    const config = getTableConfig(table);
    const columns = config.columns.map((column) => `"${column.name}" ${column.getSQLType()}`).join(", ");
    await pg.exec(`CREATE TABLE "${config.name}" (${columns})`);
  }
  const wid = "workspace-1";
  const ids = Array.from({ length: 6 }, (_, i) => `contact-${i}`);
  for (const id of [...ids, "another-workspace"]) {
    await db.insert(contacts).values({ id, userId: id === "another-workspace" ? "workspace-2" : wid, name: id, email: `${id}@example.com` });
    await db.insert(prospectIntelligence).values({ contactId: id, analysisStatus: "completed", reviewStatus: "approved", suggestedFirstMessage: "Hi there", lifecycleStatus: "active", outreachStatus: "not_sent" });
  }
  const queue = async (contactId: string, recipient: string, workspaceUserId = wid) => {
    await db.insert(prospectOutreachQueueItems).values({
      id: `queue-${contactId}`, batchId: "existing-batch", workspaceUserId, contactId, selectedChannel: "email",
      recipientIdentity: recipient, recipientIdentityNormalized: recipient.trim().toLowerCase(), messageSnapshot: "Hello", queueStatus: "queued",
      dedupKey: buildQueueDedupKey({ workspaceUserId, contactId, channel: "email", recipientIdentity: recipient }),
    });
  };
  await queue(ids[0], `${ids[0]}@example.com`);
  for (let i = 1; i < 5; i++) await queue(`outside-selected-set-${i}`, ` ${ids[i].toUpperCase()}@EXAMPLE.COM `);
  // Same recipient in another workspace must not block contact-5.
  await queue("other-workspace-entry", `${ids[5]}@example.com`, "workspace-2");

  const output = join(scratch, "batch.mjs");
  await build({ entryPoints: ["server/prospectImport/prospectCampaignReadinessService.ts"], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", plugins: [{
    name: "external-service-fixtures",
    setup(builder) {
      builder.onLoad({ filter: /[/\\]drizzle[/\\]db\.ts$/ }, () => ({ contents: "export const db = globalThis.__readinessTest.db;", loader: "ts" }));
      builder.onLoad({ filter: /[/\\]shared[/\\]schema\.ts$/ }, () => ({ contents: "export const { contacts, prospectIntelligence, prospectAiOutcomes, prospectOutreachQueueItems } = globalThis.__readinessTest.schema;", loader: "ts" }));
      builder.onLoad({ filter: /prospectOutreachQueueService\.ts$/ }, () => ({ contents: "export async function getOutreachSettings() { return globalThis.__readinessTest.settings; }", loader: "ts" }));
      builder.onLoad({ filter: /prospectOutreachEligibilityService\.ts$/ }, () => ({ contents: `
        export async function loadWorkspaceChannelConnections() {
          globalThis.__readinessTest.probes++;
          return { emailConnected: true, emailMailboxId: "mailbox", smsConnected: false, whatsappConnected: false, facebookConnected: false, instagramConnected: false };
        }
        export async function batchLoadPriorOutreachFlags(ids) { return new Map(ids.map(id => [id, { priorOutreachDetected: false }])); }
        export function contactSuppressionState() { return { suppressed: false, optedOut: false, detail: null, reason: null }; }
      `, loader: "ts" }));
      builder.onLoad({ filter: /prospectWebsiteUrl\.ts$/ }, () => ({ contents: "export function resolveProspectWebsiteUrl() { return null; }", loader: "ts" }));
    },
  }] });
  const { batchEvaluateProspectCampaignReadiness }: { batchEvaluateProspectCampaignReadiness: typeof EvaluateBatch } = await import(pathToFileURL(output).href);
  sqlQueries.length = 0;
  const evaluated = await batchEvaluateProspectCampaignReadiness({ workspaceUserId: wid, contactIds: ids });
  assert.equal(evaluated.preview.willQueue, 1);
  assert.equal(evaluated.readiness.get(ids[0])?.campaignReadyBlockCode, "duplicate_queued");
  for (let i = 1; i < 5; i++) assert.equal(evaluated.readiness.get(ids[i])?.campaignReadyBlockCode, "duplicate_recipient");
  assert.equal(evaluated.readiness.get(ids[5])?.campaignReady, true);
  assert.equal(sqlQueries.length, 4, "contacts, PI, outcomes, queue are loaded in four batch queries");
  assert.equal(state.probes, 1, "one workspace sender probe per batch");
  assert.equal((await batchEvaluateProspectCampaignReadiness({ workspaceUserId: wid, contactIds: ["another-workspace"] })).preview.willQueue, 0);

  const readyIds = [...evaluated.readiness].filter(([, result]) => result.campaignReady).map(([id]) => id);
  const finalPreview = await batchEvaluateProspectCampaignReadiness({ workspaceUserId: wid, contactIds: readyIds });
  assert.equal(finalPreview.preview.selectedCount, 1);
  assert.equal(finalPreview.preview.willQueue, 1);
  assert.equal(finalPreview.preview.skips.length, 0);

  // Reuse list-loaded data; only outcomes + queue reads remain, irrespective of size.
  const contactRows = await db.select().from(contacts);
  const piRows = await db.select().from(prospectIntelligence);
  const context = { contacts: new Map(contactRows.map((c) => [c.id, c])), intelligence: new Map(piRows.map((p) => [p.contactId, p])), priorOutreach: new Map() };
  sqlQueries.length = 0;
  const fromList = await batchEvaluateProspectCampaignReadiness({ workspaceUserId: wid, contactIds: ids, context });
  assert.deepEqual(fromList.preview, evaluated.preview);
  assert.equal(sqlQueries.length, 2);
  const readCount = sqlQueries.length;
  await batchEvaluateProspectCampaignReadiness({ workspaceUserId: wid, contactIds: [], context });
  assert.equal(sqlQueries.length, readCount, "empty lists cause no DB reads");

  // Both template modes admit a qualified contact without saved outreach content.
  await pg.exec(`UPDATE prospect_intelligence SET suggested_first_message = NULL WHERE contact_id = 'contact-5'`);
  for (const mode of ["use_my_template", "ai_assisted_template"] as const) {
    state.settings = { ...state.settings, outreachInstructions: { ...PROSPECT_MESSAGE_CREATION_DEFAULTS, mode, templateBody: "Hello {{business_name}}" } };
    assert.equal((await batchEvaluateProspectCampaignReadiness({ workspaceUserId: wid, contactIds: [ids[5]] })).preview.willQueue, 1, mode);
  }
  // The current maximum Review list uses the same four reads, not 1,000 per-row reads.
  await pg.exec(`
    INSERT INTO contacts (id, user_id, name, email)
      SELECT 'bulk-' || i, 'workspace-1', 'Business ' || i, 'bulk-' || i || '@example.com' FROM generate_series(1, 1000) i;
    INSERT INTO prospect_intelligence (contact_id, analysis_status, review_status, suggested_first_message, lifecycle_status, outreach_status)
      SELECT 'bulk-' || i, 'completed', 'approved', 'Hello', 'active', 'not_sent' FROM generate_series(1, 1000) i;
  `);
  state.settings = { ...PROSPECT_OUTREACH_DEFAULT_SETTINGS };
  sqlQueries.length = 0;
  const probesBefore = state.probes;
  const maximumList = await batchEvaluateProspectCampaignReadiness({ workspaceUserId: wid, contactIds: Array.from({ length: 1000 }, (_, i) => `bulk-${i + 1}`) });
  assert.equal(maximumList.preview.willQueue, 1000);
  assert.equal(maximumList.preview.skips.length, 0);
  assert.equal(sqlQueries.length, 4);
  assert.equal(state.probes, probesBefore + 1);
  console.log("prospect-campaign-readiness-batch-db: PostgreSQL 1/6 parity, workspace scope, normalized external recipients, list reuse, four reads for 1,000 rows, template modes passed");
} finally {
  delete (globalThis as any).__readinessTest;
  await pg.close();
  await rm(scratch, { recursive: true, force: true });
}
