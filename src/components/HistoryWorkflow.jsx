import { useEffect, useRef, useState } from 'react';
import { AppWindow, Check, Clock3, Maximize2, Minimize2, Sparkles, SquareTerminal, UserRound, X } from 'lucide-react';
import TaskRows from '../vendor/beautiful/TaskRows';
import { ConnectionLogo } from './ConnectionLogo';
import { OrbLoading } from './ScreenTransition';
import snapshot from './history-workflow-snapshot.json';
import '../history-workflow.css';

// Above the chat box: read the computer history, find where the back-and-forth is, and propose a workflow
// Offload could run. The analysis runs through the local history service at every click. If the API can't be reached, the last saved
// analysis of the engineering example is shown, labeled as such.
const post = async (url, body = {}, signal = AbortSignal.timeout(12000)) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Offload-Client':'local' }, body: JSON.stringify(body), signal });
  if(!r.headers.get('content-type')?.includes('application/json'))throw Error('The local computer history service is unavailable.');
  const value = await r.json();
  if (!r.ok) throw Error(value.error || 'Request failed.');
  return value;
};

const provenanceOf = finding => finding.provenance || (finding.sample ? 'seed' : 'unknown');
const provenanceLabel = finding => ({seed:'Sample activity',captured:'Captured activity',mixed:'Sample and captured activity',unknown:'Activity source not verified'})[provenanceOf(finding)];

function refinePrompt({ summary, finding, workflow }, instruction = '') {
  const steps = workflow.steps.map((s, i) => `${i + 1}. ${s.label} (${s.app}): ${s.detail}`).join('\n');
  return [
    `Source: ${provenanceLabel(finding)}. This is a workflow proposal, not completed work. ${summary}`,
    finding.topTitle ? `Repeated window title: "${finding.topTitle}" (${finding.topTitleVisitsPerDay} visits per recorded day).` : '',
    finding.meetingTimes.length ? `Times found in saved window titles: ${finding.meetingTimes.join(', ')}. These do not prove a meeting was booked.` : '',
    `Draft workflow, "${workflow.title}":\n${steps}`,
    instruction ? `What I want changed: ${instruction}` : '',
    'Improve this proposed workflow using only the supplied evidence. Preserve sample-data labels. Do not claim task completion or authorize sends, bookings, database writes or other external actions. Describe a local draft and the permissions still needed.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

const ICONS = { You: UserRound, Offload: Sparkles, Terminal: SquareTerminal };
const Logo = ({ logo, app, size = 15 }) => {
  if (logo) return <ConnectionLogo id={logo} size={size} />;
  const Icon = ICONS[app] || AppWindow;
  return <Icon size={size} aria-hidden="true" />;
};

export default function HistoryWorkflow({ ready, modelName, onRefine }) {
  const [phase, setPhase] = useState('idle');
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState('');
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState('');
  const [expanded, setExpanded] = useState(false);
  const [instruction, setInstruction] = useState('');
  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);
  const cancel = () => {
    pending.current?.abort();
    pending.current = null;
    setPhase('idle');
  };

  const build = async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const deadline = setTimeout(() => controller.abort(new DOMException('History request timed out.', 'TimeoutError')), 12000);
    setPhase('loading');
    setSaved(false);
    setExpanded(false);
    setInstruction('');
    setNote('');setSaveError('');
    try {
      const value = await post('/api/activity/workflow', {}, controller.signal);
      if (pending.current !== controller) return;
      if (!value.finding) return setPhase('empty');
      setResult(value);
    } catch (error) {
      if (pending.current !== controller || error.name === 'AbortError') return;
      setResult(snapshot);
      setNote('Showing the last saved analysis of the engineering example. The live history is not reachable right now.');
    } finally {
      clearTimeout(deadline);
      if (pending.current === controller) pending.current = null;
    }
    setPhase('done');
  };
  const handOff = async () => {
    setSaving(true);setSaveError('');
    try {
      const {saves,...workflow}=result.workflow;
      const saved=await post('/api/activity/workflows', {...workflow,provenance:provenanceOf(result.finding)});
      if(saved.status!=='saved-proposal'||!saved.id)throw Error('The service did not confirm that this proposal was saved.');
      setSaved(true);
    } catch(error) {setSaveError(error.message);}
    finally {setSaving(false);}
  };
  const refine = (event) => {
    event?.preventDefault();
    if (!ready) return;
    onRefine(refinePrompt(result, instruction.trim()), `Refine “${result.workflow.title}”`);
  };

  if (phase === 'idle' || phase === 'empty')
    return (
      <div className="history-workflow-launch">
        <button type="button" onClick={build}>
          <Sparkles size={15} aria-hidden="true" />
          <span>Find work to hand off</span>
          <small>from saved activity</small>
        </button>
        {phase === 'empty' && <p role="status">No repeated workflow found in the saved activity. You can use the example in Sleep without enabling capture.</p>}
      </div>
    );

  if (phase === 'loading')
    return (
      <div className="history-workflow is-loading" aria-busy="true">
        <OrbLoading compact state="searching" label="Reading saved activity…" />
        <p>Looking for the hour you switch apps the most, across the last 28 days.</p>
        <button type="button" className="text-button" onClick={cancel}>Cancel</button>
      </div>
    );

  const { finding, summary, workflow } = result;
  const night = finding.night || { date: '', sessions: [] };
  const rows = expanded ? night.sessions : night.sessions.slice(0, 6);
  return (
    <section className="history-workflow" aria-labelledby="history-workflow-title">
      <header>
        <span className="eyebrow">
          <Clock3 size={13} aria-hidden="true" /> {provenanceLabel(finding)}
        </span>
        <span className="header-actions">
          <button type="button" className="text-button" aria-expanded={expanded} onClick={() => setExpanded((x) => !x)}>
            {expanded ? <Minimize2 size={13} aria-hidden="true" /> : <Maximize2 size={13} aria-hidden="true" />}
            {expanded ? 'Less' : 'Expanded view'}
          </button>
          <button type="button" className="icon" aria-label="Close" onClick={() => setPhase('idle')}>
            <X size={15} />
          </button>
        </span>
      </header>
      <h3 id="history-workflow-title">{summary}</h3>

      {night.sessions.length > 0 && (
        <div className="history-agenda">
          <p className="agenda-date">{night.date}</p>
          <ol>
            {rows.map((s, i) => (
              <li key={i}>
                <time>{s.time}</time>
                <span className="app-chip">
                  <Logo logo={s.logo} app={s.name} /> {s.name}
                </span>
                <span className="agenda-title">{s.title || ''}</span>
              </li>
            ))}
          </ol>
          {!expanded && night.sessions.length > rows.length && (
            <button type="button" className="text-button more" onClick={() => setExpanded(true)}>
              {night.sessions.length - rows.length} more on this date
            </button>
          )}
        </div>
      )}

      {expanded && (
        <div className="history-more">
          {finding.nights?.length > 1 && (
            <>
              <p className="agenda-date">Recorded dates</p>
              <ul className="history-nights">
                {finding.nights.map((n) => (
                  <li key={n.day}>
                    <span>{n.date}</span>
                    <span>{n.start}</span>
                    <span>{n.minutes} min</span>
                    <span>{n.switches} switches</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {finding.topTitle && <p>Reopened “{finding.topTitle}” {finding.topTitleVisitsPerDay}× per recorded day.</p>}
          {finding.meetingTimes[0] && <p>Time shown in a saved title: {finding.meetingTimes[0]}.</p>}
          {workflow.proactive?.map((p) => <p key={p}>{p}</p>)}
          {workflow.needs?.length > 0 && <p>Needs {workflow.needs.join(' · ')}.</p>}
        </div>
      )}

      <div className="history-workflow-plan">
        <h4>{workflow.title}</h4>
        <p className="trigger">
          <strong>When</strong> {workflow.trigger}
        </p>
        <div className="beautiful-ui">
          <TaskRows
            variant="List"
            labels={{ completed: 'Done', paused: 'Asks you' }}
            rows={workflow.steps.map((s, i) => ({
              key: String(i),
              label: (
                <span className="step-label">
                  <Logo logo={s.logo} app={s.app} size={16} /> {s.label}
                </span>
              ),
              amount: s.ask ? 'Asks you' : s.app,
              status: 'idle',
              step: i + 1,
              details: [{ label: s.detail, meta: '' }],
            }))}
          />
        </div>
      </div>

      <footer>
        {saved ? (
          <p className="saved" role="status">
            <Check size={15} aria-hidden="true" /> Proposal saved. No task has started and no account changes are authorized.
          </p>
        ) : (
          <>
            <button type="button" className="button small" disabled={saving} onClick={handOff}>
              {saving ? 'Saving…' : 'Hand it off'}
            </button>
            {ready && (
              <button type="button" className="button small secondary" onClick={refine}>
                Refine with {modelName}
              </button>
            )}
            <button type="button" className="text-button" onClick={() => setPhase('idle')}>
              Not now
            </button>
          </>
        )}
      </footer>
      {saveError && <p className="history-error" role="alert">{saveError}</p>}
      {!saved && (
        <form className="history-reprompt" onSubmit={refine}>
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            maxLength={300}
            disabled={!ready}
            aria-label="Tell Offload what to change in this workflow"
            placeholder={ready ? 'Tell Offload what to change, e.g. “only on weekdays”' : 'Connect a model to change this workflow'}
          />
        </form>
      )}
      {note && <button type="button" className="text-button" onClick={build}>Retry saved activity</button>}
      <p className="source">
        {note || `Found with one aggregation over ${finding.sessions} saved sessions. This rule-based proposal has not executed any work.`}{' '}
        {workflow.observation || 'Time savings have not been measured.'}
      </p>
    </section>
  );
}
