/** STOP processing must be retryable independently of message persistence. */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
await mkdir("work", { recursive: true });
const scratch = await mkdtemp(join(process.cwd(), "work", "marketing-inbound-"));
const state = { fail: true, attempts: 0, reads: 0, identities: [] as any[] };
(globalThis as any).__inboundRetry = state;
try {
  const output = join(scratch, "inbound.mjs");
  await build({ entryPoints: ["server/emailChannel/persistInbound.ts"], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", plugins: [{ name: "fixtures", setup(b) {
    b.onLoad({ filter: /[/\\]drizzle[/\\]db\.ts$/ }, () => ({ contents: "export const db={};", loader: "ts" }));
    b.onLoad({ filter: /[/\\]server[/\\]storage\.ts$/ }, () => ({ contents: "export const storage={getMessageByUserExternalId:async()=>{globalThis.__inboundRetry.reads++;return {id:'already-persisted',conversationId:'conv',contactId:'contact'}}};", loader: "ts" }));
    b.onLoad({ filter: /prospectIntelligenceService\.ts$/ }, () => ({ contents: "export async function markProspectOutreachReplied(){}", loader: "ts" }));
    b.onLoad({ filter: /prospectEmailSuppressionService\.ts$/ }, () => ({ contents: "export async function applyProspectEmailSuppression(){};export async function suppressContactByEmailInWorkspace(){}", loader: "ts" }));
    b.onLoad({ filter: /[/\\]presence\.ts$/ }, () => ({ contents: "export function notifyUser(){}", loader: "ts" }));
    b.onLoad({ filter: /[/\\]mailboxStore\.ts$/ }, () => ({ contents: "export async function insertEmailMessageDetail(){}", loader: "ts" }));
    b.onLoad({ filter: /[/\\]contactMatch\.ts$/ }, () => ({ contents: "export async function resolveEmailContact(){throw new Error('dedup should return first')};export function shouldSuppressEmailContactCreation(){return null}", loader: "ts" }));
    b.onLoad({ filter: /[/\\]marketingCompliance[/\\]store\.ts$/ }, () => ({ contents: "export async function suppressMarketingIdentity(input){const s=globalThis.__inboundRetry;s.attempts++;if(s.fail){s.fail=false;throw new Error('transient ledger failure')}s.identities.push(input)}", loader: "ts" }));
  } }] });
  const { persistNormalizedEmailMessage } = await import(pathToFileURL(output).href);
  const params = { mailbox: { workspaceUserId: "workspace-a", emailAddress: "sender@example.com" }, normalized: { providerMessageId: "already-persisted", direction: "inbound", subject: "Re: hello", textBody: "Stop", from: { email: "person@example.com" }, to: [] } };
  await assert.rejects(persistNormalizedEmailMessage(params), /transient ledger failure/);
  assert.equal(state.reads, 0, "dedup must not prevent a retryable suppression write");
  const retry = await persistNormalizedEmailMessage(params);
  assert.equal(retry.created, false);
  assert.equal(retry.messageId, "already-persisted");
  assert.equal(state.attempts, 2);
  assert.equal(state.reads, 1);
  assert.equal(state.identities[0].workspace, "workspace-a");
  assert.equal(state.identities[0].scope, "all");
  await persistNormalizedEmailMessage({...params, normalized:{...params.normalized,from:{email:"forms@vendor.example"},replyTo:{email:"visitor@example.com"}}});
  assert.equal(state.identities.at(-1).email,"visitor@example.com","pre-dedup suppression must use authoritative Reply-To visitor identity");
  console.log("ok - persisted STOP is suppressed on replay after a transient ledger failure, before message deduplication");
} finally { delete (globalThis as any).__inboundRetry; await rm(scratch, { recursive: true, force: true }); }
