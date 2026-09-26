import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, History, Upload } from 'lucide-react';
import { Modal } from './Modal';
import SleepServiceNotice from './SleepServiceNotice';
import { mongodbDemoSources, MONGODB_DEMO } from '../../shared/mongodb-demo';
import './PersonalSuggestions.css';

const api = async (path = '', body) => {
  const response = await fetch(`/api/suggestions${path}`, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.headers.get('content-type')?.includes('application/json')) throw Error('Next actions need the local Offload service. Open the local app to import sessions and prepare tasks.');
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Unable to load saved suggestions.');
  return result;
};
const safeLink = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } };
const kindLabel = kind => ({ 'meeting-prep': 'Meeting preparation', 'meeting-followup': 'Meeting follow-up', 'weekly-routine': 'Weekly routine', 'recover-context': 'Project context' }[kind] || 'Suggested task');
const runLabel = run => run.status === 'completed' ? (run.outputs?.artifact ? 'Draft ready' : 'Finished without a downloadable draft')
  : ({ queued: 'Waiting for the local worker', running: 'Preparing draft', failed: 'Could not prepare draft', paused: 'Paused', needs_review: 'Needs your review', cancelled: 'Cancelled' }[run.status] || run.status);

const defaultDeadline = () => { const value = new Date(); value.setDate(value.getDate() + 1); value.setHours(8, 0, 0, 0); return new Date(+value - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

export default function PersonalSuggestions() {
  const navigate = useNavigate();
  const [actionDraft, setActionDraft] = useState(null), [exampleOpen, setExampleOpen] = useState(false);
  const fileInput = useRef(null);
  const [state, setState] = useState(null), [project, setProject] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [versions, setVersions] = useState(null), [checking, setChecking] = useState(false), [meeting, setMeeting] = useState(null);
  const load = useCallback(async () => {
    try { const data = await api(); setState(data); setError(''); setProject(old => old || data.projects[0]?.projectId || ''); }
    catch (failure) { setError(failure.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const retry = async () => { setChecking(true); try { await load(); } finally { setChecking(false); } };
  const hasWork = state?.runs.some(run => ['queued', 'running'].includes(run.status));
  useEffect(() => { if (!hasWork) return; const timer = setInterval(load, 2000); return () => clearInterval(timer); }, [hasWork, load]);
  const act = async fn => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); await load(); } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };
  const decide = (id, decision) => act(async () => {
    const result = await api(`/${id}/decision`, { decision });
    if (decision === 'accept') setNotice(result.run?.status === 'completed' ? 'Draft ready. Review it before acting on the listed items.' : 'Task queued. The local worker will prepare a draft from the cited sources.');
  });
  const importFile = event => {
    const file = event.target.files?.[0]; if (!file) return;
    act(async () => {
      if (file.size > 8 * 1024 * 1024) throw Error('Choose a sessions file smaller than 8 MB.');
      const input = JSON.parse(await file.text()), events = Array.isArray(input) ? input : input.events;
      if (!Array.isArray(events) || !events.length || events.length > 5000) throw Error('Choose a sessions export with 1 to 5,000 source notes.');
      let imported = 0;
      for (let i = 0; i < events.length; i += 500) imported += (await api('/import', { events: events.slice(i, i + 500) })).inserted;
      setNotice(`Imported ${imported} source notes. Review the suggested next steps below.`);
    });
    event.target.value = '';
  };
  const addMeeting = () => {
    setError('');
    setMeeting({ id: crypto.randomUUID(), sourceId: `meeting-note-${crypto.randomUUID()}`, title: '', startsAt: '', endsAt: '', status: 'scheduled', notes: '', url: '' });
  };
  const saveMeeting = event => {
    event.preventDefault();
    act(async () => {
      const startsAt = new Date(meeting.startsAt), endsAt = new Date(meeting.endsAt);
      if (!(+endsAt > +startsAt)) throw Error('The meeting end must be after its start.');
      if (meeting.status === 'completed' && +endsAt > Date.now()) throw Error('A completed meeting must have already ended.');
      if (meeting.url && !safeLink(meeting.url)) throw Error('Use an http or https source link.');
      const selected = state?.projects.find(item => item.projectId === project);
      await api('/import', { events: [{
        sourceId: meeting.sourceId, sessionId: `meeting-${meeting.id}`, projectId: selected?.projectId || 'meetings',
        projectTitle: selected?.title || 'Meetings', timestamp: new Date().toISOString(), text: meeting.notes.trim(),
        kind: 'meeting-note', origin: 'user', locator: meeting.url || 'User-entered meeting notes',
        meeting: { id: meeting.id, title: meeting.title.trim(), startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), status: meeting.status },
      }] });
      setMeeting(null);
      setNotice('Meeting notes saved. Review any suggested draft below before starting it.');
    });
  };
  const loadExample = () => act(async () => {
    await api('/import', { events: mongodbDemoSources() });
    setProject(MONGODB_DEMO.projectId); setExampleOpen(false);
    setNotice('Example notes loaded. Choose Start once to prepare a checklist, then Draft this to assign a model task.');
  });
  const queueActionDraft = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const deadline = new Date(actionDraft.deadline).getTime();
      if (deadline <= Date.now() || deadline > Date.now() + 31 * 86400000) throw Error('Choose a future deadline within 31 days.');
      const result = await api(`/runs/${actionDraft.runId}/actions/${actionDraft.index}/draft`, {
        deadline, budget: Number(actionDraft.budget), maxAttempts: Number(actionDraft.maxAttempts),
      });
      if (!result.task?.id) throw Error('The service did not return a task. Check the task list before trying again.');
      navigate('/app/sleep?view=tasks', { state: { queuedDraft: {
        id: result.task.id, title: result.task.title, status: result.task.status,
        workerEnabled: result.workerEnabled === true,
      } } });
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <div className="standard-page personal-suggestions" aria-label="Personal task suggestions">
    <div className="page-title"><div><h1>Next actions</h1><p>Prepare for a meeting, follow up on notes, or resume work from saved evidence.</p></div></div>
    {error && !meeting && !actionDraft && !exampleOpen && <SleepServiceNotice message={error} onRetry={!state ? retry : undefined} busy={checking} />}
    {notice && <p className="suggestion-notice" role="status">{notice}</p>}
    <div className="suggestion-source-actions">
      <button className="button secondary" disabled={busy} onClick={addMeeting}><CalendarDays size={16} />Add meeting notes</button>
      <button className="text-button" disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={15} />Import selected sessions</button>
      <Link to="/app/history"><History size={15} />Computer history</Link>
      <button className="text-button" disabled={busy} onClick={() => setExampleOpen(true)}>Try an example</button>
    </div>
    <input ref={fileInput} type="file" accept="application/json,.json" disabled={busy} onChange={importFile} hidden />
    {!state && error && <p className="suggestion-example-link"><Link to="/example">Example workflow</Link><span>Prepared from sample data.</span></p>}
    <p className="muted">Suggestions use the sources you save here. Start once authorizes a local draft. Sending, publishing and completing action items require a separate decision.</p>
    {!state && !error && <p role="status">Loading saved evidence...</p>}
    {state && <>
      {!!state.projects.length && <div className="button-row suggestion-project"><label>Project<select aria-label="Project" value={project} onChange={event => setProject(event.target.value)}>
        <option value="">Choose a project</option>{state.projects.map(item => <option key={item.projectId} value={item.projectId}>{item.title}</option>)}
      </select></label><button className="button secondary" disabled={busy || !project} onClick={() => act(async () => {
        const result = await api('/open', { projectId: project }); if (!result.suggestion) setNotice('No context-recovery task is due for this project.');
      })}>Resume project</button></div>}
      {!state.suggestions.length && <div className="suggestion-empty"><h2>No next action to review yet.</h2><p>Add an agenda for an upcoming meeting or notes from a completed one. Meeting preparation appears within 24 hours of its start.</p></div>}
      {state.suggestions.map(suggestion => <article className="suggestion-action" key={suggestion._id}>
        <div className="suggestion-kind">{kindLabel(suggestion.kind)}{suggestion.source === 'seed' ? ' · Sample data' : suggestion.source === 'mixed' ? ' · Includes sample data' : ''}</div>
        <h2>{suggestion.title}</h2><p>{suggestion.reason}</p>{suggestion.outputLabel && <p>Output: {suggestion.outputLabel}</p>}
        <details><summary>Why this task?</summary><p>{suggestion.completionMeaning || 'Creates a local context draft with source references. Nothing is sent or published.'}</p>
          <ul>{(suggestion.evidence || []).map(source => <li key={source.id}><time>{new Date(source.date).toLocaleDateString()}</time>{' '}{safeLink(source.locator) ? <a href={safeLink(source.locator)} target="_blank" rel="noreferrer">Open source</a> : <span>{source.locator}</span>}{source.source === 'seed' && ' · Sample data'}</li>)}</ul>
        </details>
        <div className="button-row"><button className="button" disabled={busy} onClick={() => decide(suggestion._id, 'accept')}>Start once</button>
          <button className="button secondary" disabled={busy} onClick={() => decide(suggestion._id, 'snooze')}>Snooze</button>
          <details className="suggestion-more"><summary>More options</summary><div><button className="text-button" disabled={busy} onClick={() => decide(suggestion._id, 'dismiss')}>Dismiss</button><button className="text-button" disabled={busy} onClick={() => decide(suggestion._id, 'mute')}>Stop suggesting</button></div></details>
        </div>
      </article>)}
      {!!state.runs.length && <section className="suggestion-runs" aria-label="Recent tasks"><h2>Recent tasks</h2>{state.runs.map(run => <article className="suggestion-action" key={run._id}>
        <h3>{run.input?.title || run.input?.projectTitle || 'Saved task'}</h3><p className="suggestion-run-state">{runLabel(run)}</p>
        {run.error && <p>{run.error}</p>}
        {['queued', 'running'].includes(run.status) && <button className="button secondary small" disabled={busy} onClick={() => act(async () => { await api(`/runs/${run._id}/cancel`, {}); setNotice('Task cancelled.'); })}>Cancel task</button>}
        {run.status === 'completed' && run.outputs?.artifact && <><p>Review the draft before acting on it. Listed action items are not marked complete.</p><a className="button secondary" href={`/api/suggestions/artifacts/${run._id}`}>Download draft</a></>}
        {run.status === 'completed' && run.input?.kind === 'meeting-followup' && !!run.outputs?.draft?.actionItems?.length && <div className="suggestion-action-items"><h4>Recorded action items</h4><p>Choose one to prepare a local draft. The original action stays open.</p><ul>{run.outputs.draft.actionItems.map((item, index) => <li key={`${item.sourceId}-${index}`}>
          <blockquote>{item.text}</blockquote>
          {item.draftSupported === true ? <button className="button secondary small" aria-label={`Draft this: ${item.text}`} disabled={busy} onClick={() => { setError(''); setActionDraft({ runId: run._id, index, text: item.text, deadline: defaultDeadline(), budget: '10000', maxAttempts: '1' }); }}>Draft this</button>
            : <p>{item.draftUnsupportedReason || 'Keep this as a manual action. Only supported local writing tasks can run in Sleep.'}</p>}
        </li>)}</ul></div>}
      </article>)}</section>}
      {state.policy && <details className="suggestion-policy"><summary>Suggestion settings and history</summary><p>Policy version {state.policy.version}: context recovery needs at least {state.policy.settings.minSupport} independent sessions, with a {state.policy.settings.cooldownHours}-hour cooldown.</p>
        <button className="button secondary" disabled={busy} onClick={() => act(async () => setVersions(await api('/policy')))}>Show policy history</button>
        {versions?.versions.map(version => <div key={version._id}><p>Version {version.version}: {version.status}. {version.reason}</p>{version.evaluation && <p>Held-out correct: {version.evaluation.heldOut.before.correct} to {version.evaluation.heldOut.after.correct} of {version.evaluation.heldOut.after.total}. Regressions: {version.evaluation.heldOut.regressions.length}.</p>}</div>)}
        {versions?.versions.find(version => version._id === versions.activeId)?.parent && <button className="button secondary" disabled={busy} onClick={() => act(async () => { await api('/policy/rollback', { expectedActiveId: versions.activeId }); setVersions(await api('/policy')); })}>Restore previous policy</button>}
      </details>}
    </>}
    {exampleOpen && <Modal title="Try an example" onClose={() => !busy && setExampleOpen(false)}><div className="meeting-note-form">
      <p>Sample meeting notes for a MongoDB engineer. Load them here, then choose Start once to prepare a source-linked checklist.</p>
      <p>Draft this can turn one selected action into a model task after you choose its budget and deadline.</p>
      {!state && <p>The local service must be connected to load the notes. You can still open the prepared example.</p>}
      {error && <p role="alert">{error}</p>}
      <div className="button-row"><button className="button" disabled={busy || !state} onClick={loadExample}>{busy ? 'Loading...' : 'Load sample notes'}</button><Link to="/example">Example workflow</Link></div>
    </div></Modal>}
    {actionDraft && <Modal title="Draft an action item" onClose={() => !busy && setActionDraft(null)}><form className="meeting-note-form" onSubmit={queueActionDraft}>
      <blockquote className="suggestion-action-quote">{actionDraft.text}</blockquote>
      <p>Sleep will use the cited notes to prepare action-draft.md and source-evidence.md. This queues a model task. You will review the proposed local files before they are saved.</p>
      <div className="meeting-note-times"><label>Ready by<input autoFocus required type="datetime-local" value={actionDraft.deadline} onChange={event => setActionDraft({ ...actionDraft, deadline: event.target.value })} /></label><label>Total token budget<input required type="number" min="1000" max="100000" step="1000" value={actionDraft.budget} onChange={event => setActionDraft({ ...actionDraft, budget: event.target.value })} /></label></div>
      <label>Maximum attempts<select value={actionDraft.maxAttempts} onChange={event => setActionDraft({ ...actionDraft, maxAttempts: event.target.value })}><option value="1">1 attempt</option><option value="2">2 attempts</option><option value="3">3 attempts</option></select></label>
      <p>The budget covers all attempts. Times use {Intl.DateTimeFormat().resolvedOptions().timeZone}. Nothing is sent or published, and the original action is not marked complete.</p>
      {error && <p role="alert">{error}</p>}
      <button className="button" disabled={busy}>{busy ? 'Queueing...' : 'Queue draft task'}</button>
    </form></Modal>}
    {meeting && <Modal title="Add meeting notes" onClose={() => !busy && setMeeting(null)}><form className="meeting-note-form" onSubmit={saveMeeting}>
      <label>Meeting title<input autoFocus required maxLength={120} value={meeting.title} onChange={event => setMeeting({ ...meeting, title: event.target.value })} /></label>
      <label>Meeting status<select value={meeting.status} onChange={event => setMeeting({ ...meeting, status: event.target.value })}><option value="scheduled">Upcoming meeting</option><option value="completed">Completed meeting</option></select></label>
      <div className="meeting-note-times"><label>Starts<input type="datetime-local" required value={meeting.startsAt} onChange={event => setMeeting({ ...meeting, startsAt: event.target.value })} /></label><label>Ends<input type="datetime-local" required value={meeting.endsAt} onChange={event => setMeeting({ ...meeting, endsAt: event.target.value })} /></label></div>
      <p>Times use your computer's timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
      <label>Agenda or meeting notes<textarea required rows={5} maxLength={4000} value={meeting.notes} onChange={event => setMeeting({ ...meeting, notes: event.target.value })} /></label>
      <p>For follow-ups, put each recorded action on its own line starting with “Action:”. Preserve the owner and deadline from your notes.</p>
      <label>Source link (optional)<input type="url" maxLength={240} value={meeting.url} onChange={event => setMeeting({ ...meeting, url: event.target.value })} /></label>
      {error && <p role="alert">{error}</p>}
      {!state && <p>Connect the local service before saving these notes.</p>}
      <button className="button" disabled={busy || !state}>{busy ? 'Saving...' : 'Save meeting notes'}</button>
    </form></Modal>}
  </div>;
}
