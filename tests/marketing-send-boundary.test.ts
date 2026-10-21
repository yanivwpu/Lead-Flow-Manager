/** Actual sendEmailViaMailbox with fixture storage/provider; never opens a socket. */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
await mkdir("work", { recursive: true });
const scratch = await mkdtemp(join(process.cwd(), "work", "marketing-send-"));
const state = { durableGlobal: false, calls: [] as any[], contact: { id: "c", userId: "w", email: "person@example.com", customFields: { suppressed: true, suppressionScope: "email", emailUnsubscribed: true } } };
(globalThis as any).__sendBoundary = state;
try {
  const output = join(scratch, "send.mjs");
  await build({ entryPoints: ["server/emailChannel/sendService.ts"], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", plugins: [{ name: "fixtures", setup(b) {
    b.onLoad({ filter: /[/\\]server[/\\]storage\.ts$/ }, () => ({ loader: "ts", contents: `export const storage={getContact:async()=>globalThis.__sendBoundary.contact,createConversation:async()=>({id:'conv'}),createMessage:async()=>({id:'msg'}),updateMessage:async()=>{},updateConversation:async()=>{},createActivityEvent:async()=>{}};` }));
    b.onLoad({ filter: /[/\\]presence\.ts$/ }, () => ({ loader: "ts", contents: "export function notifyUser(){}" }));
    b.onLoad({ filter: /[/\\]mailboxStore\.ts$/ }, () => ({ loader: "ts", contents: `export async function getEmailMailboxById(){return {id:'m',workspaceUserId:'w',emailAddress:'sender@example.com',provider:'gmail'}};export async function insertEmailMessageDetail(){};export async function updateEmailMailbox(){};export async function incrementEmailSendCounters(){};export async function getEmailMessageDetail(){return null};export async function updateEmailMessageBodies(){}` }));
    b.onLoad({ filter: /[/\\]oauth\.ts$/ }, () => ({ loader: "ts", contents: "export async function getValidMailboxAccessToken(){return {accessToken:'fixture'}}" }));
    b.onLoad({ filter: /[/\\]gmailProvider\.ts$/ }, () => ({ loader: "ts", contents: `export function getEmailProvider(){return {sendNewEmail:async p=>{globalThis.__sendBoundary.calls.push(p);return {success:true,providerMessageId:'fake'}},replyToThread:async()=>{throw new Error('unexpected reply')}}}` }));
    b.onLoad({ filter: /[/\\]persistInbound\.ts$/ }, () => ({ loader: "ts", contents: "export async function findEmailConversationByThread(){return null}" }));
    b.onLoad({ filter: /[/\\]marketingCompliance[/\\]service\.ts$/ }, () => ({ loader: "ts", contents: "export async function withCompliantMarketingEmail(){throw new Error('Marketing sending disabled') }" }));
    b.onLoad({ filter: /[/\\]marketingCompliance[/\\]store\.ts$/ }, () => ({ loader: "ts", contents: "export async function withGlobalDncEmailBoundary(w,r,send){return send()};export async function isContactDurablySuppressed(){return globalThis.__sendBoundary.durableGlobal};export async function suppressMarketingIdentity(){}" }));
  } }] });
  const { sendEmailViaMailbox } = await import(pathToFileURL(output).href);
  const params = { workspaceUserId: "w", sentByUserId: "w", contactId: "c", mailboxId: "m", content: "Your receipt", rich: { mailboxId: "m", subject: "Receipt", replyMode: "new", messagePurpose: "transactional", marketingUnsubscribeUrl: "https://attacker.example/" } };
  assert((await sendEmailViaMailbox(params)).success, "email-only marketing opt-out must preserve manual/transactional messages");
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].textBody, "Your receipt");
  assert.equal(state.calls[0].payload.marketingUnsubscribeUrl, undefined, "client cannot supply List-Unsubscribe");
  const commercial = await sendEmailViaMailbox({ ...params, rich: { ...params.rich, prospectOutreach: true } });
  assert.equal(commercial.success, false);
  assert.match(commercial.error, /disabled/);
  assert.equal(state.calls.length, 1, "transactional marker cannot bypass commercial Prospect AI boundary");
  state.durableGlobal = true;
  state.contact.customFields = {} as typeof state.contact.customFields;
  const reimported = await sendEmailViaMailbox(params);
  assert.equal(reimported.success, false);
  assert.match(reimported.error, /global do-not-contact/);
  assert.equal(state.calls.length, 1);
  console.log("ok - real send service: transactional/manual preserved, client header stripped, Prospect marketing cannot bypass hold");
} finally { delete (globalThis as any).__sendBoundary; await rm(scratch, { recursive: true, force: true }); }
