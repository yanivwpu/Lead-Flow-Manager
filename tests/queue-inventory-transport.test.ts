import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const script=resolve('scripts/probes/queue-inventory.cjs');
const identity={RAILWAY_PROJECT_ID:'2adeea49-431c-4ddf-8815-9ce89af66f32',RAILWAY_ENVIRONMENT_ID:'fa2e8c30-72ea-4688-877f-4a68e24198bc',RAILWAY_SERVICE_ID:'a7b75139-5bf8-4a02-b4ab-b7d12e17e770',RAILWAY_DEPLOYMENT_ID:'local-fixture-deployment',RAILWAY_GIT_COMMIT_SHA:'6f3212fd4340803cb15ca6412a145349f82acc6d'};
const password='fixture-password-must-not-appear';
async function runProbe(url:string,cwd=process.cwd()){
 const child=spawn(process.execPath,[script],{cwd,env:{...process.env,...identity,REDIS_URL:url,DEBUG:'',NODE_DEBUG:'',NODE_PATH:''},stdio:['ignore','pipe','pipe']});
 let output='',stderr='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>stderr+=data);
 const guard=setTimeout(()=>child.kill('SIGKILL'),50000);
 try{
  const [code]=await once(child,'exit');
  assert.ok(!output.includes(password));assert.equal(stderr,'');
  const lines=output.trim().split('\n');assert.equal(lines.length,1,'one safe JSON result');
  return{code,result:JSON.parse(lines[0])};
 }finally{clearTimeout(guard);}
}
// A loopback RESP fixture, not a Redis database. It has no data-writing implementation.
function frame(buffer:Buffer):{args:string[];used:number}|undefined{
 if(buffer[0]!==42)return;
 let end=buffer.indexOf('\r\n');if(end<0)return;
 const count=Number(buffer.subarray(1,end).toString()),args:string[]=[];let at=end+2;
 for(let i=0;i<count;i++){
  end=buffer.indexOf('\r\n',at);if(end<0||buffer[at]!==36)return;
  const length=Number(buffer.subarray(at+1,end).toString()),start=end+2;
  if(buffer.length<start+length+2)return;
  args.push(buffer.subarray(start,start+length).toString());at=start+length+2;
 }
 return{args,used:at};
}
function reply(value:any):string{
 if(value instanceof Error)return '-'+value.message+'\r\n';
 if(value===null)return '$-1\r\n';
 if(typeof value==='number')return ':'+value+'\r\n';
 if(Array.isArray(value))return '*'+value.length+'\r\n'+value.map(reply).join('');
 return '$'+Buffer.byteLength(value)+'\r\n'+value+'\r\n';
}
async function fixture(mode:'success'|'auth'|'wrongtype'|'unsupported'|'timeout'='success'){
 const commands:string[]=[];const sockets=new Set<net.Socket>();
 const server=net.createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
  let buffered=Buffer.alloc(0),queued:any[]|null=null;
  socket.on('data',chunk=>{
   buffered=Buffer.concat([buffered,chunk]);let parsed;
   while(parsed=frame(buffered)){
    buffered=buffered.subarray(parsed.used);const [raw,...args]=parsed.args,name=raw.toUpperCase();commands.push(name);
    assert.ok(['AUTH','CLIENT','SELECT','MULTI','EXISTS','LLEN','ZCARD','HGET','EXEC','QUIT'].includes(name),'unexpected Redis command');
    if(name==='AUTH'){socket.write(mode==='auth'?'-WRONGPASS '+password+'\r\n':'+OK\r\n');continue;}
    if(['CLIENT','SELECT'].includes(name)){socket.write('+OK\r\n');continue;}
    if(name==='MULTI'){if(mode==='unsupported'){socket.write('-ERR unknown command MULTI '+password+'\r\n');}else{queued=[];socket.write('+OK\r\n');}continue;}
    if(name==='EXEC'){
     if(mode==='timeout')continue;
     if(mode==='unsupported'){socket.write('-EXECABORT Transaction discarded\r\n');continue;}
     socket.write(reply(queued||[]));queued=null;continue;
    }
    const field=args[0]?.split(':').at(-1);
    const values:Record<string,number>={meta:1,active:2,wait:3,paused:0,delayed:4,failed:5,prioritized:1,'waiting-children':0};
    const value=mode==='wrongtype'&&field==='active'?Error('WRONGTYPE '+password):name==='HGET'?null:values[field]??0;
    if(queued){queued.push(value);socket.write('+QUEUED\r\n');}else socket.write(reply(value));
   }
  });
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 return{port:(server.address() as net.AddressInfo).port,commands,close:async()=>{for(const socket of sockets)socket.destroy();await new Promise<void>(r=>server.close(()=>r()));}};
}

test('actual ioredis reads nonzero counts twice using only AUTH/metadata and read-only transactions', {timeout:25000},async()=>{
 const f=await fixture();try{
  const r=await runProbe(`redis://default:${password}@127.0.0.1:${f.port}/0?family=4`);assert.equal(r.code,0);assert.equal(r.result.result,'READ_COMPLETE');
  assert.equal(r.result.samples.length,2);
  for(const sample of r.result.samples){assert.equal(sample.active,2);assert.equal(sample.waiting,3);assert.equal(sample.delayed,4);assert.equal(sample.failed,5);assert.equal(sample.metadataPresent,true);}
  assert.equal(f.commands.filter(c=>c==='MULTI').length,2);assert.equal(f.commands.filter(c=>c==='EXEC').length,2);
 }finally{await f.close();}
});
test('actual ioredis accepts the application-supported assignment format without a production change',{timeout:25000},async()=>{
 const f=await fixture();try{
  const r=await runProbe(`REDIS_URL="redis://default:${password}@127.0.0.1:${f.port}/0"`);
  assert.equal(r.code,0);assert.equal(r.result.result,'READ_COMPLETE');assert.equal(r.result.redisConfigFormat,'quoted_assignment');
 }finally{await f.close();}
});
test('actual ioredis reports authentication, wrong-type commands and aborted transactions safely',{timeout:30000},async()=>{
 for(const [mode,reason,stage]of [['auth','redis_authentication_failed','connect'],['wrongtype','redis_key_type_mismatch','read_counts'],['unsupported','redis_command_unsupported','read_counts']]as const){
  const f=await fixture(mode);try{const r=await runProbe(`redis://default:${password}@127.0.0.1:${f.port}`);assert.equal(r.code,1);assert.equal(r.result.reason,reason);assert.equal(r.result.stage,stage);}finally{await f.close();}
 }
});
test('actual missing ioredis module and refused socket produce distinct failure stages',{timeout:10000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'queue-probe-no-modules-'));
 try{const r=await runProbe('redis://127.0.0.1:1',directory);assert.equal(r.result.reason,'redis_module_missing');assert.equal(r.result.stage,'load_module');}finally{await rm(directory,{recursive:true,force:true});}
 const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=(server.address()as net.AddressInfo).port;await new Promise<void>(r=>server.close(()=>r()));
 const r=await runProbe(`redis://127.0.0.1:${port}`);assert.equal(r.result.reason,'redis_connection_refused');assert.equal(r.result.stage,'connect');
});
test('actual TLS certificate failures remain enforced and produce no certificate/credential dumps',{timeout:20000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'queue-probe-tls-'));let server:tls.Server|undefined;
 try{
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(directory,'key.pem'),'-out',join(directory,'cert.pem'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
  server=tls.createServer({key:await readFile(join(directory,'key.pem')),cert:await readFile(join(directory,'cert.pem'))});server.on('tlsClientError',()=>{});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const r=await runProbe(`rediss://default:${password}@127.0.0.1:${(server.address()as net.AddressInfo).port}`);assert.equal(r.result.reason,'redis_tls_failed');assert.equal(r.result.stage,'connect');
 }finally{if(server)await new Promise<void>(r=>server!.close(()=>r()));await rm(directory,{recursive:true,force:true});}
});
test('actual read timeout returns a safe failure rather than hanging or inventing queue counts',{timeout:20000},async()=>{
 const f=await fixture('timeout');try{const r=await runProbe(`redis://127.0.0.1:${f.port}`);assert.equal(r.result.reason,'redis_timeout');assert.equal(r.result.stage,'read_counts');assert.equal(r.result.samples.length,0);}finally{await f.close();}
});
