import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ThinkingOrb } from "thinking-orbs";
import { useWorkspace } from "../store";

const phases = ["Read saved context", "Consolidate duplicates", "Find recurring work", "Check candidate routines"];
const date = value => new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export default function Sleep() {
  const { state, act } = useWorkspace();
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const review = state.sleepHistory[0];
  const working = review?.status === "running";
  const pending = state.skills.filter(s => !s.enabled);
  const skills = state.skills.filter(s => filter === "all" || (filter === "approved" ? s.enabled : !s.enabled));
  const perform = async (type, payload) => {
    setBusy(true);
    try { await act(type, payload); } catch { /* The workspace displays action errors. */ }
    finally { setBusy(false); }
  };
  return <div className="standard-page sleep-page">
    <div className="page-title"><h1>Review your saved context</h1><p>Let the day settle. Keep what helps tomorrow.</p></div>
    <div className="sleep-intro sleep-hero">
      <ThinkingOrb state={working ? "weaving" : "breathing"} size={64} />
      <div>
        <span className="sleep-eyebrow">SLEEP REVIEW</span>
        <h2>{working ? phases[Math.min(review.phase, 3)] : "Less repetition. More room."}</h2>
        <p>Review saved notes, combine duplicates and turn recurring work into routines you can inspect and approve.</p>
        <div className="button-row">
          <button className="button" disabled={working || busy || !state.memory.length} onClick={() => perform("sleep")}>{working ? "Review in progress…" : "Run a sleep review"}</button>
          {working && <button className="button secondary" disabled={busy} onClick={() => perform("cancel-sleep", { id: review.id })}>Cancel review</button>}
        </div>
        {!state.memory.length && <p>Add notes in <Link to="/app/memory">Memory</Link> to start your first review.</p>}
      </div>
    </div>
    <p className="sleep-disclosure">Local, rules-based review. No model training, background recording or external actions. Routine checks verify structure and evidence, not agent performance.</p>
    <div className="sleep-stats">
      <div><strong>{state.memory.length}</strong><span>Saved memories</span></div>
      <div><strong>{pending.length}</strong><span>Awaiting approval</span></div>
      <div><strong>{state.skills.filter(s => s.enabled).length}</strong><span>Approved routines</span></div>
    </div>
    {working && <section className="sleep-progress" aria-label="Review progress">
      <progress max="4" value={review.phase} aria-label="Sleep review progress" />
      <ol>{phases.map((phase, i) => <li key={phase} className={i <= review.phase ? "current" : ""} aria-current={i === review.phase ? "step" : undefined}><span>{i < review.phase ? "Done" : i + 1}</span>{phase}</li>)}</ol>
      <p role="status">Reviewing a snapshot of {review.inputCount} memories. New notes will be included next time.</p>
    </section>}
    {review?.status === "completed" && <div className="notice" role="status"><p>Reviewed {review.inputCount} memories and combined {review.duplicates} duplicates. {review.results?.length ? `${review.results.filter(r => r.outcome !== "unchanged").length} new or updated candidates; ${review.results.filter(r => r.outcome === "unchanged").length} unchanged.` : "No supported recurring workflow found. Add two distinct notes about a weekly update, follow-up, release or meeting."}</p></div>}
    {review?.status === "cancelled" && <div className="notice"><p>Review cancelled. Your memories and routines were not changed by this review.</p></div>}
    <section className="sleep-schedule">
      <div><h2>A regular moment to reflect</h2><p>Runs once each day at or after your chosen time while Offload is open on this device.</p></div>
      <label><input type="checkbox" checked={state.settings.sleepSchedule} onChange={e => perform("settings", { sleepSchedule: e.target.checked })} /> Schedule daily review</label>
      {state.settings.sleepSchedule && <label>Local review time <input type="time" required value={state.settings.sleepHour} onChange={e => e.target.value && perform("settings", { sleepHour: e.target.value })} /></label>}
    </section>
    <div className="section-line"><h2>Saved routines</h2><span>{state.skills.length}</span></div>
    <div className="sleep-filters" role="group" aria-label="Filter routines">{[["all", "All"], ["pending", "Needs approval"], ["approved", "Approved"]].map(([value, label]) => <button key={value} className="button secondary small" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
    {!skills.length && <div className="sleep-empty"><h3>{state.skills.length ? "No routines in this view." : "Your first routine starts with context."}</h3><p>Save specific instructions about repeated work. A review needs at least two distinct supporting notes for a candidate.</p><Link to="/app/memory">Open memory</Link></div>}
    {skills.map(skill => <article className="skill" key={skill.id}>
      <div className="section-line"><h2>{skill.name}</h2><span>Version {skill.version}</span></div>
      <span className="sleep-badge">{skill.enabled ? "Approved" : "Needs approval"}{(skill.example ?? skill.sample) ? " · Example context" : ""}</span>
      <p>{skill.description}</p>
      <div className="skill-rules">{skill.rules.map((rule, i) => <p key={i}>{rule}</p>)}</div>
      <details><summary>Supporting notes ({skill.evidence?.length || skill.sourceIds.length})</summary>{(skill.evidence || []).map(note => <blockquote key={note.id}><p>{note.text}</p><small>{note.source}</small></blockquote>)}</details>
      <details><summary>Review checks</summary>{skill.checks.map(check => <p key={check.name}>{check.passed ? "Passed" : "Failed"}: {check.name}</p>)}<small>These are deterministic evidence checks. They do not measure real task success.</small></details>
      {!!skill.previousVersions?.length && <details><summary>Previous versions</summary>{[...skill.previousVersions].reverse().map(version => <div key={version.version}><h3>Version {version.version}</h3>{version.rules.map((rule, i) => <p key={i}>{rule}</p>)}</div>)}</details>}
      <button className={"button small " + (skill.enabled ? "secondary" : "")} disabled={busy || (!skill.enabled && !skill.checks.every(c => c.passed))} onClick={() => perform("skill", { id: skill.id, enabled: !skill.enabled })}>{skill.enabled ? "Pause routine" : "Approve routine"}</button>
      <p className="sleep-footnote">Approval applies to this version. Changed instructions require approval again. Execution is not connected.</p>
    </article>)}
    <section className="sleep-history"><div className="section-line"><h2>Review history</h2><span>{state.sleepHistory.length}</span></div>
      {!state.sleepHistory.length && <p>Completed and cancelled reviews will appear here.</p>}
      {state.sleepHistory.map(item => <details key={item.id}><summary><span>{date(item.startedAt)}</span><span>{item.status}</span></summary><p>{item.inputCount} memories in the starting snapshot{item.status === "completed" ? ` · ${item.duplicates} duplicates consolidated` : ""}</p>{item.results?.map(result => <p key={result.id}>{result.name} · v{result.version} · {result.outcome}</p>)}{item.status === "completed" && !item.results?.length && <p>No candidate routines found.</p>}</details>)}
    </section>
  </div>;
}
