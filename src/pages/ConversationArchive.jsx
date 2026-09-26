import {useState} from 'react';import {Link} from 'react-router-dom';
import {Archive,Trash2} from 'lucide-react';import {useWorkspace} from '../store';
export default function ConversationArchive(){
 const {state,act}=useWorkspace(),[tab,setTab]=useState('archived');
 const rows=state.conversations.filter(c=>c.listStatus===tab);
 return <div className="standard-page"><div className="page-title"><h1>Saved conversations</h1></div>
  <div className="slow-tabs"><button className={tab==='archived'?'active':''} onClick={()=>setTab('archived')}>Archive</button><button className={tab==='deleted'?'active':''} onClick={()=>setTab('deleted')}>Trash</button></div>
  {rows.map(c=><article className="sleeping-chat" key={c.id}>{tab==='archived'?<Archive size={20}/>:<Trash2 size={20}/>}<Link to={'/app/chat/'+c.id}><strong>{c.title}</strong><span>{c.pending?'Working':c.messages.length+' messages'}</span></Link><button className="text-button" onClick={()=>act('conversation-state',{id:c.id,action:'restore'})}>Restore</button></article>)}
  {!rows.length&&<p className="sleep-empty">{tab==='archived'?'No archived conversations.':'Trash is empty.'}</p>}
 </div>;
}
