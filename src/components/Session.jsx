import {useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Monitor,Mic,Layers,Square,Play,Download,Plus,NotebookPen} from 'lucide-react';
import {useWorkspace} from '../store';
import {Modal} from './Modal';
import {ThinkingOrb} from './ScreenTransition';
import {startCapture} from '../session-capture';
import {beginRecording,appendChunk,listRecordings,recordingBlob} from '../recording-store';
import './Session.css';
const modes=[['screen','Screen',Monitor],['audio','Microphone',Mic],['both','Both',Layers]];
const ownerKey='offload.capture-owner';
function tabOwner(){let id=sessionStorage.getItem(ownerKey);if(!id){id=crypto.randomUUID();sessionStorage.setItem(ownerKey,id);}return id;}
export default function Session({open,onClose}){
 const navigate=useNavigate();
 const {state,act}=useWorkspace(),current=state.sessions.find(s=>s.status==='active');
 const [mode,setMode]=useState('screen'),[starting,setStarting]=useState(false),[recording,setRecording]=useState(false),[error,setError]=useState(''),[text,setText]=useState(''),[recordings,setRecordings]=useState([]),[saving,setSaving]=useState(false),[name,setName]=useState(''),[savingNote,setSavingNote]=useState(false);
 const abort=useRef(null),capture=useRef(null),currentRef=useRef(current),actRef=useRef(act),owner=useRef(tabOwner()),busy=useRef(false),mounted=useRef(true);currentRef.current=current;actRef.current=act;
 const refresh=()=>listRecordings().then(rows=>{if(mounted.current)setRecordings(rows)}).catch(()=>{});
 const finish=async id=>{if(currentRef.current?.id===id)await actRef.current('session-end',{id});};
 useEffect(()=>{mounted.current=true;const unload=()=>{abort.current?.abort();void capture.current?.stop();};window.addEventListener('pagehide',unload);return()=>{mounted.current=false;abort.current?.abort();window.removeEventListener('pagehide',unload);void capture.current?.stop();};},[]);
 useEffect(()=>{if(open)void refresh();},[open]);
 useEffect(()=>{
  if(capture.current&&!current){void capture.current.stop();capture.current=null;}
  // A reloaded tab cannot recover browser media permissions or an old MediaRecorder.
  if(current?.captureOwner===owner.current&&!capture.current&&!busy.current)void finish(current.id).catch(()=>{});
 },[current?.id,current?.captureOwner]);
 const start=async()=>{
  if(busy.current||current)return;busy.current=true;setStarting(true);setError('');const id=crypto.randomUUID();let index=0;abort.current=new AbortController();
  try{
   // Acquire display permission first, in the user's click gesture.
   const handle=await startCapture({mode,signal:abort.current.signal,onChunk:blob=>appendChunk(id,index++,blob),onError:e=>setError(e.name==='QuotaExceededError'?'Storage is full. Recording stopped; saved footage is still available.':e.message),onStopped:()=>{capture.current=null;setRecording(false);void finish(id).catch(e=>setError(e.message));void refresh();}});
   capture.current=handle;
   await beginRecording(id,mode);
   await act('session-start',{id,mode,captureOwner:owner.current,name:name.trim()||(mode==='both'?'Screen and microphone':mode==='audio'?'Microphone':'Screen')});
   if(!handle.active){await act('session-end',{id});throw Error('Sharing stopped before the session started.');}
   setRecording(true);
  }catch(e){await capture.current?.stop();capture.current=null;setError(e.name==='NotAllowedError'?'Permission was not granted. Nothing is recording.':e.message);}
  finally{busy.current=false;setStarting(false);}
 };
 const stop=async()=>{setSaving(true);try{if(capture.current)await capture.current.stop();if(current)await finish(current.id);await refresh();if(current?.mode==='notes'&&current.notes?.length){onClose();navigate('/app/history');}}catch(e){setError(e.message);}finally{setRecording(false);setSaving(false);}};
 const download=async record=>{try{const blob=await recordingBlob(record.id),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`offload-${record.mode}-${new Date(record.at).toISOString().replaceAll(':','-')}.${blob.type.includes('mp4')?'mp4':'webm'}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){setError(e.message);}};
 if(!open)return null;
 return <Modal title={current?'Your work session':'Start a work session'} onClose={onClose} wide>
  <div className="offload-session">
  {!current?<><p>Choose a screen, microphone, or both.</p><label className="session-name">Session name <span>(optional)</span><input value={name} maxLength={80} disabled={starting} onChange={e=>setName(e.target.value)} placeholder="e.g. Product planning"/></label><div className="session-modes">{modes.map(([id,label,Icon])=><button type="button" key={id} aria-pressed={mode===id} className={mode===id?'selected':''} disabled={starting} onClick={()=>setMode(id)}><Icon size={18}/>{label}</button>)}</div>
   {mode==='both'&&<p className="small-copy">Record your chosen screen and microphone together until you stop.</p>}
   <button className="button" disabled={starting} onClick={start}>{starting?'Starting…':'Start session'}<Play size={16}/></button></>:<>
   <div className="session-live">{current.mode==='notes'?<div className="session-notes-icon"><NotebookPen size={25}/></div>:<ThinkingOrb state="listening" size={64}/>}<div><h3>{current.name}</h3><p>{recording?'Recording · You can close this panel.':current.mode==='notes'?'Notes only · No recording':'Recording is managed in its original tab.'}</p></div><button className="button secondary small" disabled={saving} onClick={stop}><Square size={14}/>{saving?'Saving…':'Stop session'}</button></div>
   <label>Add a decision or detail<textarea maxLength={4000} value={text} onChange={e=>setText(e.target.value)} placeholder="What should Offload remember?"/></label><button className="button small" disabled={!text.trim()||savingNote} onClick={async()=>{setSavingNote(true);try{await act('session-note',{id:current.id,text});setText('');}catch(e){setError(e.message);}finally{setSavingNote(false);}}}>{savingNote?'Saving…':'Save note'}<Plus size={15}/></button><div className="session-notes">{current.notes.map((note,i)=><p key={i}>{note}</p>)}</div>
  </>}
  {error&&<p role="alert" className="error-text">{error}</p>}
  {recordings.filter(r=>r.id!==current?.id).length>0&&<div className="recording-result"><h3>Recordings</h3>{recordings.filter(r=>r.id!==current?.id).slice(0,5).map(r=><button key={r.id} className="text-button" onClick={()=>download(r)}><Download size={15}/>{modes.find(m=>m[0]===r.mode)?.[1]} · {new Date(r.at).toLocaleString()}</button>)}</div>}
  </div>
 </Modal>;
}
