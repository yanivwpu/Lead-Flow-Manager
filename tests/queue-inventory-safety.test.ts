import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../scripts/probes/queue-inventory.cjs',import.meta.url),'utf8');
const safeEnv={RAILWAY_PROJECT_ID:'2adeea49-431c-4ddf-8815-9ce89af66f32',RAILWAY_ENVIRONMENT_ID:'fa2e8c30-72ea-4688-877f-4a68e24198bc',RAILWAY_SERVICE_ID:'a7b75139-5bf8-4a02-b4ab-b7d12e17e770',RAILWAY_DEPLOYMENT_ID:'fixture-deployment',RAILWAY_GIT_COMMIT_SHA:'6f3212fd4340803cb15ca6412a145349f82acc6d',REDIS_URL:'rediss://fixture:never-print-this@redis.example:6380'};
async function probe(env:Record<string,string>){
 let commands:any[]=[];let connections=0;let done!:(v:any)=>void;const result=new Promise<any>(r=>done=r);
 class Redis{
  constructor(){connections++;}on(){}async connect(){}disconnect(){}
  multi(list:any[]){commands.push(...list);assert.ok(list.every(c=>['exists','llen','zcard','hget'].includes(c[0])));return{exec:async()=>list.map(c=>[null,c[0]==='hget'?null:c[0]==='exists'?1:0])};}
 }
 vm.runInNewContext(source,{require:(name:string)=>{assert.equal(name,'node:module');return{createRequire:()=>((name:string)=>{assert.equal(name,'ioredis');return Redis;})};},process:{env,cwd:()=>'/app',exitCode:0},setTimeout:(f:()=>void)=>{f();},Promise,Date,Error,URL,console:{log:(s:string)=>done(JSON.parse(s))}});
 return{value:await result,commands,connections};
}
test('queue inventory uses only atomic read commands, exposes no credential, and changes no queues',async()=>{
 const r=await probe(safeEnv);assert.equal(r.value.result,'READ_COMPLETE');assert.equal(r.value.samples.length,2);assert.equal(r.commands.length,18);assert.equal(r.connections,1);assert.ok(!JSON.stringify(r.value).includes('never-print-this'));
});
test('wrong service or unexpected production commit fails before Redis connects',async()=>{
 for(const env of [{...safeEnv,RAILWAY_SERVICE_ID:'other'},{...safeEnv,RAILWAY_GIT_COMMIT_SHA:'changed'}]){
  const r=await probe(env);assert.equal(r.value.result,'FAIL');assert.equal(r.connections,0);assert.equal(r.commands.length,0);
 }
});
test('Windows launcher keeps official release checksums and strict runtime/result guards',async()=>{
 const ps=await readFile(new URL('../scripts/probes/windows/Run-Probe.ps1',import.meta.url),'utf8');
 for(const hash of ['1f468573a544587a2c22e6262abc393dafaaf8627ae9f45a5ef2e7d96423c8b6','e733d050060ac069f1e37b6ae55bf1565878ee82241c5934820d90ffe47544e6','5458648ebd0cfe47f2da81eb3461d46e150d3f5ffbfa9179bb6d03869ace970e'])assert.ok(ps.includes(hash));
 assert.ok(ps.includes("@('' | & $Railway @Arguments 2>&1)"));assert.ok(ps.includes("$Parsed.check -eq 'queue_inventory'"));
 const payload=ps.match(/\$Payload = '([A-Za-z0-9+/=]+)'/)![1];assert.equal(Buffer.from(payload,'base64').toString(),source);
});
