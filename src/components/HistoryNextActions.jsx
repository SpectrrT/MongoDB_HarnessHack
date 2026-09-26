import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {ArrowRight,CalendarDays,FileText,Plus,RefreshCw,Repeat2} from 'lucide-react';
import {ConnectionLogo} from './ConnectionLogo';
import './HistoryNextActions.css';

const kindLabel=kind=>({'pre-meeting':'Meeting prep','post-meeting':'Follow-up','repeat-work':'Repeated work','meeting-notes-needed':'Meeting notes'}[kind]||'Next action');
const timestamp=value=>{const date=new Date(value);return Number.isFinite(+date)?date.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';};
async function api(path='',body){
 const response=await fetch('/api/activity/next-actions'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Offload-Client':'local'},body:JSON.stringify(body)});
 const value=await response.json().catch(()=>null);
 if(!response.ok||!value)throw Error(value?.error||'Next actions are unavailable. Try again.');
 return value;
}
function SourceIcon({source}){
 const label=String(source||'').toLowerCase();
 const id=/github/.test(label)?'github':/mongo/.test(label)?'mongodb':/calendar/.test(label)?'calendar':/gmail|mail.google/.test(label)?'gmail':/slack/.test(label)?'slack':/docs.google|google docs|drive/.test(label)?'drive':null;
 return id?<ConnectionLogo id={id} size={17}/>:<FileText size={16} aria-hidden="true"/>;
}

export default function HistoryNextActions({refreshKey}){
 const navigate=useNavigate();
 const [actions,setActions]=useState([]),[meetings,setMeetings]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busyId,setBusyId]=useState('');
 const [title,setTitle]=useState(''),[startsAt,setStartsAt]=useState(''),[notes,setNotes]=useState('');
 const alive=useRef(true),sequence=useRef(0),lastRefresh=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;sequence.current++;};},[]);
 const load=useCallback(async(quiet=false)=>{
  const current=++sequence.current;lastRefresh.current=Date.now();if(!quiet)setLoading(true);
  try{const value=await api();if(alive.current&&current===sequence.current){setActions(value.actions||[]);setMeetings(value.meetings||[]);setError(value.historyError||'');}}
  catch(error){if(alive.current&&current===sequence.current)setError(error.message);}
  finally{if(alive.current&&current===sequence.current)setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{if(Date.now()-lastRefresh.current>=30000)void load(true);},[refreshKey,load]);
 const decide=async(action,decision)=>{
  if(busyId)return;setBusyId(action.id);setError('');setNotice('');
  try{
   const value=await api('/'+encodeURIComponent(action.id)+'/decision',{decision});
   if(!alive.current)return;
   if(decision==='prepare'&&value.prompt){navigate('/app/chat?draft='+encodeURIComponent(value.prompt));return;}
   setNotice(value.alreadyDecided?'This action was already handled.':decision==='snooze'?'Saved for later.':decision==='dismiss'?'Suggestion dismissed.':'No draft is ready for this action.');
   await load(true);
  }catch(error){if(alive.current)setError(error.message);}
  finally{if(alive.current)setBusyId('');}
 };
 const addMeeting=async event=>{
  event.preventDefault();if(busyId)return;const date=new Date(startsAt);
  if(!title.trim()||!Number.isFinite(+date)){setError('Enter a meeting title and start time.');return;}
  setBusyId('meeting');setError('');setNotice('');
  try{await api('/meetings',{title:title.trim(),startsAt:date.toISOString(),...(notes.trim()?{notes:notes.trim()}:{})});if(!alive.current)return;setTitle('');setStartsAt('');setNotes('');setNotice('Meeting details saved. Any suggested preparation will cite these details.');await load(true);}
  catch(error){if(alive.current)setError(error.message);}
  finally{if(alive.current)setBusyId('');}
 };
 return <section className="hx-section hx-next-actions" aria-labelledby="history-next-title" aria-busy={loading}>
  <div className="hx-next-heading"><div><h2 id="history-next-title">What comes next</h2><p>Suggested from recorded history and meeting details you add. Nothing starts automatically.</p></div><button type="button" className="text-button" disabled={loading||!!busyId} onClick={()=>load()}><RefreshCw size={14} aria-hidden="true"/>Refresh</button></div>
  {error&&<p className="hx-error" role="alert">{error}</p>}
  {notice&&<p className="hx-next-notice" role="status">{notice}</p>}
  {loading&&!actions.length&&<p className="hx-note" role="status">Checking the evidence in your history…</p>}
  {!loading&&!error&&!actions.length&&<p className="hx-next-empty">No supported next actions yet. More history can reveal meeting preparation, follow-ups, and repeated work.</p>}
  <div className="hx-next-grid">{actions.map(action=>{
   const evidence=action.evidence||[];
   const Icon=/meeting/.test(action.kind)?CalendarDays:/weekly|repeat/.test(action.kind)?Repeat2:FileText;
   return <article className="hx-next-card" key={action.id}>
    <div className="hx-next-kind"><Icon size={17} strokeWidth={1.6} aria-hidden="true"/><span>{kindLabel(action.kind)}</span>{action.sample===true&&<span className="hx-tag">Demo history</span>}</div>
    <h3>{action.title}</h3><p>{action.reason}</p>{(Array.isArray(action.needsInput)?action.needsInput.length>0:!!action.needsInput)&&<p className="hx-next-input">Needs your details before the draft is ready to send.</p>}
    <details className="hx-next-evidence"><summary>Why this? <span>{evidence.length} source{evidence.length===1?'':'s'}</span></summary><ol>{evidence.map((source,index)=><li key={source.id||index}><div className="hx-next-source"><SourceIcon source={source.source}/><strong>{source.source||'History entry'}</strong></div>{source.timestamp&&<time dateTime={source.timestamp}>{timestamp(source.timestamp)}</time>}{source.text&&<p>{source.text}</p>}</li>)}</ol></details>
    <div className="hx-next-actions-row"><button type="button" className="button small" disabled={!!busyId||!evidence.length} onClick={()=>decide(action,'prepare')}>{busyId===action.id?'Updating…':'Prepare draft'}<ArrowRight size={14} aria-hidden="true"/></button><button type="button" className="text-button" disabled={!!busyId} onClick={()=>decide(action,'snooze')}>Later</button><button type="button" className="text-button" disabled={!!busyId} onClick={()=>decide(action,'dismiss')}>Dismiss</button>{action.kind==='repeat-work'&&<Link className="hx-next-routine" to={'/app/tasks?fromHistory='+encodeURIComponent(action.id)}>Set up routine <ArrowRight size={12} aria-hidden="true"/></Link>}</div>
   </article>;
  })}</div>
  <details className="hx-meeting-entry"><summary><Plus size={15} aria-hidden="true"/>Add meeting details</summary><p>Add a real meeting to prepare for. Times use {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p><form onSubmit={addMeeting}><div className="hx-meeting-fields"><label>Meeting title<input required maxLength={160} value={title} onChange={event=>setTitle(event.target.value)} placeholder="Engineering review"/></label><label>Start time<input required type="datetime-local" value={startsAt} onChange={event=>setStartsAt(event.target.value)}/></label></div><label>Agenda or notes <span>Optional</span><textarea rows={3} maxLength={1800} value={notes} onChange={event=>setNotes(event.target.value)} placeholder="What needs to be prepared or decided?"/></label><button className="button small" disabled={!!busyId}>{busyId==='meeting'?'Saving…':'Save meeting'}</button></form>{meetings.length>0&&<ul className="hx-saved-meetings">{meetings.map(meeting=><li key={meeting.id||meeting._id||meeting.startsAt}><CalendarDays size={15} aria-hidden="true"/><span>{meeting.title}</span><time>{timestamp(meeting.startsAt)}</time></li>)}</ul>}</details>
 </section>;
}
