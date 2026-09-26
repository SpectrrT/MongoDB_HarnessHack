import {Link} from 'react-router-dom';
import {ArrowRight} from 'lucide-react';
import Net from '../components/Net';
import {WorkDiagram} from '../components/LandingDiagrams';
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
  </div><WorkDiagram/></section></main>
 </div>;
}
