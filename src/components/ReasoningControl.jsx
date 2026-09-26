import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {motion,AnimatePresence,useReducedMotion,useMotionValue,useTransform,animate} from 'motion/react';
import {createPortal} from 'react-dom';
import {SlidersHorizontal} from 'lucide-react';
export const EFFORTS=[['low','Light'],['medium','Medium'],['high','High'],['xhigh','Extra high'],['max','Max'],['ultra','Ultra']];
export const effortLabel = value => EFFORTS.find(e=>e[0]===value)?.[1] || 'Light';
export default function ReasoningControl({value,onChange,supported=[],disabled}) {
 const reduced=useReducedMotion(),[open,setOpen]=useState(false),[position,setPosition]=useState({}),[preview,setPreview]=useState(null);
 const ref=useRef(),popup=useRef(),track=useRef(),drag=useRef(null),animation=useRef();
 const choices=EFFORTS.filter(([key])=>supported.includes(key)),last=choices.length-1;
 const index=Math.max(0,choices.findIndex(([key])=>key===value)),locked=disabled||last<1;
 const progress=useMotionValue(last>0?index/last:0);
 const thumbPosition=useTransform(progress,v=>`${v*100}%`);
 const snap=next=>{animation.current?.stop();if(reduced)progress.set(next);else animation.current=animate(progress,next,{type:'spring',stiffness:650,damping:42,mass:.6});};
 useEffect(()=>{if(!drag.current){setPreview(null);snap(last>0?index/last:0);}return()=>animation.current?.stop();},[index,last,reduced]);
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 useLayoutEffect(()=>{
  if(!open)return;
  const positionPopup=()=>{const anchor=ref.current.getBoundingClientRect(),height=popup.current?.offsetHeight||120,width=240;setPosition({left:Math.max(12,Math.min(window.innerWidth-width-12,anchor.right-width)),top:anchor.top>=height+20?anchor.top-height-8:Math.min(window.innerHeight-height-12,anchor.bottom+8)});};
  positionPopup();window.addEventListener('resize',positionPopup);window.addEventListener('scroll',positionPopup,true);
  return()=>{window.removeEventListener('resize',positionPopup);window.removeEventListener('scroll',positionPopup,true);};
 },[open]);
 useEffect(()=>{
  if(!open)return;
  const close=e=>{if(!ref.current?.contains(e.target)&&!popup.current?.contains(e.target))setOpen(false);};
  const key=e=>{if(e.key==='Escape'){setOpen(false);ref.current?.querySelector('button')?.focus();}};
  document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);
  return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);};
 },[open]);
 const move=clientX=>{const rect=track.current.getBoundingClientRect();const fraction=Math.max(0,Math.min(1,(clientX-rect.left)/rect.width));progress.set(fraction);const next=Math.round(fraction*last);setPreview(next);return next;};
 const finish=(event,cancelled=false)=>{
  if(drag.current!==event.pointerId)return;
  const next=cancelled?index:move(event.clientX);drag.current=null;
  snap(last>0?next/last:0);setPreview(null);
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  if(!cancelled&&next!==index)onChange(choices[next][0]);
 };
 const displayed=choices[preview??index]?.[1]||effortLabel(value);
 return <div className="reasoning-control" ref={ref}>
  <button type="button" className="reasoning-trigger" aria-label="Adjust reasoning" aria-expanded={open} aria-controls="reasoning-popover" disabled={disabled} onClick={()=>setOpen(v=>!v)}><SlidersHorizontal size={16}/>{effortLabel(value)}</button>
  {createPortal(<AnimatePresence>{open&&<motion.div id="reasoning-popover" ref={popup} style={position} className="reasoning-popover" initial={{opacity:0,y:reduced?0:4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduced?0:3}} transition={{duration:reduced?0:.14}}>
   <div className="reasoning-heading"><span>Reasoning</span><strong>{displayed}</strong></div>
   <div className="reasoning-slider-wrap" data-disabled={locked||undefined} data-dragging={preview!==null||undefined}>
    <div className="reasoning-track" ref={track} aria-hidden="true"><div className="reasoning-rail"/><motion.div className="reasoning-fill" style={{scaleX:progress}}/>{choices.map(([key],i)=><i className="reasoning-tick" key={key} style={{left:`${last>0?i/last*100:0}%`}}/>)}<motion.span className="reasoning-thumb" style={{left:thumbPosition}}/></div>
    <input type="range" aria-label="Reasoning level" aria-valuetext={displayed} min="0" max={Math.max(1,last)} step="1" value={preview??index} disabled={locked}
     onPointerDown={event=>{if(locked||event.button!==0)return;event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);drag.current=event.pointerId;animation.current?.stop();move(event.clientX);}}
     onPointerMove={event=>{if(drag.current===event.pointerId)move(event.clientX);}}
     onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)}
     onChange={event=>{if(drag.current!==null)return;const next=Number(event.target.value);snap(last>0?next/last:0);onChange(choices[next][0]);}}/>
   </div>
   <div className="reasoning-ends"><span>{choices[0]?.[1]||'Unavailable'}</span><span>{choices.at(-1)?.[1]||''}</span></div>
  </motion.div>}</AnimatePresence>,ref.current?.closest('.workspace')||document.body)}
 </div>;
}
