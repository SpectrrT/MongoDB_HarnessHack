import {useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {ArrowUpRight,ChevronLeft,ChevronRight} from 'lucide-react';
import {PERSONAL_SUGGESTIONS} from '../../shared/personal-suggestions';
import {ConnectionLogo} from './ConnectionLogo';
import {useWorkspace} from '../store';
export default function SuggestedTasks({onSelect,disabled}){
 const {state}=useWorkspace(),reduced=useReducedMotion();
 const [page,setPage]=useState(0),pages=Math.ceil(PERSONAL_SUGGESTIONS.length/2);
 if(!state.settings.suggestions)return null;
 return <section className="suggested-carousel" aria-label="Suggested for you">
  <div className="suggested-carousel-head"><h2>Suggested for you</h2><div><button aria-label="Previous suggestions" onClick={()=>setPage(p=>(p+pages-1)%pages)}><ChevronLeft size={15}/></button><span>{page+1} / {pages}</span><button aria-label="Next suggestions" onClick={()=>setPage(p=>(p+1)%pages)}><ChevronRight size={15}/></button></div></div>
  <div className="suggested-carousel-stage"><AnimatePresence initial={false} mode="wait"><motion.div key={page} className="suggested-carousel-cards" initial={{opacity:reduced?1:0,y:reduced?0:4}} animate={{opacity:1,y:0}} exit={{opacity:reduced?1:0,y:reduced?0:-4}} transition={{duration:reduced?0:.14}}>{PERSONAL_SUGGESTIONS.slice(page*2,page*2+2).map(task=><button key={task.id} className="suggested-task-card" disabled={disabled} onClick={()=>onSelect(task.prompt,task.title)}><span className="suggested-task-source"><ConnectionLogo source={task.source} size={21}/><span>{task.category}</span><ArrowUpRight size={15}/></span><strong>{task.title}</strong><span className="suggested-task-description">{task.reason}</span><span className="suggested-task-tools">{(task.sources||[task.source]).map(source=><span key={source}><ConnectionLogo source={source} size={15}/>{source==='GitHub'?'Repository':source}</span>)}{task.prepared&&<span className="suggested-demo-label">Prepared demo</span>}</span></button>)}</motion.div></AnimatePresence></div>
 </section>;
}
