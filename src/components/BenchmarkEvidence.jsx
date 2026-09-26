import {EChartsBarChart} from '../vendor/evilcharts/bar';
import evidence from '../data/benchmark-evidence.json';

const comparisons = evidence.presentationComparisons;
const number = value => Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : 'Not verified';
const font = '"Avenir Next", Avenir, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const colors = ['#aaa', '#171717'];
const runsFor = result => result.runs;

function metric(result, context, offload) {
  if (context) return result[offload ? 'afterContextChars' : 'beforeContextChars'] / result.stages;
  const passed = result[offload ? 'offloadPassed' : 'baselinePassed'];
  return passed ? result[offload ? 'offloadTokens' : 'baselineTokens'] / passed : null;
}

const escape = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
function tooltipFor(result, context, offload, name) {
  const value = number(metric(result, context, offload));
  const trials = runsFor(result).map(run => number(context ? run[offload ? 'afterContextChars' : 'beforeContextChars'] : metric(run, false, offload))).join(' · ');
  return `<div class="benchmark-tooltip"><strong>${escape(name)}</strong><p>${escape(result.label)}</p><p><b>${value}</b> ${context ? 'history characters per step' : 'tokens per verified answer'}</p>${context ? '' : `<p>${result[offload ? 'offloadPassed' : 'baselinePassed']}/${result.stages} checks passed</p>`}<p class="benchmark-trials">Trials: ${trials}</p></div>`;
}

function BenchmarkChart({context = false}) {
  const names = context ? ['Before selection', 'After selection'] : ['Without Offload', 'With Offload'];
  const data = comparisons.map(result => ({model: result.label, baseline: metric(result, context, false), offload: metric(result, context, true)}));
  const config = Object.fromEntries(['baseline', 'offload'].map((key, i) => [key, {label: names[i], colors: {light: [colors[i]], dark: [colors[i]]}}]));
  const series = ['baseline', 'offload'].map((key, index) => ({id: key, name: names[index], type: 'bar', barWidth: 32, barGap: '50%',
    data: data.map(row => row[key]), itemStyle: {color: colors[index], borderRadius: 0},
    label: {show: true, position: 'top', distance: 12, color: '#171717', fontFamily: font, fontSize: 14, fontWeight: 600, formatter: ({value}) => number(value)},
    emphasis: {disabled: true}, animation: false,
  }));
  const options = {
    textStyle: {fontFamily: font}, grid: {left: 43, right: 14, top: 40, bottom: 45},
    xAxis: {type: 'category', data: data.map(row => row.model), axisLine: {lineStyle: {color: '#d2d2d2'}}, axisTick: {show: false}, axisLabel: {fontFamily: font, color: '#555', fontSize: 12, margin: 18, interval: 0}},
    yAxis: {type: 'value', min: 0, splitNumber: 3, axisLabel: {fontFamily: font, color: '#777', fontSize: 11, formatter: value => value >= 1000 ? `${value / 1000}k` : value}, splitLine: {lineStyle: {color: '#ededed'}}, axisTick: {show: false}, axisLine: {show: false}},
    series, tooltip: {
      show: true, trigger: 'item', triggerOn: 'mousemove|click', confine: true, renderMode: 'html',
      backgroundColor: '#fff', borderColor: '#d2d2d2', borderWidth: 1, padding: 12,
      textStyle: {color: '#171717', fontFamily: font, fontSize: 11},
      extraCssText: 'box-shadow:0 3px 14px #00000012;max-width:220px;white-space:normal;box-sizing:border-box;',
      formatter: params => { const result = comparisons[params.dataIndex], offload = params.seriesId === 'offload'; return result ? tooltipFor(result, context, offload, names[offload ? 1 : 0]) : ''; },
    }, animation: false,
  };
  const description = comparisons.map(result => `${result.label}: ${names[0]} ${number(metric(result, context, false))}, ${names[1]} ${number(metric(result, context, true))}${context ? '' : `. Verified checks: reference ${result.baselinePassed}/${result.stages}, Offload ${result.offloadPassed}/${result.stages}`}`).join('. ');
  return <>
    <div className="benchmark-legend" aria-hidden="true">{names.map((name, i) => <span key={name}><i style={{background: colors[i]}}/>{name}</span>)}</div>
    <div role="img" aria-label={description} className="benchmark-chart-accessible">
      <EChartsBarChart data={data} config={config} renderer="svg" animation={false} className="benchmark-chart" chartOptions={options}>
        <EChartsBarChart.XAxis dataKey="model"/>
        <EChartsBarChart.YAxis/>
        <EChartsBarChart.Bar dataKey="baseline"/>
        <EChartsBarChart.Bar dataKey="offload"/>
      </EChartsBarChart>
    </div>
  </>;
}

export default function BenchmarkEvidence() {
  return <section className="benchmark-evidence" aria-labelledby="benchmark-title">
    <h2 id="benchmark-title">{evidence.presentationTitle}</h2>
    <div className="benchmark-figures">
      <figure aria-labelledby="benchmark-tokens-title">
        <figcaption id="benchmark-tokens-title"><h3>Tokens per verified answer</h3><span>All tokens spent choosing context, fetching saved text and answering, divided by correct answers.</span></figcaption>
        <BenchmarkChart/>
      </figure>
      <figure aria-labelledby="benchmark-context-title">
        <figcaption id="benchmark-context-title"><h3>History kept for the next step</h3><span>Saved text before and after selection, measured in characters. This is only part of the token total.</span></figcaption>
        <BenchmarkChart context/>
      </figure>
    </div>
    <p className="benchmark-method">Same models and tasks, with and without Offload. Offload keeps the history needed next and saves the rest for later. Choosing that history also uses tokens, so a much shorter history means a smaller saving in total tokens. Astra kept the same accuracy; Opus missed two checks. <a href="/evidence/benchmark-report.html">Methods and all results</a></p>
  </section>;
}
