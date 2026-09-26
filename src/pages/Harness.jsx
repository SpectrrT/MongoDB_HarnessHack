import React, { useEffect, useRef, useState } from 'react';
export default function Harness() {
  const [configured, setConfigured] = useState(false), [notes, setNotes] = useState('');
  const [run, setRun] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [id, setId] = useState(() => localStorage.getItem('offload.harness.lastRun') || '');
  const pending = useRef(null);
  useEffect(() => {
    fetch('/api/harness/status').then(r => { if (!r.ok) throw Error(); return r.json(); })
      .then(s => setConfigured(s.configured)).catch(() => setError('Start the local harness API to connect.'));
  }, []);
  useEffect(() => {
    if (!id) return;
    let stopped = false, timer;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/harness/runs/${encodeURIComponent(id)}`);
        if (!response.ok) throw Error('Could not load this run.');
        const value = await response.json();
        if (!stopped) { setRun(value); setError(''); if (!['completed', 'failed'].includes(value.status)) timer = setTimeout(refresh, 1500); }
      } catch (e) { if (!stopped) { setError(e.message); timer = setTimeout(refresh, 3000); } }
    };
    refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, [id]);
  const start = async event => {
    event.preventDefault(); setBusy(true); setError('');
    const input = { instructions: 'Prepare a concise project handoff.', notes: notes.split('\n').map(s => s.trim()).filter(Boolean).map((text, i) => ({ id: `note${i + 1}`, text })) };
    const signature = JSON.stringify(input);
    if (pending.current?.signature !== signature) pending.current = { signature, requestKey: crypto.randomUUID() };
    try {
      const response = await fetch('/api/harness/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestKey: pending.current.requestKey, input }) });
      const value = await response.json();
      if (!response.ok) throw Error(value.error || 'Could not start run.');
      localStorage.setItem('offload.harness.lastRun', value.id); setRun(null); setId(value.id); pending.current = null;
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <div className="standard-page">
    <div className="page-title"><h1>Durable handoff</h1><p>Turn project notes into a source-linked handoff. Progress survives worker restarts.</p></div>
    <p>{configured ? 'MongoDB connected. A separate worker processes the queue.' : 'Setup required: configure the event Atlas sandbox and start the harness API.'}</p>
    <form onSubmit={start}>
      <label htmlFor="harness-notes">Project notes, one per line</label>
      <textarea id="harness-notes" rows={7} style={{ width: '100%', margin: '12px 0' }} value={notes} onChange={e => setNotes(e.target.value)} maxLength={30000} required />
      <p className="muted">Submitted notes go to the configured model provider. Up to 30 notes, 2,000 characters each.</p>
      <button className="button" disabled={!configured || busy || !notes.trim()}>{busy ? 'Saving run…' : 'Create handoff'}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {run && <section aria-label="Saved run" style={{ marginTop: 28 }}>
      <h2>{run.status === 'completed' ? 'Handoff ready' : run.status === 'failed' ? 'Run stopped' : 'Work in progress'}</h2>
      <p role="status">{run.checkpoint} of 4 checkpoints saved. {run.attempts} worker claims.</p>
      <ol>{['Collect context', 'Draft handoff', 'Check source references', 'Save artifact'].map((step, i) => <li key={step}>{step}: {i < run.checkpoint ? 'saved' : 'waiting'}</li>)}</ol>
      {run.error && run.status !== 'completed' && <p>{run.error}</p>}
      {run.outputs?.artifact && <><h3>Project handoff</h3><p>{run.outputs.artifact.draft.summary}</p>{run.outputs.artifact.draft.claims.map((claim, i) => <p key={i}>{claim.text} <small>Sources: {claim.sourceIds.join(', ')}</small></p>)}<p className="muted">{run.outputs.artifact.evaluation.limitation}</p></>}
      <details><summary>Checkpoint receipts</summary>{run.receipts.map(receipt => <p key={receipt.key}>{receipt.step}: {new Date(receipt.completedAt).toLocaleString()}</p>)}</details>
      <p className="muted">This milestone creates an internal artifact. It does not send or publish it. Adaptive policy learning is still in development.</p>
    </section>}
  </div>;
}
