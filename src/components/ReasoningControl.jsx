import {useEffect,useRef,useState} from 'react';
import {motion,AnimatePresence,useReducedMotion,useSpring} from 'motion/react';
import {createPortal} from 'react-dom';
import {SlidersHorizontal} from 'lucide-react';
export const EFFORTS=[['low','Light'],['medium','Medium'],['high','High'],['xhigh','Extra high'],['max','Max'],['ultra','Ultra']];
export const effortLabel = value => EFFORTS.find(e=>e[0]===value)?.[1] || 'Light';
export default function ReasoningControl({value,onChange,supported=[],disabled}) {
 const reduced=useReducedMotion(),[open,setOpen]=useState(false),[position,setPosition]=useState({}),ref=useRef(),popup=useRef();
 const choices=EFFORTS.filter(([k])=>supported.includes(k)),index=Math.max(0,choices.findIndex(([k])=>k===value));
 const percent=choices.length>1?index/(choices.length-1)*100:0;
 const progress=useSpring(percent,{stiffness:500,damping:42,mass:.55});
 useEffect(()=>{reduced?progress.jump(percent):progress.set(percent);},[percent,reduced]);
 useEffect(()=>{if(!open)return;const close=e=>{if(!ref.current?.contains(e.target)&&!popup.current?.contains(e.target))setOpen(false);};const key=e=>{if(e.key==='Escape')setOpen(false);};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);};},[open]);
 return <div className="reasoning-control" ref={ref}><button type="button" className="reasoning-trigger" aria-label="Adjust reasoning" aria-expanded={open} disabled={disabled} onClick={()=>{const rect=ref.current.getBoundingClientRect();setPosition({left:Math.max(12,Math.min(innerWidth-237,rect.left)),top:Math.max(12,rect.top-122),bottom:"auto"});setOpen(v=>!v);}}><SlidersHorizontal size={12}/>{effortLabel(value)}</button>{createPortal(<AnimatePresence>{open&&<motion.div ref={popup} style={position} className="reasoning-popover beautiful-ui" initial={{opacity:0,y:reduced?0:5,scale:reduced?1:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:reduced?0:3}} transition={{duration:reduced?0:.16}}><div className="reasoning-heading"><span>Reasoning</span><strong>{effortLabel(value)}</strong></div><div className="reasoning-slider-wrap"><div className="reasoning-rail"><motion.div style={{width:progress.get()+'%'}} animate={{width:percent+'%'}} transition={reduced?{duration:0}:{type:'spring',stiffness:500,damping:42}}/></div><input type="range" aria-label="Reasoning level" aria-valuetext={effortLabel(value)} min="0" max={Math.max(1,choices.length-1)} step="1" value={index} disabled={disabled||choices.length<2} onChange={e=>{const choice=choices[Number(e.target.value)];if(choice)onChange(choice[0]);}}/></div><div className="reasoning-ends"><span>Light</span><span>{choices.at(-1)?.[1]||'Ultra'}</span></div></motion.div>}</AnimatePresence>,ref.current?.closest(".workspace")||document.body)}</div>;
}
