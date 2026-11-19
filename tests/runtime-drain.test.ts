import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { RuntimeDrain, createDrainHttpGate, trackHttpHandlers } from '../server/runtimeDrain';
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};};

test('drain fences new roots and scheduled claims while admitted human/AI/provider work settles',async()=>{
 const drain=new RuntimeDrain(),hold=deferred(),inside=deferred();let sent=0,stopped=0;
 drain.register('worker',()=>{stopped++;});
 const work=drain.run('ai',async()=>{inside.resolve();await hold.promise;await drain.run('provider',async()=>{sent++;});});
 await inside.promise;
 const completion=drain.begin();assert.equal(completion,drain.begin());
 let ready=false;void completion.then(()=>ready=true);
 await assert.rejects(drain.run('new-reply',async()=>{}),/draining/);
 await drain.scheduled('new-job',async()=>{throw Error('must not claim');});
 await new Promise(r=>setImmediate(r));assert.equal(ready,false);assert.equal(stopped,1);
 hold.resolve();await work;await completion;assert.equal(sent,1);assert.deepEqual(drain.snapshot(),{draining:true,active:{}});
});
test('a failed worker stop hook never reports a successful drain',async()=>{
 const drain=new RuntimeDrain();drain.register('broken',()=>{throw Error('stop failed');});
 await assert.rejects(drain.begin(),/do not cut over/);await assert.rejects(drain.begin());
});
test('HTTP work after provider ACK remains tracked and new requests get retryable 503',async()=>{
 const drain=new RuntimeDrain(),held=deferred(),entered=deferred(),app=express();app.use(createDrainHttpGate(drain));
 app.post('/hook',async(_req,res)=>{res.sendStatus(200);entered.resolve();await held.promise;});
 app.get('/health',(_req,res)=>res.sendStatus(200));
 trackHttpHandlers((app as any)._router.stack,false,drain);
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address() as any,url=`http://127.0.0.1:${address.port}`;
 try{
  assert.equal((await fetch(url+'/hook',{method:'POST'})).status,200);await entered.promise;
  let ready=false;const completion=drain.begin().then(()=>ready=true);
  const retry=await fetch(url+'/hook',{method:'POST'});assert.equal(retry.status,503);assert.equal(retry.headers.get('Retry-After'),'30');
  assert.equal((await fetch(url+'/health')).status,200);assert.equal(ready,false);
  held.resolve();await completion;assert.equal(ready,true);
 }finally{held.resolve();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});

test('real process SIGUSR2 waits for AI/provider work, rejects a second send, then SIGTERM exits',async()=>{
 const {fork}=await import('node:child_process'),{mkdtemp,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const directory=await mkdtemp(join(tmpdir(),'drain-process-'));
 const child=fork(new URL('./helpers/runtimeDrainProcess.ts',import.meta.url),[],{execArgv:['--import','tsx'],env:{...process.env,RUNTIME_DRAIN_STATUS_FILE:join(directory,'status.json')},stdio:['ignore','pipe','pipe','ipc']});
 const events:string[]=[];child.on('message',(m:any)=>events.push(m.event));child.stdout?.on('data',data=>{for(const line of String(data).trim().split('\n'))try{events.push(JSON.parse(line).event);}catch{}});
 const until=async(name:string)=>{const end=Date.now()+10000;while(!events.includes(name)){if(Date.now()>end)throw Error('process barrier timeout: '+name);await new Promise(r=>setTimeout(r,10));}};
 try{
  await until('started');child.kill('SIGUSR2');await until('drain_started');
  child.send('new-send');await until('blocked');assert.ok(!events.includes('drain_ready'));
  child.send('finish');await until('drain_ready');assert.ok(events.includes('provider-completed'));assert.ok(!events.includes('unexpected-send'));
  const status=JSON.parse(await readFile(join(directory,'status.json'),'utf8'));assert.equal(status.state,'ready');assert.deepEqual(status.active,{});
  child.kill('SIGTERM');const [code]=await once(child,'exit');assert.equal(code,0);
 }finally{if(child.exitCode===null)child.kill('SIGKILL');await rm(directory,{recursive:true,force:true});}
});
