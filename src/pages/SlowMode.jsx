import {Link,useNavigate} from 'react-router-dom';
import {useState} from 'react';
import {Moon} from 'lucide-react';
import {modelRequest} from '../model-api';
import {useWorkspace} from '../store';
import ContextMemory from '../components/ContextMemory';
import SleepTasks from '../components/SleepTasks';
import PersonalSuggestions from '../components/PersonalSuggestions';
import '../slow-mode.css';

const tabs = [['conversations','Conversations'],['suggestions','Next actions'],['tasks','Overnight tasks'],['memory','Memory review'],['context','Context memory']];
export default function SlowMode({children}) {
  const {state,act}=useWorkspace(),navigate=useNavigate();
  const [tab,setTab]=useState('conversations'),[error,setError]=useState('');
  const sleeping=state.conversations.filter(c=>c.sleepEnabled);
  return <>
    <div className="slow-tabs">{tabs.map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</div>
    {tab==='conversations'?<div className="standard-page sleeping-conversations"><h1>Sleep</h1><p>Conversations you have left for later.</p>
      {sleeping.map(c=><article key={c.id} className="sleeping-chat"><Moon size={20}/><Link to={'/app/chat/'+c.id}><strong>{c.title}</strong><span>{c.pending?'Working':c.sleepJobId?'Review available':'Sleep enabled'}</span></Link><button className="text-button" onClick={async()=>{try{await modelRequest('sleep/'+c.id,{enabled:false});await act('conversation-sleep',{id:c.id,enabled:false});navigate('/app/chat/'+c.id);}catch(e){setError(e.message);}}}>Wake</button></article>)}
      {!sleeping.length&&<p className="sleep-empty">Use the moon beside a chat's model controls to move it here.</p>}
      <p className="sleep-empty">With consent, Sleep can draft one local candidate after 30 idle minutes. The configured OpenRouter worker uses at most 10,000 tokens and 20 minutes per pass.</p>
      {error&&<p role="alert">{error}</p>}
    </div>:tab==='suggestions'?<PersonalSuggestions/>:tab==='context'?<ContextMemory/>:tab==='memory'?children:<SleepTasks/>}
  </>;
}
