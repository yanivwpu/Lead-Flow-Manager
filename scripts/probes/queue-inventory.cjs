'use strict';
// Inventory only: no BullMQ objects, Lua, queue pause/resume, or job mutations.
const {createRequire}=require('node:module');
const req=createRequire(process.cwd()+'/package.json');
const env=process.env;
const result={check:'queue_inventory',result:'FAIL',observedAt:new Date().toISOString()};
let redis;
function ensure(ok,reason){if(!ok){const e=new Error(reason);e.safeReason=reason;throw e;}}
(async()=>{
 try{
  ensure(env.RAILWAY_PROJECT_ID==='2adeea49-431c-4ddf-8815-9ce89af66f32' && env.RAILWAY_ENVIRONMENT_ID==='fa2e8c30-72ea-4688-877f-4a68e24198bc' && env.RAILWAY_SERVICE_ID==='a7b75139-5bf8-4a02-b4ab-b7d12e17e770' && !!env.RAILWAY_DEPLOYMENT_ID,'wrong_or_unattested_runtime');
  ensure(/^[a-f0-9]{40}$/.test(env.RAILWAY_GIT_COMMIT_SHA||''),'unattested_runtime_commit');
  result.deploymentId=env.RAILWAY_DEPLOYMENT_ID;result.commit=env.RAILWAY_GIT_COMMIT_SHA;result.replicaId=env.RAILWAY_REPLICA_ID||null;
  ensure(!!env.REDIS_URL,'redis_url_absent');
  const Redis=req('ioredis');
  redis=new Redis(env.REDIS_URL,{lazyConnect:true,enableReadyCheck:false,enableOfflineQueue:false,maxRetriesPerRequest:0,retryStrategy:()=>null,connectTimeout:5000,commandTimeout:5000,autoResubscribe:false,autoResendUnfulfilledCommands:false,tls:env.REDIS_URL.startsWith('rediss://')||env.REDIS_URL.includes('upstash.io')?{}:undefined});
  redis.on('error',()=>{});await redis.connect();
  result.queue='unified-inbox';result.samples=[];
  for(let i=0;i<2;i++){
   const k='bull:unified-inbox:';
   const commands=[['exists',k+'meta'],['llen',k+'active'],['llen',k+'wait'],['llen',k+'paused'],['zcard',k+'delayed'],['zcard',k+'failed'],['zcard',k+'prioritized'],['zcard',k+'waiting-children'],['hget',k+'meta','paused']];
   // One atomic snapshot. Every command inside this transaction reads only.
   const rows=await redis.multi(commands).exec();
   ensure(rows&&rows.length===commands.length&&rows.every(r=>!r[0]),'redis_read_failed');
   const v=rows.map(r=>r[1]);
   result.samples.push({at:new Date().toISOString(),metadataPresent:v[0]===1,active:v[1],waiting:v[2],pausedWaiting:v[3],delayed:v[4],failed:v[5],prioritized:v[6],waitingChildren:v[7],queuePaused:v[8]==='1'});
   if(i===0)await new Promise(resolve=>setTimeout(resolve,10000));
  }
  result.result='READ_COMPLETE';result.limitation='Inventory only; not proof of stopped workers, drained HTTP/AI, or a release approval.';
 }catch(e){result.reason=e.safeReason||'inventory_failed';process.exitCode=1;}
 finally{if(redis)redis.disconnect();console.log(JSON.stringify(result));}
})();
