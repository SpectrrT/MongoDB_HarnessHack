import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';

export default function ContextMemory() {
  const [state,setState]=useState(null),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    const refresh=async()=>{try{const response=await fetch('/api/rem/state');if(!response.ok)throw Error('Context memory is unavailable.');const next=await response.json();if(active){setState(next);setError('');}}catch(e){if(active)setError(e.message);}};
    refresh();const timer=setInterval(refresh,5000);
    return()=>{active=false;clearInterval(timer);};
  },[]);
  const runs=(state?.runs||[]).filter(r=>r.compaction);
  return <div className="standard-page sleep-page">
    <div className="page-title"><h1>Sleep</h1><p>Keep useful context close. Recover the details when they matter again.</p></div>
    <section className="sleep-schedule"><div><h2>Context memory</h2><p>Jev estimates whether older tool exchanges are still useful. Low-probability exchanges leave the active prompt and remain available in the run's archive.</p><p>Task instructions, rules, recent exchanges and detected constraints stay protected. Uncertain decisions stay in context. If protected context cannot fit, the run pauses for review.</p></div></section>
    {error&&<p role="alert">{error}</p>}
    {!state&&!error&&<p role="status">Loading context memory...</p>}
    {state&&<p className="sleep-disclosure">Selector: {state.engine.compaction||'off'}. Storage: {state.engine.database}. Task model: {state.engine.model}. Character counts measure retained tool history, not total prompt tokens.</p>}
    {!runs.length&&state&&<div className="sleep-empty"><h3>No context selections recorded yet.</h3><p>Selections appear here when a connected run reaches its context budget.</p><Link to="/app/rem">Open the engine runs</Link></div>}
    {runs.map(run=>{const c=run.compaction;return <article className="skill" key={run.runId}>
      <div className="section-line"><h2>{run.title||run.runId}</h2><span>{c.status==='needs_review'?'Needs review':c.status==='compacted'?'Compacted':'Within budget'}</span></div>
      <p>{c.beforeChars.toLocaleString()} to {c.afterChars.toLocaleString()} characters. {c.retained} exchanges retained, {c.archived} omitted from this prompt.</p>
      <p className="muted">{c.decisionCalls} new Jev calls, {c.cacheHits} cached decisions. Selection took {c.latencyMs} ms. {c.inputTokens+c.outputTokens} reported decision tokens this selection{c.usageKnown?'':'; usage incomplete'}.</p>
      <p className="muted">Run total: {(run.usage?.compactionInputTokens||0)+(run.usage?.compactionOutputTokens||0)} decision tokens. Source: {c.source}.</p>
      {c.errors?.length>0&&<p role="status">{c.errors.join('. ')}. Unscored exchanges were retained.</p>}
    </article>;})}
  </div>;
}
