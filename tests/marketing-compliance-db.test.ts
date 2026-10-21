/** Real PostgreSQL semantics in PGlite; no external database or provider calls.
 * Advisory locking is stubbed: concurrent real-worker acceptance is a release gate. */
import assert from "node:assert/strict";
import { readFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import { chats, dripEnrollments, contacts, prospectIntelligence, prospectOutreachQueueItems, flowJobs, noReplyJobs, automationTimerJobs, campaignEnrollments } from "../shared/schema";
const pg = new PGlite();
const db = drizzle(pg);
(globalThis as any).__marketingTest = { db };
await mkdir("work", { recursive: true });
const scratch = await mkdtemp(join(process.cwd(), "work", "marketing-db-"));
try {
  await pg.exec("CREATE TABLE users(id varchar PRIMARY KEY); CREATE TABLE prospect_outreach_settings(workspace_user_id varchar PRIMARY KEY,outreach_instructions jsonb); CREATE TABLE email_mailboxes(id varchar PRIMARY KEY,workspace_user_id varchar,messages_sent_today integer,messages_sent_hour integer,send_count_day_key text,send_count_hour_key text); CREATE FUNCTION pg_advisory_xact_lock(bigint) RETURNS int LANGUAGE SQL AS 'SELECT 1'; INSERT INTO users VALUES ('a'),('b');");
  for (const table of [chats, dripEnrollments, contacts, prospectIntelligence, prospectOutreachQueueItems, flowJobs, noReplyJobs, automationTimerJobs, campaignEnrollments]) {
    const config = getTableConfig(table);
    await pg.exec(`CREATE TABLE ${config.name} (${config.columns.map(c => `"${c.name}" ${c.getSQLType()}`).join(",")})`);
  }
  await pg.exec("INSERT INTO contacts(id,user_id,email,custom_fields) VALUES ('history','a','History@Example.com','{\"unsubscribed\":true}')");
  await pg.exec(await readFile("migrations/0113_marketing_compliance.sql", "utf8"));
  assert.equal((await pg.query("SELECT * FROM marketing_suppressions")).rows.length, 1, "historical flags backfilled");
  await pg.exec(`INSERT INTO contacts(id,user_id,email,phone,custom_fields) VALUES
    ('a1','a','Person@Example.com','+12025550123','{}'),('a2','a',' person@example.com ','12025550123','{}'),('b1','b','person@example.com','+12025550123','{}');
    INSERT INTO prospect_intelligence(contact_id,outreach_status) VALUES ('a1','not_sent');
    INSERT INTO prospect_outreach_queue_items(id,workspace_user_id,contact_id,recipient_identity_normalized,queue_status) VALUES ('q1','a','a1','person@example.com','queued'),('q2','a','a2','person@example.com','sending'),('qb','b','b1','person@example.com','queued');
    INSERT INTO flow_jobs(id,user_id,contact_id,status) VALUES ('f1','a','a1','pending');
    INSERT INTO no_reply_jobs(id,user_id,contact_id,status) VALUES ('n1','a','a2','running');
    INSERT INTO automation_timer_jobs(id,user_id,status,payload) VALUES ('t1','a','pending','{"contactId":"a1"}');
    INSERT INTO campaign_enrollments(id,user_id,contact_id,status) VALUES ('c1','a','a1','active');`);
  const output = join(scratch, "store.mjs");
  await build({ entryPoints: ["server/marketingCompliance/store.ts"], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", plugins: [{ name: "isolated-db", setup(b) {
    b.onLoad({ filter: /[/\\]drizzle[/\\]db\.ts$/ }, () => ({ contents: "export const db=globalThis.__marketingTest.db;", loader: "ts" }));
  } }] });
  const store = await import(pathToFileURL(output).href);
  await pg.exec("INSERT INTO chats(id,user_id,whatsapp_phone) VALUES ('legacy-a','a','12025550123'),('legacy-b','b','12025550123'); INSERT INTO drip_enrollments(id,chat_id,status) VALUES ('da','legacy-a','active'),('db','legacy-b','active')");
  const input = { workspace: "a", email: "PERSON@example.com", reason: "unsubscribe", source: "fixture", scope: "all" };
  await store.suppressMarketingIdentity(input);
  await store.suppressMarketingIdentity(input);
  assert(await store.isMarketingSuppressed("a", " person@example.com "));
  assert(!await store.isMarketingSuppressed("b", "person@example.com"));
  assert(await store.isContactDurablySuppressed({ userId: "a", phone: "+12025550123" }, "sms"));
  assert(await store.isContactDurablySuppressed({userId:"a",phone:"12025550123"}, "sms"));
  const get = async (table: string, id: string) => (await pg.query<any>(`SELECT * FROM ${table} WHERE id=$1`, [id])).rows[0];
  assert.equal((await get("drip_enrollments", "da")).status,"cancelled");
  assert.equal((await get("drip_enrollments", "db")).status,"active");
  assert.equal((await get("contacts", "a1")).custom_fields.doNotContact, true);
  assert.equal((await get("contacts", "a2")).custom_fields.unsubscribed, true);
  assert.deepEqual((await get("contacts", "b1")).custom_fields, {});
  assert.equal((await get("prospect_outreach_queue_items", "q1")).queue_status, "skipped");
  assert.equal((await get("prospect_outreach_queue_items", "q2")).queue_status, "skipped");
  assert.equal((await get("prospect_outreach_queue_items", "qb")).queue_status, "queued");
  for (const [table, id] of [["flow_jobs", "f1"], ["no_reply_jobs", "n1"], ["automation_timer_jobs", "t1"]]) assert.equal((await get(table, id)).status, "skipped");
  assert.equal((await get("campaign_enrollments", "c1")).status, "cancelled");
  const lifecycle = (await pg.query<any>("SELECT outreach_status,lifecycle_status FROM prospect_intelligence WHERE contact_id='a1'")).rows[0];
  assert.equal(lifecycle.outreach_status, "not_sent", "opt-out must preserve sent/reply audit instead of inventing a lifecycle state");
  assert.equal(lifecycle.lifecycle_status, "archived", "suppressed prospects leave active Review");
  await pg.exec("DELETE FROM contacts WHERE user_id='a'; INSERT INTO contacts(id,user_id,email) VALUES ('reimport','a','person@example.com')");
  assert(await store.isContactDurablySuppressed({ userId: "a", email: "person@example.com" }, "email"), "reimport cannot bypass ledger");
  const count = (await pg.query<any>("SELECT count(*)::int AS n FROM marketing_suppressions WHERE email_normalized='person@example.com'")).rows[0].n;
  assert.equal(count, 1, "idempotent ledger");
  // Exercise actual route handlers without opening network sockets.
  process.env.MARKETING_OPTOUT_SECRET = "isolated integration test secret at least 32 bytes";
  const { issueOptOutToken } = await import("../server/marketingCompliance/policy");
  const routeOutput = join(scratch, "routes.mjs");
  await build({ stdin: { contents: 'export * from "./server/marketingCompliance/routes"; export * from "./server/marketingCompliance/service"; export {registerChannelAdapters} from "./server/channelAdapters"; export {applyProspectEmailSuppression} from "./server/prospectImport/prospectEmailSuppressionService"; export {evaluateAutomationSendGuard} from "./server/automationSendGuard"; export {gmailEmailProvider} from "./server/emailChannel/gmailProvider"; export {sendUserWhatsAppMessage,sendUserWhatsAppMedia} from "./server/userTwilio"; export {sendMetaWhatsAppMessage,sendMetaWhatsAppMedia,sendMetaWhatsAppTemplate,sendMetaInteractiveMessage} from "./server/userMeta";', resolveDir: process.cwd(), loader: "ts" }, outfile: routeOutput, bundle: true, platform: "node", format: "esm", packages: "external", plugins: [{ name: "isolated-services", setup(b) {
    b.onLoad({ filter: /[/\\]drizzle[/\\]db\.ts$/ }, () => ({ contents: "export const db=globalThis.__marketingTest.db;", loader: "ts" }));
    b.onLoad({ filter: /[/\\]emailChannel[/\\]mailboxStore\.ts$/ }, () => ({ contents: "export async function getEmailMailboxById(id) { return {id,workspaceUserId:'a'}; } export async function listEmailMailboxes() { return []; }", loader: "ts" }));
    b.onLoad({ filter: /prospectImportAccess\.ts$/ }, () => ({ contents: "export function requireProspectImportAccess(req,res,next){next()}", loader: "ts" }));
    b.onLoad({ filter: /prospectWorkspaceScope\.ts$/ }, () => ({ contents: "export async function resolveProspectWorkspaceUserId(){return 'a'}", loader: "ts" }));
    b.onLoad({filter:/[/\\]channelService\.ts$/},()=>({contents:"export const channelService={registerAdapter:(channel,adapter)=>globalThis.__marketingTest.adapters.set(channel,adapter)}",loader:"ts"}));
    b.onResolve({filter:/^twilio$/}, () => ({path:"twilio",namespace:"fake"}));
    b.onLoad({filter:/.*/,namespace:"fake"}, () => ({contents:"export default function(){return {messages:{create:async()=>({sid:'fake',status:'sent'})}}}",loader:"ts"}));
    b.onLoad({ filter: /[/\\]server[/\\]storage\.ts$/ }, () => ({ contents: "const user={twilioAccountSid:'fake',twilioAuthToken:'fake',twilioConnected:true,twilioWhatsappNumber:'+12025550000',metaAccessToken:'fake',metaConnected:true,metaPhoneNumberId:'fake'}; export const storage={getContact:async()=>globalThis.__marketingTest.contact||null,updateContact:async(id,patch)=>({...globalThis.__marketingTest.contact,...patch}),getConversation:async()=>({id:'wa',userId:'a',channel:'whatsapp',status:'active',windowExpiresAt:new Date(Date.now()+3600000)}),getChannelSettings:async()=>['instagram','facebook','telegram'].map(channel=>({channel,config:{accessToken:'fake',pageId:'fake',botToken:'fake'}})),getUser:async()=>user,getUserForSession:async()=>user};", loader: "ts" }));
  } }] });
  const routes = await import(pathToFileURL(routeOutput).href);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Unexpected provider network call"); };
  try {
    for (const invoke of [() => routes.sendUserWhatsAppMessage("a","12025550123","test"), () => routes.sendUserWhatsAppMedia("a","12025550123","https://example.com/image"), () => routes.sendMetaWhatsAppMessage("a","12025550123","test"), () => routes.sendMetaWhatsAppMedia("a","12025550123","https://example.com/image","image"), () => routes.sendMetaWhatsAppTemplate("a","12025550123","test"), () => routes.sendMetaInteractiveMessage("a","12025550123","button",{})]) await assert.rejects(invoke(), /durable global do-not-contact/);
    assert.equal((await routes.sendUserWhatsAppMessage("b","12025550123","test")).sid,"fake");
    (globalThis as any).__marketingTest.adapters = new Map();
    (globalThis as any).__marketingTest.contact = {id:"a1",userId:"a",phone:"12025550123",email:"person@example.com",instagramId:"ig",facebookId:"fb",telegramId:"tg"};
    routes.registerChannelAdapters();
    for (const channel of ["sms","instagram","facebook","telegram"]) {
      const blocked = await (globalThis as any).__marketingTest.adapters.get(channel).send({contactId:"a1",conversationId:"wa",content:"test"});
      assert.equal(blocked.success,false,channel+" adapter must enforce durable DNC before provider dispatch");
      assert.match(blocked.error,/durable global do-not-contact/);
    }
    delete (globalThis as any).__marketingTest.contact;

  } finally { globalThis.fetch = originalFetch; }
  (globalThis as any).__marketingTest.contact = {id:"bounce-contact",userId:"a",email:"form@example.com",customFields:{}};
  await routes.applyProspectEmailSuppression({contactId:"bounce-contact",reason:"bounce",bouncedEmail:"actual-recipient@example.com"});
  assert(await store.isMarketingSuppressed("a","actual-recipient@example.com"));
  assert(!await store.isMarketingSuppressed("a","form@example.com"));
  await store.suppressMarketingIdentity({workspace:"a",email:"email-only@example.com",scope:"email",reason:"unsubscribe",source:"fixture"});
  (globalThis as any).__marketingTest.contact = {id:"email-only",userId:"a",email:"email-only@example.com",phone:"+12025550124",customFields:{emailUnsubscribed:true}};
  const scopedWorkflow = await routes.evaluateAutomationSendGuard({userId:"a",contactId:"email-only",conversationId:"wa",source:"workflow",idempotencyKey:"wa-after-email-opt-out"});
  assert.equal(scopedWorkflow.ok,true,"email-only opt-out must not block a WhatsApp conversation when channel is omitted");
  delete (globalThis as any).__marketingTest.contact;
  const registered = new Map<string, Function[]>();
  const app = Object.fromEntries(["get", "post", "put"].map(method => [method, (path: string, ...handlers: Function[]) => registered.set(method + path, handlers)]));
  routes.registerMarketingComplianceRoutes(app);
  (globalThis as any).__marketingTest.contact = {id:"empty",userId:"a"};
  let identityStatus = 200; let identityBody: any;
  const identityRes = {status(n:number){identityStatus=n;return this},json(v:any){identityBody=v;return this}};
  await registered.get("get/api/marketing/contacts/:contactId/suppression")!.at(-1)!({user:{id:"a"},params:{contactId:"empty"}},identityRes);
  assert.equal(identityBody.canSuppress, false);
  await registered.get("post/api/marketing/contacts/:contactId/dnc")!.at(-1)!({user:{id:"a"},params:{contactId:"empty"}},identityRes);
  assert.equal(identityStatus,400);
  delete (globalThis as any).__marketingTest.contact;
  const invoke = async (method: string, token: string, body: Record<string,string> = {}) => {
    let status = 200; let output: unknown;
    const res = { set() { return this; }, status(n: number) { status=n; return this; }, type() { return this; }, send(v: unknown) { output=v; return this; }, json(v: unknown) { output=v; return this; } };
    await registered.get(method + "/api/marketing/unsubscribe/:token")!.at(-1)!({ params: { token }, path: "/api/marketing/unsubscribe/" + token, body, query: { workspace: "b" }, user: { id: "b" } }, res);
    return { status, output };
  };
  const routeToken = issueOptOutToken({ workspace: "a", email: "fresh@example.com" });
  assert.equal((await invoke("get", routeToken)).status, 200);
  assert(!await store.isMarketingSuppressed("a", "fresh@example.com"), "GET scanner must not suppress");
  assert.equal((await invoke("post", routeToken)).status, 400);
  assert.equal((await invoke("post", "invalid", { "List-Unsubscribe": "One-Click" })).status, 400);
  for (let i=0;i<2;i++) assert.equal((await invoke("post", routeToken, { "List-Unsubscribe": "One-Click" })).status, 200);
  assert(await store.isMarketingSuppressed("a", "fresh@example.com"));
  assert(!await store.isMarketingSuppressed("b", "fresh@example.com"), "session/query tenant cannot retarget token");
  process.env.NODE_ENV="test"; process.env.APP_ENV="staging";
  process.env.MARKETING_SENDS_ENABLED="staging-only"; process.env.MARKETING_TEST_RECIPIENT="allowed@example.com";
  process.env.MARKETING_PUBLIC_ORIGIN="https://staging.example.com";
  let sent=0;
  const send = async (message: {text:string;html:string;unsubscribeUrl:string}) => { sent++; assert(message.text.includes("123 Test Road")); assert(message.html.includes("<footer>")); assert(message.unsubscribeUrl.startsWith("https://staging.example.com/api/marketing/unsubscribe/")); return {success:true}; };
  const marketing = { workspace:"a", mailbox:"m1", recipients:["allowed@example.com"], text:"Hello", html:"<p>Hello</p>" };
  await assert.rejects(routes.withCompliantMarketingEmail(marketing, send), /physical mailing address/);
  assert.equal(sent,0);
  await pg.exec("INSERT INTO email_mailboxes(id,workspace_user_id) VALUES ('m1','a'); INSERT INTO marketing_sender_profiles VALUES ('a','m1','Sender','123 Test Road',now(),'a')");
  await assert.rejects(routes.withCompliantMarketingEmail(marketing, message => routes.gmailEmailProvider.sendNewEmail({accessToken:"fake",from:"sender@example.com",payload:{mailboxId:"m1",to:["allowed@example.com"],subject:"Bad\nHeader"},textBody:message.text,htmlBody:message.html,onDispatch:message.onDispatch})), /Unsafe email header/);
  await routes.withCompliantMarketingEmail(marketing, send);
  assert.equal(sent,1);
  await store.suppressMarketingIdentity({workspace:"a", email:"allowed@example.com",reason:"unsubscribe",source:"test"});
  await assert.rejects(routes.withCompliantMarketingEmail(marketing, send), /suppressed/);
  assert.equal(sent,1,"last provider boundary blocks a queued recipient after opt-out");
  await pg.exec("INSERT INTO prospect_outreach_queue_items(id,workspace_user_id,sender_mailbox_id,recipient_identity_normalized,subject_snapshot,message_snapshot) VALUES ('preview','a','m1','allowed@example.com','Saved subject','Saved message')");
  await pg.exec(`UPDATE prospect_outreach_queue_items SET message_snapshot='Template https://example.com/reset?token=abc!',link_rendering_snapshot='{"campaignLinkUrl":"","preserveAuthoredUrls":true}' WHERE id='preview'; INSERT INTO prospect_outreach_settings VALUES ('a','{"mode":"ai_compose","linkUrl":"https://example.com/changed"}')`);
  let previewStatus=200; let previewBody:any;
  const previewRes={status(n:number){previewStatus=n;return this},json(v:any){previewBody=v;return this}};
  await registered.get("get/api/marketing/queue/:itemId/preview")!.at(-1)!({user:{id:"allowlisted-caller"},params:{itemId:"preview"}},previewRes);
  assert.equal(previewStatus,200,"preview must use the surrounding Prospect workspace resolver");
  assert.equal(previewBody.subject,"Saved subject");
  assert(previewBody.text.includes("123 Test Road"));
  assert(previewBody.html.includes('href="https://example.com/reset?token=abc!"'),"preview must retain the draft rendering snapshot after workspace mode/link changes");
  process.env.NODE_ENV="production";
  await assert.rejects(routes.withCompliantMarketingEmail(marketing, send), /disabled/);
  assert.equal(sent,1);
  console.log("ok - migration, historical backfill, tenant isolation, duplicate/reimport/phone suppression, atomic queue/job cancellation");
} finally { await pg.close(); await rm(scratch, { recursive: true, force: true }); }
