import { useState } from 'react';
import { Moon, Plus, Pause, Play, X, ArrowUpRight } from 'lucide-react';
import { useWorkspace } from '../store';
import { Modal } from '../components/Modal';
import '../slow-mode.css';
const defaultDeadline = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8,0,0,0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16); };
export default function SlowMode({ children }) {
  const { state, act } = useWorkspace();
  const [tab, setTab] = useState('tasks'), [draft, setDraft] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const open = (suggestion) => { setError(''); setDraft({title: suggestion?.title || '', brief: suggestion ? `${suggestion.reason}\nPrepare a draft for me to review. Do not send or publish anything.` : '', deadline: defaultDeadline(), budget: '10000'}); };
  const tasks = state.overnight || [];
  return <>
    <div className="slow-tabs"><button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>Overnight tasks</button><button className={tab === 'memory' ? 'active' : ''} onClick={() => setTab('memory')}>Memory review</button></div>
    {tab === 'memory' ? children : <div className="standard-page slow-page">
      <div className="slow-heading"><div><span className="slow-label"><Moon size={14}/> SLOW MODE</span><h1>Leave it for<br />the morning.</h1><p>Set a task, a deadline and a token budget.<br />Review the result before anything goes out.</p></div><button className="button" onClick={() => open()}><Plus size={16}/> Add a task</button></div>
      <div className="overnight-heading"><h2>Overnight queue</h2><span>{tasks.filter(t => t.status !== 'cancelled').length} tasks</span></div>
      {!tasks.length && <div className="overnight-empty"><Moon size={26}/><h3>What can wait until morning?</h3><p>Add a brief with the result you need. Your tasks and budgets stay saved here.</p></div>}
      {tasks.map(t => <article className="overnight-task" key={t.id}>
        <div className="overnight-task-head"><h3>{t.title}</h3><span>{t.status === 'queued' ? 'Runner needed' : t.status === 'paused' ? 'Paused' : 'Cancelled'}</span></div>
        <p>{t.brief}</p><div className="overnight-meta"><span>Due {new Date(t.deadline).toLocaleString([], {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'})}</span><span>{t.budget.toLocaleString()} token target</span><span>{t.tokensUsed} used</span></div>
        {t.status !== 'cancelled' && <div className="overnight-actions"><button className="button small secondary" onClick={() => act('overnight', {id:t.id, status:t.status === 'paused' ? 'queued' : 'paused'}).catch(() => {})}>{t.status === 'paused' ? <Play size={14}/> : <Pause size={14}/>}{t.status === 'paused' ? 'Return to queue' : 'Pause task'}</button><button className="button small ghost" onClick={() => act('overnight', {id:t.id, status:'cancelled'}).catch(() => {})}><X size={14}/>Cancel task</button></div>}
      </article>)}
      <p className="runner-note">You can save tasks now. Overnight execution needs a connected worker. It will not start from this browser.</p>
      <div className="overnight-heading"><h2>Ideas for tonight</h2><span>Choose what to queue</span></div>
      {state.suggestions.filter(s => s.status === 'pending').slice(0,4).map(s => <button className="night-suggestion" key={s.id} onClick={() => open(s)}><span><strong>{s.title}</strong><small>{s.reason}</small></span><ArrowUpRight size={18}/></button>)}
      <p className="runner-note">The token budget is saved as a target. The overnight worker is not connected, so no tokens are spent by queued tasks.</p>
    </div>}
    {draft && <Modal title="Queue an overnight task" onClose={() => setDraft(null)}><form className="overnight-form" onSubmit={async e => {e.preventDefault(); setBusy(true); setError(''); try {await act('overnight', {...draft, deadline: new Date(draft.deadline).getTime(), budget:Number(draft.budget)}); setDraft(null);} catch(e) {setError(e.message);} finally {setBusy(false);} }}>
      <label>Task<input autoFocus required maxLength={160} value={draft.title} placeholder="Prepare tomorrow's project update" onChange={e => setDraft({...draft,title:e.target.value})}/></label>
      <label>What should be ready?<textarea required rows={4} maxLength={4000} value={draft.brief} placeholder="Describe the result and how to check it." onChange={e => setDraft({...draft,brief:e.target.value})}/></label>
      <div className="overnight-fields"><label>Ready by<input type="datetime-local" required value={draft.deadline} onChange={e => setDraft({...draft,deadline:e.target.value})}/></label><label>Token budget<input type="number" required min="1000" max="1000000" step="1000" value={draft.budget} onChange={e => setDraft({...draft,budget:e.target.value})}/></label></div>
      <p>This saves your brief. A worker must be connected before it can run.</p>{error && <p role="alert">{error}</p>}<button className="button" disabled={busy}>{busy ? 'Saving…' : 'Save to queue'}<Moon size={15}/></button>
    </form></Modal>}
  </>;
}
