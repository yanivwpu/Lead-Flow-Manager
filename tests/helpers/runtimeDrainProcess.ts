import { installDrainSignals, runtimeDrain, runTrackedWork } from '../../server/runtimeDrain';
let release!:()=>void;
const held=new Promise<void>(r=>release=r);
installDrainSignals();
const clock=setInterval(()=>{},1000);
runtimeDrain.register('scheduler',()=>clearInterval(clock));
void runTrackedWork('held-ai',async()=>{
 process.send?.({event:'started'});await held;
 await runTrackedWork('provider',async()=>process.send?.({event:'provider-completed'}));
});
process.on('message',message=>{
 if(message==='finish')release();
 if(message==='new-send')void runTrackedWork('new-send',async()=>process.send?.({event:'unexpected-send'}))
   .catch(()=>process.send?.({event:'blocked'}));
});
