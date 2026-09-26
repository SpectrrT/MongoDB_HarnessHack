import {useEffect,useState} from 'react';
import ToolChips from '../vendor/beautiful/ToolChips';
import ApprovalCard from '../vendor/beautiful/ApprovalCard';
import {modelRequest} from '../model-api';
import {toolPresentation} from '../../shared/tool-events';
import {ConnectionLogo} from './ConnectionLogo';
export function AgentActivity({events=[]}){
 const tools=events.filter(e=>e.type!=='session');if(!tools.length)return null;
 return <div className="beautiful-ui agent-activity"><ToolChips live diffs={[]} diffLines={{}} labels={{header:`${tools.length} tool ${tools.length===1?'call':'calls'}`}} steps={tools.map((event,i)=>{
  const view=toolPresentation(event);
  return {icon:event.type==='fileChange'?'write':'read',iconNode:view.service?<ConnectionLogo id={view.service} size={15}/>:undefined,label:`${i+1}. ${view.label}`,chip:view.status,working:view.working,mono:false,detailMono:true,detail:[{text:view.detail},...String(event.output||event.detail||'').split('\n').slice(0,40).map(text=>({text}))]};
 })}/></div>;
}
export function AgentApproval({request,jobId}){
 const [attempt,setAttempt]=useState(0);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[content,setContent]=useState('{}');const p=request.params||{};
 const needsFields=p.requestedSchema&&Object.keys(p.requestedSchema.properties||{}).length>0;
 const inputs=request.method.includes('requestUserInput'),questions=inputs?(p.questions||[]).map(q=>({q:q.question,type:'radio',options:(q.options||[]).map(o=>o.label)})):[{q:p.reason||p.message||'Allow this action?',type:'radio',options:['Allow once','Decline']}];
 const reply=async body=>{if(busy)return;setBusy(true);setError('');try{await modelRequest(`jobs/${jobId}/approvals/${request.id}`,body);}catch(e){setError(e.message);setBusy(false);setAttempt(n=>n+1);}};
 return <section className="agent-approval beautiful-ui"><h3>{inputs?'Your input is needed':'Approval needed'}</h3>{p.command&&<pre>{p.command}</pre>}{p.cwd&&<small>Working folder: {p.cwd}</small>}{p.permissions&&<pre>{JSON.stringify(p.permissions,null,2)}</pre>}{p.changes&&<pre>{JSON.stringify(p.changes,null,2)}</pre>}{p.grantRoot&&<pre>{p.grantRoot}</pre>}{p.networkApprovalContext&&<pre>{JSON.stringify(p.networkApprovalContext,null,2)}</pre>}{needsFields&&<label>Requested information<pre>{JSON.stringify(p.requestedSchema,null,2)}</pre><textarea aria-label="Tool response JSON" value={content} onChange={e=>setContent(e.target.value)}/></label>}{p.url&&/^https?:\/\//.test(p.url)&&<a href={p.url} target="_blank" rel="noopener noreferrer">Open the connection request</a>}<details className="approval-request-details"><summary>Request details</summary><pre>{JSON.stringify(p,null,2)}</pre></details><div inert={busy||undefined}><ApprovalCard key={attempt} manual resettable={false} questions={questions} labels={{skip:'Decline',continue:'Continue',send:inputs?'Send answer':'Confirm',sentMessage:'Response sent'}} onSkipped={()=>reply({action:'deny'})} onSubmitted={(answers,custom)=>{try{if(inputs)reply({action:'approve',answers:Object.fromEntries(p.questions.map((q,i)=>[q.id,custom[i]||(q.options||[])[answers[i]?.[0]]?.label||'']))});else reply({action:answers[0]?.[0]===0?'approve':'deny',...(p.requestedSchema?{content:needsFields?JSON.parse(content):{}}:{})});}catch{setError('Enter valid JSON for the requested information.');setAttempt(n=>n+1);}}}/></div>{error&&<p role="alert">{error}</p>}</section>;
}
function Artifact({jobId,file}){
 const [url,setUrl]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let active=true,objectUrl;fetch(`/api/model/jobs/${jobId}/artifacts/${file.id}`,{headers:{'X-Offload-Client':'local'}}).then(async r=>{if(!r.ok)throw Error('File is unavailable.');const blob=await r.blob(),ext=file.name.split('.').pop().toLowerCase(),type=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif'})[ext];objectUrl=URL.createObjectURL(type?new Blob([blob],{type}):blob);if(active)setUrl(objectUrl);else URL.revokeObjectURL(objectUrl);}).catch(e=>{if(active)setError(e.message)});return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[jobId,file.id]);
 return <div className="agent-artifact">{file.image&&url&&<img src={url} alt={file.name}/>}<a href={url||undefined} download={file.name.split('/').pop()}>{file.name}</a><small>{error||`${Math.max(1,Math.round(file.size/1024))} KB`}</small></div>;
}
export function AgentArtifacts({agent}){return agent?.artifacts?.length?<div className="agent-artifacts">{agent.artifacts.map(file=><Artifact key={file.id} jobId={agent.jobId} file={file}/>)}</div>:null;}
