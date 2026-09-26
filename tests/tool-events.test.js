import test from 'node:test';import assert from 'node:assert/strict';import {toolPresentation,activityGroups} from '../shared/tool-events.js';
test('compaction labels distinguish real Jev calls, cached work, native compaction and no-op checks',()=>{
 assert.equal(toolPresentation({type:'contextCompaction',status:'running',source:'typesafe:jev-1.13',decisionCalls:1}).label,'Using Jev for compaction');
 assert.equal(toolPresentation({type:'contextCompaction',status:'failed',source:'typesafe:jev-1.13',decisionCalls:1}).status,'Failed');
 assert.equal(toolPresentation({type:'contextCompaction',status:'completed',source:'typesafe:jev-1.13',decisionCalls:0,cacheHits:2}).label,'Apply cached compaction decisions');
 assert.equal(toolPresentation({type:'contextCompaction',status:'completed',detail:JSON.stringify({type:'contextCompaction'})}).label,'Compact conversation');
 assert.equal(activityGroups([{type:'contextCompaction',status:'under_budget',detail:JSON.stringify({decisionCalls:0})}]).length,0);
});
test('tool activity names the actual source and never turns a failure into success',()=>{
 assert.equal(toolPresentation({type:'mcpToolCall',label:'gmail.search_emails',status:'inProgress'}).label,'Search email');
 assert.equal(toolPresentation({type:'mcpToolCall',label:'gmail.read_email',status:'failed'}).status,'Failed');
 const e={type:'mcpToolCall',status:'completed',detail:JSON.stringify({server:'cua_repl',tool:'js',arguments:{code:'await tab.goto("https://courseworks.columbia.edu")'}})};
 assert.equal(toolPresentation(e).label,'Check CourseWorks');
 e.detail=JSON.stringify({server:'cua_repl',tool:'js',arguments:{code:'https://gradescope.com'},error:{message:'Sign in required'}});assert.equal(toolPresentation(e).status,'Failed');
});

test('repeated tools collapse without hiding a failed or running call',()=>{
 const event={type:'toolCall',label:'list_files',status:'completed'};
 const groups=activityGroups([event,event,event,{...event,status:'failed'}]);
 assert.equal(groups.length,2);assert.equal(groups[0].events.length,3);assert.equal(groups[1].view.status,'Failed');
 assert.equal(toolPresentation({type:'toolCall',label:'read_file',status:'completed',arguments:JSON.stringify({path:'notes/plan.md'})}).label,'Read plan.md');
});

test('query demo labels come from real command and file arguments with runtime status intact',()=>{
 const baseline={type:'commandExecution',status:'inProgress',detail:JSON.stringify({command:'node scripts/query-demo.mjs --baseline'})};
 assert.equal(toolPresentation(baseline).label,'Measure baseline query plan');
 assert.equal(toolPresentation(baseline).service,'mongodb');
 assert.equal(toolPresentation(baseline).status,'Working');
 const candidate={type:'toolCall',label:'run_command',status:'failed',arguments:JSON.stringify({command:'node "/repo with spaces/scripts/query-demo.mjs" --candidate-index'})};
 assert.equal(toolPresentation(candidate).label,'Test candidate index');
 assert.equal(toolPresentation(candidate).status,'Failed');
 assert.equal(activityGroups([baseline,candidate]).length,2);
 for(const [path,label] of [['docs/QUERY-DEMO.md','Read query demo guide'],['fixtures/query-demo/pipeline.json','Read query demo fixtures']]){
  assert.equal(toolPresentation({type:'toolCall',label:'read_file',arguments:JSON.stringify({path})}).label,label);
  assert.equal(toolPresentation({type:'commandExecution',detail:JSON.stringify({command:`cat ${path}`})}).label,label);
 }
 assert.equal(toolPresentation({type:'commandExecution',detail:JSON.stringify({command:"/bin/zsh -lc 'node scripts/query-demo.mjs --baseline'"})}).label,'Measure baseline query plan');
});

test('mentions and unrelated commands do not appear as MongoDB tool activity',()=>{
 for(const command of ['echo "node scripts/query-demo.mjs --baseline"','node scripts/other.mjs --baseline','node scripts/query-demo.mjs.old --baseline','printf docs/QUERY-DEMO.md',"echo '; node scripts/query-demo.mjs --baseline'",'echo ";" node scripts/query-demo.mjs --baseline',"jq -n --arg file .data/query-demo/example/report.json",'jq ".data/query-demo/example/report.json" other.json']){
  const view=toolPresentation({type:'commandExecution',status:'completed',detail:JSON.stringify({command})});
  assert.equal(view.label,'Run command');assert.equal(view.service,undefined);
 }
 assert.equal(toolPresentation({type:'toolCall',label:'write_file',arguments:JSON.stringify({path:'fixtures/query-demo/pipeline.json'})}).label,'Save pipeline.json');
 assert.equal(toolPresentation({type:'commandExecution',label:'echo hello',output:'node scripts/query-demo.mjs --baseline'}).service,undefined);
});

test('quoted shell wrappers preserve escaped candidate JSON and runtime status',()=>{
 // Representative of the real commandExecution event emitted by the query demo.
 const command=String.raw`/bin/zsh -lc "node /demo/scripts/query-demo.mjs --candidate-index '{\"tenantId\":1,\"status\":1,\"createdAt\":-1,\"_id\":-1}' --output .data/query-demo"`;
 const event={type:'commandExecution',status:'completed',detail:JSON.stringify({command})};
 assert.equal(toolPresentation(event).label,'Test candidate index');
 assert.equal(toolPresentation(event).service,'mongodb');
 assert.equal(toolPresentation(event).status,'Done');
 assert.equal(toolPresentation({...event,status:'failed'}).status,'Failed');
 assert.equal(toolPresentation({type:'commandExecution',detail:JSON.stringify({command:String.raw`/bin/zsh -lc "echo 'node /demo/scripts/query-demo.mjs --candidate-index {}'"`})}).label,'Run command');
});

test('real query runner and report reads are evidence inspections',()=>{
 for(const command of ['cat /demo/scripts/query-demo.mjs',"jq '.baseline' .data/query-demo/example/report.json",String.raw`/bin/zsh -lc "jq 'keys, .baseline, .candidate' .data/query-demo/example/report.json | sed -n '1,220p'"`]){
  const view=toolPresentation({type:'commandExecution',detail:JSON.stringify({command})});
  assert.equal(view.label,'Inspect query evidence');assert.equal(view.service,'mongodb');
 }
 assert.equal(toolPresentation({type:'toolCall',label:'read_file',arguments:JSON.stringify({path:'artifacts/query-demo/example/candidate-explain.json'})}).label,'Inspect query evidence');
});
