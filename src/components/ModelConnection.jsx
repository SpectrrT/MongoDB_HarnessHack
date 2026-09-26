import { useEffect, useSyncExternalStore } from 'react';
import { useWorkspace } from '../store';
import { modelRequest } from '../model-api';
import { ConnectionLogo } from './ConnectionLogo';
let snapshot = {status:null,error:''}, inflight;
const listeners = new Set();
const emit = () => listeners.forEach(fn=>fn());
async function refreshStatus() {
  if(inflight)return inflight;
  snapshot = {status:null,error:''};emit();
  inflight = modelRequest('status').then(status=>{snapshot={status,error:''};}).catch(e=>{snapshot={status:null,error:e.message};}).finally(()=>{inflight=null;emit();});
  return inflight;
}
export function useModelStatus() {
  const current = useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},()=>snapshot);
  useEffect(()=>{if(!snapshot.status&&!snapshot.error)refreshStatus();},[]);
  return {...current,refresh:refreshStatus};
}
export default function ModelConnection() {
  const {state,act}=useWorkspace(),{status,error,refresh}=useModelStatus();
  const connected=state.settings.modelConnected && status?.connected;
  return <section className="model-connection"><ConnectionLogo id="openai" size={26}/><div><h2>ChatGPT on this Mac</h2><p>{error || (connected ? 'Connected through Codex. Your account limits apply.' : status?.message || 'Checking your sign-in…')}</p></div>{status?.connected ? <button className="button small secondary" onClick={()=>act('settings',{modelConnected:!connected,modelSelection:state.settings.modelSelection || (status.models.find(m=>m.id==='gpt-5.5') || status.models[0])?.id}).catch(()=>{})}>{connected ? 'Disconnect' : 'Use ChatGPT'}</button> : <button className="button small secondary" onClick={refresh}>Check again</button>}</section>;
}
