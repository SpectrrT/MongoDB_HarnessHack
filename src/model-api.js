export async function modelRequest(path,body) {
  let response;
  try{response=await fetch('/api/model/'+path,{method:body ? 'POST' : 'GET',headers:{'Content-Type':'application/json','X-Offload-Client':'local'},...(body ? {body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(20000)});}
  catch{throw Object.assign(Error('Reconnecting to your local agent…'),{retryable:true});}
  let result;try{result=await response.json();}catch{throw Object.assign(Error('Reconnecting to your local agent…'),{retryable:true});}
  if(!response.ok)throw Object.assign(Error(result.error || 'The local model service is unavailable.'),{retryable:response.status>=500||response.status===429});
  return result;
}
