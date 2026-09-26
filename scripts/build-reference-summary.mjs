import fs from 'node:fs';
import crypto from 'node:crypto';
const root = new URL('../', import.meta.url);
const jsonFiles=[1,2,3].map(i=>`agents-reference-opus-v14-json-${i}.json`);
const jsonComplete=jsonFiles.every(file=>{try{return JSON.parse(fs.readFileSync(new URL('docs/evidence/'+file,root),'utf8')).summary?.complete===true;}catch{return false;}});
const specifications = [
  ...(jsonComplete?[{id:'opus-v14-json',label:'Claude Opus 5.5',current:true,files:jsonFiles}]:[]),
  {id:'astra-v14',label:'GPT-6 Astra',current:true,files:[1,2,3].map(i=>`agents-reference-astra-v14-${i}.json`)},
  {id:'opus-v14',label:jsonComplete?'Claude Opus 5.5, prompted JSON':'Claude Opus 5.5',current:!jsonComplete,files:[1,2,3].map(i=>`agents-reference-opus-v14-${i}.json`)},
  {id:'gpt4o',label:'GPT-4o-mini',files:['agents-reference-2026-09-26.json','agents-reference-replication-2.json','agents-reference-replication-3.json']},
  {id:'astra',label:'GPT-6 Astra, previous selector',files:['agents-reference-astra-paced-1.json','agents-reference-astra-paced-2.json']},
  {id:'opus',label:'Claude Opus 5.5, previous selector',files:['agents-reference-opus-paced-1.json','agents-reference-opus-paced-2.json']},
];
const interrupted = ['agents-reference-opus-1.json','agents-reference-opus-2.json','agents-reference-astra-1.json'];
const read = name => JSON.parse(fs.readFileSync(new URL('docs/evidence/'+name,root),'utf8'));
const trials = [];
function capture(file) {
  const report=read(file),s=report.summary;
  if(!s?.complete || s.stages!==12) throw Error('Incomplete report: '+file);
  const receipt='/evidence/'+file;
  // Provider errors may carry account metadata. It is irrelevant to verification.
  const publicReport=JSON.parse(JSON.stringify(report,(key,value)=>['user_id','organization_id','headers'].includes(key)?undefined:value));
  publicReport.publicReceiptNote='Account identifiers and response header metadata omitted; prompts, outputs, usage, status and experimental outcomes are unchanged.';
  const publicBytes=JSON.stringify(publicReport,null,2)+'\n';
  fs.writeFileSync(new URL('public'+receipt,root),publicBytes);
  const row={file,receipt,model:report.protocol.model,selectorPolicyVersion:report.protocol.selectorPolicyVersion || 'retention-v9-shared-encoding',outputFormat:report.protocol.outputFormat || 'prompted JSON',adapter:report.protocol.adapter||'Chat Completions SDK reference and Offload loop',sha256:crypto.createHash('sha256').update(publicBytes).digest('hex'),sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(new URL('docs/evidence/'+file,root))).digest('hex'),summary:s,
    httpFailures:report.receipts.filter(r=>r.status!==200).length,
    beforeContextChars:report.cases.flatMap(c=>c.stages).reduce((n,r)=>n+r.metrics.beforeChars,0),
    afterContextChars:report.cases.flatMap(c=>c.stages).reduce((n,r)=>n+r.metrics.afterChars,0),
    pacingMs:report.protocol.requestIntervalMs||0};
  trials.push(row);return row;
}
const comparisons=specifications.map(group=>{
 const rows=group.files.map(capture);
 if(rows.some(r=>r.model!==rows[0].model||r.selectorPolicyVersion!==rows[0].selectorPolicyVersion||r.outputFormat!==rows[0].outputFormat))throw Error('Different protocols cannot be pooled: '+group.id);
 if(rows.some(r=>r.summary.reference.totalTokens===null||r.summary.offload.totalTokens===null))throw Error('Unknown usage cannot be ranked: '+group.id);
 const sum=field=>rows.reduce((n,r)=>n+field(r.summary),0);
 return {id:group.id,label:group.label,current:Boolean(group.current),selectorPolicyVersion:rows[0].selectorPolicyVersion,outputFormat:rows[0].outputFormat,baselineLabel:'SDK reference',baselineTokens:sum(s=>s.reference.totalTokens),offloadTokens:sum(s=>s.offload.totalTokens),baselinePassed:sum(s=>s.referencePassed),offloadPassed:sum(s=>s.offloadPassed),stages:sum(s=>s.stages),trialCount:rows.length,answerModel:rows[0].model,
  decisionTokens:sum(s=>s.decisions.totalTokens),baselineCalls:sum(s=>s.reference.calls),offloadCalls:sum(s=>s.offload.calls),baselineLatencyMs:sum(s=>s.referenceAnswerLatencyMs),offloadLatencyMs:sum(s=>s.offloadSelectionAndAnswerLatencyMs),beforeContextChars:rows.reduce((n,r)=>n+r.beforeContextChars,0),afterContextChars:rows.reduce((n,r)=>n+r.afterContextChars,0),
  runs:rows.map(r=>({baselineTokens:r.summary.reference.totalTokens,offloadTokens:r.summary.offload.totalTokens,baselinePassed:r.summary.referencePassed,offloadPassed:r.summary.offloadPassed,checks:r.summary.stages,beforeContextChars:r.beforeContextChars/r.summary.stages,afterContextChars:r.afterContextChars/r.summary.stages,receipt:r.receipt})),
  receipt:'/evidence/reference-summary.json',description:`${rows.length} full paired trials, each with three synthetic tasks and twelve changing-context stages. Both arms use ${group.label}, identical goals, checks, archive tools and per-call limits. SDK reference receives full history; Offload selects context and can recover the originals.`,limitation:'Development fixtures, not independent unseen tasks or a broad reasoning benchmark. Exact JSON checks cover facts and required format. All-in Offload cost remains unknown because selector prices are absent. Request scheduling waits count in arm latency. Provider routing and caching are uncontrolled.',trials:rows.map(r=>r.receipt)};
});
interrupted.forEach(capture);
const selectorExperiments=[10,11,12,13,14].map(version=>{const file=`selector-v${version}-probe.json`,raw=read(file);fs.writeFileSync(new URL('public/evidence/'+file,root),JSON.stringify(raw,null,2)+'\n');return {version,pass:raw.pass,usage:raw.usage,receipt:'/evidence/'+file};});
const formatProbeFile=new URL('docs/evidence/opus-json-format-probe.json',root);
let formatProbe=null;
if(fs.existsSync(formatProbeFile)){const raw=JSON.parse(fs.readFileSync(formatProbeFile,'utf8'));fs.writeFileSync(new URL('public/evidence/opus-json-format-probe.json',root),JSON.stringify(raw,null,2)+'\n');formatProbe={pass:raw.pass,usage:raw.usage,receipt:'/evidence/opus-json-format-probe.json'};}
const summary={formatProbe,selectorExperiments,createdAt:new Date().toISOString(),protocol:'Fixed trials, all outcomes retained; rate-limit failures separately preserved with unknown totals.',comparisons,trials};
fs.writeFileSync(new URL('public/evidence/reference-summary.json',root),JSON.stringify(summary,null,2)+'\n');
fs.writeFileSync(new URL('docs/evidence/reference-summary.json',root),JSON.stringify(summary,null,2)+'\n');
const file=new URL('src/data/benchmark-evidence.json',root),evidence=JSON.parse(fs.readFileSync(file,'utf8'));
evidence.presentationComparisons=comparisons.filter(r=>r.current).sort((a,b)=>a.id.startsWith('astra')?-1:b.id.startsWith('astra')?1:0);
evidence.presentationTitle=evidence.presentationComparisons.every(r=>r.offloadTokens<r.baselineTokens)?'Same tasks. Fewer tokens.':'Same models. Same tasks.';
evidence.presentationDescription='Offload and an OpenAI Agents SDK reference, tested side by side.';
evidence.presentationMethod='Three runs per model. Three development tasks, 36 exact checks per configuration. Same model and tools in each pair. All selector and retrieval tokens included.';
fs.writeFileSync(file,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(comparisons));
