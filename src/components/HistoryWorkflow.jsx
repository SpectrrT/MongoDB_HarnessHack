import { useState } from 'react';
import { ArrowRight, Check, Clock3, Sparkles, X } from 'lucide-react';
import TaskRows from '../vendor/beautiful/TaskRows';
import { ConnectionLogo } from './ConnectionLogo';
import { OrbLoading } from './ScreenTransition';
import snapshot from './history-workflow-snapshot.json';
import '../history-workflow.css';

// Above the chat box: read the computer history, find where the back-and-forth is, and propose a workflow
// Offload could run. The analysis runs on Atlas at every click. If the API can't be reached, the last saved
// analysis of the same sample week is shown, labeled as such.
const post = async (url, body = {}) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const value = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(value.error || 'Request failed.');
  return value;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function refinePrompt({ summary, finding, workflow }) {
  const steps = workflow.steps.map((s, i) => `${i + 1}. ${s.label} (${s.app}): ${s.detail}`).join('\n');
  return [
    `Offload looked at my computer history: ${summary}`,
    finding.topTitle ? `The thread I keep reopening: "${finding.topTitle}" (${finding.topTitleVisitsPerDay} times a night).` : '',
    finding.meetingTimes.length ? `The meetings I end up booking: ${finding.meetingTimes.join(', ')}.` : '',
    `Draft workflow, "${workflow.title}":\n${steps}`,
    'Improve this workflow for me. Keep the step where you ask me once before sending or booking. Say exactly what you would do with the next scheduling thread, and which permissions you need.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export default function HistoryWorkflow({ ready, modelName, onRefine }) {
  const [phase, setPhase] = useState('idle');
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState('');

  const build = async () => {
    setPhase('loading');
    setSaved(false);
    setNote('');
    try {
      const [value] = await Promise.all([post('/api/activity/workflow'), wait(1400)]);
      if (!value.finding) return setPhase('empty');
      setResult(value);
    } catch {
      setResult(snapshot);
      setNote('Showing the last saved analysis of the sample week. The live history is not reachable right now.');
    }
    setPhase('done');
  };
  const handOff = async () => {
    try {
      await post('/api/activity/workflows', { ...result.workflow });
    } catch {
      // Saving is best effort; the card still reflects the decision.
    }
    setSaved(true);
  };

  if (phase === 'idle' || phase === 'empty')
    return (
      <div className="history-workflow-launch">
        <button type="button" onClick={build}>
          <Sparkles size={15} aria-hidden="true" />
          <span>Find work to hand off</span>
          <small>from your computer history</small>
        </button>
        {phase === 'empty' && <p role="status">Nothing repeats enough yet. Keep the collector running for a few days.</p>}
      </div>
    );

  if (phase === 'loading')
    return (
      <div className="history-workflow is-loading">
        <OrbLoading compact state="searching" label="Reading your computer history…" />
        <p>Looking for the hour you switch apps the most, across the last two weeks.</p>
      </div>
    );

  const { finding, summary, workflow } = result;
  const total = finding.timeline.reduce((sum, s) => sum + s.minutes, 0) || 1;
  const shade = (label) => Math.max(0, finding.apps.findIndex((a) => a.label === label));
  return (
    <section className="history-workflow" aria-labelledby="history-workflow-title">
      <header>
        <span className="eyebrow">
          <Clock3 size={13} aria-hidden="true" /> From your computer history
          {finding.sample && <em>Sample week</em>}
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
            <small>{a.visitsPerDay}× a night</small>
          </span>
        ))}
        {finding.topTitle && (
          <span className="stat-chip">
            Reopened “{finding.topTitle}” {finding.topTitleVisitsPerDay}× a night
          </span>
        )}
        {finding.meetingTimes[0] && <span className="stat-chip">Meetings land at {finding.meetingTimes[0]}</span>}
      </div>
      <div className="history-workflow-strip" aria-hidden="true">
        {finding.timeline.map((s, i) => (
          <span key={i} data-shade={shade(s.label)} style={{ flexGrow: s.minutes / total }} title={`${s.name} · ${s.minutes} min`} />
        ))}
      </div>

      <div className="history-workflow-plan">
        <p className="kicker">Offload can take this off your plate</p>
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
          Needs {workflow.needs.join(' · ')}. Saves {workflow.saves}.
        </p>
      </div>

      <footer>
        {saved ? (
          <p className="saved" role="status">
            <Check size={15} aria-hidden="true" /> Handed off. Offload asks you once before it sends or books anything.
          </p>
        ) : (
          <>
            <button type="button" className="button small" onClick={handOff}>
              Hand it off
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
      <p className="source">{note || `Found with one aggregation over ${finding.sessions} sessions in MongoDB Atlas, planned on this Mac.`}</p>
    </section>
  );
}
