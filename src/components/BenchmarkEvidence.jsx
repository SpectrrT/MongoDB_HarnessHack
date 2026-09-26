import {EChartsBarChart} from '../vendor/evilcharts/bar';
import * as echarts from 'echarts/core';
import {ScatterChart} from 'echarts/charts';
import evidence from '../data/benchmark-evidence.json';

echarts.use([ScatterChart]);
const comparisons = evidence.presentationComparisons;
const number = value => Math.round(value).toLocaleString('en-US');
const font = '"Avenir Next", Avenir, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const colors = ['#aaa', '#171717'];
const runsFor = result => result.runs || [{baselineTokens: result.baselineTokens / result.trialCount, offloadTokens: result.offloadTokens / result.trialCount,
  baselinePassed: result.baselinePassed / result.trialCount, offloadPassed: result.offloadPassed / result.trialCount,
  beforeContextChars: result.beforeContextChars / result.stages, afterContextChars: result.afterContextChars / result.stages}];

function metric(result, context, offload) {
  if (context) return result[offload ? 'afterContextChars' : 'beforeContextChars'] / result.stages;
  const passed = result[offload ? 'offloadPassed' : 'baselinePassed'];
  return passed ? result[offload ? 'offloadTokens' : 'baselineTokens'] / passed : null;
}

function BenchmarkChart({context = false}) {
  const names = context ? ['Before selection', 'After selection'] : ['SDK reference', 'Offload'];
  const data = comparisons.map(result => ({model: result.label, baseline: metric(result, context, false), offload: metric(result, context, true)}));
  const config = Object.fromEntries(['baseline', 'offload'].map((key, i) => [key, {label: names[i], colors: {light: [colors[i]], dark: [colors[i]]}}]));
  const series = ['baseline', 'offload'].map((key, index) => ({id: key, name: names[index], type: 'bar', barWidth: 32, barGap: '50%',
    data: data.map(row => row[key]), itemStyle: {color: colors[index], borderRadius: 0},
    label: {show: true, position: 'top', distance: 15, color: '#171717', fontFamily: font, fontSize: 14, fontWeight: 600, formatter: ({value}) => number(value)},
    emphasis: {disabled: true}, animation: false,
  }));
  for (const [arm, offload] of [['baseline', false], ['offload', true]]) {
    const trialCount = Math.max(...comparisons.map(result => runsFor(result).length));
    for (let trial = 0; trial < trialCount; trial++) series.push({id: `${arm}-trial-${trial}`, name: `Run ${trial + 1}`, type: 'scatter', symbolSize: 5,
      symbolOffset: [(offload ? 24 : -24) + (trial - (trialCount - 1) / 2) * 6, 0],
      data: comparisons.map((result, index) => {
        const run = runsFor(result)[trial];
        const value = !run ? null : context ? run[offload ? 'afterContextChars' : 'beforeContextChars'] : run[offload ? 'offloadTokens' : 'baselineTokens'] / run[offload ? 'offloadPassed' : 'baselinePassed'];
        return [index, Number.isFinite(value) ? value : null];
      }), itemStyle: {color: '#fff', borderColor: '#171717', borderWidth: 1}, z: 5, animation: false, silent: true,
    });
  }
  const options = {
    textStyle: {fontFamily: font}, grid: {left: 43, right: 14, top: 40, bottom: 45},
    xAxis: {type: 'category', data: data.map(row => row.model), axisLine: {lineStyle: {color: '#d2d2d2'}}, axisTick: {show: false}, axisLabel: {fontFamily: font, color: '#555', fontSize: 12, margin: 18, interval: 0}},
    yAxis: {type: 'value', min: 0, splitNumber: 3, axisLabel: {fontFamily: font, color: '#777', fontSize: 11, formatter: value => value >= 1000 ? `${value / 1000}k` : value}, splitLine: {lineStyle: {color: '#ededed'}}, axisTick: {show: false}, axisLine: {show: false}},
    series, tooltip: {show: false}, animation: false,
  };
  const description = comparisons.map(result => `${result.label}: ${names[0]} ${number(metric(result, context, false))}, ${names[1]} ${number(metric(result, context, true))}`).join('. ');
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
    <p className="benchmark-intro">{evidence.presentationDescription} Bars combine all runs; dots show individual trials.</p>
    <div className="benchmark-figures">
      <figure aria-labelledby="benchmark-tokens-title">
        <figcaption id="benchmark-tokens-title"><h3>Tokens per verified answer</h3><span>Lower is better. Selector and retrieval included.</span></figcaption>
        <BenchmarkChart/>
        <div className="benchmark-results">{comparisons.map(result => {
          const difference = 100 * (1 - metric(result, false, true) / metric(result, false, false));
          return <p key={result.id}><span>{result.label}</span><strong>{Math.abs(difference).toFixed(1)}% {difference >= 0 ? 'fewer' : 'more'}</strong><small>Checks: reference {result.baselinePassed}/{result.stages}, Offload {result.offloadPassed}/{result.stages}</small></p>;
        })}</div>
      </figure>
      <figure aria-labelledby="benchmark-context-title">
        <figcaption id="benchmark-context-title"><h3>Context per step</h3><span>Characters kept. Originals stay retrievable.</span></figcaption>
        <BenchmarkChart context/>
        <div className="benchmark-results">{comparisons.map(result => <p key={result.id}><span>{result.label}</span><strong>{(100 * (1 - result.afterContextChars / result.beforeContextChars)).toFixed(1)}% smaller</strong><small>Exact source records kept in the archive</small></p>)}</div>
      </figure>
    </div>
    <p className="benchmark-method">{evidence.presentationMethod} Verified answers pass exact content and format checks. These are development tests, not a general intelligence ranking. <a href="/evidence/benchmark-report.html">Methods and all results</a></p>
  </section>;
}
