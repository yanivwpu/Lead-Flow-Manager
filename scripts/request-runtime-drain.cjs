'use strict';
// MUTATING LOCAL PROCESS CONTROL: run only during an operator-approved release window.
// Does not stop the container, change Railway settings, purge queues or replay provider sends.
const fs=require('node:fs');
const expected={project:'2adeea49-431c-4ddf-8815-9ce89af66f32',environment:'fa2e8c30-72ea-4688-877f-4a68e24198bc',service:'a7b75139-5bf8-4a02-b4ab-b7d12e17e770'};
const statusFile='/tmp/whachat-runtime-drain.json';
function read(){
 const s=JSON.parse(fs.readFileSync(statusFile,'utf8'));
 for(const[k,id]of Object.entries(expected))if(s[k]!==id)throw Error('wrong_service');
 if(s.deployment!==process.env.RAILWAY_DEPLOYMENT_ID||s.commit!==process.env.RAILWAY_GIT_COMMIT_SHA||!s.deployment||!s.commit)throw Error('wrong_deployment');
 if(!Number.isSafeInteger(s.pid)||s.pid<1||s.pid===process.pid)throw Error('invalid_process');
 const cmd=fs.readFileSync('/proc/'+s.pid+'/cmdline','utf8');
 if(!/dist\/index\.cjs(?:\x00|$)/.test(cmd))throw Error('not_application_process');
 process.kill(s.pid,0);return s;
}
(async()=>{
 try{
  const initial=read();
  process.kill(initial.pid,'SIGUSR2');
  const deadline=Date.now()+10*60_000;
  while(Date.now()<deadline){
   const s=read();
   if(s.pid!==initial.pid||s.deployment!==initial.deployment)throw Error('process_changed');
   if(s.state==='failed')throw Error('drain_failed');
   if(s.state==='ready'&&s.draining&&Object.keys(s.active).length===0){console.log(JSON.stringify({result:'DRAIN_READY',deployment:s.deployment,commit:s.commit,pid:s.pid}));return;}
   await new Promise(r=>setTimeout(r,1000));
  }
  throw Error('still_draining_do_not_cut_over');
 }catch(e){console.error(JSON.stringify({result:'NOT_READY',reason:['wrong_service','wrong_deployment','invalid_process','not_application_process','process_changed','drain_failed','still_draining_do_not_cut_over'].includes(e.message)?e.message:'status_unavailable',action:'do_not_cut_over'}));process.exitCode=1;}
})();
