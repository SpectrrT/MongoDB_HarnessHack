import {useState,useEffect} from 'react';
import {useWorkspace} from '../store';
import {modelRequest} from '../model-api';
import {ConnectionLogo} from './ConnectionLogo';
export function useOpenRouterStatus(){const [status,setStatus]=useState(null),[error,setError]=useState('');const refresh=async()=>{try{setStatus(await modelRequest('openrouter/status'));setError('');}catch(e){setError(e.message);}};useEffect(()=>{refresh();},[]);return {status,error,refresh};}
export default function OpenRouterConnection(){
 const {state,act}=useWorkspace(),{status,error,refresh}=useOpenRouterStatus(),[busy,setBusy]=useState(false),[failure,setFailure]=useState('');
 const connect=async()=>{setBusy(true);try{const {url}=await modelRequest('openrouter/start',{});location.assign(url);}catch(e){setFailure(e.message);setBusy(false);}};
 const active=state.settings.modelProvider==='openrouter';
 return <section className="model-connection"><ConnectionLogo id="openrouter" size={28}/><div><h2>OpenRouter</h2><p>{failure||error||(status?.connected?'Connected':status?'Use your OpenRouter models and credits.':'Checking connection…')}</p></div>{status?.connected?<><button className="button small secondary" onClick={()=>act('settings',{modelProvider:active?'codex':'openrouter'}).catch(()=>{})}>{active?'Use ChatGPT instead':'Use OpenRouter'}</button><button className="text-button" onClick={async()=>{await modelRequest('openrouter/disconnect',{});await act('settings',{modelProvider:'codex'});refresh();}}>Disconnect</button></>:<button className="button small secondary" disabled={busy} onClick={connect}>Connect OpenRouter</button>}</section>;
}
