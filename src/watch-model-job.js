export function watchModelJob({read,onUpdate,onFinish,onConnection,interval=900,schedule=setTimeout,unschedule=clearTimeout}){
 let active=true,timer,failures=0;
 const poll=async()=>{
  try{
   const job=await read();if(!active)return;
   failures=0;onConnection('');onUpdate(job);
   if(job.status!=='running'){await onFinish(job);return;}
  }catch(error){
   if(!active)return;
   if(error.retryable===false){await onFinish({status:'failed',error:error.message});return;}
   failures++;onConnection('Reconnecting… Your reply will appear here when the connection returns.');
  }
  if(active)timer=schedule(poll,Math.min(5000,interval*Math.max(1,failures)));
 };
 void poll();return()=>{active=false;unschedule(timer);};
}
