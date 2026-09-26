import {useEffect,useState} from 'react';import {useNavigate,Link} from 'react-router-dom';
import {Plus,CalendarClock,Pause,Play,ArrowRight} from 'lucide-react';
import {useWorkspace} from '../store';import {modelRequest} from '../model-api';import {Modal} from './Modal';
import {useModelStatus} from './ModelConnection';import {useOpenRouterStatus} from './OpenRouterConnection';
import {AgentActivity,AgentApproval,AgentArtifacts} from './AgentActivity';import StreamingText from '../vendor/beautiful/StreamingText';
import '../scheduled-tasks.css';
const isoDate=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const when=ms=>new Date(ms).toLocaleString([],{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
// Spell out the weekday, so a weekly task that starts on the wrong day is visible before planning.
const firstRun=(date,time,repeat)=>{const start=new Date(date+'T'+time);if(!Number.isFinite(start.getTime()))return '';return 'First run '+start.toLocaleString([],{weekday:'long',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'})+({daily:', then every day',weekly:', then every '+start.toLocaleDateString([],{weekday:'long'}),monthly:', then monthly'}[repeat]||'')+'. ';};
export default function ScheduledTasks(){
 const {state,act}=useWorkspace(),navigate=useNavigate(),codex=useModelStatus(),openrouter=useOpenRouterStatus();
 const [tasks,setTasks]=useState([]),[open,setOpen]=useState(false),[brief,setBrief]=useState(''),[date,setDate]=useState(''),[time,setTime]=useState('09:00'),[repeat,setRepeat]=useState('weekly'),[error,setError]=useState(''),[loadError,setLoadError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState(null),[job,setJob]=useState(null),[editing,setEditing]=useState(null);
 const refresh=()=>modelRequest('tasks').then(r=>setTasks(r.tasks));
 useEffect(()=>{let live=true;const read=async()=>{try{const r=await modelRequest('tasks');if(live){setTasks(r.tasks);setLoadError('');}}catch(e){if(live)setLoadError(e.message);}};void read();const timer=setInterval(read,3000);return()=>{live=false;clearInterval(timer);};},[]);
 useEffect(()=>{if(!selected)return;let live=true;const read=async()=>{try{const r=await modelRequest('jobs/'+selected);if(live)setJob(r);}catch(e){if(live)setError(e.message);}};void read();const timer=setInterval(read,1500);return()=>{live=false;clearInterval(timer);};},[selected]);
 const provider=state.settings.modelProvider||'codex',connection=provider==='codex'?codex.status:openrouter.status;
 const model=provider==='codex'?(state.settings.modelSelection||connection?.models[0]?.id):state.settings.openrouterModel;
 const modelInfo=connection?.models.find(m=>m.id===model),effort=modelInfo?.efforts?.includes('high')?'high':modelInfo?.defaultEffort||'low';
 const create=async()=>{setBusy(true);setError('');try{
  if(!connection?.connected||!model)throw Error('Connect your model in Connections first.');
  const planningId=crypto.randomUUID(),nextAt=new Date(date+'T'+time).getTime();if(!Number.isFinite(nextAt)||nextAt<Date.now())throw Error('Choose a future start time.');
  const task=await modelRequest('tasks',{title:brief.trim().split('\n')[0].slice(0,100),brief:brief.trim(),repeat,nextAt,planningId});await refresh();
  const text=`Plan this ${repeat==='once'?'scheduled':repeat+' recurring'} task, first run ${when(nextAt)}: ${brief.trim()}\nThink carefully about the information, connected tools, scope, and approval boundaries needed. Do not execute the task yet. Ask the user the essential clarification questions, then refine the plan as they answer. Use the request-user-input tool if available. The user will activate the schedule from Tasks once planning is complete.`;
  const started=await modelRequest('jobs',{requestId:crypto.randomUUID(),conversationId:planningId,provider,model,effort,messages:[{role:'user',text}],notes:[]});
  await act('chat-start',{id:planningId,jobId:started.id,model,effort,text,displayText:brief.trim(),notes:[]});setOpen(false);navigate('/app/chat/'+planningId);
 }catch(e){setError(e.message);}finally{setBusy(false);}};
 const change=async(task,action)=>{setBusy(true);setError('');try{
  const conversation=state.conversations.find(c=>c.id===task.planningId);
  if(action==='activate'&&(!conversation?.messages.some(m=>m.role==='assistant')||conversation.pending))throw Error('Finish the planning conversation first.');
  await modelRequest('tasks/'+task.id,{action,...(action==='activate'?{context:{provider,model,effort,messages:conversation.messages.slice(-14).map(m=>({role:m.role,text:m.text.slice(0,20000)})),notes:[]}}:{})});await refresh();
 }catch(e){setError(e.message);}finally{setBusy(false);}};
 // Planning can settle on a different day or time, so the schedule stays editable after the task is saved.
 const edit=task=>{const d=new Date(task.nextAt||Date.now()+86400000);setDate(isoDate(d));setTime(String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'));setRepeat(task.repeat);setError('');setEditing(task);};
 const reschedule=async()=>{setBusy(true);setError('');try{
  const nextAt=new Date(date+'T'+time).getTime();if(!Number.isFinite(nextAt)||nextAt<Date.now())throw Error('Choose a future start time.');
  await modelRequest('tasks/'+editing.id,{action:'reschedule',nextAt,repeat});setEditing(null);await refresh();
 }catch(e){setError(e.message);}finally{setBusy(false);}};
 const fields=<div className="scheduled-fields"><label>Start date<input aria-label="Start date" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Time<input aria-label="Start time" type="time" value={time} onChange={e=>setTime(e.target.value)}/></label><label>Repeat<select aria-label="Repeat" value={repeat} onChange={e=>setRepeat(e.target.value)}>{['once','daily','weekly','monthly'].map(value=><option key={value} value={value}>{value[0].toUpperCase()+value.slice(1)}</option>)}</select></label></div>;
 return <section className="scheduled-tasks">
  <div className="scheduled-heading"><h2>Scheduled tasks</h2><button className="button small" onClick={()=>{setDate(isoDate(new Date(Date.now()+86400000)));setOpen(true);}}><Plus size={16}/>Add task</button></div>
  {(error||loadError)&&<p className="error-text" role="alert">{error||loadError}</p>}
  {tasks.map(task=><article className="scheduled-row" key={task.id}><CalendarClock size={21}/><div><h3>{task.title}</h3><p>{task.repeat==='once'?'Once':task.repeat[0].toUpperCase()+task.repeat.slice(1)}{task.nextAt?' · '+when(task.nextAt):''} · {task.jobId?'Running':task.status==='paused'?'Paused':task.status==='finished'?'Finished':'Scheduled'}</p>{task.error&&<p className="error-text">{task.error}</p>}<div className="scheduled-actions"><Link to={'/app/chat/'+task.planningId}>Plan <ArrowRight size={13}/></Link>{(task.jobId||task.history?.[0])&&<button onClick={()=>{setJob(null);setSelected(task.jobId||task.history[0].id);}}>View latest run</button>}<button disabled={busy} onClick={()=>change(task,task.status==='scheduled'?'pause':'activate')}>{task.status==='scheduled'?<Pause size={13}/>:<Play size={13}/>} {task.status==='scheduled'?'Pause':'Activate'}</button>{!task.jobId&&<button disabled={busy} onClick={()=>edit(task)}>Edit schedule</button>}</div></div></article>)}
  {!tasks.length&&<p className="muted">Choose a task and when it should run.</p>}
  {open&&<Modal title="Add a task" onClose={()=>setOpen(false)}><label className="scheduled-label">Task<textarea aria-label="Task description" value={brief} onChange={e=>setBrief(e.target.value)} placeholder="Track query-plan regressions and prepare a tested fix…" maxLength={4000}/></label>{fields}<p className="small-copy">{firstRun(date,time,repeat)}{Intl.DateTimeFormat().resolvedOptions().timeZone}. Your agent will ask what it needs before you activate the schedule. Offload must be running for scheduled tasks.</p>{error&&<p role="alert" className="error-text">{error}</p>}<button className="button" disabled={busy||!brief.trim()||!date||!time} onClick={create}>{busy?'Starting…':'Plan task'}<ArrowRight size={16}/></button></Modal>}
  {editing&&<Modal title="Edit schedule" onClose={()=>setEditing(null)}><p className="small-copy">{editing.title}</p>{fields}<p className="small-copy">{firstRun(date,time,repeat)}{Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>{error&&<p role="alert" className="error-text">{error}</p>}<button className="button" disabled={busy||!date||!time} onClick={reschedule}>{busy?'Saving…':'Save schedule'}<ArrowRight size={16}/></button></Modal>}
  {selected&&<Modal wide title="Task run" onClose={()=>setSelected(null)}>{job?<><AgentActivity events={job.events}/>{job.approvals?.map(request=><AgentApproval key={request.id} request={request} jobId={job.id}/>)}<div className="beautiful-ui"><StreamingText content={[{text:job.result?.text||job.stream||'Working…'}]} sources={[]} followUps={[]} labels={{sources:'',followUps:''}} loop={false} fill live/></div>{job.error&&<p className="error-text">{job.error}</p>}<AgentArtifacts agent={job.result?.agent}/></>:<p>Opening the run…</p>}</Modal>}
 </section>;
}
