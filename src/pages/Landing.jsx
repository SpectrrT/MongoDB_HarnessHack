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
   <p className="hero-description">Keep context across long runs. Test what worked.<br/>Use it to improve the next one.</p>
   <Link to="/app" className="button">Try Offload <ArrowRight size={17}/></Link>
   <div className="hero-engineering"><span>Persistent memory</span><span>Verified outcomes</span><span>Evolving rules</span></div>
  </div><WorkDiagram/></section>
  <section className="site-preview" id="how"><div className="section-heading"><h2>The work that keeps<br/>your team moving.</h2><p>Give the agent a goal.<br/>Keep the context and the evidence.</p></div>
   <div className="preview-window"><div className="preview-top"><span className="wordmark">offload</span><span>Suggested for you</span><span className="ascii-small">YOUR NEXT MOVE</span></div><div className="preview-content">
    <div className="preview-message"><h3>From an open issue<br/>to a verified fix.</h3><p>Reproduce the failure. Trace the cause.<br/>Prepare the patch and run the checks.</p><Link className="text-link" to="/app">Try Offload <ArrowRight size={16}/></Link></div>
    <div className="preview-suggestions">{[
     {title:'Investigate a failing build',detail:'Read the failure logs, trace the change, and prepare a fix.',category:'Development',services:['GitHub']},
     {title:'Prepare a migration plan',detail:'Map dependencies and write the rollout and rollback steps.',category:'Infrastructure',services:['GitHub','Google Drive']},
     {title:'Review the release handoff',detail:'Collect open issues, decisions, and checks before release.',category:'Delivery',services:['GitHub','Linear']},
     {title:'Turn feedback into a patch',detail:'Connect review comments to the code and verify the change.',category:'Engineering',services:['GitHub','Figma']},
    ].map(({title,detail,category,services})=><Link className="preview-row" to="/app" key={title}><div className="landing-task-meta"><span>{category}</span><ArrowRight size={17} strokeWidth={1.5}/></div><strong>{title}</strong><p>{detail}</p><div className="landing-task-tools">{services.map(source=><span key={source}><ConnectionLogo source={source} size={20}/>{source}</span>)}</div></Link>)}</div>
   </div></div>
  </section>
  <MemoryDiagram/>
  <section className="site-story" id="control"><div><p className="eyebrow">Your permissions</p><h2>Offload gets<br/>full context.</h2></div><div className="story-details"><article><h3><Mic size={21} strokeWidth={1.5}/>Always-on recording.</h3><p>Toggle Offload to listen or watch. Keep the session running until you stop it.</p></article><article><h3><Brain size={21} strokeWidth={1.5}/>Dynamic task management.</h3><p>REM manages context. Jev, a decision model, can check whether a task is complete.</p></article></div></section>
  <section className="site-close"><h2>The model you can<br/><em>trust</em> to Offload.</h2><Link to="/app" className="button">Try Offload <ArrowRight size={17}/></Link></section>
  </main><footer><span className="wordmark">offload</span></footer>
 </div>;
}
