import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Plug } from "lucide-react";
import { Modal } from "../components/Modal";

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
const STATUS_CLASS = { running: "is-running", paused_for_auth: "is-blocked", done: "is-ready", failed: "is-cancelled" };

const get = async (url) => {
  const r = await fetch(url);
  const v = await r.json();
  if (!r.ok) throw Error(v?.error || "Request failed.");
  return v;
};
const post = async (url, body) => {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const v = await r.json();
  if (!r.ok) throw Error(v?.error || "Request failed.");
  return v;
};
const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;
const money = (x) => `$${(x ?? 0).toFixed(4)}`;
const LABEL_OVERRIDES = { latencyMs: "Latency" };
const label = (key) =>
  LABEL_OVERRIDES[key] || key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
const statusClass = (s) => STATUS_CLASS[s] || "";
// Import kept below the top-of-file imports, which other branches edit.
import RemSelfCheck from "../components/RemSelfCheck";

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

function useRemEvents() {
  const [events, setEvents] = useState([]);
  const [hello, setHello] = useState(null);
  useEffect(() => {
    const es = new EventSource("/api/rem/stream");
    const onHello = (e) => {
      try {
        setHello(JSON.parse(e.data));
      } catch {}
    };
    const onChange = (e) => {
      try {
        const data = JSON.parse(e.data);
        setEvents((prev) => [...prev.slice(-499), { ...data, at: Date.now() }]);
      } catch {}
    };
    const onReset = () => setEvents([]);
    es.addEventListener("hello", onHello);
    es.addEventListener("change", onChange);
    es.addEventListener("reset", onReset);
    return () => es.close();
  }, []);
  return { events, hello };
}

function FitnessTable({ title, before, after }) {
  if (!before && !after) return null;
  const splits = [
    ["train", "Train"],
    ["heldOut", "Held-out"],
    ["all", "All"],
  ];
  return (
    <div className="rem-table-wrap">
      <table className="rem-table">
        <thead>
          <tr>
            <th>{title}</th>
            <th>Before</th>
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          {splits.map(([key, name]) => {
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
              {label(k)}: {String(v)}
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
  if (!asks?.length) return <p className="muted">No open asks.</p>;
  return (
    <div className="rem-asks">
      {asks.map((a) => (
        <article key={a._id} className="rem-ask">
          <p>{a.text}</p>
          <span className="muted">
            {a.kind}
            {a.risk ? ` · risk: ${a.risk}` : ""}
          </span>
          <div className="button-row">
            <button className="button small" disabled={busy} onClick={() => onDecide(a._id, "approve")}>
              Approve
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
  if (!gate && !inj) return null;
  return (
    <div className="rem-run-extras">
      {gate && gate.p != null && (
        <p>
          P(goal satisfied | evidence) = {Number(gate.p).toFixed(2)} vs threshold {gate.threshold}:{" "}
          {gate.passed ? "done" : "keep working"}
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
    (e) => e.collection === "episodes" || e.collection === "effects" || (e.collection === "checkpoints" && ["paused_for_auth", "done", "failed"].includes(e.status)),
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
  const [days, setDays] = useState(3);
  const [simResult, setSimResult] = useState(null);
  const simulate = async () => {
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
    }
  };
  return (
    <div className="rem-controls">
      <span className="status-label">Harness v{state.harness.version}</span>
      {state.engine?.database?.startsWith("atlas:") && (
        <span className="status-label">MongoDB Atlas · {state.engine.database.slice(6)} · search {state.engine.search}</span>
      )}
      <span className="muted">
        Day {state.day} · {state.week}
      </span>
      <div className="button-row">
        <label className="rem-select">
          Simulate
          <input type="number" min="1" max="10" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Days to simulate" />
          days
        </label>
        <button className="button secondary small" disabled={busy} onClick={simulate}>
          Run simulated days
        </button>
        <button className="button secondary small" disabled={busy} onClick={onReset}>
          Reset engine
        </button>
      </div>
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
  );
}

function DayPanel({ state, events, busy, setBusy, setError, reload }) {
  const [taskId, setTaskId] = useState(TASKS[0][0]);
  const [activeRunId, setActiveRunId] = useState(null);
  const [lastRun, setLastRun] = useState(null);

  const runLog = useMemo(() => (activeRunId ? events.filter((e) => e.runId === activeRunId) : []), [events, activeRunId]);
  const liveRun = state.runs.find((r) => r.runId === activeRunId);
  const shown = liveRun || lastRun;

  const run = async () => {
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
        Runs execute through the durable harness: a checkpoint after every step, exactly-once effects, and a pause if account access
        expires mid-run.
      </p>
      <div className="rem-day-controls button-row">
        <label className="rem-select">
          Task
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            {TASKS.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <button className="button" disabled={busy} onClick={run}>
          {busy ? "Running..." : "Run"}
        </button>
      </div>
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
          <button key={r.runId} className="rem-run-row" onClick={() => setActiveRunId(r.runId)}>
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
  const [freshBrief, setFreshBrief] = useState(null);

  const nightEvents = useMemo(
    () => (sleeping || freshBrief ? events.filter((e) => e.at >= nightStart && PHASE_BY_COLLECTION[e.collection]) : []),
    [events, nightStart, sleeping, freshBrief],
  );
  const phasesSeen = useMemo(() => {
    const seen = new Set(["Replay"]);
    for (const e of nightEvents) seen.add(PHASE_BY_COLLECTION[e.collection]);
    return seen;
  }, [nightEvents]);

  const brief = freshBrief || state.brief;

  const runSleep = async () => {
    setBusy(true);
    setSleeping(true);
    setError("");
    setNightStart(Date.now());
    setFreshBrief(null);
    try {
      const { brief } = await post("/api/rem/sleep");
      setFreshBrief(brief);
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
        One consolidation run: replay the day, merge memories, distill repeated work into a skill, evolve the harness against the
        gym, then queue asks.
      </p>
      <p className="muted">
        Memory: {state.memory.active} active, {state.memory.retired} retired, {state.memory.episodes} episodes ({state.memory.unconsolidated}{" "}
        unconsolidated).
      </p>
      {!!state.skills.length && (
        <div className="rem-skills-catalog">
          <span className="rem-eyebrow">Skills catalog</span>
          <ul>
            {state.skills.map((s) => (
              <li key={s.name}>
                {s.name}: {s.status}
                {s.stats ? ` (${s.stats.practicePasses}/${s.stats.practiceRuns} sandbox passes, ${s.stats.evidence} traces)` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button className="button" disabled={busy} onClick={runSleep}>
        {sleeping ? "Sleeping..." : "Sleep"}
      </button>
      {sleeping && (
        <ol className="rem-phases">
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
          <div className="section-line">
            <h3>Replay</h3>
          </div>
          <p>
            {brief.replay.episodes} episodes from {brief.replay.runs.length} run{brief.replay.runs.length === 1 ? "" : "s"}; pass rate{" "}
            {pct(brief.replay.passRate)}, collateral {brief.replay.collateral}, interventions {brief.replay.interventions}.
          </p>
          <div className="section-line">
            <h3>Merge</h3>
          </div>
          <p>
            {brief.merge.episodesIn} episodes to {brief.merge.facts} facts to {brief.merge.memoriesAfter} active memories (
            {brief.merge.created} new, {brief.merge.folded} folded in). {brief.merge.contradictionsResolved} contradictions resolved,{" "}
            {brief.merge.retired} retired, {brief.merge.noiseDropped} noise dropped, {brief.merge.expiring} set to expire.
          </p>
          <div className="section-line">
            <h3>Distill</h3>
          </div>
          {brief.distill.skills.length ? (
            brief.distill.skills.map((s) => (
              <p key={s.name}>
                Skill "{s.name}" {s.status}: sandbox test {s.test.pass ? "passed" : "failed"} ({s.evidence} traces, {s.test.steps}{" "}
                steps, {money(s.test.cost)}).
              </p>
            ))
          ) : (
            <p className="muted">No repeated work distilled this night.</p>
          )}
          <div className="section-line">
            <h3>Evolve</h3>
          </div>
          <PatternsList patterns={brief.evolve.patterns} />
          <EditsList edits={brief.evolve.edits} />
          <FitnessTable title="Shadow-harness comparison" before={brief.evolve.baseline} after={brief.evolve.fitness} />
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
  const decide = async (id, decision) => {
    setBusy(true);
    setError("");
    try {
      await post(`/api/rem/asks/${id}`, { decision });
      await reload();
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
          <RemSelfCheck brief={brief} />
          {brief.verified && (
            <table className="rem-table">
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
          )}
        </>
      )}
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
      <div className="section-line">
        <h3>Lineage</h3>
        <span>{state.harness.lineage.length} version{state.harness.lineage.length === 1 ? "" : "s"}</span>
      </div>
      <Lineage lineage={state.harness.lineage} />
      <div className="section-line">
        <h3>Open asks</h3>
        <span>{state.asks.length}</span>
      </div>
      <AsksList asks={state.asks} onDecide={decide} busy={busy} />
    </section>
  );
}

export default function Rem() {
  const { events, hello } = useRemEvents();
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await get("/api/rem/state"));
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (hello) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hello?.day, hello?.harness]);

  const doReset = async () => {
    setConfirmReset(false);
    setBusy(true);
    setError("");
    try {
      await post("/api/rem/reset");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="standard-page rem-page">
      <div className="page-title">
        <div>
          <h1>REM</h1>
          <p>Replay, evolve, merge. The engine's day, night and morning, straight from the harness.</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {!state ? (
        <p className="muted">Loading the harness...</p>
      ) : (
        <>
          <ControlsBar state={state} busy={busy} setBusy={setBusy} setError={setError} reload={load} onReset={() => setConfirmReset(true)} />
          <DayPanel state={state} events={events} busy={busy} setBusy={setBusy} setError={setError} reload={load} />
          <NightPanel state={state} events={events} busy={busy} setBusy={setBusy} setError={setError} reload={load} />
          <MorningPanel state={state} busy={busy} setBusy={setBusy} setError={setError} reload={load} />
        </>
      )}
      {confirmReset && (
        <Modal title="Reset the REM engine?" onClose={() => setConfirmReset(false)}>
          <p>This drops the day, night and lineage history in memory and starts a fresh harness at v0. There is no undo.</p>
          <button className="button" onClick={doReset}>
            Reset engine
          </button>
        </Modal>
      )}
    </div>
  );
}
