import {useEffect,useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {ArrowUpRight,ChevronLeft,ChevronRight,Pause,Play} from 'lucide-react';
import {PERSONAL_SUGGESTIONS} from '../../shared/personal-suggestions';
import {ConnectionLogo} from './ConnectionLogo';
import {useWorkspace} from '../store';
export default function SuggestedTasks({onSelect,disabled}){
 const {state}=useWorkspace(),reduced=useReducedMotion();
 const [page,setPage]=useState(0),[paused,setPaused]=useState(false),[hover,setHover]=useState(false),[focused,setFocused]=useState(false);
 const pages=Math.ceil(PERSONAL_SUGGESTIONS.length/2);
 useEffect(()=>{if(reduced||paused||hover||focused||disabled)return;const timer=setInterval(()=>{if(!document.hidden)setPage(p=>(p+1)%pages)},2000);return()=>clearInterval(timer);},[reduced,paused,hover,focused,disabled,pages]);
 if(!state.settings.suggestions)return null;
 return <section className="suggested-carousel" aria-label="Suggested for you" onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} onFocusCapture={()=>setFocused(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setFocused(false)}}>
  <div className="suggested-carousel-head"><h2>Suggested for you</h2><div><button aria-label="Previous suggestions" onClick={()=>setPage(p=>(p+pages-1)%pages)}><ChevronLeft size={15}/></button><span>{page+1} / {pages}</span>{!reduced&&<button aria-label={paused?'Rotate suggestions':'Pause suggestions'} aria-pressed={paused} onClick={()=>setPaused(p=>!p)}>{paused?<Play size={12}/>:<Pause size={12}/>}</button>}<button aria-label="Next suggestions" onClick={()=>setPage(p=>(p+1)%pages)}><ChevronRight size={15}/></button></div></div>
  <div className="suggested-carousel-stage"><AnimatePresence initial={false} mode="wait"><motion.div key={page} className="suggested-carousel-cards" initial={{opacity:reduced?1:0,rotateX:reduced?0:8,y:reduced?0:6}} animate={{opacity:1,rotateX:0,y:0}} exit={{opacity:reduced?1:0,rotateX:reduced?0:-6,y:reduced?0:-4}} transition={{duration:reduced?0:.14,ease:[.22,1,.36,1]}}>{PERSONAL_SUGGESTIONS.slice(page*2,page*2+2).map(task=><button key={task.id} className="suggested-task-card" disabled={disabled} onClick={()=>onSelect(task.prompt,task.title)}><span className="suggested-task-source"><ConnectionLogo source={task.source} size={21}/><span>{task.category}</span><ArrowUpRight size={15}/></span><strong>{task.title}</strong><span className="suggested-task-description">{task.reason}</span></button>)}</motion.div></AnimatePresence></div>
 </section>;
}
