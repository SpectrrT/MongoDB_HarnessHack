import {useEffect,useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {Clock3,GitBranch,Database,Check,Pause,Play} from 'lucide-react';
import '../landing-diagrams.css';
const tracks=[
 {title:'Long horizon engineering',Icon:Clock3,detail:'Keep goals, memory, and checkpoints across long runs.',signal:'Carry context forward',tone:'horizon'},
 {title:'Recursive harnessing',Icon:GitBranch,detail:'Replay outcomes. Test changes to rules, context, and tool access.',signal:'Improve the next run',tone:'recursive'},
];
export function WorkDiagram(){
 const [active,setActive]=useState(0),[paused,setPaused]=useState(false),[hover,setHover]=useState(false),reduced=useReducedMotion();
 useEffect(()=>{if(paused||hover||reduced)return;const timer=setInterval(()=>setActive(value=>1-value),5000);return()=>clearInterval(timer);},[paused,hover,reduced]);
 return <figure className={'work-diagram harness-diagram track-'+active} aria-label="Offload: long horizon engineering and recursive harnessing" onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} onFocusCapture={()=>setHover(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setHover(false);}}>
  <div className="diagram-index"><span>THE HARNESS, IN MOTION</span><button type="button" aria-label={paused?'Animate diagram':'Pause diagram'} onClick={()=>setPaused(value=>!value)}>{paused?<Play size={13}/>:<Pause size={13}/>}</button></div>
  <div className={'harness-board '+(paused?'motion-paused':'')}>
   <div className="diagram-ascii" aria-hidden="true">{Array.from({length:15},(_,row)=>Array.from({length:24},(_,col)=>(row*7+col*3)%13===0?'+':(row+col)%7===0?':':'.').join(' ')).join('\n')}</div>
   <svg className="harness-paths" viewBox="0 0 500 450" aria-hidden="true"><defs><marker id="harness-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1 6 4 1 7" fill="none" stroke="currentColor" strokeWidth="1.2"/></marker></defs>
    <g className="path-base" fill="none" strokeWidth="1.3" markerEnd="url(#harness-arrow)"><path d="M130 130 V159 Q130 170 141 170 H225 Q236 170 236 181 V204"/><path d="M370 130 V159 Q370 170 359 170 H275 Q264 170 264 181 V204"/><path d="M250 285 V319 Q250 330 239 330 H130 V355"/><path d="M250 285 V319 Q250 330 261 330 H370 V355"/></g>
    <g className="path-flow" fill="none" strokeWidth="2"><path className="flow-horizon" d="M130 130 V159 Q130 170 141 170 H225 Q236 170 236 181 V204"/><path className="flow-recursive" d="M370 130 V159 Q370 170 359 170 H275 Q264 170 264 181 V204"/><path d="M250 285 V319 Q250 330 239 330 H130 V355"/></g>
   </svg>
   <div className="challenge-cards">{tracks.map(({title,Icon,tone},index)=><button key={title} type="button" className={'challenge-card '+tone} aria-pressed={active===index} onClick={()=>setActive(index)}><span className="challenge-icon"><Icon size={20} strokeWidth={1.5}/></span><span>{title}</span><span className="challenge-number">0{index+1}</span></button>)}</div>
   <div className="harness-core"><span className="harness-core-wordmark">offload</span><span>Dynamic model orchestration</span><div className="core-signal" aria-hidden="true"><i/><i/><i/><i/><i/></div></div>
   <div className="harness-outcomes"><div><Database size={18} strokeWidth={1.5}/><span>Memory + checkpoints</span></div><div><Check size={18} strokeWidth={1.5}/><span>Evaluate + evolve</span></div></div>
  </div>
  <figcaption className="harness-caption"><AnimatePresence mode="wait" initial={false}><motion.div key={active} initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}} transition={{duration:reduced?0:.18}}><strong>{tracks[active].signal}</strong><span>{tracks[active].detail}</span></motion.div></AnimatePresence></figcaption>
 </figure>;
}

export function MemoryDiagram(){
 const notes=[['Release decisions','blue'],['Verified fixes','green'],['Project constraints','amber'],['Tool permissions','pink']];
 return <section className="memory-diagram-section" aria-labelledby="memory-diagram-heading"><div className="memory-diagram-copy"><h2 id="memory-diagram-heading">It does the work.<br/><em>Period.</em></h2><p>Offload dynamically analyzes your workflow and takes over repetitive tasks.</p></div><figure className="memory-diagram is-reviewed"><div className="diagram-index"><span>CONTEXT FOR THE NEXT RUN</span><span>04 / KEPT</span></div><div className="memory-note-stack">{notes.map(([label,color])=><div className={'memory-note note-'+color} key={label}><span className="note-mark" aria-hidden="true">+</span><span>{label}</span><span className="note-tail">saved</span></div>)}</div><div className="memory-output"><span className="memory-output-icon" aria-hidden="true">✓</span><div><strong>Decisions survive the next session.</strong><span>Relevant context, ready when the task needs it.</span></div></div></figure></section>;
}
