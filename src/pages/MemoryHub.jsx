import {useEffect,useRef,useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {ArrowRight,Brain,Moon,Plus,Search,Trash2} from 'lucide-react';
import {useWorkspace} from '../store';
import {modelRequest} from '../model-api';
import SleepTasks from '../components/SleepTasks';
import Sleep from './Sleep';
import Rem from './Rem';
import ContextMemory from '../components/ContextMemory';
import PersonalSuggestions from '../components/PersonalSuggestions';
import {SLEEP_EXAMPLE_TITLE,SLEEP_EXAMPLE_PROMPT} from '../../shared/sleep-example';
import '../memory.css';
import '../slow-mode.css';

function Disclosure({title,description,children,defaultOpen=false}){
 const ref=useRef(null);
 const [opened,setOpened]=useState(defaultOpen),[expanded,setExpanded]=useState(defaultOpen);
 useEffect(()=>{if(defaultOpen){setOpened(true);setExpanded(true);const frame=requestAnimationFrame(()=>ref.current?.scrollIntoView({block:'start',behavior:'auto'}));return()=>cancelAnimationFrame(frame);}},[defaultOpen]);
 return <details ref={ref} className="memory-disclosure" open={expanded} onToggle={event=>{setExpanded(event.currentTarget.open);if(event.currentTarget.open)setOpened(true);}}>
  <summary><span><strong>{title}</strong><small>{description}</small></span><Plus size={16} aria-hidden="true"/></summary>
  {opened&&<div className="memory-disclosure-body">{children}</div>}
 </details>;
}

export default function MemoryHub(){
 const [params]=useSearchParams();
 const requested=params.get('tab'),tab=['sleep','rem'].includes(requested)?requested:'notes';
 const [learningVisited,setLearningVisited]=useState(tab==='rem');
 useEffect(()=>{if(tab==='rem')setLearningVisited(true);},[tab]);
 return <div className="memory-hub">
  <header className="memory-hub-heading"><div><h1>Memory</h1><p>Context to keep. Work to revisit. Lessons to review.</p></div><Brain size={23} strokeWidth={1.5} aria-hidden="true"/></header>
  <nav className="memory-hub-nav" aria-label="Memory views">
   {[['notes','Notes','/app/memory'],['sleep','Sleep','/app/memory?tab=sleep'],['rem','Learning','/app/memory?tab=rem']].map(([key,label,url])=><Link key={key} to={url} aria-current={tab===key?'page':undefined}>{label}</Link>)}
  </nav>
  <div hidden={tab!=='notes'}><Notes reviewOpen={tab==='notes'&&params.get('view')==='review'}/></div>
  <div hidden={tab!=='sleep'}><SleepingWork view={tab==='sleep'?params.get('view'):null}/></div>
  {(learningVisited||tab==='rem')&&<div hidden={tab!=='rem'} className="memory-learning"><Rem compact/></div>}
 </div>;
}

function Notes({reviewOpen}){
 const {state,act}=useWorkspace();
 const [text,setText]=useState(''),[query,setQuery]=useState(''),[saving,setSaving]=useState(false);
 const notes=state.memory.filter(note=>(note.text+' '+note.source).toLowerCase().includes(query.toLowerCase()));
 const save=async event=>{event.preventDefault();if(!text.trim()||saving)return;setSaving(true);try{await act('memory',{text});setText('');}catch{}finally{setSaving(false);}};
 return <section aria-label="Saved context">
  <form className="memory-hub-add" onSubmit={save}><textarea aria-label="New memory" placeholder="A decision, a preference, a detail for next time…" value={text} onChange={event=>setText(event.target.value)}/><button className="button small" disabled={saving||!text.trim()}>{saving?'Saving…':'Save memory'}<Plus size={15}/></button></form>
  <div className="memory-hub-list-heading"><h2>Saved notes <span>{state.memory.length}</span></h2><label className="memory-hub-search"><Search size={15} aria-hidden="true"/><input aria-label="Search memories" placeholder="Find a note" value={query} onChange={event=>setQuery(event.target.value)}/></label></div>
  <div className="memory-hub-notes memory-list">{notes.map(note=><article key={note.id}><div className="memory-hub-note-meta"><span>{note.source}{(note.example||note.sample)?' · Example':''}</span><time dateTime={new Date(note.createdAt).toISOString()}>{new Date(note.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time><button className="icon-button" aria-label="Delete memory" onClick={()=>act('delete-memory',{id:note.id}).catch(()=>{})}><Trash2 size={15}/></button></div><p>{note.text}</p></article>)}</div>
  {!notes.length&&<p className="memory-hub-empty">{query?'No matching notes. Try another search.':'Save a note to keep useful context for your next conversation.'}</p>}
  <Disclosure defaultOpen={reviewOpen} title="Review saved context" description="Combine duplicate notes, inspect routines, and manage daily review."><Sleep/></Disclosure>
 </section>;
}

function SleepingWork({view}){
 const {state,act,sleepStates,updateSleepState}=useWorkspace();
 const navigate=useNavigate();
 const [error,setError]=useState(''),[busy,setBusy]=useState('');
 const conversations=state.conversations.filter(conversation=>!conversation.listStatus&&(conversation.sleepEnabled||conversation.messages.some(message=>message.sleep)));
 const progress=conversation=>{
  const snapshot=sleepStates[conversation.id];
  if(snapshot?.connectionError&&conversation.sleepEnabled)return 'Reconnecting to Sleep';
  if(conversation.sleepEnabled&&['starting','running'].includes(snapshot?.state))return 'Working in the background';
  if(conversation.sleepEnabled&&snapshot?.state==='paused')return 'Paused. Review progress';
  if(conversation.messages.some(message=>message.sleep))return 'Review available';
  if(snapshot?.skipped)return 'No unfinished draft found';
  if(snapshot?.state==='done')return 'Saving review';
  return conversation.sleepEnabled?'Waiting for idle time':'Sleep off';
 };
 const tryExample=async()=>{setError('');try{const id=crypto.randomUUID();await act('prepare-conversation',{id,title:SLEEP_EXAMPLE_TITLE,text:SLEEP_EXAMPLE_PROMPT});navigate('/app/chat/'+id);}catch(error){setError(error.message);}};
 const wake=async conversation=>{setBusy(conversation.id);setError('');try{const snapshot=await modelRequest('sleep/'+conversation.id,{enabled:false});updateSleepState(conversation.id,snapshot);await act('conversation-sleep',{id:conversation.id,enabled:false,jobId:snapshot.jobId||sleepStates[conversation.id]?.jobId});navigate('/app/chat/'+conversation.id);}catch(error){setError(error.message);}finally{setBusy('');}};
 return <section aria-label="Sleeping work">
  <div className="memory-hub-section-heading"><h2>Conversations and reviews</h2><span>{conversations.length}</span></div>
  <p className="memory-hub-intro">Turn on Sleep in a conversation to prepare a local draft after 30 idle minutes, or choose Run Sleep now. Completed reviews stay here.</p>
  <p><button className="button secondary small" onClick={tryExample}>Try Sleep example</button></p>
  <p className="memory-hub-intro">Open a prepared query brief, turn on Sleep, then choose Run Sleep now. No database changes are made.</p>
  {error&&<p className="error-text" role="alert">{error}</p>}
  <div className="memory-hub-sleeping">{conversations.map(conversation=><article key={conversation.id}><Moon size={18} strokeWidth={1.5} aria-hidden="true"/><Link to={'/app/chat/'+conversation.id}><strong>{conversation.title}</strong><span>{progress(conversation)}</span></Link>{conversation.sleepEnabled&&<button className="text-button" disabled={!!busy} onClick={()=>wake(conversation)}>{busy===conversation.id?'Waking...':'Wake'}</button>}<Link to={'/app/chat/'+conversation.id} aria-label={'Open '+conversation.title}><ArrowRight size={16}/></Link></article>)}</div>
  {!conversations.length&&<p className="memory-hub-empty">Use the moon beside a chat’s model controls to leave it here.</p>}
  <Disclosure defaultOpen={view==='tasks'} title="Overnight queue" description="Assign bounded tasks, inspect checks, and download verified outputs."><SleepTasks/></Disclosure>
  <Disclosure defaultOpen={view==='context'} title="Context memory" description="Inspect retained exchanges, archived context, and decision costs."><ContextMemory/></Disclosure>
  <Disclosure defaultOpen={view==='suggestions'} title="Suggested next actions" description="Resume a project using source-backed suggestions from selected sessions."><PersonalSuggestions/></Disclosure>
  <Disclosure defaultOpen={view==='review'} title="Review history and routines" description="Run a local context review and inspect its evidence."><Sleep/></Disclosure>
 </section>;
}
