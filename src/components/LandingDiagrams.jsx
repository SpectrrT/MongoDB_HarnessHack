import {useState} from 'react';
import '../landing-diagrams.css';

export function WorkDiagram(){
 return <figure className="work-diagram" aria-labelledby="work-flow-caption">
  <div className="diagram-index"><span>CONTEXT → ACTION</span><span>01 / OFFLOAD</span></div>
  <svg viewBox="0 0 480 440" role="img" aria-labelledby="work-flow-title work-flow-desc">
   <title id="work-flow-title">From your context to a finished file</title>
   <desc id="work-flow-desc">Screen context and saved notes enter Offload, which gives your selected model context and tools to produce a file you can review.</desc>
   <defs><pattern id="work-dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="#c4ccc9"/></pattern><marker id="work-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M1 1 L6 4 L1 7" fill="none" stroke="#66827c" strokeWidth="1.3"/></marker></defs>
   <rect width="480" height="440" rx="8" fill="#f3f6f1"/>
   <rect x="16" y="16" width="448" height="408" fill="url(#work-dots)"/>
   <g fill="none" stroke="#66827c" strokeWidth="1.5" markerEnd="url(#work-arrow)">
    <path d="M112 108 V140 Q112 148 120 148 H208 Q216 148 216 156 V176"/>
    <path d="M368 108 V140 Q368 148 360 148 H272 Q264 148 264 156 V176"/>
    <path d="M240 264 V296"/>
   </g>
   <rect x="32" y="40" width="160" height="68" rx="8" fill="#fae5a9" stroke="#d6bc75"/>
   <g transform="translate(48 60)" fill="none" stroke="#75622c" strokeWidth="1.6"><rect width="24" height="16" rx="2"/><path d="M12 16v6M6 22h12"/></g>
   <text x="88" y="80" className="diagram-node">Screen</text>
   <rect x="288" y="40" width="160" height="68" rx="8" fill="#fff" stroke="#cbd3cc"/>
   <g transform="translate(304 60)" fill="none" stroke="#66776b" strokeWidth="1.6"><path d="M2 0h16l6 6v20H2zM18 0v6h6M7 12h12M7 18h9"/></g>
   <text x="340" y="80" className="diagram-node">Notes</text>
   <rect x="124" y="176" width="232" height="88" rx="8" fill="#3459cf"/>
   <text x="148" y="216" className="diagram-wordmark" fill="#fff">offload</text>
   <text x="148" y="244" className="diagram-sub" fill="#e4eaff">Your model. Your tools.</text>
   <g stroke="#a7bafb" strokeWidth="1" fill="none" transform="translate(312 204)"><path d="M0 0h16v16H0zM-8 8h32M8-8v32"/><circle cx="8" cy="8" r="4" fill="#e4eaff"/></g>
   <rect x="132" y="312" width="232" height="84" rx="8" fill="#ddebcf" stroke="#96b686"/>
   <rect x="120" y="300" width="232" height="84" rx="8" fill="#e9f3dc" stroke="#96b686"/>
   <g transform="translate(144 324)" fill="none" stroke="#47723f" strokeWidth="1.5"><path d="M0 0h20l8 8v28H0zM20 0v8h8M7 18h14M7 24h10"/></g>
   <text x="188" y="336" className="diagram-node">Work you can use</text>
   <text x="188" y="360" className="diagram-sub" fill="#506447">A file, ready to review</text>
  </svg>
  <figcaption id="work-flow-caption"><span>Less re-explaining. More doing.</span><span aria-hidden="true">[ ↗ ]</span></figcaption>
 </figure>;
}

const notes=[['Release notes','blue'],['Open bugs','amber'],['Release notes','blue'],['Team decision','green'],['Open bugs','amber'],['Customer rule','pink']];
export function MemoryDiagram(){
 const [reviewed,setReviewed]=useState(false);
 const visible=reviewed?notes.filter((n,i)=>notes.findIndex(a=>a[0]===n[0])===i):notes;
 return <section className="memory-diagram-section" aria-labelledby="memory-diagram-heading">
  <div className="memory-diagram-copy"><span className="diagram-kicker">[ MEMORY, WITH LESS NOISE ]</span><h2 id="memory-diagram-heading">Remember the work.<br/><em>Lose the repetition.</em></h2><p>A useful note shouldn’t need five copies. Keep each decision and instruction once, ready for the next task.</p><button className="text-link" aria-pressed={reviewed} onClick={()=>setReviewed(v=>!v)}>{reviewed?'Show the original notes':'Remove repeated notes'}<span aria-hidden="true">{reviewed?'↶':'↗'}</span></button></div>
  <figure className={`memory-diagram ${reviewed?'is-reviewed':''}`}>
   <div className="diagram-index"><span>{reviewed?'AFTER REVIEW':'BEFORE REVIEW'}</span><span>{visible.length} NOTES</span></div>
   <div className="memory-note-stack" aria-label="Illustrated saved notes">{visible.map(([name,color],i)=><div className={`memory-note note-${color}`} key={name+i}><span className="note-mark" aria-hidden="true">{reviewed?'✓':'+'}</span><span>{name}</span><span className="note-tail" aria-hidden="true">{reviewed?'kept':String(i+1).padStart(2,'0')}</span></div>)}</div>
   <div className="memory-output"><span className="memory-output-icon" aria-hidden="true">{reviewed?'✓':'↓'}</span><div><strong>{reviewed?'Four distinct notes. Nothing lost.':'Six notes. Two repeated.'}</strong><span aria-live="polite">{reviewed?'The decisions stay. The copies go.':'Select “Remove repeated notes” to see the change.'}</span></div></div>
   <figcaption>Illustrated note review</figcaption>
  </figure>
 </section>;
}
