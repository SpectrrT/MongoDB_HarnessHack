import React,{createContext,useContext,useEffect,useState,useCallback,useRef} from 'react';
import {createWorkspace,transition,advanceWorkspace} from '../shared/workspace.js';
const Context=createContext(null),KEY='offload.workspace.v1';
const MODE=import.meta.env.VITE_STORAGE_MODE||'browser';
export function WorkspaceProvider({children}){
 const [state,setState]=useState(null),[error,setError]=useState('');const ref=useRef(null),queue=useRef(Promise.resolve());
 const put=useCallback(s=>{ref.current=s;setState(s);if(MODE==='browser'){try{localStorage.setItem(KEY,JSON.stringify(s));}catch{setError('The browser could not save your workspace. Export a backup in Settings.');}}return s;},[]);
 useEffect(()=>{if(MODE==='api'){fetch('/api/state').then(r=>{if(!r.ok)throw Error('The local service is unavailable. Start it with npm run dev.');return r.json();}).then(put).catch(e=>setError(e.message));}else{try{const saved=localStorage.getItem(KEY);const s=saved?JSON.parse(saved):createWorkspace();if(s.version!==1)throw Error('This workspace uses an unsupported version.');put(advanceWorkspace(s));}catch(e){setError('Your saved workspace could not be opened. Export or clear it in browser storage before restarting.');}}},[put]);
 const act=useCallback((type,payload={})=>{const run=queue.current.catch(()=>{}).then(async()=>{try{let s;if(MODE==='api'){const r=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,payload})});s=await r.json();if(!r.ok)throw Error(s.error);}else{s=transition(advanceWorkspace(ref.current),{type,payload});}put(s);setError('');return s;}catch(e){setError(e.message);throw e;}});queue.current=run;return run;},[put]);
 useEffect(()=>{const tick=setInterval(async()=>{if(!ref.current)return;if(MODE==='api'){try{const r=await fetch('/api/state');if(r.ok){const s=await r.json();if(s.revision!==ref.current.revision)put(s);}}catch{}}else{const next=advanceWorkspace(ref.current);if(next!==ref.current)put(next);}},1000);return()=>clearInterval(tick);},[put]);
 useEffect(()=>{const h=e=>{if(e.key===KEY&&e.newValue){try{const s=JSON.parse(e.newValue);if(s.version===1){ref.current=s;setState(s);}}catch{}}};addEventListener('storage',h);return()=>removeEventListener('storage',h);},[]);
 const reset=async()=>{if(MODE==='api'){const r=await fetch('/api/reset',{method:'POST'});if(!r.ok)throw Error('Reset failed.');put(await r.json());}else put(createWorkspace());};
 return <Context.Provider value={{state,act,error,setError,reset,mode:MODE}}>{children}</Context.Provider>;
}
export const useWorkspace=()=>useContext(Context);
export function download(name,text,type='text/markdown'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
