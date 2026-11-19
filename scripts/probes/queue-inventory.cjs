'use strict';
// Inventory only: no app imports, BullMQ objects, Lua, queue pause/resume or job mutations.
const {createRequire}=require('node:module');
const req=createRequire(process.cwd()+'/package.json');
const env=process.env;
const result={check:'queue_inventory',probeVersion:2,result:'FAIL',observedAt:new Date().toISOString()};
let redis,stage='identify_runtime',lastConnectionFailure;
const safeReasons=new Set([
 'wrong_or_unattested_runtime','unattested_runtime_commit','redis_url_absent','redis_config_invalid',
 'unsupported_redis_protocol','redis_module_missing','redis_module_invalid','redis_module_load_failed',
 'redis_dns_failed','redis_connection_refused','redis_connection_failed','redis_connection_closed',
 'redis_timeout','redis_tls_failed','redis_authentication_failed','redis_authentication_required',
 'redis_permission_denied','redis_quota_exceeded','redis_rate_limited','redis_command_unsupported',
 'redis_command_invalid','redis_key_type_mismatch','redis_transaction_aborted','redis_command_failed',
 'redis_response_invalid','redis_client_initialization_failed','inventory_timeout','probe_internal_error',
]);
const safeCodes=new Set(['MODULE_NOT_FOUND','ERR_MODULE_NOT_FOUND','ERR_INVALID_URL','ENOTFOUND','EAI_AGAIN',
 'ECONNREFUSED','ECONNRESET','EHOSTUNREACH','ENETUNREACH','EPIPE','ETIMEDOUT','ERR_TLS_CERT_ALTNAME_INVALID',
 'CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE',
 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY','ERR_SSL_WRONG_VERSION_NUMBER','ERR_TLS_HANDSHAKE_TIMEOUT']);
class ProbeFailure extends Error {
 constructor(reason,details={}){super(reason);this.reason=reason;this.details=details;}
}
function ensure(ok,reason){if(!ok)throw new ProbeFailure(reason);}
// Inspect text privately for fixed categories; never return text, stack, URL, host or command arguments.
function classify(error,at){
 const code=typeof error?.code==='string'&&safeCodes.has(error.code)?error.code:undefined;
 const message=typeof error?.message==='string'?error.message:'';
 let reason;
 // Codes take precedence: a hostname/error payload containing "TLS" is not a TLS failure.
 if(code==='ENOTFOUND'||code==='EAI_AGAIN')reason='redis_dns_failed';
 else if(code==='ECONNREFUSED')reason='redis_connection_refused';
 else if(code==='ETIMEDOUT')reason='redis_timeout';
 else if(code==='ECONNRESET'||code==='EPIPE')reason='redis_connection_closed';
 else if(code&&(/TLS|SSL|CERT|SELF_SIGNED|ISSUER|LEAF_SIGNATURE/.test(code)))reason='redis_tls_failed';
 else if(code==='ERR_INVALID_URL')reason='redis_config_invalid';
 else if(code==='MODULE_NOT_FOUND'||code==='ERR_MODULE_NOT_FOUND')reason='redis_module_missing';
 else if(/\bWRONGPASS\b|invalid (?:username|password)|authentication failed|AUTH failed/i.test(message))reason='redis_authentication_failed';
 else if(/\bNOAUTH\b|authentication required/i.test(message))reason='redis_authentication_required';
 else if(/\bNOPERM\b|permission denied|not allowed to (?:run|execute|access)/i.test(message))reason='redis_permission_denied';
 else if(/max requests limit exceeded|quota exceeded|monthly.*limit|daily.*limit|max concurrent connections/i.test(message))reason='redis_quota_exceeded';
 else if(/rate limit|too many requests|\bTHROTTLED\b/i.test(message))reason='redis_rate_limited';
 else if(/TLS|SSL handshake|certificate (?:has expired|verify|validation)|self.signed certificate/i.test(message))reason='redis_tls_failed';
 else if(/timed? ?out|timeout/i.test(message))reason='redis_timeout';
 else if(/max retries per request/i.test(message))reason='redis_connection_failed';
 else if(/connection (?:is )?closed|socket closed|stream isn.t writeable/i.test(message))reason='redis_connection_closed';
 else if(/unknown command|command.*(?:not supported|disabled)/i.test(message))reason='redis_command_unsupported';
 else if(/wrong number of arguments|syntax error/i.test(message))reason='redis_command_invalid';
 else if(/\bWRONGTYPE\b/i.test(message))reason='redis_key_type_mismatch';
 else if(/\bEXECABORT\b/i.test(message))reason='redis_transaction_aborted';
 else if(at==='load_module')reason=code==='MODULE_NOT_FOUND'||code==='ERR_MODULE_NOT_FOUND'?'redis_module_missing':'redis_module_load_failed';
 else if(at==='parse_config')reason='redis_config_invalid';
 else if(at==='create_client')reason='redis_client_initialization_failed';
 else reason=at==='connect'?'redis_connection_failed':at==='read_counts'?'redis_command_failed':'probe_internal_error';
 return {reason,...(code?{errorCode:code}:{})};
}
function parseAddress(raw){
 let value=String(raw||'').trim();
 ensure(!!value,'redis_url_absent');
 let format='url';
 // Match the app's supported assignment-prefix normalization, without executing a CLI command.
 if(/^(?:export\s+)?REDIS_URL\s*=/.test(value)){
  value=value.replace(/^(?:export\s+)?REDIS_URL\s*=\s*/,'').trim();format='assignment';
 }
 if(/^redis-cli\s+(?:--tls\s+)?(?:-u|--uri)\s+/.test(value)){
  value=value.replace(/^redis-cli\s+(?:--tls\s+)?(?:-u|--uri)\s+/,'').trim();format='cli_uri';
 }
 if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))){
  value=value.slice(1,-1).trim();format=format==='assignment'?'quoted_assignment':format==='cli_uri'?'cli_uri':'quoted_url';
 }
 const address=new URL(value);
 ensure(address.protocol==='redis:'||address.protocol==='rediss:','unsupported_redis_protocol');
 ensure(!!address.hostname&&!address.hash,'redis_config_invalid');
 result.redisConfigFormat=format;
 return {address,value};
}
(async()=>{
 let expired;
 const expiration=new Promise((_,reject)=>{expired=reject;});
 expiration.catch(()=>{});
 const bounded=operation=>Promise.race([operation,expiration]);
 const deadline=setTimeout(()=>{
  result.reason='inventory_timeout';result.stage=stage;process.exitCode=1;expired(new ProbeFailure('inventory_timeout'));
  try{redis?.disconnect();}catch{}
  // The normal catch/finally emits the single safe result after the connection closes.
 },45000);
 try{
  ensure(env.RAILWAY_PROJECT_ID==='2adeea49-431c-4ddf-8815-9ce89af66f32' && env.RAILWAY_ENVIRONMENT_ID==='fa2e8c30-72ea-4688-877f-4a68e24198bc' && env.RAILWAY_SERVICE_ID==='a7b75139-5bf8-4a02-b4ab-b7d12e17e770' && !!env.RAILWAY_DEPLOYMENT_ID,'wrong_or_unattested_runtime');
  ensure(/^[a-f0-9]{40}$/.test(env.RAILWAY_GIT_COMMIT_SHA||''),'unattested_runtime_commit');
  result.deploymentId=env.RAILWAY_DEPLOYMENT_ID;result.commit=env.RAILWAY_GIT_COMMIT_SHA;result.replicaId=env.RAILWAY_REPLICA_ID||null;
  stage='parse_config';
  const {address,value}=parseAddress(env.REDIS_URL);
  const hostname=address.hostname.toLowerCase();
  const useTls=address.protocol==='rediss:'||hostname==='upstash.io'||hostname.endsWith('.upstash.io');
  result.redisTls=useTls;
  stage='load_module';
  const loaded=req('ioredis');
  const Redis=typeof loaded==='function'?loaded:loaded?.default||loaded?.Redis;
  ensure(typeof Redis==='function','redis_module_invalid');
  stage='create_client';
  redis=new Redis(value,{lazyConnect:true,enableReadyCheck:false,enableOfflineQueue:false,maxRetriesPerRequest:0,
   retryStrategy:()=>null,connectTimeout:10000,commandTimeout:10000,autoResubscribe:false,
   autoResendUnfulfilledCommands:false,tls:useTls?{}:undefined});
  let connectionFailed;
  const connectionFailure=new Promise((_,reject)=>{connectionFailed=reject;});
  connectionFailure.catch(()=>{});
  redis.on('error',error=>{
   lastConnectionFailure=classify(error,stage);
   if(stage==='connect')connectionFailed(new ProbeFailure(lastConnectionFailure.reason,lastConnectionFailure));
  });
  stage='connect';await bounded(Promise.race([redis.connect(),connectionFailure]));
  result.queue='unified-inbox';result.samples=[];
  const k='bull:unified-inbox:';
  const commands=[['exists',k+'meta'],['llen',k+'active'],['llen',k+'wait'],['llen',k+'paused'],
   ['zcard',k+'delayed'],['zcard',k+'failed'],['zcard',k+'prioritized'],['zcard',k+'waiting-children'],['hget',k+'meta','paused']];
  for(let i=0;i<2;i++){
   stage='read_counts';result.sampleNumber=i+1;
   let rows;
   try{rows=await bounded(redis.multi(commands).exec());}
   catch(error){
    // ioredis exposes queued command failures on EXECABORT. Inspect them without emitting their arguments.
    if(Array.isArray(error?.previousErrors)){
     const cause=error.previousErrors.find(e=>classify(e,stage).reason!=='redis_command_failed');
     if(cause)throw new ProbeFailure(classify(cause,stage).reason,classify(cause,stage));
    }
    throw error;
   }
   ensure(Array.isArray(rows)&&rows.length===commands.length,'redis_response_invalid');
   for(let index=0;index<rows.length;index++){
    ensure(Array.isArray(rows[index])&&rows[index].length>=1,'redis_response_invalid');
    if(rows[index][0])throw new ProbeFailure(classify(rows[index][0],stage).reason,
      {...classify(rows[index][0],stage),command:commands[index][0].toUpperCase(),queueField:commands[index][1].slice(k.length)});
    ensure(rows[index].length===2,'redis_response_invalid');
   }
   const v=rows.map(row=>row[1]);
   ensure(v.slice(0,8).every(n=>Number.isSafeInteger(n)&&n>=0)&&v[0]<=1&&[null,'0','1'].includes(v[8]),'redis_response_invalid');
   result.samples.push({at:new Date().toISOString(),metadataPresent:v[0]===1,active:v[1],waiting:v[2],
    pausedWaiting:v[3],delayed:v[4],failed:v[5],prioritized:v[6],waitingChildren:v[7],queuePaused:v[8]==='1'});
   if(i===0){
    stage='between_samples';let pause;
    try{await bounded(new Promise(resolve=>{pause=setTimeout(resolve,10000);}));}finally{clearTimeout(pause);}
   }
  }
  result.result='READ_COMPLETE';delete result.sampleNumber;
  result.limitation='Inventory only; not proof of stopped workers, drained HTTP/AI, or a release approval.';
 }catch(error){
  const failure=error instanceof ProbeFailure?{reason:error.reason,...error.details}:classify(error,stage);
  // Prefer the original authentication/TLS/DNS error when connect later reports only "Connection is closed".
  const chosen=lastConnectionFailure&&['redis_connection_closed','redis_connection_failed'].includes(failure.reason)?lastConnectionFailure:failure;
  if(!result.reason)result.reason=safeReasons.has(chosen.reason)?chosen.reason:'probe_internal_error';
  if(chosen.errorCode&&safeCodes.has(chosen.errorCode))result.errorCode=chosen.errorCode;
  if(chosen.command)result.command=chosen.command;
  if(chosen.queueField)result.queueField=chosen.queueField;
  result.stage=stage;process.exitCode=1;
 }finally{
  clearTimeout(deadline);
  try{redis?.disconnect();}catch{}
  console.log(JSON.stringify(result));
 }
})();
