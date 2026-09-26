import { useState,useEffect,useRef } from 'react';
import { useNavigate,useLocation } from 'react-router-dom';
import { Plus,Square } from 'lucide-react';
import PromptBar from '../vendor/beautiful/PromptBar';
import StreamingText from '../vendor/beautiful/StreamingText';
import LoadingState from '../vendor/beautiful/LoadingState';
import ContextCards from '../vendor/beautiful/ContextCards';
import { useWorkspace } from '../store';
import { retrieveNotes } from '../../shared/retrieval';
import { modelRequest } from '../model-api';
import ModelConnection,{useModelStatus} from '../components/ModelConnection';
import '../live-chat.css';
import ReasoningControl,{effortLabel} from '../components/ReasoningControl';
export default function LiveChat({id}) {
  const {state,act}=useWorkspace(), navigate=useNavigate(),location=useLocation();
  const {status,error:statusError}=useModelStatus();
  const [sending,setSending]=useState(false),[error,setError]=useState(''),[prefill,setPrefill]=useState('');
  const c=state.conversations.find(c=>c.id===id), pending=c?.pending;
  const chosen=state.settings.modelSelection || 'gpt-5.5';
  const selectedModel=status?.models.find(m=>m.id===chosen);
  const effort=selectedModel?.efforts.includes(state.settings.reasoningEffort)?state.settings.reasoningEffort:'low';
  const ready=status?.connected && state.settings.modelConnected;
  const end=useRef();
  useEffect(()=>{const text=new URLSearchParams(location.search).get('prompt');if(text){setPrefill(text);navigate('/app/chat',{replace:true});}},[]);
  useEffect(()=>{end.current?.scrollIntoView({behavior:'smooth'});},[c?.messages.length]);
  useEffect(()=>{
    if(!pending)return;let alive=true,timer;
    const poll=async()=>{try{const job=await modelRequest('jobs/'+pending.id);if(!alive)return;if(job.status==='running'){timer=setTimeout(poll,900);return;}await act('chat-finish',{id,jobId:pending.id,...(job.status==='completed'?{text:job.result.text,usage:job.result.usage}:{error:job.error || 'You stopped this reply.'})});}catch(e){if(alive)await act('chat-finish',{id,jobId:pending.id,error:e.message}).catch(()=>{});}};
    poll();return()=>{alive=false;clearTimeout(timer);};
  },[pending?.id,id,act]);
  const send=async text=>{if(sending||pending||!ready)return;setSending(true);setError('');try{
    const cid=id||crypto.randomUUID(),notes=retrieveNotes(text,state.memory);
    const messages=[...(c?.messages||[]).slice(-5).map(m=>({role:m.role,text:m.text.slice(0,2400)})),{role:'user',text:text.slice(0,4000)}];
    const job=await modelRequest('jobs',{requestId:crypto.randomUUID(),model:chosen,effort,messages,notes});
    await act('chat-start',{id:cid,jobId:job.id,model:chosen,effort,text,notes});navigate('/app/chat/'+cid,{replace:true});setPrefill('');
  }catch(e){setError(e.message);}finally{setSending(false);}};
  useEffect(()=>{if(prefill && ready && !sending && !pending){const text=prefill;setPrefill('');send(text);}},[prefill,ready]);
  return <div className={"chat-page live-chat " + (!c?.messages.length ? "empty-thread" : "")}>
    {!ready && <ModelConnection/>}
    {!c?.messages.length ? <div className="chat-empty"><h1><span>Hello {state.profile.name}</span><br/>What can I help you with?</h1>{prefill && <button className="button secondary" disabled={!ready||sending} onClick={()=>send(prefill)}>Use this brief: {prefill}</button>}</div> : <div className="messages">
      {c.messages.map(m=><div key={m.id} className={'message '+m.role}>
        {m.role==='assistant' ? <><div className="beautiful-ui"><StreamingText content={[{text:m.text}]} sources={[]} followUps={[]} labels={{sources:'',followUps:''}} loop={false} fill live/></div>{m.notes?.length>0 && <details className="retrieved-notes"><summary>{m.notes.length} saved notes used</summary>{m.notes.map(n=><ContextCards key={n.id} labels={{header:"Retrieved context",count:1}} chunks={[{title:n.source,chars:`${n.text.length} characters`,body:n.text,source:n.source,badge:"TXT",tone:"bg-ink"}]}/>)}</details>}{m.usage && <div className="response-receipt"><small className="token-receipt">{m.usage.input_tokens?.toLocaleString()} input tokens · {m.usage.output_tokens?.toLocaleString()} output tokens</small><small>{m.model} · {effortLabel(m.effort)}</small></div>}</> : <><p>{m.text}</p><button className="text-button" onClick={()=>act('memory',{text:m.text,source:'Conversation'}).catch(()=>{})}><Plus size={13}/>Save as memory</button></>}
      </div>)}
      {(pending||sending)&&<div className="beautiful-ui model-working"><LoadingState label="Working on your reply" variant="Dots"/>{pending && <button className="text-button" onClick={()=>modelRequest('jobs/'+pending.id+'/stop',{}).catch(e=>setError(e.message))}><Square size={13}/>Stop</button>}</div>}
      <div ref={end}/>
    </div>}
    {(error||c?.error)&&<p className="chat-error" role="alert">{error||c.error}</p>}
    <div className="chat-composer beautiful-ui"><PromptBar controls={<ReasoningControl value={effort} supported={selectedModel?.efforts||[]} disabled={!ready||sending||!!pending} onChange={reasoningEffort=>act('settings',{reasoningEffort}).catch(()=>{})}/>} local={false} tall placeholder="Ask Offload…" disabled={!ready||sending||!!pending} models={(status?.models||[{id:chosen,name:chosen}]).map(m=>({key:m.id,name:m.name}))} modelValue={chosen} onModelChange={modelSelection=>act('settings',{modelSelection}).catch(()=>{})} onSend={send}/></div>
    {!c?.messages.length && <div className="chat-starters">{['What can Offload do?', 'Help me plan an overnight task', 'Summarize the decisions in my saved notes', 'Draft my next project update'].map(t=><button key={t} disabled={!ready||sending} onClick={()=>send(t)}><Plus size={14}/>{t}</button>)}</div>}
  </div>;
}
