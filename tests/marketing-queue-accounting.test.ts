/** Execute the production failure transition against PostgreSQL semantics. */
import assert from "node:assert/strict";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { build } from "esbuild";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const pg = new PGlite();
(globalThis as any).__queueAccounting = drizzle(pg);
await mkdir("work", { recursive: true });
const scratch = await mkdtemp(join(process.cwd(), "work", "marketing-accounting-"));
try {
  await pg.exec("CREATE TABLE prospect_outreach_batches(id varchar,failed_count integer); CREATE TABLE prospect_outreach_queue_items(id varchar,queue_status text,last_error text,started_at timestamp,updated_at timestamp); INSERT INTO prospect_outreach_batches VALUES ('batch',0); INSERT INTO prospect_outreach_queue_items(id,queue_status) VALUES ('opted-out','skipped'),('claimed','sending');");
  const source = await readFile("server/prospectImport/prospectOutreachQueueService.ts", "utf8");
  const ast = ts.createSourceFile("queue.ts", source, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "markItemFailed");
  assert(declaration, "production failure handler must exist");
  const output = join(scratch, "failure.mjs");
  await build({ stdin: { contents: `import {sql,eq,and} from 'drizzle-orm'; import {prospectOutreachQueueItems,prospectOutreachBatches} from './shared/schema'; import {shouldGloballyPauseProspectCampaign,isProspectScopedOutreachFailure} from './shared/prospectOutreachFailureScope'; const db=globalThis.__queueAccounting; const pauseQueue=async()=>{throw new Error('unexpected pause')}; const releaseClaimedItemAfterInfraPause=pauseQueue; ${declaration.getText(ast)}; export {markItemFailed};`, resolveDir: process.cwd(), loader: "ts" }, outfile: output, bundle: true, platform: "node", format: "esm", packages: "external" });
  const { markItemFailed } = await import(pathToFileURL(output).href);
  const count = async () => (await pg.query<any>("SELECT failed_count FROM prospect_outreach_batches WHERE id='batch'")).rows[0].failed_count;
  await markItemFailed({ id: "opted-out", batchId: "batch", workspaceUserId: "workspace" }, "provider failure", false);
  assert.equal(await count(), 0, "a suppression that won the transition must not increment failed counts");
  await markItemFailed({ id: "claimed", batchId: "batch", workspaceUserId: "workspace" }, "provider failure", false);
  assert.equal(await count(), 1);
  await markItemFailed({ id: "claimed", batchId: "batch", workspaceUserId: "workspace" }, "late duplicate completion", false);
  assert.equal(await count(), 1, "a repeated worker completion must not double count");
  // Execute the actual Retry handler: ambiguous delivery must not requeue.
  const retry = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "retryFailedQueueItem")!;
  const retryOutput = join(scratch,"retry.mjs");
  const retryAst = ts.createSourceFile("retry.ts",retry.getText(ast),ts.ScriptTarget.Latest,true);
  const retryFunction = retryAst.statements[0] as ts.FunctionDeclaration;
  const statements = retryFunction.body!.statements;
  // Keep production early guards through reconciliation; replace only the DB read.
  const guardEnd = statements.findIndex(node=>node.getText(retryAst).includes("storage.getContact"));
  const guards = statements.slice(1,guardEnd).map(node=>node.getText(retryAst)).join("\n");
  await build({stdin:{contents:`export async function retryFailedQueueItem(fixture){const rows=[fixture];${guards};throw new Error('retry reached provider preparation')}`,resolveDir:process.cwd(),loader:"ts"},outfile:retryOutput,platform:"node",format:"esm"});
  const retryModule = await import(pathToFileURL(retryOutput).href);
  assert.deepEqual(await retryModule.retryFailedQueueItem({queueStatus:"failed",attempts:1,maxAttempts:3,lastError:"ambiguous_provider_delivery: timeout"}),{retried:false,reason:"delivery_reconciliation_required"});
  console.log("ok - production queue failure accounting respects opt-out races and duplicate completion");
} finally { delete (globalThis as any).__queueAccounting; await pg.close(); await rm(scratch, { recursive: true, force: true }); }
