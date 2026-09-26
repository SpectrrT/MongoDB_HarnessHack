export async function modelRequest(path,body) {
  const response=await fetch('/api/model/'+path,{method:body ? 'POST' : 'GET',headers:{'Content-Type':'application/json','X-Offload-Client':'local'},...(body ? {body:JSON.stringify(body)} : {})});
  let result;try{result=await response.json();}catch{throw Error('Start the local service with npm run dev to connect your model.');}
  if(!response.ok)throw Error(result.error || 'The local model service is unavailable.');
  return result;
}
