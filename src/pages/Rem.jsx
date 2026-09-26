import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, Plug, Sun, Moon, Sunrise, RefreshCw, FlaskConical } from "lucide-react";
import { Modal } from "../components/Modal";
import { ThinkingOrb } from "../components/ScreenTransition";
import LoadingState from "../vendor/beautiful/LoadingState";
import { useWorkspace } from "../store";
import { resolveTheme } from "../../shared/themes";
import "../rem.css";

// REM: day (durable runs) -> night (consolidate + evolve) -> morning (brief, diff, asks).
// Every number on this page comes from GET /api/rem/state, POST /api/rem/run|sleep|simulate,
// or the live change-stream events at GET /api/rem/stream. Nothing here is computed locally
// except formatting.

const TASKS = [
  ["weekly-brief", "Weekly brief"],
  ["standup", "Standup"],
  ["blockers", "Unresolved blockers"],
  ["follow-ups", "Promised follow-ups"],
  ["release-handoff", "Release handoff"],
  ["review-prep", "Product review prep"],
  ["review-brief", "Product review brief"],
  ["cleanup-drafts", "Clean up old drafts"],
  ["recap", "Project recap"],
];

const PHASE_BY_COLLECTION = {
  rehearsals: "Rehearse",
  memories: "Merge",
  episodes: "Merge",
  skills: "Distill",
  edits: "Evolve",
  harnesses: "Evolve",
  asks: "Asks",
  briefs: "Brief",
};
const PHASES = ["Replay", "Merge", "Distill", "Rehearse", "Evolve", "Calibrate", "Asks", "Brief"];
const METRIC_ORDER = ["tasks", "passed", "passRate", "collateral", "cost", "steps", "interventions", "latencyMs"];
const STATUS_CLASS = { running: "is-running", paused_for_auth: "is-blocked", done: "is-ready", incomplete: "is-blocked", failed: "is-cancelled" };

const readResponse = async (response) => {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw Error("REM needs the local Offload service. This website does not host the engine. Open the local app to run tasks and review results.");
  }
  const value = await response.json();
  if (!response.ok) throw Error(value?.error || "Request failed.");
  return value;
};
const get = async (url) => readResponse(await fetch(url));
const post = async (url, body) => readResponse(await fetch(url, {
  method: "POST", headers: { "Content-Type": "application/json", "X-Offload-Client": "local" }, body: JSON.stringify(body ?? {}),
}));
const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;
const money = (x) => Number.isFinite(x) ? `$${x.toFixed(4)}` : "n/a";
const LABEL_OVERRIDES = { latencyMs: "Latency" };
const label = (key) =>
  LABEL_OVERRIDES[key] || key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
const statusClass = (s) => STATUS_CLASS[s] || "";

function fmtMetric(key, value) {
  if (value === undefined || value === null) return "n/a";
  if (key === "passRate" || /Rate$/.test(key)) return pct(value);
  if (/^cost/i.test(key) || /Cost$/.test(key)) return money(value);
  if (key === "latencyMs") return `${Math.round(value / 1000)}s`;
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(3);
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  return String(value);
}
function metricKeys(...objs) {
  const keys = new Set();
  for (const o of objs) if (o) for (const k of Object.keys(o)) keys.add(k);
  const known = METRIC_ORDER.filter((k) => keys.has(k));
  const rest = [...keys].filter((k) => !METRIC_ORDER.includes(k)).sort();
  return [...known, ...rest];
}
const fmtDelta = (d) =>
  d
    ? `${d.passDelta >= 0 ? "+" : ""}${d.passDelta} pass, ${d.stepsDelta >= 0 ? "+" : ""}${d.stepsDelta} steps/task, ${
        d.costDelta >= 0 ? "+" : ""
      }${Math.round(d.costDelta * 100)}% cost${d.flips?.length ? `, flips ${d.flips.join(", ")}` : ""}`
    : "n/a";

function PolicyValue({ value }) {
  if (value == null) return <span>Not set</span>;
  if (Array.isArray(value)) return <span>{value.length ? value.join(", ") : "None"}</span>;
  if (typeof value === "object") return <dl className="rem-policy-values">{Object.entries(value).map(([key, item]) =>
    <div key={key}><dt>{label(key)}</dt><dd><PolicyValue value={item} /></dd></div>)}</dl>;
  return <span>{typeof value === "boolean" ? (value ? "Enabled" : "Disabled") : String(value)}</span>;
}

function Disclosure({ title, children, open = false }) {
  return <details className="rem-disclosure" open={open}><summary>{title}</summary><div className="rem-disclosure-body">{children}</div></details>;
}

function useRemEvents() {
  const [events, setEvents] = useState([]);
  const [hello, setHello] = useState(null);
  const [connected, setConnected] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  useEffect(() => {
    const es = new EventSource("/api/rem/stream");
    const onHello = (e) => {
      try {
        setHello(JSON.parse(e.data));
        setConnected(true);
      } catch {}
    };
    const onChange = (e) => {
      try {
        const data = JSON.parse(e.data);
        setEvents((prev) => [...prev.slice(-499), { ...data, at: Date.now() }]);
      } catch {}
    };
    const onReset = () => { setEvents([]); setResetVersion((value) => value + 1); };
    es.onerror = () => setConnected(false);
    es.addEventListener("hello", onHello);
    es.addEventListener("change", onChange);
    es.addEventListener("reset", onReset);
    return () => es.close();
  }, []);
  return { events, hello, connected, resetVersion };
}

function FitnessTable({ title, before, after }) {
  const [selected, setSelected] = useState("heldOut");
  if (!before && !after) return null;
  const splits = [
    ["train", "Train"],
    ["heldOut", "Held-out"],
    ["all", "All"],
  ].filter(([key]) => before?.[key] || after?.[key]);
  const activeSplit = splits.some(([key]) => key === selected) ? selected : splits[0]?.[0];
  return (
    <div className="rem-fitness">
      <div className="rem-split-picker" role="group" aria-label={`${title} data split`}>
        {splits.filter(([key]) => before?.[key] || after?.[key]).map(([key, name]) =>
          <button key={key} aria-pressed={activeSplit === key} onClick={() => setSelected(key)}>{name}</button>)}
      </div>
      <div className="rem-table-wrap" tabIndex={0} role="region" aria-label={title}>
      <table className="rem-table">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th>Before</th>
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          {splits.filter(([key]) => key === activeSplit).map(([key, name]) => {
            const b = before?.[key],
              a = after?.[key];
            if (!b && !a) return null;
            const keys = metricKeys(b, a);
            return (
              <React.Fragment key={key}>
                <tr className="rem-table-split">
                  <td colSpan={3}>{name}</td>
                </tr>
                {keys.map((k) => (
                  <tr key={k}>
                    <td>{label(k)}</td>
                    <td>{fmtMetric(k, b?.[k])}</td>
                    <td>{fmtMetric(k, a?.[k])}</td>
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function GenomeView({ genome }) {
  if (!genome) return null;
  return (
    <div className="rem-genome">
      <div>
        <h3>Rules ({genome.rules.length})</h3>
        {genome.rules.length ? (
          <ul>
            {genome.rules.map((r) => (
              <li key={r.id}>{r.text}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">None yet.</p>
        )}
      </div>
      <div>
        <h3>Guardrails ({genome.guardrails.length})</h3>
        {genome.guardrails.length ? (
          <ul>
            {genome.guardrails.map((g) => (
              <li key={g.id}>{g.description}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">None yet.</p>
        )}
      </div>
      <div>
        <h3>Tool scopes</h3>
        <ul>
          {Object.entries(genome.toolScopes).map(([provider, ops]) => (
            <li key={provider}>
              {provider}: {ops.length ? ops.join(", ") : "none"}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Context policy</h3>
        <ul>
          {Object.entries(genome.contextPolicy).map(([k, v]) => (
            <li key={k}>
              <span>{label(k)}</span>: <PolicyValue value={v} />
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Model routing</h3>
        <ul>
          {Object.entries(genome.routing).map(([k, v]) => (
            <li key={k}>
              {label(k)}: {v ?? "n/a"}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PatternsList({ patterns }) {
  if (!patterns?.length) return <p className="muted">No weakness patterns mined.</p>;
  return (
    <ul className="rem-patterns">
      {patterns.map((p) => (
        <li key={p.name}>
          <strong>{p.title}</strong> <span className="muted">({p.severity}, tasks {p.tasks.join(", ")})</span>
        </li>
      ))}
    </ul>
  );
}

function EditsList({ edits }) {
  if (!edits?.length) return <p className="muted">No edits proposed this night.</p>;
  return (
    <div className="rem-edits">
      {edits.map((e) => {
        const key = e.editId || e._id || e.description;
        const status = e.outcome?.status;
        return (
          <article key={key} className="rem-edit">
            <div className="section-line">
              <h3>{e.description}</h3>
              <span className={"status-label " + (status === "accepted" || status === "auto-approved" ? "is-ready" : status === "rejected" ? "is-blocked" : "")}>
                {status || "queued"}
              </span>
            </div>
            <p className="muted">
              {e.rationale}
              {e.pattern ? ` (pattern: ${e.pattern})` : ""}
            </p>
            <div className="rem-predict-observe">
              <div>
                <span className="rem-eyebrow">Predicted</span>
                <p>{fmtDelta(e.prediction)}</p>
              </div>
              <div>
                <span className="rem-eyebrow">Observed{e.outcome?.train ? " (train)" : ""}</span>
                <p>{e.outcome?.train ? fmtDelta(e.outcome.train) : e.outcome?.reason || "not yet validated"}</p>
              </div>
            </div>
            {e.outcome?.heldOut && (
              <p className="muted">
                Held-out pass delta {e.outcome.heldOut.passDelta >= 0 ? "+" : ""}
                {e.outcome.heldOut.passDelta}, regressed {e.outcome.heldOut.regressed}.
              </p>
            )}
            {!!e.heldOutRegressedTitles?.length && <p className="muted">Regressed: {e.heldOutRegressedTitles.join(", ")}</p>}
            {e.outcome?.predictionError != null && <p className="muted">Prediction error: {e.outcome.predictionError}</p>}
            {e.outcome?.challenge && (
              <p className="muted">
                Adversarial challenge: held {e.outcome.challenge.held} of {e.outcome.challenge.attacks}
                {e.outcome.challenge.failed?.length ? `, failed ${e.outcome.challenge.failed.map((f) => `${f.taskId} ${f.attack}`).join(", ")}` : ""}.
              </p>
            )}
            <p className="rem-gate">
              {status === "accepted" || status === "auto-approved"
                ? "No-regression gate: passed, net-positive."
                : status === "rejected"
                  ? `No-regression gate: rejected (${e.outcome.reason}).`
                  : status === "queued-ask"
                    ? "Needs new authority: queued as a morning ask."
                    : "Awaiting validation."}
            </p>
          </article>
        );
      })}
    </div>
  );
}

function Lineage({ lineage }) {
  if (!lineage?.length) return <p className="muted">No harness versions yet.</p>;
  const latest = lineage.at(-1)?.version;
  return (
    <div className="rem-lineage">
      {[...lineage].reverse().map((v) => (
        <details key={v.version} open={v.version === latest}>
          <summary>
            v{v.version}
            {v.parentVersion != null ? ` (from v${v.parentVersion})` : " (gen 0)"} · night {v.night ?? "seed"} ·{" "}
            {v.fitness ? `${v.fitness.all.passed}/${v.fitness.all.tasks} passed, ${money(v.fitness.all.cost)}` : "no gym run yet"}
          </summary>
          {v.diffText?.length ? (
            <ul>
              {v.diffText.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">No changes from the parent.</p>
          )}
        </details>
      ))}
    </div>
  );
}

function AsksList({ asks, onDecide, busy }) {
  const [answers, setAnswers] = useState({});
  if (!asks?.length) return <p className="muted">No open asks.</p>;
  return (
    <div className="rem-asks">
      {asks.map((a) => (
        <article key={a._id} className="rem-ask">
          <p>{a.text}</p>
          {a.validation?.reason && <p className="muted">{a.validation.reason}</p>}
          {a.kind === "owner" && <label className="rem-answer" htmlFor={`answer-${a._id}`}>Owner name
            <input id={`answer-${a._id}`} value={answers[a._id] || ""} maxLength={80} disabled={busy} onChange={(event) => setAnswers((previous) => ({ ...previous, [a._id]: event.target.value }))} placeholder="Who owns this item?" />
          </label>}
          <span className="muted">
            {label(a.kind.replaceAll(".", " "))}
            {a.risk ? ` · risk: ${a.risk}` : ""}
          </span>
          <div className="button-row">
            <button className="button small" disabled={busy || (a.kind === "owner" && !answers[a._id]?.trim())} onClick={() => onDecide(a._id, "approve", a.kind === "owner" ? answers[a._id].trim() : undefined)}>
              {a.kind === "owner" ? "Save answer" : "Approve"}
            </button>
            <button className="button small secondary" disabled={busy} onClick={() => onDecide(a._id, "deny")}>
              Deny
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function RunExtras({ run }) {
  const gate = run?.completion;
  const inj = run?.injected;
  const compact = run?.compaction;
  if (!gate && !inj && !compact) return null;
  return (
    <div className="rem-run-extras">
      {compact && Number.isFinite(compact.beforeBytes) ? <p>Sleep working transcript: {compact.beforeBytes} bytes, budget {compact.budgetBytes} bytes. Protected context needs review.</p> : compact && <p>Sleep context: {compact.beforeChars} to {compact.afterChars} characters, {compact.archived} exchanges archived, {compact.decisionCalls} new decision calls. {compact.status === "needs_review" ? "Protected context exceeds budget." : ""}</p>}
      {gate && (
        <p>
          P(goal satisfied | evidence) = {gate.p == null ? "unavailable" : Number(gate.p).toFixed(2)} vs threshold {gate.threshold}:{" "}
          {gate.passed ? "verified" : run.status === "running" ? "checking remaining work" : "incomplete: completion checks did not pass"}
          {gate.source ? ` (${gate.source}${gate.attempts > 1 ? `, ${gate.attempts} checks` : ""})` : ""}
        </p>
      )}
      {inj && (
        <div>
          <span className="rem-eyebrow">Lessons injected</span>
          <p className="muted">
            Recall {inj.recall?.mode || "default"}
            {inj.recall?.k != null ? `, top ${inj.recall.k}` : ""}
            {inj.recall?.recencyHalfLifeDays != null ? `, half-life ${inj.recall.recencyHalfLifeDays} d` : ""}
            {inj.chars != null ? `, ${inj.chars}/${inj.budgetChars} chars` : ""}
            {inj.dropped ? `, ${inj.dropped} dropped for budget` : ""}
          </p>
          {!!inj.memoryIds?.length && <p>Memories: {inj.memoryIds.map((id) => String(id).slice(-8)).join(", ")}</p>}
          {!!inj.ruleIds?.length && <p>Rules: {inj.ruleIds.join(", ")}</p>}
        </div>
      )}
    </div>
  );
}

function RunLog({ events }) {
  const rows = events.filter(
    (e) => e.collection === "episodes" || e.collection === "effects" || (e.collection === "checkpoints" && ["paused_for_auth", "done", "incomplete", "failed"].includes(e.status)),
  );
  if (!rows.length) return <p className="muted">No live steps recorded for this run in this session.</p>;
  return (
    <ol className="rem-run-log">
      {rows.map((e, i) => {
        const blocked = /Blocked by/.test(e.text || "");
        return (
          <li key={i} className={e.collection === "effects" ? "is-effect" : blocked ? "is-guardrail" : e.kind === "error" ? "is-error" : ""}>
            {(blocked || e.kind === "error") && <AlertTriangle size={13} />}
            <span className="rem-tag">{e.collection === "effects" ? "Effect" : e.collection === "checkpoints" ? "Run" : e.tool || e.kind || e.collection}</span>
            <span>{e.text || (e.collection === "effects" ? `${e.tool} ${e.status} (key ${e.effectKey?.slice(0, 10)}...)` : e.status)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ControlsBar({ state, busy, setBusy, setError, reload, onReset }) {
  const [simulating, setSimulating] = useState(false);
  const [days, setDays] = useState(3);
  const [simResult, setSimResult] = useState(null);
  const validDays = Number.isInteger(Number(days)) && Number(days) >= 1 && Number(days) <= 10;
  const simulate = async () => {
    if (!validDays || busy) return;
    setSimulating(true);
    setBusy(true);
    setError("");
    setSimResult(null);
    try {
      const r = await post("/api/rem/simulate", { days: Number(days) });
      setSimResult(r);
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setSimulating(false);
    }
  };
  return (
    <details className="rem-demo-tools">
      <summary><FlaskConical size={16} aria-hidden="true" /> Simulation tools <span>Run several days or reset the shared engine</span></summary>
      <div className="rem-controls">
      <div className="button-row">
        <label className="rem-select">
          Simulate
          <input type="number" min="1" max="10" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Days to simulate" aria-invalid={!validDays} disabled={busy} />
          days
        </label>
        <button className="button secondary small" disabled={busy || !validDays} onClick={simulate}>
          {simulating ? "Simulating..." : "Run simulated days"}
        </button>
        <button className="button secondary small" disabled={busy} onClick={onReset}>
          Reset engine
        </button>
      </div>
      {!validDays && <p className="muted" role="status">Choose a whole number from 1 to 10.</p>}
      {simResult && (
        <div className="rem-sim-result">
          <p className="muted">Simulated to day {simResult.day}.</p>
          <div className="rem-table-wrap">
            <table className="rem-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Pass rate</th>
                  <th>Active memories</th>
                  <th>Duplicate ratio</th>
                  <th>Cost</th>
                  <th>Interventions</th>
                </tr>
              </thead>
              <tbody>
                {simResult.days.map((d) => (
                  <tr key={d.meta.day}>
                    <td>
                      {d.meta.day} ({d.meta.week})
                    </td>
                    <td>{pct(d.passRate)}</td>
                    <td>{d.memory.after.memories}</td>
                    <td>{pct(d.memory.after.duplicateRatio)}</td>
                    <td>{money(d.cost)}</td>
                    <td>{d.interventions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
    </details>
  );
}

function DayPanel({ state, events, busy, setBusy, setError, reload }) {
  const [taskId, setTaskId] = useState(TASKS[0][0]);
  const [activeRunId, setActiveRunId] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [running, setRunning] = useState(false);

  const runLog = useMemo(() => (activeRunId ? events.filter((e) => e.runId === activeRunId) : []), [events, activeRunId]);
  const liveRun = state.runs.find((r) => r.runId === activeRunId);
  const shown = liveRun || lastRun;

  const run = async () => {
    setRunning(true);
    setBusy(true);
    setError("");
    try {
      const { run } = await post("/api/rem/run", { taskId, week: state.week });
      setActiveRunId(run.runId);
      setLastRun(run);
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setRunning(false);
    }
  };
  const toggleConnection = async (provider, next) => {
    setBusy(true);
    setError("");
    try {
      await post("/api/rem/connection", { provider, state: next });
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const recent = state.runs.slice(0, 6);

  return (
    <section className="rem-section" aria-label="Day">
      <div className="section-line">
        <h2>Day: run a task</h2>
        <span>{state.week}</span>
      </div>
      <p className="muted">
        Choose a task, follow its progress, and inspect the result. The harness saves its place after each step.
      </p>
      <div className="rem-day-controls button-row">
        <label className="rem-select">
          Task
          <select disabled={busy} value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            {TASKS.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <button className="button" disabled={busy} onClick={run}>
          {running ? "Running..." : "Run"}
        </button>
      </div>
      <Disclosure title="Test account access">
      <p className="muted">Fixture connections for this engine. Expire one to test pause and resume.</p>
      <div className="rem-connections">
        {state.connections.map((c) => (
          <span key={c.provider} className={"connection-state " + (c.tokenState === "valid" ? "is-connected" : "is-expired")}>
            {c.name}: {c.tokenState}
            <button className="text-button" disabled={busy} onClick={() => toggleConnection(c.provider, c.tokenState === "valid" ? "expired" : "valid")}>
              {c.tokenState === "valid" ? "Expire access" : "Reconnect"}
            </button>
          </span>
        ))}
      </div>
      </Disclosure>
      {running && <div className="beautiful-ui rem-loading"><LoadingState label="Running the task" variant="Dots" /></div>}
      {activeRunId && (
        <div className="rem-live-run">
          <div className="section-line">
            <h3>{shown?.title || taskId}</h3>
            <span className={"status-label " + statusClass(shown?.status)}>{shown?.status}</span>
          </div>
          {shown?.status === "paused_for_auth" && (
            <div className="notice">
              <Plug size={20} />
              <div>
                <h3>Paused for auth</h3>
                <p>
                  {state.connections.find((c) => c.provider === shown.provider)?.name || shown.provider} access expired mid-run. The
                  run asked once and is waiting at its checkpoint.
                </p>
                <button className="button small" disabled={busy} onClick={() => toggleConnection(shown.provider, "valid")}>
                  Reconnect {state.connections.find((c) => c.provider === shown.provider)?.name || shown.provider}
                </button>
              </div>
            </div>
          )}
          <RunLog events={runLog} />
          <RunExtras run={shown} />
          {shown?.final && <p className="rem-final">{shown.final}</p>}
          {shown?.verdict && (
            <p className="muted">
              Checked end state: {shown.verdict.endState ? "reached" : "not reached"}
              {shown.verdict.collateral?.length ? `, collateral: ${shown.verdict.collateral.join(", ")}` : ", no collateral"}.
            </p>
          )}
        </div>
      )}
      <div className="section-line">
        <h3>Recent runs</h3>
        <span>{state.runs.length}</span>
      </div>
      <div className="rem-run-rows">
        {recent.map((r) => (
          <button key={r.runId} className="rem-run-row" aria-pressed={activeRunId === r.runId} onClick={() => { setActiveRunId(r.runId); setLastRun(r); }}>
            <div>
              <strong>{r.title}</strong>
              <small>
                {r.week} · {r.turns} steps · {money(r.usage?.cost)}
                {r.interventions ? ` · ${r.interventions} interventions` : ""}
              </small>
            </div>
            <span className={"status-label " + statusClass(r.status)}>{r.status}</span>
            <ChevronRight size={15} />
          </button>
        ))}
        {!recent.length && <p className="muted">No runs yet. Pick a task and click Run.</p>}
      </div>
    </section>
  );
}

function NightPanel({ state, events, busy, setBusy, setError, reload }) {
  const [sleeping, setSleeping] = useState(false);
  const [nightStart, setNightStart] = useState(0);
  const [completed, setCompleted] = useState(false);

  const nightEvents = useMemo(
    () => (sleeping || completed ? events.filter((e) => e.at >= nightStart && PHASE_BY_COLLECTION[e.collection]) : []),
    [events, nightStart, sleeping, completed],
  );
  const phasesSeen = useMemo(() => {
    const seen = new Set(["Replay"]);
    for (const e of nightEvents) seen.add(PHASE_BY_COLLECTION[e.collection]);
    return seen;
  }, [nightEvents]);

  const brief = state.brief;

  const runSleep = async () => {
    setBusy(true);
    setSleeping(true);
    setError("");
    setNightStart(Date.now());
    setCompleted(false);
    try {
      await post("/api/rem/sleep");
      setCompleted(true);
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setSleeping(false);
    }
  };

  return (
    <section className="rem-section" aria-label="Night">
      <div className="section-line">
        <h2>Night: consolidate and evolve</h2>
        <span>night {brief?.night ?? "none yet"}</span>
      </div>
      <p className="muted">
        Turn the day’s work into useful memory. Test proposed improvements before accepting them, and queue anything that needs your approval.
      </p>
      <div className="rem-memory-strip">
        <span><strong>{state.memory.active}</strong> active memories</span>
        <span><strong>{state.memory.unconsolidated}</strong> episodes to review</span>
        <span><strong>{state.memory.archivedEpisodes ?? 0}</strong> archived episodes</span>
      </div>
      {!!state.skills.length && (
        <details className="rem-skills-catalog"><summary>Saved skills ({state.skills.length})</summary>
          <span className="rem-eyebrow">Skills catalog</span>
          <ul>
            {state.skills.map((s) => (
              <li key={s.name}>
                {s.name}: {s.status}
                {s.stats ? ` (${s.stats.practicePasses}/${s.stats.practiceRuns} sandbox passes, ${s.stats.evidence} traces)` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      <button className="button" disabled={busy} onClick={runSleep}>
        {sleeping ? "Sleeping..." : "Sleep"}
      </button>
      {sleeping && <div className="beautiful-ui rem-loading"><LoadingState label="Reviewing the day" variant="Orbit" /></div>}
      {sleeping && (
        <ol className="rem-phases" aria-label="Observed night phases">
          {PHASES.map((p) => (
            <li key={p} className={phasesSeen.has(p) ? "is-active" : ""}>
              {p}
            </li>
          ))}
        </ol>
      )}
      {sleeping && (
        <div className="rem-night-live" role="log" aria-label="Night activity">
          {nightEvents.slice(-30).map((e, i) => (
            <p key={i} className="muted">
              {PHASE_BY_COLLECTION[e.collection]}: {e.text || `${e.collection} ${e.operationType}`}
            </p>
          ))}
        </div>
      )}
      {!sleeping && brief && (
        <div className="rem-brief">
          <p className="muted">
            Harness v{brief.harness.from} to v{brief.harness.to}.
          </p>
          <div className="rem-phase-grid">
          <article className="rem-phase-card"><span className="rem-eyebrow">01 / Review</span><h3>Replay</h3>
          <p>
            {brief.replay.episodes} episodes from {brief.replay.runs.length} run{brief.replay.runs.length === 1 ? "" : "s"}; pass rate{" "}
            {pct(brief.replay.passRate)}, collateral {brief.replay.collateral}, interventions {brief.replay.interventions}.
          </p>
          </article><article className="rem-phase-card"><span className="rem-eyebrow">02 / Remember</span><h3>Merge</h3>
          <p>
            {brief.merge.episodesIn} episodes to {brief.merge.facts} facts to {brief.merge.memoriesAfter} active memories (
            {brief.merge.created} new, {brief.merge.folded} folded in). {brief.merge.contradictionsResolved} contradictions resolved,{" "}
            {brief.merge.retired} retired, {brief.merge.noiseDropped} noise dropped, {brief.merge.expiring} set to expire.
          </p>
          </article><article className="rem-phase-card"><span className="rem-eyebrow">03 / Learn</span><h3>Distill</h3>
          {brief.distill.skills.length ? (
            brief.distill.skills.map((s) => (
              <p key={s.name}>
                Skill "{s.name}" {s.status}: sandbox test {s.test.pass ? "passed" : "failed"} ({s.evidence} traces, {s.test.steps}{" "}
                steps, {money(s.test.cost)}).
              </p>
            ))
          ) : (
            <p className="muted">No new skill found in this review.</p>
          )}
          </article>
          {brief.rehearse && <article className="rem-phase-card"><span className="rem-eyebrow">04 / Stress-test</span><h3>Rehearse</h3>
            <p>{brief.rehearse.tried} variations tested. {brief.rehearse.held} passed, {brief.rehearse.broke.length} exposed new failures.</p>
            <p className="muted">Level {brief.rehearse.level}. {brief.rehearse.kept} unresolved challenges retained.</p></article>}
          {brief.calibration && <article className="rem-phase-card"><span className="rem-eyebrow">05 / Check the judge</span><h3>Calibrate</h3>
            <p>Completion threshold: {brief.calibration.threshold.to} ({brief.calibration.threshold.status}).</p>
            <p className="muted">Held-out checks without the answer key: {brief.calibration.blind.heldOut.falseAccepts} unfinished runs accepted; {brief.calibration.blind.heldOut.falseRejects} completed runs rejected.</p></article>}
          </div>
          <div className="section-line"><h3>Evolve</h3><span>{brief.evolve.edits.length} proposed edits</span></div>
          <Disclosure title="Inspect proposed changes and validation">
          <PatternsList patterns={brief.evolve.patterns} />
          <EditsList edits={brief.evolve.edits} />
          </Disclosure>
          <p className="muted">Compare before and after results in Morning.</p>
          {!!brief.evolve.skipped?.length && <p className="muted">Skipped: {brief.evolve.skipped.map((s) => s.description).join("; ")}.</p>}
          <div className="section-line">
            <h3>Asks queued</h3>
          </div>
          {brief.asks.length ? (
            <ul>
              {brief.asks.map((a) => (
                <li key={a.dedupeKey}>
                  {a.text} ({a.status})
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No new asks.</p>
          )}
        </div>
      )}
      {!sleeping && !brief && <p className="muted">No night has run yet.</p>}
    </section>
  );
}

function MorningPanel({ state, busy, setBusy, setError, reload }) {
  const brief = state.brief;
  const current = state.harness.lineage.find((v) => v.version === state.harness.version);
  const decide = async (id, decision, answer) => {
    setBusy(true);
    setError("");
    try {
      const result = await post(`/api/rem/asks/${encodeURIComponent(id)}`, { decision, ...(answer ? { answer } : {}) });
      await reload();
      if (result.ask?.validation && !result.ask.validation.passed) setError(result.ask.validation.reason);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rem-section" aria-label="Morning">
      <div className="section-line">
        <h2>Morning: brief, diff, and asks</h2>
      </div>
      <div className="section-line">
        <h3>Open asks</h3>
        <span>{state.asks.length}</span>
      </div>
      <AsksList asks={state.asks} onDecide={decide} busy={busy} />
      {!brief && <p className="muted">No night has run yet. Sleep once to see a morning brief.</p>}
      {brief && (
        <>
          <div className="section-line">
            <h3>Night timeline</h3>
          </div>
          <ol className="rem-timeline">
            {(brief.timeline || PHASES).map((p, i) => {
              const name = typeof p === "string" ? p : p.phase;
              const at = typeof p === "object" ? p.simAt || p.startedAt || p.at : null;
              const ms = typeof p === "object" ? p.wallMs : null;
              return (
                <li key={i}>
                  {name}
                  {at && <time>{new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>}
                  {ms != null && <span className="muted"> {ms} ms</span>}
                </li>
              );
            })}
          </ol>
          <div className="section-line">
            <h3>Before / after on the gym</h3>
          </div>
          <FitnessTable title="Whole gym" before={brief.evolve.baseline} after={brief.evolve.fitness} />
          {brief.verified && (
            <div className="rem-table-wrap" tabIndex={0} role="region" aria-label="Verified work costs">
            <table className="rem-table">
              <caption>Cost per verified result</caption>
              <thead><tr><th>Verified work</th><th>Verified</th><th>Cost</th><th>Cost per verified success</th><th>Tokens per verified success</th></tr></thead>
              <tbody>
                {["gymBefore", "gymAfter", "day"].filter((k) => brief.verified[k]).map((k) => {
                  const v = brief.verified[k];
                  const label = { gymBefore: "Gym, before", gymAfter: "Gym, after", day: "Day runs" }[k];
                  return (
                    <tr key={k}>
                      <td>{label}</td>
                      <td>{v.verified}</td>
                      <td>{v.cost != null ? `$${Number(v.cost).toFixed(4)}` : "n/a"}</td>
                      <td>{v.costPerVerifiedSuccess != null ? `$${Number(v.costPerVerifiedSuccess).toFixed(4)}` : "n/a"}</td>
                      <td>{v.tokensPerVerifiedSuccess != null ? Math.round(v.tokensPerVerifiedSuccess) : "n/a"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </>
      )}
      <Disclosure title="Current harness settings">
      <div className="section-line">
        <h3>Genome: current harness</h3>
        <span>v{state.harness.version}</span>
      </div>
      {current && current.parentVersion != null && (
        <>
          <p className="muted">
            Diff from v{current.parentVersion} to v{state.harness.version}:
          </p>
          {state.harness.diffText.length ? (
            <ul>
              {state.harness.diffText.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">No changes from the parent.</p>
          )}
        </>
      )}
      <GenomeView genome={state.harness.genome} />
      </Disclosure>
      <Disclosure title="Harness version history">
      <div className="section-line">
        <h3>Lineage</h3>
        <span>{state.harness.lineage.length} version{state.harness.lineage.length === 1 ? "" : "s"}</span>
      </div>
      <Lineage lineage={state.harness.lineage} />
      </Disclosure>

    </section>
  );
}

const VIEWS = [
  { id: "day", name: "Day", detail: "Run a task", Icon: Sun },
  { id: "night", name: "Night", detail: "Review and improve", Icon: Moon },
  { id: "morning", name: "Morning", detail: "Results and approvals", Icon: Sunrise },
];

export default function Rem() {
  const { state: workspace } = useWorkspace();
  const orbTheme = resolveTheme(workspace.settings.theme, matchMedia("(prefers-color-scheme: dark)").matches, workspace.settings.themeCustom).mode;
  const { events, hello, connected, resetVersion } = useRemEvents();
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [view, setView] = useState("day");
  const [localReset, setLocalReset] = useState(0);
  const requestId = useRef(0);
  const tabs = useRef([]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const next = await get("/api/rem/state");
      if (id === requestId.current) setState(next);
    } catch (e) {
      if (id === requestId.current) setError(e.message);
    }
  }, []);
  useEffect(() => { load(); }, [load, hello, resetVersion]);
  // Refresh after a quiet point in the live stream, including work from another browser.
  useEffect(() => {
    if (!events.length) return;
    const timer = setTimeout(load, 350);
    return () => clearTimeout(timer);
  }, [events, load]);
  useEffect(() => () => { requestId.current += 1; }, []);

  const refresh = async () => {
    setError("");
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  };
  const doReset = async () => {
    setConfirmReset(false);
    setBusy(true);
    setError("");
    try {
      await post("/api/rem/reset");
      setLocalReset((value) => value + 1);
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const focusTab = (event, index) => {
    const direction = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    const next = event.key === "Home" ? 0 : event.key === "End" ? VIEWS.length - 1 : direction ? (index + direction + VIEWS.length) % VIEWS.length : null;
    if (next == null) return;
    event.preventDefault();
    setView(VIEWS[next].id);
    tabs.current[next]?.focus();
  };
  const panelProps = { state, events, busy, setBusy, setError, reload: load };
  return (
    <div className="standard-page rem-page">
      <div className="page-title rem-title">
        <div><span className="rem-eyebrow">REPLAY · EVOLVE · MERGE</span><h1>REM</h1>
          <p>A day of work. A night of learning.<br />A harness ready for what comes next.</p></div>
        <div className="rem-title-orb" aria-hidden="true"><ThinkingOrb theme={orbTheme} state={busy ? "weaving" : "breathing"} size={64} /></div>
      </div>
      <div className="rem-toolbar">
        <div className="rem-engine-status">
          {state && <><span className="status-label">Harness v{state.harness.version}</span><span>Day {state.day} · {state.week}</span></>}
          <span className="rem-stream-status"><i className={connected ? "connected" : ""} />{connected ? "Live updates" : "Reconnecting updates"}</span>
        </div>
        <button className="button secondary small" disabled={busy || refreshing} onClick={refresh}><RefreshCw size={14} aria-hidden="true" />{refreshing ? "Refreshing..." : "Refresh"}</button>
      </div>
      {error && <div className="rem-error" role="alert"><AlertTriangle size={18} aria-hidden="true" /><div><strong>Could not complete the request</strong><p>{error}</p><p>{state ? "Your last loaded results are kept below. Use Refresh to try again." : "Once the local service is running, open its address to continue."}</p></div></div>}
      {!state ? (!error && <div className="beautiful-ui rem-loading"><LoadingState label="Loading the harness" variant="Dots" /></div>) : (
        <>
          <p className="rem-source-note">{state.engine?.model === "scripted" ? "Scripted model · fixture tasks" : `Model: ${state.engine?.model || "Unavailable"} · fixture tasks`}. Results below come from this engine, including failed checks.</p>
          <div className="rem-overview" aria-label="Engine overview">
            <div><span>Active memories</span><strong>{state.memory.active}</strong><small>{state.memory.unconsolidated} episodes awaiting review</small></div>
            <div><span>Saved skills</span><strong>{state.skills.length}</strong><small>Reusable patterns from prior work</small></div>
            <div><span>Needs your approval</span><strong>{state.asks.length}</strong><button onClick={() => { setView("morning"); tabs.current[2]?.focus(); }}>Review asks <ChevronRight size={13} aria-hidden="true" /></button></div>
          </div>
          <div className="rem-tabs" role="tablist" aria-label="REM cycle">
            {VIEWS.map(({ id, name, detail, Icon }, index) => <button key={id} ref={(el) => { tabs.current[index] = el; }} id={`rem-tab-${id}`} role="tab" aria-selected={view === id} aria-controls={`rem-panel-${id}`} tabIndex={view === id ? 0 : -1} onKeyDown={(event) => focusTab(event, index)} onClick={() => setView(id)}><Icon size={17} aria-hidden="true" /><span>{name}<small>{detail}</small></span>{id === "morning" && state.asks.length > 0 && <b>{state.asks.length}</b>}</button>)}
          </div>
          <div key={`${resetVersion}-${localReset}`}>
            {VIEWS.map(({ id }) => <div key={id} id={`rem-panel-${id}`} role="tabpanel" aria-labelledby={`rem-tab-${id}`} tabIndex={0} hidden={view !== id}>
              {id === "day" ? <DayPanel {...panelProps} /> : id === "night" ? <NightPanel {...panelProps} /> : <MorningPanel {...panelProps} />}
            </div>)}
            <ControlsBar {...panelProps} onReset={() => setConfirmReset(true)} />
          </div>
        </>
      )}
      {confirmReset && <Modal title="Reset the REM engine?" onClose={() => setConfirmReset(false)}>
        <p>This permanently clears the shared engine’s runs, memories, archives and harness history, including stored database records, and starts again at v0. Every browser using this engine is affected.</p>
        <div className="button-row"><button className="button secondary" onClick={() => setConfirmReset(false)}>Cancel</button><button className="button" disabled={busy} onClick={doReset}>Reset engine</button></div>
      </Modal>}
    </div>
  );
}
