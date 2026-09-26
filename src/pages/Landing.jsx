import {Link} from 'react-router-dom';
import {ArrowRight,Mic,Brain} from 'lucide-react';
import {ConnectionLogo} from '../components/ConnectionLogo';
import Net from '../components/Net';
import {WorkDiagram,MemoryDiagram} from '../components/LandingDiagrams';
import '../landing-ascii.css';
export default function Landing(){
 return <div className="site ascii-site landing-focused">
  <nav className="site-nav"><Link to="/" className="wordmark">offload</Link><Link to="/app" className="button small">Try Offload <ArrowRight size={16}/></Link></nav>
  <main><section className="hero"><Net/><div className="hero-copy">
   <p className="eyebrow"><span aria-hidden="true">[ + ] </span>A harness that learns from the work</p>
   <h1>Your agent should<br/><em>finish the job.</em></h1>
   <p className="hero-description">Offload is a dynamic harness that utilizes a decision model to be both smarter, and more efficient.</p>
   <Link to="/app" className="button">Try Offload <ArrowRight size={17}/></Link>
   <div className="hero-engineering"><span>Persistent memory</span><span>Verified outcomes</span><span>Evolving rules</span></div>
  </div><WorkDiagram/></section>
  <section className="site-preview" id="how"><div className="section-heading"><h2>The harness that keeps<br/>your team moving.</h2></div>
   <div className="preview-window"><div className="preview-top"><span className="wordmark">offload</span><span>Suggested for you</span><span className="ascii-small">YOUR NEXT MOVE</span></div><div className="preview-content">
    <div className="preview-message"><h3>From an open issue<br/>to a verified fix.</h3><p>Reproduce the failure. Trace the cause.<br/>Prepare the patch and run the checks.</p><Link className="text-link" to="/app">Try Offload <ArrowRight size={16}/></Link></div>
    <div className="preview-suggestions">{[
     {title:'Fix a slow aggregation',detail:'Inspect the query plan, test an index, and compare the results.',category:'Performance',services:['MongoDB','GitHub']},
     {title:'Ship a resumable backfill',detail:'Plan bounded batches, save checkpoints, and verify a safe restart.',category:'Migration',services:['MongoDB','GitHub']},
     {title:'Recover a change-stream pipeline',detail:'Trace the interruption and test recovery from a saved resume token.',category:'Reliability',services:['MongoDB','GitHub']},
     {title:'Roll out a document schema change',detail:'Check existing documents and plan validation, rollout, and rollback.',category:'Schema',services:['MongoDB','GitHub']},
    ].map(({title,detail,category,services})=><Link className="preview-row" to="/app" key={title}><div className="landing-task-meta"><span>{category}</span><ArrowRight size={17} strokeWidth={1.5}/></div><strong>{title}</strong><p>{detail}</p><div className="landing-task-tools">{services.map(source=><span key={source}><ConnectionLogo source={source} size={20}/>{source}</span>)}</div></Link>)}</div>
   </div></div>
  </section>
  <MemoryDiagram/>
  <section className="site-story" id="control"><div><p className="eyebrow">Your permissions</p><h2>Offload gets<br/>full context.</h2></div><div className="story-details"><article><h3><Mic size={21} strokeWidth={1.5}/>Always-on recording.</h3><p>Toggle Offload to listen or watch. Keep the session running until you stop it.</p></article><article><h3><Brain size={21} strokeWidth={1.5}/>Dynamic task management.</h3><p>REM manages context. Jev, a decision model, can check whether a task is complete.</p></article></div></section>
  <section className="site-close"><h2>The model you can<br/><em>trust</em> to Offload.</h2><Link to="/app" className="button">Try Offload <ArrowRight size={17}/></Link></section>
  </main><footer><span className="wordmark">offload</span></footer>
 </div>;
}
