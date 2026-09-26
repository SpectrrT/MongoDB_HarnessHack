import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Moon, Plus, Pause, Play, X, ArrowUpRight } from 'lucide-react';
import { useWorkspace } from '../store';
import { Modal } from './Modal';
import SleepServiceNotice from './SleepServiceNotice';

const deadline = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8,0,0,0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16); };
async function api(url, value) {
  const response = await fetch(url, value ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) } : {});
  if (!response.headers.get('content-type')?.includes('application/json')) throw Error('Overnight tasks need the local Offload service. Open the local app to assign and run tasks.');
  const result = await response.json(); if (!response.ok) throw Error(result.error || 'Sleep request failed.'); return result;
}
const labels = { queued: 'Queued', running: 'Working', approval: 'Approval needed', paused: 'Paused', completed: 'Checks passed', incomplete: 'Incomplete', cancelled: 'Cancelled' };
const selectedAction = task => /^Selected action:\s*(.+)$/m.exec(task.brief || '')?.[1]?.replace(/^(?:Action(?: item)?|Todo|Follow-up):\s*/i, '').trim();
const readableTitle = task => {
  const action = selectedAction(task);
  if (!action) return task.title;
  const title = action.replace(/^(?:draft|write|prepare)\s+(?:an?\s+|the\s+)?/i, '').replace(/\.$/, '');
  return title ? title[0].toUpperCase() + title.slice(1) : task.title;
};
export default function SleepTasks() {
  const { state, act } = useWorkspace();
  const queuedDraft = useLocation().state?.queuedDraft;
  const [tasks, setTasks] = useState([]), [status, setStatus] = useState(null), [draft, setDraft] = useState(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const taskCount = tasks.filter(task => task.status !== 'cancelled').length;
  const handedOffTask = tasks.find(task => task.id === queuedDraft?.id);
  const awaitingWorker = queuedDraft && (handedOffTask?.status ?? queuedDraft.status) === 'queued';
  const [loadError, setLoadError] = useState(''), [checking, setChecking] = useState(false);
  const refresh = async () => {
    const config = await api('/api/sleep/tasks/status'); setStatus(config);
    if (config.configured) setTasks(await api('/api/sleep/tasks'));
    setLoadError('');
  };
  useEffect(() => {
    let disposed = false;
    const read = async () => { try { if (!disposed) await refresh(); } catch (e) { if (!disposed) setLoadError(e.message); } };
    void read(); const timer = setInterval(read, 3000); return () => { disposed = true; clearInterval(timer); };
  }, []);
  const retry = async () => { setChecking(true); try { await refresh(); } catch (e) { setLoadError(e.message); } finally { setChecking(false); } };
  const open = suggestion => {
    setError(''); setDraft({ requestKey: crypto.randomUUID(), title: suggestion?.title || '',
      brief: suggestion ? `${suggestion.reason}\nPrepare a local draft for review. Use only facts in this brief.` : '',
      deadline: deadline(), budget: '10000', path: 'report.md', contains: '', allowWrite: false });
  };
  const control = async (task, action) => {
    try { setError(''); await api(`/api/sleep/tasks/${task.id}/control`, { action }); await refresh(); }
    catch (e) { setError(e.message); }
  };
  return <div className="standard-page slow-page">
    <div className="slow-heading"><div><span className="slow-label"><Moon size={14}/> SLEEP</span><h1>Overnight tasks</h1><p>Assign a local draft with a deadline, token budget and checks.</p></div><button className="button" onClick={() => open()}><Plus size={16}/> Add a task</button></div>
    {queuedDraft && <p className="suggestion-notice" role="status">Draft task saved. {awaitingWorker && ((status?.enabled ?? queuedDraft.workerEnabled) ? 'Queued for the local Sleep worker.' : 'Waiting for the local Sleep worker to be enabled.')} The original action remains open.</p>}
    {loadError && <SleepServiceNotice message={loadError} onRetry={retry} busy={checking} />}
    {error && <p role="alert">{error}</p>}
    <div className="overnight-heading"><h2>Overnight queue</h2><span>{status ? `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}` : 'Waiting for service'}</span></div>
    {status && !tasks.length && <div className="overnight-empty"><h3>What can wait until morning?</h3><p>Add the facts to work from and a file you can independently check.</p></div>}
    {tasks.map(task => <article className="overnight-task" key={task.id}>
      <div className="overnight-task-head"><h3>{readableTitle(task)}</h3><span>{labels[task.status] || task.status}</span></div>
      <p>{selectedAction(task) || task.brief}</p>
      {selectedAction(task) && <details className="overnight-instructions"><summary>Draft instructions and sources</summary><pre>{task.brief}</pre></details>}
      <div className="overnight-meta"><span>Due {new Date(task.deadline).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span><span>{task.tokensUsed.toLocaleString()} / {task.budget.toLocaleString()} tokens</span><span>{task.calls} model {task.calls === 1 ? 'call' : 'calls'}</span></div>
      {task.reason && <p>{task.reason}</p>}
      {task.usageUnknown > 0 && <p>Usage includes {task.usageUnknown} conservative reservations where billed usage was unavailable.</p>}
      {task.checkResults?.map(check => <p key={check.id||check.path}>{check.path}: {check.passed ? 'checks passed' : check.failed.join(', ')}</p>)}
      {task.artifacts?.map(artifact => <p key={artifact.path}><a href={`/api/sleep/tasks/${task.id}/artifacts/${encodeURIComponent(artifact.path)}`}>Download {artifact.path}</a></p>)}
      {task.status === 'approval' && <><p>Approve only these exact local file changes. No shell commands or external actions are requested.</p>{task.pending?.files.map(file => <details key={file.path}><summary>{file.path}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{file.content}</pre></details>)}<button className="button small" onClick={() => control(task, 'approve')}>Approve displayed files</button></>}
      {!['completed','incomplete','cancelled'].includes(task.status) && <div className="overnight-actions">
        {task.status !== 'approval' && <button className="button small secondary" onClick={() => control(task, task.status === 'paused' ? 'resume' : 'pause')}>{task.status === 'paused' ? <Play size={14}/> : <Pause size={14}/>} {task.status === 'paused' ? 'Resume task' : 'Pause task'}</button>}
        <button className="button small ghost" onClick={() => control(task, 'cancel')}><X size={14}/> Cancel task</button>
      </div>}
    </article>)}
    <p className="runner-note">{!status ? 'Worker status is unavailable.' : status.configured ? status.enabled ? 'The local Sleep worker is enabled. Keep the server running while it works.' : 'Task storage is connected. Start the Sleep task worker on this computer to execute the queue.' : 'MongoDB task storage is not configured. A connected worker is required to run assigned tasks.'} Completion means the checks you set passed. A draft still needs your judgment.</p>
    {!!state.overnight?.length && <><div className="overnight-heading"><h2>Previously saved briefs</h2><span>Not assigned to the worker</span></div>{state.overnight.filter(t => t.status !== 'cancelled').map(task => <article className="overnight-task" key={task.id}><h3>{task.title}</h3><p>{task.brief}</p><button className="button small secondary" onClick={() => { open(); setDraft(d => ({...d,title:task.title,brief:task.brief,budget:String(task.budget)})); }}>Add output checks to assign</button><button className="button small ghost" onClick={() => act('overnight',{id:task.id,status:'cancelled'}).catch(e => setError(e.message))}>Dismiss saved brief</button></article>)}</>}
    <div className="overnight-heading"><h2>Ideas for overnight</h2><span>Choose what to queue</span></div>
    {state.suggestions.filter(s => s.status === 'pending').slice(0,4).map(s => <button className="night-suggestion" key={s.id} onClick={() => open(s)}><span><strong>{s.title}</strong><small>{s.reason}</small></span><ArrowUpRight size={18}/></button>)}
    {draft && <Modal title="Assign a Sleep task" onClose={() => setDraft(null)}><form className="overnight-form" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError('');
      try {
        await api('/api/sleep/tasks', { requestKey: draft.requestKey, input: { title: draft.title, brief: draft.brief, deadline: new Date(draft.deadline).getTime(), budget: Number(draft.budget),
          checks: [{ path: draft.path, contains: draft.contains.split('\n').map(s => s.trim()).filter(Boolean), minBytes: 1 }], writeFiles: draft.allowWrite ? [draft.path] : [] } });
        setDraft(null); await refresh();
      } catch (e) { setError(e.message); } finally { setBusy(false); }
    }}>
      <label>Task<input autoFocus required maxLength={160} value={draft.title} onChange={e => setDraft({...draft,title:e.target.value})}/></label>
      <label>What should be ready?<textarea required rows={4} maxLength={4000} value={draft.brief} placeholder="Include the facts needed for your local draft." onChange={e => setDraft({...draft,brief:e.target.value})}/></label>
      <div className="overnight-fields"><label>Ready by<input type="datetime-local" required value={draft.deadline} onChange={e => setDraft({...draft,deadline:e.target.value})}/></label><label>Token budget<input type="number" required min="1000" max="1000000" step="1000" value={draft.budget} onChange={e => setDraft({...draft,budget:e.target.value})}/></label></div>
      <label>Output filename<input required pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]*" maxLength={120} value={draft.path} onChange={e => setDraft({...draft,path:e.target.value})}/></label>
      <label>Required exact phrases, one per line<textarea required rows={3} value={draft.contains} placeholder="Release blocked&#10;Owner Maya" onChange={e => setDraft({...draft,contains:e.target.value})}/></label>
      <label style={{display:'flex',alignItems:'start'}}><input style={{width:'auto'}} type="checkbox" checked={draft.allowWrite} onChange={e => setDraft({...draft,allowWrite:e.target.checked})}/> Allow Sleep to create this output in its isolated task folder. Otherwise it will pause for approval.</label>
      <p>Tokens are reserved before each bounded call. Interrupted calls without provider usage consume the full reservation. Failed checks allow up to three generation attempts.</p>
      {error && <p role="alert">{error}</p>}<button className="button" disabled={busy || !status?.configured}>{busy ? 'Saving...' : 'Assign task'}</button>
    </form></Modal>}
  </div>;
}
