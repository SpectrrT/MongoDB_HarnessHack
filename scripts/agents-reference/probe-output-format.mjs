import fs from 'node:fs/promises';
import {createMemoryDb} from '../../rem/db/index.js';
import {createContextCompactor} from '../../server/context/compaction.js';
import {answer, JSON_MODE, MODEL, totals, sha256} from './protocol.mjs';
import {exactAnswer} from '../fixtures/evolving-context.mjs';
if(!JSON_MODE)throw Error('This registered probe requires explicit JSON mode');
const output=process.argv[2];
if(!output)throw Error('Pass an unused output path');
try{await fs.access(output);throw Error('Refusing to overwrite evidence');}catch(e){if(e.code!=='ENOENT')throw e;}
const prior=JSON.parse(await fs.readFile('docs/evidence/agents-reference-opus-v14-1.json','utf8'));
const stage=prior.cases.flatMap(c=>c.stages).find(s=>s.id==='reopened');
const inputFor=arm=>JSON.parse(prior.receipts.find(r=>r.stage==='reopened'&&r.arm===arm&&r.phase==='answer').request.messages.find(m=>m.role==='user').content);
const reference=inputFor('reference'),offload=inputFor('offload'),receipts=[];
const db=createMemoryDb(),compactor=createContextCompactor({db,budgetChars:100000,scorer:{name:'unused',async score(){throw Error('No selector calls belong in this format probe')}}});
const runId='json-format-probe';await compactor.select({runId,goal:stage.goal,units:reference.records});
const report={createdAt:new Date().toISOString(),kind:'Paired reproduction of an observed format failure, not a full benchmark',model:MODEL,outputFormat:'json_object',sourceReceipt:'agents-reference-opus-v14-1.json',stage:'reopened',protocolHash:sha256(await fs.readFile(new URL('./protocol.mjs',import.meta.url),'utf8')),expected:stage.expected,receipts};
try{
 for(const [arm,engine,input] of [['reference','sdk',reference],['offload','offload',offload]]){
  report[arm]=await answer({engine,goal:stage.goal,units:input.records,compactor,runId,receipts,context:{arm,phase:'answer',stage:'reopened'},apiKey:process.env.OPENROUTER_API_KEY});
  report[arm].pass=exactAnswer(report[arm].answer,stage.expected);await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
 }
}finally{report.usage=totals(receipts);report.pass=report.reference?.pass===true&&report.offload?.pass===true;await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:report.pass,usage:report.usage,reference:report.reference?.pass,offload:report.offload?.pass}));if(!report.pass)process.exitCode=1;}
