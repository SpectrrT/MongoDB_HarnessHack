import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Clock3, Sparkles, X } from 'lucide-react';
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

function refinePrompt({ summary, finding, workflow }) {
  const steps = workflow.steps.map((s, i) => `${i + 1}. ${s.label} (${s.app}): ${s.detail}`).join('\n');
  return [
    `Source: ${provenanceLabel(finding)}. This is a workflow proposal, not completed work. ${summary}`,
    finding.topTitle ? `Repeated window title: "${finding.topTitle}" (${finding.topTitleVisitsPerDay} visits per recorded day).` : '',
    finding.meetingTimes.length ? `Times found in saved window titles: ${finding.meetingTimes.join(', ')}. These do not prove a meeting was booked.` : '',
    `Draft workflow, "${workflow.title}":\n${steps}`,
    'Improve this proposed workflow using only the supplied evidence. Preserve sample-data labels. Do not claim task completion or authorize sends, bookings, database writes or other external actions. Describe a local draft and the permissions still needed.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export default function HistoryWorkflow({ ready, modelName, onRefine }) {
  const [phase, setPhase] = useState('idle');
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState('');
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState('');
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
  const total = finding.timeline.reduce((sum, s) => sum + s.minutes, 0) || 1;
  const shade = (label) => Math.max(0, finding.apps.findIndex((a) => a.label === label));
  return (
    <section className="history-workflow" aria-labelledby="history-workflow-title">
      <header>
        <span className="eyebrow">
          <Clock3 size={13} aria-hidden="true" /> {provenanceLabel(finding)}
        </span>
        <button type="button" className="icon" aria-label="Close" onClick={() => setPhase('idle')}>
          <X size={15} />
        </button>
      </header>
      <h3 id="history-workflow-title">{summary}</h3>
      <div className="history-workflow-apps">
        {finding.apps.map((a) => (
          <span key={a.label} className="app-chip">
            {a.logo ? <ConnectionLogo id={a.logo} size={16} /> : null}
            {a.name}
            <small>{a.visitsPerDay}× per recorded day</small>
          </span>
        ))}
        {finding.topTitle && (
          <span className="stat-chip">
            Reopened “{finding.topTitle}” {finding.topTitleVisitsPerDay}× per recorded day
          </span>
        )}
        {finding.meetingTimes[0] && <span className="stat-chip">Time shown in a saved title: {finding.meetingTimes[0]}</span>}
      </div>
      <div className="history-workflow-strip" aria-hidden="true">
        {finding.timeline.map((s, i) => (
          <span key={i} data-shade={shade(s.label)} style={{ flexGrow: s.minutes / total }} title={`${s.name} · ${s.minutes} min`} />
        ))}
      </div>

      <div className="history-workflow-plan">
        <p className="kicker">Proposed workflow</p>
        <h4>{workflow.title}</h4>
        <p className="problem">{workflow.problem}</p>
        <p className="trigger">
          <strong>When</strong> {workflow.trigger}
        </p>
        <div className="beautiful-ui">
          <TaskRows
            variant="List"
            labels={{ completed: 'Done', paused: 'Asks you' }}
            rows={workflow.steps.map((s, i) => ({
              key: String(i),
              label: s.label,
              amount: s.ask ? 'Asks you' : s.app,
              status: 'idle',
              step: i + 1,
              details: [{ label: s.detail, meta: '' }],
            }))}
          />
        </div>
        <ul className="history-workflow-proactive">
          {workflow.proactive.map((p) => (
            <li key={p}>
              <ArrowRight size={13} aria-hidden="true" /> {p}
            </li>
          ))}
        </ul>
        <p className="needs">
          Needs {workflow.needs.join(' · ')}. {workflow.observation || 'Time savings have not been measured.'}
        </p>
      </div>

      <footer>
        {saved ? (
          <p className="saved" role="status">
            <Check size={15} aria-hidden="true" /> Proposal saved. No task has started and no account changes are authorized.
          </p>
        ) : (
          <>
            <button type="button" className="button small" disabled={saving} onClick={handOff}>
              {saving ? 'Saving…' : 'Save proposal'}
            </button>
            {ready && (
              <button type="button" className="button small secondary" onClick={() => onRefine(refinePrompt(result), `Refine “${workflow.title}”`)}>
                Refine with {modelName}
              </button>
            )}
            <button type="button" className="text-button" onClick={() => setPhase('idle')}>
              Not now
            </button>
          </>
        )}
      </footer>
      {saveError&&<p role="alert">{saveError}</p>}
      {note && <button type="button" className="text-button" onClick={build}>Retry saved activity</button>}
      <p className="source">{note || `Found with one aggregation over ${finding.sessions} saved sessions. This rule-based proposal has not executed any work.`}</p>
    </section>
  );
}
