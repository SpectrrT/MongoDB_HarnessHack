import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const evidence = JSON.parse(fs.readFileSync(new URL('src/data/benchmark-evidence.json', root), 'utf8'));
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link = item => item.receipt ? `<a href="${escape(item.receipt)}">Raw receipt</a>` : '';
const entries = [
  ['Changing tasks', evidence], ['Repeated context', evidence.repeated],
  ['Research development replay', evidence.research], ['Onboarding development replay', evidence.onboarding],
  ...(evidence.presentationComparisons || []).map(item => [item.label,item]),
].filter(([,item]) => item);
const sections = entries.map(([name,item]) => `<section><h2>${escape(name)}</h2><p>${escape(item.description || evidence.description)}</p><table><thead><tr><th>Configuration</th><th>Total tokens</th><th>Checks passed</th></tr></thead><tbody><tr><th>${escape(item.baselineLabel || 'Without Offload')}</th><td>${escape(item.baselineTokens)}</td><td>${escape(item.baselinePassed)} / ${escape(item.stages)}</td></tr><tr><th>Offload</th><td>${escape(item.offloadTokens)}</td><td>${escape(item.offloadPassed)} / ${escape(item.stages)}</td></tr></tbody></table><p>${escape(item.answerModel || evidence.answerModel)}. ${escape(item.scorer || '')}</p><p>${escape(item.limitation)}</p>${link(item)}</section>`).join('');
const details = [...(evidence.personal || []), ...(evidence.reliability || [])].map(item => `<section><h2>${escape(item.title)}</h2><p><strong>${escape(item.status || item.scope)}</strong></p><p>${escape(item.result)}</p><p>${escape(item.conditions || item.description)}</p>${link(item)}</section>`).join('');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offload benchmark methods and results</title><style>body{max-width:800px;margin:50px auto;padding:0 24px;color:#171717;font:16px/1.7 "Avenir Next",system-ui,sans-serif}h1{font-size:32px;line-height:1.2}h2{font-size:22px}section{border-top:1px solid #ddd;margin-top:35px;padding-top:20px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{text-align:left;padding:8px;border-bottom:1px solid #ddd}a{color:inherit}p{overflow-wrap:anywhere}</style><a href="/">Offload</a><h1>Benchmark methods and all results</h1><p>These are measured, task-specific development results, not a general model ranking. Token totals include reported selection and recovery usage. Exact checks assess the stated tasks and output contracts, not broad intelligence. Repeated snapshots are not independent tasks.</p>${sections}${details}</html>`;
fs.writeFileSync(new URL('public/evidence/benchmark-report.html', root), html+'\n');
