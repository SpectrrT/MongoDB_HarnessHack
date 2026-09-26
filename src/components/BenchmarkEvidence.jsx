import { lazy, Suspense, useState } from 'react';
import evidence from '../data/benchmark-evidence.json';
const BenchmarkCharts = lazy(() => import('./BenchmarkCharts'));

export default function BenchmarkEvidence() {
  const [workload, setWorkload] = useState('evolving');
  const result = workload === 'evolving' ? evidence : evidence[workload];
  const number = value => Number.isFinite(value) ? value.toLocaleString('en-US') : 'Unknown';
  const savings = result.tokenSavingsPercent;
  const difference = result.noSelection ? 'Context selection did not activate' : Number.isFinite(savings)
    ? `${Math.abs(savings).toFixed(2)}% ${savings >= 0 ? 'fewer' : 'more'} total tokens`
    : 'Total token difference unavailable';
  return <section className="benchmark-evidence" aria-labelledby="benchmark-title">
    <div className="benchmark-heading"><h2 id="benchmark-title">{evidence.title}</h2><span>{result.scope || evidence.scope}</span></div>
    <div className="benchmark-workloads" aria-label="Benchmark workload">
      <button type="button" aria-pressed={workload === 'evolving'} onClick={() => setWorkload('evolving')}>Changing tasks</button>
      <button type="button" aria-pressed={workload === 'repeated'} onClick={() => setWorkload('repeated')}>Repeated context</button>
      <button type="button" aria-pressed={workload === 'research'} onClick={() => setWorkload('research')}>Research replay</button>
      <button type="button" aria-pressed={workload === 'onboarding'} onClick={() => setWorkload('onboarding')}>Onboarding replay</button>
    </div>
    <div className="benchmark-comparison">
      <div><span>{result.baselineLabel}</span><strong>{number(result.baselineTokens)}</strong><small>tokens · {result.baselinePassed}/{result.stages} exact checks</small></div>
      <div><span>{result.offloadLabel}</span><strong>{number(result.offloadTokens)}</strong><small>tokens · {result.offloadPassed}/{result.stages} exact checks</small></div>
    </div>
    <p className="benchmark-difference">{difference}<span>{result.noSelection ? 'Identical input. Score and token differences are generation variation.' : 'Scoring and recovery included'}</span></p>
    <Suspense fallback={<p className="benchmark-loading">Loading measured charts...</p>}><BenchmarkCharts result={result}/></Suspense>
    <details><summary>See the test conditions</summary>
      <p>{result.description}</p><p>{result.answerModel} · {result.scorer}</p>
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
