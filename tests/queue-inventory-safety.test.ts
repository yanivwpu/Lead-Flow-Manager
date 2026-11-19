import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../scripts/probes/queue-inventory.cjs',import.meta.url),'utf8');
const safeEnv={RAILWAY_PROJECT_ID:'2adeea49-431c-4ddf-8815-9ce89af66f32',RAILWAY_ENVIRONMENT_ID:'fa2e8c30-72ea-4688-877f-4a68e24198bc',RAILWAY_SERVICE_ID:'a7b75139-5bf8-4a02-b4ab-b7d12e17e770',RAILWAY_DEPLOYMENT_ID:'fixture-deployment',RAILWAY_GIT_COMMIT_SHA:'6f3212fd4340803cb15ca6412a145349f82acc6d',REDIS_URL:'rediss://fixture:never-print-this@redis.example:6380'};
type Scenario={loadError?:any;exportShape?:'default'|'Redis'|'invalid';connectError?:any;eventError?:any;readError?:any;rowError?:any;invalidCount?:boolean;disconnectError?:boolean;hangConnect?:boolean;expire?:boolean};
async function probe(env:Record<string,string>,scenario:Scenario={}){
 let commands:any[]=[];let connections=0;let tls=false;let suppliedUrl='';let done!:(v:any)=>void;let errorHandler=(e:any)=>{};
 const result=new Promise<any>(r=>done=r);
 class Redis{
  constructor(url:string,options:any){connections++;tls=!!options.tls;suppliedUrl=url;}
  on(event:string,handler:any){if(event==='error')errorHandler=handler;}
  async connect(){if(scenario.hangConnect)await new Promise(()=>{});if(scenario.eventError)errorHandler(scenario.eventError);if(scenario.connectError)throw scenario.connectError;}
  disconnect(){if(scenario.disconnectError)throw Error('never-print-this cleanup');}
  multi(list:any[]){
   commands.push(...list);assert.ok(list.every(c=>['exists','llen','zcard','hget'].includes(c[0])));
   return{exec:async()=>{
    if(scenario.readError)throw scenario.readError;
    return list.map((c,index)=>scenario.rowError&&index===1?[scenario.rowError]:[null,c[0]==='hget'?null:c[0]==='exists'?1:scenario.invalidCount?'never-print-this':0]);
   }};
  }
 }
 vm.runInNewContext(source,{
  require:(name:string)=>{assert.equal(name,'node:module');return{createRequire:()=>((name:string)=>{
   assert.equal(name,'ioredis');if(scenario.loadError)throw scenario.loadError;
   return scenario.exportShape==='default'?{default:Redis}:scenario.exportShape==='Redis'?{Redis}:scenario.exportShape==='invalid'?{}:Redis;
  })};},
  process:{env,cwd:()=>'/app',exitCode:0},setTimeout:(f:()=>void,ms:number)=>{if(ms===45000&&scenario.expire)setImmediate(f);else if(ms!==45000)f();return{unref(){}};},clearTimeout(){},
  Promise,Date,Error,URL,console:{log:(s:string)=>done(JSON.parse(s))},
 });
 return{value:await result,commands,connections,tls,suppliedUrl};
}
function noSecrets(value:any){const text=JSON.stringify(value);for(const secret of ['never-print-this','sensitive-host.example','redis.example','redis://','rediss://','private-token'])assert.ok(!text.includes(secret),secret+' leaked');}
const failure=(message:string,code?:string)=>Object.assign(new Error(message),code?{code}:{});

test('queue inventory issues only atomic read commands and never exposes credentials',async()=>{
 const r=await probe(safeEnv);assert.equal(r.value.result,'READ_COMPLETE');assert.equal(r.value.probeVersion,2);assert.equal(r.value.samples.length,2);assert.equal(r.commands.length,18);assert.equal(r.connections,1);noSecrets(r.value);
});
test('wrong service or missing runtime commit fails before Redis connects',async()=>{
 for(const env of [{...safeEnv,RAILWAY_SERVICE_ID:'other'},{...safeEnv,RAILWAY_GIT_COMMIT_SHA:''}]){
  const r=await probe(env);assert.equal(r.value.result,'FAIL');assert.equal(r.value.stage,'identify_runtime');assert.equal(r.connections,0);assert.equal(r.commands.length,0);
 }
});
test('the same read-only probe supports reviewed production versions without stale commit pins',async()=>{
 const r=await probe({...safeEnv,RAILWAY_GIT_COMMIT_SHA:'a'.repeat(40)});assert.equal(r.value.result,'READ_COMPLETE');assert.equal(r.value.commit,'a'.repeat(40));
});
test('Windows launcher keeps official release checksums and embeds the verified exact probe',async()=>{
 const ps=await readFile(new URL('../scripts/probes/windows/Run-Probe.ps1',import.meta.url),'utf8');
 for(const hash of ['1f468573a544587a2c22e6262abc393dafaaf8627ae9f45a5ef2e7d96423c8b6','e733d050060ac069f1e37b6ae55bf1565878ee82241c5934820d90ffe47544e6','5458648ebd0cfe47f2da81eb3461d46e150d3f5ffbfa9179bb6d03869ace970e'])assert.ok(ps.includes(hash));
 assert.ok(ps.includes("@('' | & $Railway @Arguments 2>&1)"));assert.ok(ps.includes("$Parsed.check -eq 'queue_inventory'"));
 const payload=ps.match(/\$Payload = '([A-Za-z0-9+/=]+)'/)![1];assert.equal(Buffer.from(payload,'base64').toString(),source);
});
test('Redis TLS checks the parsed hostname rather than credentials or lookalike URLs',async()=>{
 for(const [url,expected]of [
  ['redis://fixture:secret@host.upstash.io:6379',true],['redis://upstash.io:secret@redis.example:6379',false],
  ['redis://fixture:secret@host.upstash.io.attacker.example:6379',false],['redis://fixture:secret@notupstash.io:6379',false],
  ['rediss://fixture:secret@redis.example:6380',true],
 ] as const){const r=await probe({...safeEnv,REDIS_URL:url});assert.equal(r.tls,expected);assert.equal(r.value.result,'READ_COMPLETE');}
 const invalid=await probe({...safeEnv,REDIS_URL:'https://redis.example'});assert.equal(invalid.connections,0);assert.equal(invalid.value.reason,'unsupported_redis_protocol');
});
test('plain, quoted, assignment and redis-cli URI formats normalize without running any command',async()=>{
 for(const [raw,format]of [
  [safeEnv.REDIS_URL,'url'],['  '+safeEnv.REDIS_URL+'  ','url'],['"'+safeEnv.REDIS_URL+'"','quoted_url'],
  ['REDIS_URL='+safeEnv.REDIS_URL,'assignment'],["export REDIS_URL='"+safeEnv.REDIS_URL+"'",'quoted_assignment'],
  ['redis-cli --tls -u "'+safeEnv.REDIS_URL+'"','cli_uri'],
 ] as const){const r=await probe({...safeEnv,REDIS_URL:raw});assert.equal(r.value.result,'READ_COMPLETE');assert.equal(r.suppliedUrl,safeEnv.REDIS_URL);assert.equal(r.value.redisConfigFormat,format);noSecrets(r.value);}
 const queryUrl=safeEnv.REDIS_URL+'?family=4';
 const query=await probe({...safeEnv,REDIS_URL:queryUrl});assert.equal(query.value.result,'READ_COMPLETE');assert.equal(query.suppliedUrl,queryUrl);
 assert.throws(()=>new URL('REDIS_URL='+safeEnv.REDIS_URL));
 for(const raw of ['', 'not-a-url never-print-this',safeEnv.REDIS_URL+'#private-token']){
  const r=await probe({...safeEnv,REDIS_URL:raw});assert.equal(r.value.result,'FAIL');assert.equal(r.value.stage,'parse_config');assert.equal(r.connections,0);noSecrets(r.value);
 }
});
test('missing modules, invalid exports and supported CJS/default exports are distinguished safely',async()=>{
 for(const shape of ['default','Redis'] as const)assert.equal((await probe(safeEnv,{exportShape:shape})).value.result,'READ_COMPLETE');
 for(const [scenario,reason]of [[{loadError:failure('Cannot find module never-print-this','MODULE_NOT_FOUND')},'redis_module_missing'],[{exportShape:'invalid'},'redis_module_invalid']] as const){
  const r=await probe(safeEnv,scenario);assert.equal(r.value.reason,reason);assert.equal(r.value.stage,'load_module');assert.equal(r.connections,0);noSecrets(r.value);
 }
});
test('network, authentication, TLS and quota failures return fixed categories without raw error text',async()=>{
 for(const [error,reason]of [
  [failure('getaddrinfo sensitive-host.example','ENOTFOUND'),'redis_dns_failed'],
  [failure('getaddrinfo tls-sensitive-host.example','ENOTFOUND'),'redis_dns_failed'],
  [failure('never-print-this','ECONNREFUSED'),'redis_connection_refused'],
  [failure('connect timeout sensitive-host.example','ETIMEDOUT'),'redis_timeout'],
  [failure('WRONGPASS never-print-this rediss://fixture:private-token@sensitive-host.example'),'redis_authentication_failed'],
  [failure('NOAUTH Authentication required private-token'),'redis_authentication_required'],
  [failure('private-token','ERR_TLS_CERT_ALTNAME_INVALID'),'redis_tls_failed'],
  [failure('max requests limit exceeded private-token'),'redis_quota_exceeded'],
  [failure('too many requests private-token'),'redis_rate_limited'],
 ] as const){const r=await probe(safeEnv,{connectError:error});assert.equal(r.value.reason,reason);assert.equal(r.value.stage,'connect');noSecrets(r.value);}
 const r=await probe(safeEnv,{eventError:failure('WRONGPASS never-print-this'),connectError:failure('Connection is closed')});assert.equal(r.value.reason,'redis_authentication_failed');noSecrets(r.value);
});
test('unsupported, invalid, denied and wrong-type Redis commands preserve safe command context',async()=>{
 for(const [message,reason]of [
  ["ERR unknown command 'LLEN' private-token",'redis_command_unsupported'],
  ['ERR wrong number of arguments private-token','redis_command_invalid'],
  ['NOPERM permission denied private-token','redis_permission_denied'],
  ['WRONGTYPE private-token','redis_key_type_mismatch'],
 ] as const){const r=await probe(safeEnv,{rowError:failure(message)});assert.equal(r.value.reason,reason);assert.equal(r.value.stage,'read_counts');assert.equal(r.value.command,'LLEN');assert.equal(r.value.queueField,'active');noSecrets(r.value);}
 const error=Object.assign(failure('EXECABORT private-token'),{previousErrors:[failure('NOPERM not allowed to run MULTI private-token')]});
 const r=await probe(safeEnv,{readError:error});assert.equal(r.value.reason,'redis_permission_denied');noSecrets(r.value);
});
test('invalid counts and arbitrary error properties cannot forge safe diagnostics or leak credentials',async()=>{
 const invalid=await probe(safeEnv,{invalidCount:true});assert.equal(invalid.value.reason,'redis_response_invalid');noSecrets(invalid.value);
 const error=Object.assign(failure('rediss://private-token@sensitive-host.example'),{code:'never-print-this',safeReason:'never-print-this'});
 const unknown=await probe(safeEnv,{connectError:error,disconnectError:true});assert.equal(unknown.value.reason,'redis_connection_failed');noSecrets(unknown.value);
});

test('overall deadline bounds an unsettled connection and still emits one safe result',async()=>{
 const r=await probe(safeEnv,{hangConnect:true,expire:true});assert.equal(r.value.reason,'inventory_timeout');assert.equal(r.value.stage,'connect');assert.equal(r.value.result,'FAIL');noSecrets(r.value);
});
