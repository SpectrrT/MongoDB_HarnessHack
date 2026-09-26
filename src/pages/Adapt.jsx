import React, { useCallback, useEffect, useState } from 'react';

// Built September 26. Proof view for Sleep v2: the correction that went in,
// the policy change Sleep proposed, the held-out result and what the next run used.
const STAGES = ['Snapshot memories', 'Consolidate duplicates', 'Find recurring corrections', 'Propose policy change', 'Held-out evaluation', 'Promote or reject'];
const get = async url => { const r = await fetch(url); const v = await r.json(); if (!r.ok) throw Error(v?.error || 'Request failed.'); return v; };
const post = async (url, body) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const v = await r.json(); if (!r.ok) throw Error(v?.error || 'Request failed.'); return v;
};
const pct = x => `${Math.round(x * 100)}%`;
const cell = { borderBottom: '1px solid #ddd', padding: '6px 8px', textAlign: 'left', verticalAlign: 'top' };

export default function Adapt() {
  const [status, setStatus] = useState(null), [run, setRun] = useState(null), [report, setReport] = useState(null);
  const [policies, setPolicies] = useState(null), [correction, setCorrection] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const runId = typeof localStorage !== 'undefined' ? localStorage.getItem('offload.harness.lastRun') : null;
  const load = useCallback(async () => {
    try {
      const s = await get('/api/sleep/status'); setStatus(s);
      if (!s.configured) return;
      const [r, p] = await Promise.all([get('/api/sleep/runs/latest'), get('/api/sleep/policies')]);
      setReport(r); setPolicies(p);
      if (runId) setRun(await get(`/api/harness/runs/${encodeURIComponent(runId)}`).catch(() => null));
    } catch (e) { setError(e.message); }
  }, [runId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!report || ['completed', 'failed'].includes(report.status)) return;
    const timer = setTimeout(load, 1500);
    return () => clearTimeout(timer);
  }, [report, load]);
  const act = async fn => { setBusy(true); setError(''); try { await fn(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const o = report?.outputs || {}, active = policies?.versions.find(v => v._id === policies.activeId);
  const byCase = {};
  for (const r of o.evaluate?.results || []) (byCase[r.caseId] ||= {})[r.policy] = r;

  return <div className="standard-page">
    <div className="page-title"><h1>Harness sleep</h1><p>Sleep turns repeated corrections into a tested change to the harness itself. Memory, policy versions and reviews live in MongoDB Atlas.</p></div>
    {status && !status.configured && <p>Setup required: connect the event Atlas sandbox and set VOYAGE_API_KEY, then restart the harness API.</p>}
    {status?.configured && <p className="muted">Vector search: {status.vectorMode === 'atlas' ? 'Atlas $vectorSearch' : 'local test mode'}. Active policy: v{active?.version ?? 1}.</p>}
    {error && <p role="alert">{error}</p>}

    <section aria-label="Latest handoff" style={{ marginTop: 24 }}>
      <h2>1. Correct the last handoff</h2>
      {!run ? <p className="muted">Create a handoff on the Durable handoff page first.</p> : <>
        <p>Run {run._id.slice(0, 8)} used policy v{run.outputs?.context?.policy?.version ?? 'default'}. Status: {run.status}.</p>
        {run.outputs?.context?.memories?.length > 0 && <details open><summary>Memories recalled for this run{status.vectorMode === "atlas" ? " (Atlas $vectorSearch)" : ""}</summary>
          <ul>{run.outputs.context.memories.map(m => <li key={m.id}>{m.text} <small className="muted">({m.kind}, score {m.score?.toFixed(3)})</small></li>)}</ul></details>}
        {run.outputs?.verify?.policyChecks && <p>Policy checks: {Object.entries(run.outputs.verify.policyChecks).map(([id, r]) => `${id} ${r.passed ? 'passed' : 'failed'}`).join(', ')}.</p>}
        <form onSubmit={e => { e.preventDefault(); act(async () => { await post('/api/memories/corrections', { runId: run._id, text: correction, requestKey: crypto.randomUUID() }); setCorrection(''); }); }}>
          <label htmlFor="correction">What should this handoff have done differently?</label>
          <textarea id="correction" rows={3} style={{ width: '100%', margin: '8px 0' }} value={correction} onChange={e => setCorrection(e.target.value)} maxLength={2000} required />
          <button className="button small" disabled={busy || correction.trim().length < 3}>Save correction</button>
        </form>
      </>}
    </section>

    <section aria-label="Sleep review" style={{ marginTop: 32 }}>
      <h2>2. Sleep review</h2>
      <div className="button-row">
        <button className="button" disabled={!status?.configured || busy || (report && !['completed', 'failed'].includes(report.status))}
          onClick={() => act(() => post('/api/sleep/runs', { requestKey: crypto.randomUUID() }))}>Run sleep review</button>
      </div>
      {report && <>
        <ol>{STAGES.map((s, i) => <li key={s}>{s}: {i < report.checkpoint ? 'saved' : report.status === 'failed' && i === report.checkpoint ? 'stopped' : 'waiting'}</li>)}</ol>
        <p className="muted">{report.checkpoint} of 6 stages checkpointed. {report.attempts} worker claims.{report.error && report.status !== 'completed' ? ` ${report.error}` : ''}</p>
        {o.consolidate && <p>Consolidated {o.consolidate.merged.length} duplicate memories out of {o.consolidate.examined} new.</p>}
        {o.consolidate?.merged.map(m => <p key={m.superseded} className="muted">Kept "{m.text}", superseded "{m.supersededText}" (score {m.score.toFixed(3)}).</p>)}
        {o.propose?.pattern && <><h3>Recurring pattern ({o.propose.pattern.support.length} supporting memories)</h3>
          <ul>{o.propose.pattern.texts.map((t, i) => <li key={i}>{t}</li>)}</ul></>}
        {o.propose?.diff && <><h3>Proposed change: v{o.propose.parentVersion} to v{o.propose.candidateVersion}</h3>
          <p className="muted">{o.propose.reason}</p>
          <ul>{o.propose.diff.addRules.map(r => <li key={r}>+ rule: {r}</li>)}{o.propose.diff.removeRules.map(r => <li key={r}>- rule: {r}</li>)}
            {o.propose.diff.addChecks.map(c => <li key={c}>+ check: {c}</li>)}{Object.entries(o.propose.diff.context).map(([k, v]) => <li key={k}>context {k}: {JSON.stringify(v)}</li>)}
            {o.propose.diff.requestTools.map(t => <li key={t}>requests tool: {t} (needs a person)</li>)}</ul></>}
        {o.evaluate?.heldOut > 0 && <><h3>Held-out evaluation ({o.evaluate.heldOut} unseen cases)</h3>
          <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
            <thead><tr><th style={cell}>Case</th>{o.evaluate.checkIds.map(id => <th key={id} style={cell}>{id}<br /><small>v{o.propose.parentVersion} / v{o.propose.candidateVersion}</small></th>)}</tr></thead>
            <tbody>{Object.entries(byCase).map(([id, r]) => <tr key={id}><td style={cell}>{id.slice(0, 10)}</td>
              {o.evaluate.checkIds.map(c => <td key={c} style={cell}>{r.parent.checks[c].applies === false ? 'n/a' : r.parent.checks[c].passed ? 'pass' : 'fail'} / {r.candidate.checks[c].applies === false ? 'n/a' : r.candidate.checks[c].passed ? 'pass' : 'fail'}</td>)}</tr>)}</tbody>
          </table></div>
          <p>All checks passing: v{o.propose.parentVersion} {pct(o.evaluate.parentRate)}, v{o.propose.candidateVersion} {pct(o.evaluate.candidateRate)}. Regressions: {o.evaluate.regressions.length}.</p></>}
        {o.decide && <p role="status"><strong>{o.decide.decision === 'promoted' ? `Promoted v${o.decide.version}.` : o.decide.decision === 'none' ? 'No change.' : o.decide.decision === 'needs_approval' ? 'Waiting for approval.' : 'Rejected.'}</strong> {o.decide.reason}</p>}
      </>}
    </section>

    {policies && <section aria-label="Policy versions" style={{ marginTop: 32 }}>
      <h2>3. Harness policy versions</h2>
      {policies.versions.map(v => <details key={v._id} open={v._id === policies.activeId}>
        <summary>v{v.version}: {v._id === policies.activeId ? 'active' : v.status}{v.rejectedReason ? `. ${v.rejectedReason}` : ''}</summary>
        <ul>{v.rules.map(r => <li key={r}>{r}</li>)}</ul>
        <p className="muted">Checks: {v.checks.join(', ')}. Recall: top {v.context.k} of {v.context.kinds.join(', ')}.</p>
      </details>)}
      {active?.parent && <button className="button secondary small" disabled={busy}
        onClick={() => act(() => post('/api/sleep/policies/rollback', { expectedActiveId: policies.activeId }))}>Roll back to previous version</button>}
    </section>}
    <p className="muted" style={{ marginTop: 32 }}>Checks are deterministic rules over the draft. They verify structure, not factual accuracy. Pass rates are measured on the cases shown, never estimated.</p>
  </div>;
}
