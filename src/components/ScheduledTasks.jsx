import {useEffect,useState} from 'react';import {useNavigate,Link,useSearchParams} from 'react-router-dom';
import {Plus,CalendarClock,Pause,Play,ArrowRight} from 'lucide-react';
import {useWorkspace} from '../store';import {modelRequest} from '../model-api';import {Modal} from './Modal';
import {useModelStatus} from './ModelConnection';import {useOpenRouterStatus} from './OpenRouterConnection';
import {AgentActivity,AgentApproval,AgentArtifacts} from './AgentActivity';import StreamingText from '../vendor/beautiful/StreamingText';
import '../scheduled-tasks.css';
import {routineDraftFromAction} from '../../shared/activity-task-draft.js';
export default function ScheduledTasks(){
 const {state,act}=useWorkspace(),navigate=useNavigate(),codex=useModelStatus(),openrouter=useOpenRouterStatus();
 const [searchParams,setSearchParams]=useSearchParams(),historyAction=searchParams.get('fromHistory');
 const [tasks,setTasks]=useState([]),[open,setOpen]=useState(false),[brief,setBrief]=useState(''),[date,setDate]=useState(''),[time,setTime]=useState('09:00'),[repeat,setRepeat]=useState('weekly'),[error,setError]=useState(''),[loadError,setLoadError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState(null),[job,setJob]=useState(null);
 const refresh=()=>modelRequest('tasks').then(r=>setTasks(r.tasks));
 useEffect(()=>{let live=true;const read=async()=>{try{const r=await modelRequest('tasks');if(live){setTasks(r.tasks);setLoadError('');}}catch(e){if(live)setLoadError(e.message);}};void read();const timer=setInterval(read,3000);return()=>{live=false;clearInterval(timer);};},[]);
 useEffect(()=>{if(!selected)return;let live=true;const read=async()=>{try{const r=await modelRequest('jobs/'+selected);if(live)setJob(r);}catch(e){if(live)setError(e.message);}};void read();const timer=setInterval(read,1500);return()=>{live=false;clearInterval(timer);};},[selected]);
 useEffect(()=>{
  if(!historyAction)return;let live=true;
  const prefill=async()=>{try{
   if(!/^[a-f0-9]{64}$/.test(historyAction))throw Error('That history suggestion is not valid. Open History and choose it again.');
   const response=await fetch('/api/activity/next-actions'),data=await response.json();
   if(!response.ok)throw Error(data.error||'Could not load this suggestion.');
   const value=routineDraftFromAction(data.actions?.find(action=>action.id===historyAction));
   if(!value)throw Error('This suggestion changed or was handled. Open History to review the current evidence.');
   if(live){setBrief(value);setDate('');setTime('');setRepeat('weekly');setError('');setOpen(true);}
  }catch(error){if(live)setError(error.message);}finally{if(live)setSearchParams(params=>{const next=new URLSearchParams(params);next.delete('fromHistory');return next;},{replace:true});}};
  void prefill();return()=>{live=false;};
 },[historyAction,setSearchParams]);
 const provider=state.settings.modelProvider||'codex',connection=provider==='codex'?codex.status:openrouter.status;
 const model=provider==='codex'?(state.settings.modelSelection||connection?.models[0]?.id):state.settings.openrouterModel;
 const modelInfo=connection?.models.find(m=>m.id===model),effort=modelInfo?.efforts?.includes('high')?'high':modelInfo?.defaultEffort||'low';
 const create=async()=>{setBusy(true);setError('');try{
  if(!connection?.connected||!model)throw Error('Connect your model in Connections first.');
  const planningId=crypto.randomUUID(),nextAt=new Date(date+'T'+time).getTime();if(!Number.isFinite(nextAt)||nextAt<Date.now())throw Error('Choose a future start time.');
  const task=await modelRequest('tasks',{title:brief.trim().split('\n')[0].slice(0,100),brief:brief.trim(),repeat,nextAt,planningId});await refresh();
  const text=`Plan this ${repeat==='once'?'scheduled':repeat+' recurring'} task, first run ${new Date(nextAt).toLocaleString()}: ${brief.trim()}\nThink carefully about the information, connected tools, scope, and approval boundaries needed. Do not execute the task yet. Ask the user the essential clarification questions, then refine the plan as they answer. Use the request-user-input tool if available. The user will activate the schedule from Tasks once planning is complete.`;
  const started=await modelRequest('jobs',{requestId:crypto.randomUUID(),conversationId:planningId,provider,model,effort,messages:[{role:'user',text}],notes:[]});
  await act('chat-start',{id:planningId,jobId:started.id,model,effort,text,displayText:brief.trim(),notes:[]});setOpen(false);navigate('/app/chat/'+planningId);
 }catch(e){setError(e.message);}finally{setBusy(false);}};
 const change=async(task,action)=>{setBusy(true);setError('');try{
  const conversation=state.conversations.find(c=>c.id===task.planningId);
  if(action==='activate'&&(!conversation?.messages.some(m=>m.role==='assistant')||conversation.pending))throw Error('Finish the planning conversation first.');
  await modelRequest('tasks/'+task.id,{action,...(action==='activate'?{context:{provider,model,effort,messages:conversation.messages.slice(-14).map(m=>({role:m.role,text:m.text.slice(0,20000)})),notes:[]}}:{})});await refresh();
 }catch(e){setError(e.message);}finally{setBusy(false);}};
 return <section className="scheduled-tasks">
  <div className="scheduled-heading"><h2>Scheduled tasks</h2><button className="button small" onClick={()=>{const d=new Date(Date.now()+86400000);setDate(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));setOpen(true);}}><Plus size={16}/>Add task</button></div>
  {(error||loadError)&&<p className="error-text" role="alert">{error||loadError}</p>}
  {tasks.map(task=><article className="scheduled-row" key={task.id}><CalendarClock size={21}/><div><h3>{task.title}</h3><p>{task.repeat==='once'?'Once':task.repeat[0].toUpperCase()+task.repeat.slice(1)}{task.nextAt?' · '+new Date(task.nextAt).toLocaleString():''} · {task.jobId?'Running':task.status==='paused'?'Paused':task.status==='finished'?'Finished':'Scheduled'}</p>{task.error&&<p className="error-text">{task.error}</p>}<div className="scheduled-actions"><Link to={'/app/chat/'+task.planningId}>Plan <ArrowRight size={13}/></Link>{(task.jobId||task.history?.[0])&&<button onClick={()=>{setJob(null);setSelected(task.jobId||task.history[0].id);}}>View latest run</button>}<button disabled={busy} onClick={()=>change(task,task.status==='scheduled'?'pause':'activate')}>{task.status==='scheduled'?<Pause size={13}/>:<Play size={13}/>} {task.status==='scheduled'?'Pause':'Activate'}</button></div></div></article>)}
  {!tasks.length&&<p className="muted">Choose a task and when it should run.</p>}
  {open&&<Modal title="Add a task" onClose={()=>setOpen(false)}><label className="scheduled-label">Task<textarea aria-label="Task description" value={brief} onChange={e=>setBrief(e.target.value)} placeholder="Track query-plan regressions and prepare a tested fix…" maxLength={4000}/></label><div className="scheduled-fields"><label>Start date<input aria-label="Start date" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Time<input aria-label="Start time" type="time" value={time} onChange={e=>setTime(e.target.value)}/></label><label>Repeat<select aria-label="Repeat" value={repeat} onChange={e=>setRepeat(e.target.value)}>{['once','daily','weekly','monthly'].map(value=><option key={value} value={value}>{value[0].toUpperCase()+value.slice(1)}</option>)}</select></label></div><p className="small-copy">{Intl.DateTimeFormat().resolvedOptions().timeZone}. Choose when this should run. Repeated visits do not determine its schedule. Your agent will ask what it needs before you activate it. Offload must be running for scheduled tasks.</p>{error&&<p role="alert" className="error-text">{error}</p>}<button className="button" disabled={busy||!brief.trim()||!date||!time} onClick={create}>{busy?'Starting…':'Plan task'}<ArrowRight size={16}/></button></Modal>}
  {selected&&<Modal wide title="Task run" onClose={()=>setSelected(null)}>{job?<><AgentActivity events={job.events}/>{job.approvals?.map(request=><AgentApproval key={request.id} request={request} jobId={job.id}/>)}<div className="beautiful-ui"><StreamingText content={[{text:job.result?.text||job.stream||'Working…'}]} sources={[]} followUps={[]} labels={{sources:'',followUps:''}} loop={false} fill live/></div>{job.error&&<p className="error-text">{job.error}</p>}<AgentArtifacts agent={job.result?.agent}/></>:<p>Opening the run…</p>}</Modal>}
 </section>;
}
