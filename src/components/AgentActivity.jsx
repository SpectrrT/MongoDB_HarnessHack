import {useEffect,useState} from 'react';
import ToolChips from '../vendor/beautiful/ToolChips';
import ApprovalCard from '../vendor/beautiful/ApprovalCard';
import {modelRequest} from '../model-api';
import {activityGroups,activityDetail,toolPresentation} from '../../shared/tool-events';
import {FolderSearch,FileText,FilePenLine,Terminal,Globe,Image,Plug} from 'lucide-react';
import {ConnectionLogo} from './ConnectionLogo';
import {fetchArtifactBlob} from './artifact-fetch';
export function AgentActivity({events=[]}){
 const groups=activityGroups(events);if(!groups.length)return null;
 return <div className="beautiful-ui agent-activity"><ToolChips live diffs={[]} diffLines={{}} labels={{header:groups.some(g=>g.view.working)?'Working':'Activity'}} steps={groups.map(({view,events:group},i)=>{
  const event=group[0],kind=view.detail;
  const Icon=/list_files/.test(kind)?FolderSearch:/write|fileChange/.test(kind+event.type)?FilePenLine:/command|run_command/.test(kind+event.type)?Terminal:/image/i.test(kind+event.type)?Image:/Chrome|web|CourseWorks|Gradescope/.test(view.label)?Globe:/read_file/.test(kind)?FileText:Plug;
  return {id:event.id||`activity-${i}`,icon:'read',iconNode:view.service?<ConnectionLogo id={view.service} size={24}/>:<Icon size={22} strokeWidth={1.7}/>,label:view.label+(group.length>1?` · ${group.length} calls`:''),chip:view.status,working:view.working,mono:false,detailMono:true,detail:group.flatMap((entry,index)=>[{text:`Call ${index+1}`},...activityDetail(entry).map(text=>({text}))])};
 })}/></div>;
}
export function AgentApproval({request,jobId}){
 const [attempt,setAttempt]=useState(0);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[content,setContent]=useState('{}');const p=request.params||{};
 const approvalView=toolPresentation({type:'mcpToolCall',label:p._meta?.connector_name?.toLowerCase()+'.'+p._meta?.tool_title});
 const needsFields=p.requestedSchema&&Object.keys(p.requestedSchema.properties||{}).length>0;
 const inputs=request.method.includes('requestUserInput'),questions=inputs?(p.questions||[]).map(q=>({q:q.question,type:'radio',options:(q.options||[]).map(o=>o.label)})):[{q:p.reason||(p._meta?.tool_title?approvalView.label+'?':p.message)||'Allow this action?',type:'radio',options:['Allow once','Decline']}];
 const reply=async body=>{if(busy)return;setBusy(true);setError('');try{await modelRequest(`jobs/${jobId}/approvals/${request.id}`,body);}catch(e){setError(e.message);setBusy(false);setAttempt(n=>n+1);}};
 return <section className="agent-approval beautiful-ui"><div className="approval-service-row">{approvalView.service&&<ConnectionLogo id={approvalView.service} size={24}/>}<h3>{inputs?'Your input is needed':p._meta?.connector_name||'Permission requested'}</h3></div>{p.command&&<pre>{p.command}</pre>}{p.cwd&&<small>Working folder: {p.cwd}</small>}{p.permissions&&<pre>{JSON.stringify(p.permissions,null,2)}</pre>}{p.changes&&<pre>{JSON.stringify(p.changes,null,2)}</pre>}{p.grantRoot&&<pre>{p.grantRoot}</pre>}{p.networkApprovalContext&&<pre>{JSON.stringify(p.networkApprovalContext,null,2)}</pre>}{needsFields&&<label>Requested information<pre>{JSON.stringify(p.requestedSchema,null,2)}</pre><textarea aria-label="Tool response JSON" value={content} onChange={e=>setContent(e.target.value)}/></label>}{p.url&&/^https?:\/\//.test(p.url)&&<a href={p.url} target="_blank" rel="noopener noreferrer">Open the connection request</a>}<details className="approval-request-details"><summary>Request details</summary><pre>{JSON.stringify(p,null,2)}</pre></details><div inert={busy||undefined}><ApprovalCard key={attempt} variant={!inputs&&!needsFields?"decision":undefined} manual resettable={false} questions={questions} labels={{skip:'Decline',continue:'Continue',send:inputs?'Send answer':'Confirm',sentMessage:'Response sent'}} onSkipped={()=>reply({action:'deny'})} onSubmitted={(answers,custom)=>{try{if(inputs)reply({action:'approve',answers:Object.fromEntries(p.questions.map((q,i)=>[q.id,custom[i]||(q.options||[])[answers[i]?.[0]]?.label||'']))});else reply({action:answers[0]?.[0]===0?'approve':'deny',...(p.requestedSchema?{content:needsFields?JSON.parse(content):{}}:{})});}catch{setError('Enter valid JSON for the requested information.');setAttempt(n=>n+1);}}}/></div>{error&&<p role="alert">{error}</p>}</section>;
}
function Artifact({jobId,file}){
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let active=true,objectUrl;const controller=new AbortController();setUrl('');setError('');setLoading(true);
  fetchArtifactBlob(`/api/model/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(file.id)}`,{signal:controller.signal}).then(blob=>{
   if(!active)return;const ext=file.name.split('.').pop().toLowerCase(),type=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif'})[ext];
   objectUrl=URL.createObjectURL(type?new Blob([blob],{type}):blob);setUrl(objectUrl);
  }).catch(e=>{if(active&&e.name!=='AbortError')setError(e.message);}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[jobId,file.id,file.name,attempt]);
 return <div className="agent-artifact">{file.image&&url&&<img src={url} alt={file.name}/>}<a href={url||undefined} aria-disabled={!url||undefined} download={file.name.split('/').pop()}>{file.name}</a><small role={error?'alert':undefined}>{loading?'Preparing download…':error||`${Math.max(1,Math.round(file.size/1024))} KB`}</small>{error&&<button type="button" className="artifact-retry" onClick={()=>setAttempt(value=>value+1)}>Retry download</button>}</div>;
}
export function AgentArtifacts({agent}){return agent?.artifacts?.length?<div className="agent-artifacts">{agent.artifacts.map(file=><Artifact key={file.id} jobId={agent.jobId} file={file}/>)}</div>:null;}
