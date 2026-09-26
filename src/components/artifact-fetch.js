const aborted=()=>new DOMException('Download cancelled.','AbortError');
function wait(delay,signal){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(aborted());
  const finish=()=>{signal?.removeEventListener('abort',cancel);resolve();};
  const timer=setTimeout(finish,delay);
  const cancel=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);reject(aborted());};
  signal?.addEventListener('abort',cancel,{once:true});
 });
}

export async function fetchArtifactBlob(url,{signal,retryDelays=[600,1500,3000],fetchImpl=fetch}={}){
 for(let attempt=0;attempt<=retryDelays.length;attempt++){
  if(signal?.aborted)throw aborted();
  const controller=new AbortController(),cancel=()=>controller.abort();
  signal?.addEventListener('abort',cancel,{once:true});
  const timeout=setTimeout(cancel,10000);
  try{
   const response=await fetchImpl(url,{headers:{'X-Offload-Client':'local'},cache:'no-store',signal:controller.signal});
   if(response.ok)return await response.blob();
   const retryable=response.status===408||response.status===429||response.status>=500;
   const message=[404,410].includes(response.status)?'This file is no longer available. Ask the agent to generate it again.':response.status===403?'This download is not accessible in the current session.':'The download request could not be completed. Please retry.';
   throw Object.assign(Error(message),{retryable});
  }catch(error){
   if(signal?.aborted)throw aborted();
   if(error.retryable===false)throw error;
   if(attempt===retryDelays.length)throw Object.assign(Error('The download service could not be reached. Please retry.'),{retryable:true});
  }finally{
   clearTimeout(timeout);signal?.removeEventListener('abort',cancel);controller.abort();
  }
  await wait(retryDelays[attempt],signal);
 }
}
