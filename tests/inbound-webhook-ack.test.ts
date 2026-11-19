import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { build } from 'esbuild';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

// Execute the actual registered callbacks with synthetic provider/database boundaries.
async function callback(file:string,path:string,stubs:string){
 const source=await readFile(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);let body='';
 function visit(n:ts.Node){if(ts.isCallExpression(n)&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])&&n.arguments[0].text===path){body=n.arguments[n.arguments.length-1].getText(ast);}ts.forEachChild(n,visit);}visit(ast);assert.ok(body);
 const dir=await mkdtemp(join(tmpdir(),'inbound-ack-')),output=join(dir,'handler.mjs');
 await build({stdin:{contents:`import { requireInboundPersistence } from './server/inboundAcknowledgment'; ${stubs};export const handler=${body};`,loader:'ts',resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',outfile:output,plugins:[{name:'synthetic-providers',setup(b){b.onResolve({filter:/^\.\.\/channelService$/},()=>({path:'service',namespace:'fixture'}));b.onResolve({filter:/^\.\.\/avatarService$/},()=>({path:'avatar',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='service'?`export const channelService={processIncomingMessage:async()=>{const s=globalThis.__ackScenario;if(s.throw)throw Error('temporary database failure');return s.result;}};`:`export const shouldRefreshAvatar=()=>false;export const fetchTelegramAvatar=async()=>{};`,loader:'js'}));}}]});
 const {handler}=await import(pathToFileURL(output).href);return{handler,cleanup:()=>rm(dir,{recursive:true,force:true})};
}
function response(){return{code:200,headersSent:false,status(n:number){this.code=n;return this;},json(_v:any){this.headersSent=true;return this;},send(_v:any){this.headersSent=true;return this;}};}
const complete={success:true,message:{id:'message'},contact:{id:'contact'},conversation:{id:'conversation'}};
test('Telegram and Twilio actual handlers retry processing errors and incomplete results, ACK persisted deliveries',async()=>{
 for(const [path,stubs,request]of [
  ['/api/webhook/telegram/:userId',`const resolveTelegramWebhookOwner=async()=>({userId:'owner'});const storage={getChannelSetting:async()=>({config:{botToken:'synthetic'}})};`,{params:{userId:'opaque'},headers:{},body:{message:{message_id:1,chat:{id:2},text:'Customer message'}}}],
  ['/api/webhook/inbox/twilio',`const parseIncomingWebhook=()=>({from:'+15550000001',to:'+15550000002',accountSid:'ACfixture',messageSid:'SMfixture',body:'Customer message',numMedia:0});const findUserByTwilioCredentials=async()=>({user:{id:'owner'},matchedPhone:'+15550000002'});`,{body:{From:'+15550000001'}}],
 ] as const){
  const loaded=await callback('server/routes/webhooks.ts',path,stubs);
  try{for(const scenario of [{throw:true},{result:{success:false}}, {result:complete}]){(globalThis as any).__ackScenario=scenario;const res=response();await loaded.handler(request,res);assert.equal(res.code,'result'in scenario&&scenario.result===complete?200:503);}}
  finally{await loaded.cleanup();}
 }
});
test('Gmail actual push handler waits for durable handoff before ACK and rejects unaccepted handoff',async()=>{
 const stubs=`const authenticateGmailPubSubRequest=async()=>({ok:true});const resolveGmailPubSubConfig=()=>({configured:true});const logGmailPushEvent=()=>{};const redactEmailForLog=()=>'';const normalizeEmailAddress=x=>x;const findActiveGmailMailboxByEmail=async()=>({id:'mailbox'});const decodePubSubData=()=>({emailAddress:'fixture@example.com',historyId:'10'});const triggerMailboxIncrementalSync=async()=>{const s=globalThis.__ackScenario;await s.wait;return{accepted:s.accepted}};`;
 const loaded=await callback('server/routes/gmailPubSubWebhook.ts','/api/webhooks/gmail/pubsub',stubs);
 try{
  let release!:()=>void;(globalThis as any).__ackScenario={accepted:true,wait:new Promise<void>(r=>release=r)};
  const req={headers:{},body:{message:{data:'fixture'}}},res=response();const pending=loaded.handler(req,res);
  await new Promise(r=>setImmediate(r));assert.equal(res.headersSent,false);release();await pending;assert.equal(res.code,204);
  (globalThis as any).__ackScenario={accepted:false};const rejected=response();await loaded.handler(req,rejected);assert.equal(rejected.code,503);
 }finally{await loaded.cleanup();}
});
