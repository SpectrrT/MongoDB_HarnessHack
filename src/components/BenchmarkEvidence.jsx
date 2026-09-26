import { useState } from 'react';
import evidence from '../data/benchmark-evidence.json';

export default function BenchmarkEvidence() {
  const [workload, setWorkload] = useState('evolving');
  const result = workload === 'repeated' ? evidence.repeated : evidence;
  const number = value => Number.isFinite(value) ? value.toLocaleString('en-US') : 'Unknown';
  const savings = result.tokenSavingsPercent;
  const difference = Number.isFinite(savings)
    ? `${Math.abs(savings).toFixed(2)}% ${savings >= 0 ? 'fewer' : 'more'} total tokens`
    : 'Total token difference unavailable';
  return <section className="benchmark-evidence" aria-labelledby="benchmark-title">
    <div className="benchmark-heading"><h2 id="benchmark-title">{evidence.title}</h2><span>{evidence.scope}</span></div>
    <div className="benchmark-workloads" aria-label="Benchmark workload">
      <button type="button" aria-pressed={workload === 'evolving'} onClick={() => setWorkload('evolving')}>Changing tasks</button>
      <button type="button" aria-pressed={workload === 'repeated'} onClick={() => setWorkload('repeated')}>Repeated context</button>
    </div>
    <div className="benchmark-comparison">
      <div><span>Full context</span><strong>{number(result.baselineTokens)}</strong><small>tokens · {result.baselinePassed}/{result.stages} exact checks</small></div>
      <div><span>Offload + Jev</span><strong>{number(result.offloadTokens)}</strong><small>tokens · {result.offloadPassed}/{result.stages} exact checks</small></div>
    </div>
    <p className="benchmark-difference">{difference}<span>Scoring and recovery included</span></p>
    <details><summary>See the test conditions</summary>
      <p>{result.description}</p><p>{evidence.answerModel} · {evidence.scorer}</p>
      <p>{result.limitation}</p><a href={result.receipt} target="_blank" rel="noreferrer">Read the measured run</a>
    </details>
    <div className="benchmark-support" aria-label="Execution and memory evidence">
      {evidence.reliability.map(item => <article key={item.title}>
        <p className="ascii-small">{item.scope}</p><h3>{item.title}</h3><strong>{item.result}</strong>
        <p>{item.description}</p><a href={item.receipt} target="_blank" rel="noreferrer">Conditions and receipt</a>
      </article>)}
    </div>
    {evidence.personal?.length > 0 && <div className="benchmark-personal">
      <h3>What real session replays show</h3>
      {evidence.personal.map(item => <article key={item.id}>
        <div className="benchmark-heading"><h4>{item.title}</h4><span>{item.status}</span></div>
        {item.quote && <blockquote>“{item.quote}”<cite>{item.quoteSource}</cite></blockquote>}
        <p>{item.result}</p><p className="benchmark-caveat">{item.conditions}</p>
        <a href={item.receipt} target="_blank" rel="noreferrer">Read this replay</a>
      </article>)}
    </div>}
  </section>;
}
