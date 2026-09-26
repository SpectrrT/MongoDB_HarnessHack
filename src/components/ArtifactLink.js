import React,{useContext,useState} from 'react';
import {artifactTarget} from '../../shared/artifact-target.js';
export const ArtifactContext=React.createContext(null);
export const ArtifactProvider=ArtifactContext.Provider;
const h=React.createElement;
export function ResponseLink({href,children,title,id,'aria-label':label}){
 const agent=useContext(ArtifactContext),target=artifactTarget(href,agent);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!target){
  if(!href||/^(?:file:|sandbox:|\/Users\/|\/home\/)/i.test(href))return h('span',{title:'This file is not available in this conversation.'},children);
  return h('a',{href,title,id,'aria-label':label,...(href.startsWith('#')?{}:{target:'_blank',rel:'noopener noreferrer'})},children);
 }
 const url=target.artifactId?`/api/model/jobs/${encodeURIComponent(agent.jobId)}/artifacts/${encodeURIComponent(target.artifactId)}`:`/api/model/jobs/${encodeURIComponent(agent.jobId)}/download?path=${encodeURIComponent(target.path)}`;
 const download=async event=>{
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const response=await fetch(url,{headers:{'X-Offload-Client':'local'}});
   if(!response.ok)throw Error('This file is no longer available. Ask the agent to generate it again.');
   const blob=await response.blob(),objectUrl=URL.createObjectURL(blob),anchor=document.createElement('a');
   anchor.href=objectUrl;anchor.download=target.name;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),30000);
  }catch(e){setError(e.message);}finally{setBusy(false);}
 };
 return h(React.Fragment,null,h('a',{href:url,download:target.name,onClick:download,title:busy?'Preparing download…':`Download ${target.name}`,'aria-busy':busy||undefined,'aria-label':label},children),error&&h('span',{className:'artifact-download-error',role:'alert'},error));
}
