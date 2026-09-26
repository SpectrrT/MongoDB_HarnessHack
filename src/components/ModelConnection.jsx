import { useEffect, useState, useSyncExternalStore } from 'react';
import { useWorkspace } from '../store';
import { modelRequest } from '../model-api';
import { ConnectionLogo } from './ConnectionLogo';
let snapshot = {status:null,error:''}, inflight;
const listeners = new Set();
const emit = () => listeners.forEach(fn=>fn());
async function refreshStatus() {
  if(inflight)return inflight;
  snapshot = {...snapshot,error:''};emit();
  inflight = modelRequest('status').then(status=>{snapshot={status,error:''};}).catch(e=>{snapshot={...snapshot,error:e.message};}).finally(()=>{inflight=null;emit();});
  return inflight;
}
export function useModelStatus() {
  const current = useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},()=>snapshot);
  useEffect(()=>{if(!snapshot.status&&!snapshot.error)refreshStatus();},[]);
  useEffect(()=>{if(!current.error)return;const timer=setTimeout(refreshStatus,3000);return()=>clearTimeout(timer);},[current.error]);
  return {...current,refresh:refreshStatus};
}
export default function ModelConnection() {
  const {state,act}=useWorkspace(),{status,error,refresh}=useModelStatus();
  const [login,setLogin]=useState(null),[loginError,setLoginError]=useState(''),[starting,setStarting]=useState(false);
  const connected=state.settings.modelConnected && status?.connected;
  useEffect(()=>{
   if(!login?.id||login.status!=='pending')return;let alive=true,timer;
   const poll=async()=>{try{const result=await modelRequest('login/'+login.id);if(!alive)return;setLogin(result);if(result.status==='pending')timer=setTimeout(poll,1200);else if(result.status==='connected'){await refresh();await act('settings',{modelConnected:true,modelProvider:'codex'});}else setLoginError(result.error||'Sign-in cancelled.');}catch(e){if(alive)setLoginError(e.message);}};
   timer=setTimeout(poll,1200);return()=>{alive=false;clearTimeout(timer);};
  },[login?.id,login?.status]);
  const start=async()=>{setStarting(true);setLoginError('');const popup=window.open('about:blank','_blank');if(popup)popup.opener=null;try{const result=await modelRequest('login',{});if(result.connected){popup?.close();await refresh();await act('settings',{modelConnected:true,modelProvider:'codex'});return;}setLogin(result);if(popup)popup.location.href=result.url;}catch(e){popup?.close();setLoginError(e.message);}finally{setStarting(false);}};
  return <section className="model-connection"><ConnectionLogo id="openai" size={26}/><div><h2>ChatGPT</h2><p>{loginError||error||(login?.status==='pending'?'Finish signing in with ChatGPT in the other tab.':connected?'Connected through Codex. Your account limits apply.':status?.connected?'Your ChatGPT account is ready.':'Sign in to use your ChatGPT account and local Codex tools.')}</p>{login?.status==='pending'&&<><a href={login.url} target="_blank" rel="noopener noreferrer" className="text-link">Continue to ChatGPT ↗</a><button className="text-button" onClick={async()=>{await modelRequest('login/'+login.id+'/cancel',{});setLogin(null);}}>Cancel sign-in</button></>}</div>{status?.connected?<button className="button small secondary" onClick={()=>act('settings',{modelConnected:!connected,modelProvider:'codex',modelSelection:state.settings.modelSelection||(status.models.find(m=>m.id==='gpt-5.5')||status.models[0])?.id}).catch(()=>{})}>{connected?'Disconnect':'Use ChatGPT'}</button>:!login||login.status!=='pending'?<button className="button small secondary" disabled={starting} onClick={start}>{starting?'Opening…':'Sign in with ChatGPT'}</button>:null}</section>;
}
