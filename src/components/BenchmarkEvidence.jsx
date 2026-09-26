import evidence from '../data/benchmark-evidence.json';

const number = value => value.toLocaleString('en-US');
const comparisons = evidence.presentationComparisons || [
  {...evidence, id: 'changing', label: 'Changing tasks'},
  {...evidence.repeated, id: 'repeated', label: 'Repeated context'},
];

function Comparison({result, quality, maximum}) {
  const rows = [
    {name: result.baselineLabel || 'Without Offload', value: quality ? result.baselinePassed : result.baselineTokens},
    {name: 'Offload', value: quality ? result.offloadPassed : result.offloadTokens, offload: true},
  ];
  const difference = 100 * (1 - result.offloadTokens / result.baselineTokens);
  return <div className="benchmark-group">
    <div className="benchmark-group-heading"><h4>{result.label}</h4>
      {!quality && <strong>{Math.abs(difference).toFixed(1)}% {difference >= 0 ? 'fewer' : 'more'}</strong>}
    </div>
    {rows.map(row => <div key={row.name} className={`benchmark-bar-row${row.offload ? ' is-offload' : ''}`}>
      <div className="benchmark-bar-label"><span>{row.name}</span><strong>{quality ? `${row.value} / ${result.stages}` : number(row.value)}</strong></div>
      <div className="benchmark-bar-track" aria-hidden="true"><span style={{width: `${100 * row.value / (quality ? result.stages : maximum)}%`}}/></div>
    </div>)}
  </div>;
}

export default function BenchmarkEvidence() {
  const maximum = Math.max(...comparisons.flatMap(result => [result.baselineTokens, result.offloadTokens]));
  return <section className="benchmark-evidence" aria-labelledby="benchmark-title">
    <h2 id="benchmark-title">Fewer tokens. Checked results.</h2>
    <p className="benchmark-intro">{evidence.presentationDescription || 'Same model and tasks, with and without Offload.'}</p>
    <div className="benchmark-figures">
      <figure aria-labelledby="benchmark-tokens-title">
        <figcaption id="benchmark-tokens-title"><h3>Tokens used</h3><span>Lower is better. Selector included.</span></figcaption>
        {comparisons.map(result => <Comparison key={result.id} result={result} maximum={maximum}/>)}
      </figure>
      <figure aria-labelledby="benchmark-checks-title">
        <figcaption id="benchmark-checks-title"><h3>Checks passed</h3><span>Exact answers and required format.</span></figcaption>
        {comparisons.map(result => <Comparison key={result.id} result={result} quality/>)}
      </figure>
    </div>
    <p className="benchmark-method">{evidence.presentationMethod || 'GPT-4o-mini · Synthetic development tests: 12 changing-task stages and 4 repeated snapshots × 5 answers. The baseline missed one formatting check.'} <a href="/evidence/benchmark-report.html">Methods and all results</a></p>
  </section>;
}
