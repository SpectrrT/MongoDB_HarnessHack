import React, { useCallback, useEffect, useRef, useState } from 'react';
import './PersonalSuggestions.css';
import SleepServiceNotice from './SleepServiceNotice';
const api=async(path='',body)=>{
  const response=await fetch(`/api/suggestions${path}`,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Next actions need the local Offload service. Open the local app to import sessions and prepare tasks.');
  const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to load saved suggestions.');return result;
};
export default function PersonalSuggestions(){
  const fileInput=useRef(null);
  const [state,setState]=useState(null),[project,setProject]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[versions,setVersions]=useState(null),[checking,setChecking]=useState(false);
  const load=useCallback(async()=>{try{const data=await api();setState(data);setError('');setProject(old=>old||data.projects[0]?.projectId||'');}catch(e){setError(e.message);}},[]);
  useEffect(()=>{load();},[load]);
  const retry=async()=>{setChecking(true);try{await load();}finally{setChecking(false);}};
  const hasWork=state?.runs.some(r=>['queued','running'].includes(r.status));
  useEffect(()=>{if(!hasWork)return;const timer=setInterval(load,2000);return()=>clearInterval(timer);},[hasWork,load]);
  const act=async(fn)=>{setBusy(true);setError('');setNotice('');try{await fn();await load();}catch(e){setError(e.message);}finally{setBusy(false);}};
  const decide=(id,decision)=>act(async()=>{await api(`/${id}/decision`,{decision});if(decision==='accept')setNotice('Task saved. The local worker will prepare a source-checked context file.');});
  const importFile=event=>{const file=event.target.files?.[0];if(!file)return;act(async()=>{
    if(file.size>8*1024*1024)throw Error('Choose a sessions file smaller than 8 MB.');
    const input=JSON.parse(await file.text());const events=Array.isArray(input)?input:input.events;
    if(!Array.isArray(events)||events.length>5000)throw Error('Choose a sessions export with at most 5,000 source notes.');
    let imported=0;for(let i=0;i<events.length;i+=500)imported+=(await api('/import',{events:events.slice(i,i+500)})).inserted;
    setNotice(`Imported ${imported} source notes. Choose a project to resume.`);
  });event.target.value='';};
  return <div className="standard-page personal-suggestions" aria-label="Personal task suggestions">
    <div className="page-title"><div><h1>What comes next</h1><p>Resume a project with the decisions and requests you already saved.</p></div></div>
    {error&&<SleepServiceNotice message={error} onRetry={!state?retry:undefined} busy={checking}/>}{notice&&<p role="status">{notice}</p>}
    <button className="button secondary" disabled={busy} onClick={()=>fileInput.current?.click()}>Import selected sessions</button>
    <input ref={fileInput} type="file" accept="application/json,.json" disabled={busy} onChange={importFile} hidden/>
    <p className="muted">Import only the sessions you want to use. Suggestions cite their evidence and wait for you to start them.</p>
    {state&&<>
      <div className="button-row"><label>Project <select aria-label="Project" value={project} onChange={e=>setProject(e.target.value)} style={{maxWidth:'100%'}}>
        <option value="">Choose a project</option>{state.projects.map(p=><option key={p.projectId} value={p.projectId}>{p.title}</option>)}
      </select></label><button className="button" disabled={busy||!project} onClick={()=>act(async()=>{const result=await api('/open',{projectId:project});if(!result.suggestion)setNotice('No task is due. More independent evidence or a new project event may be needed.');})}>Resume project</button></div>
      {!state.suggestions.length&&<p>No supported next task is due.</p>}
      {state.suggestions.map(s=><article className="rem-edit" key={s._id}><h2>{s.title}</h2><p>{s.reason}</p>
        <details><summary>Why this task?</summary><p>Uses saved notes from {s.projectTitle}. Creates a local context file with exact source references. Nothing is sent or published.</p>
          <ul>{s.evidence.map(e=><li key={e.id}>{new Date(e.date).toLocaleDateString()}: {e.locator}</li>)}</ul></details>
        <div className="button-row"><button className="button" disabled={busy} onClick={()=>decide(s._id,'accept')}>Start once</button>
          <button className="button secondary" disabled={busy} onClick={()=>decide(s._id,'snooze')}>Snooze</button>
          <button className="button secondary" disabled={busy} onClick={()=>decide(s._id,'dismiss')}>Dismiss</button>
          <button className="button secondary" disabled={busy} onClick={()=>decide(s._id,'mute')}>Stop suggesting</button></div></article>)}
      <h2>Recent tasks</h2>{state.runs.map(r=><article className="rem-edit" key={r._id}><h3>{r.input.projectTitle}</h3><p>{r.status==='completed'?'Source checks passed':r.status==='queued'?'Waiting for the local worker':r.status}</p>
        {r.error&&<p>{r.error}</p>}{r.status==='completed'&&r.outputs.artifact&&<a className="button secondary" href={`/api/suggestions/artifacts/${r._id}`}>Download context</a>}</article>)}
      <details><summary>How suggestions have changed</summary><p>Policy version {state.policy.version}: at least {state.policy.settings.minSupport} independent sessions, with a {state.policy.settings.cooldownHours}-hour cooldown.</p>
        <button className="button secondary" disabled={busy} onClick={()=>act(async()=>setVersions(await api('/policy')))}>Show policy history</button>
        {versions?.versions.map(v=><div key={v._id}><p>Version {v.version}: {v.status}. {v.reason}</p>{v.evaluation&&<p>Held-out correct: {v.evaluation.heldOut.before.correct} to {v.evaluation.heldOut.after.correct} of {v.evaluation.heldOut.after.total}. Regressions: {v.evaluation.heldOut.regressions.length}.</p>}</div>)}
        {versions?.versions.find(v=>v._id===versions.activeId)?.parent&&<button className="button secondary" disabled={busy} onClick={()=>act(async()=>{await api('/policy/rollback',{expectedActiveId:versions.activeId});setVersions(await api('/policy'));})}>Restore previous policy</button>}
      </details>
    </>}
  </div>;
}
