import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveIdleCandidates,deriveIdleDraft} from '../server/suggestions/idle-candidates.js';
import {executionInput} from '../server/sleep/execution-store.js';
const user=(id,text)=>({id,role:'user',text});
const input=messages=>({conversationId:'conversation-one',messages});
const build=()=>input([user('goal','Build a local HTML counter widget.'),user('rule','Keep the data local. Do not deploy or send messages.')]);

test('derives a concrete prototype contract from explicit unresolved work without granting writes',()=>{
 const c=deriveIdleDraft(build());assert.ok(c);assert.equal(c.kind,'prototype');
 assert.deepEqual(c.checks.map(c=>c.path),['prototype.html','evidence.md']);assert.deepEqual(c.writeFiles,[]);assert.deepEqual(c.allowedTools,[]);
 assert.match(c.brief,/Build a local HTML counter widget/);assert.match(c.brief,/Do not deploy or send messages/);
 assert.match(c.hypothesis,/Unverified hypothesis/);assert.match(c.completionMeaning,/source goal remains unverified/);
 assert.deepEqual(c.sourceMessageIds,['goal','rule']);
 executionInput.parse({title:c.title,brief:c.brief,checks:c.checks,writeFiles:c.writeFiles,deadline:Date.now()+60000,budget:12000,maxAttempts:2});
});

test('timer generations and assistant restatements do not create a new candidate',()=>{
 const first=deriveIdleDraft({...build(),generation:1});
 const next=deriveIdleDraft({...build(),generation:20,messages:[...build().messages,{role:'assistant',text:'I can build a counter widget.'}]});
 assert.equal(next.id,first.id);assert.equal(next.goalKey,first.goalKey);assert.equal(next.generation,20);
 for(const status of ['queued','running','completed','failed','incomplete','paused','approval','cancelled','dismissed']){
  assert.equal(deriveIdleDraft({...build(),priorAttempts:[{candidateId:first.id,status}]}),null,status);
  assert.equal(deriveIdleDraft({...build(),priorOutcomes:[{goalKey:first.goalKey,status}]}),null,status);
 }
});

test('deterministic fallback IDs preserve role and order, and ambiguous source IDs abstain',()=>{
 const arg=input([{role:'user',text:'Build an HTML form.'},{role:'user',text:'Do not deploy.'}]);
 const one=deriveIdleDraft(arg),two=deriveIdleDraft(structuredClone(arg));assert.deepEqual(one.sourceMessageIds,two.sourceMessageIds);
 assert.equal(new Set(one.sourceMessageIds).size,2);
 assert.equal(deriveIdleDraft(input([user('same','Build an HTML form.'),user('same','Do not deploy.')])),null);
});

test('does not invent work from greeting, assistant output, external command or background results',()=>{
 for(const messages of [[user('a','Hello')],[{role:'assistant',text:'Build a dashboard next.'}],
  [user('a','Send this email now.')],[user('a','Deploy the project.')],[user('a','Import my private sessions.')],
  [{...user('a','Build a counter widget.'),sleep:true}], [user('a','Do not build a dashboard.')]])
  assert.equal(deriveIdleDraft(input(messages)),null,JSON.stringify(messages));
});

test('explicit stop, confirmed completion, gratitude and later denials suppress stale objectives',()=>{
 for(const text of ['Stop working','That is done.','It is fixed.','Thanks.','Do not build that.','No need to build that.','Please stop working','Stop working on this.','Not now.','I do not need that anymore.'])
  assert.equal(deriveIdleDraft(input([user('a','Build a counter widget.'),user('b',text)])),null,text);
 const next=deriveIdleDraft(input([user('a','Build a counter widget.'),user('b','That is done.'),user('c','Investigate why the login fails.')]));
 assert.equal(next.kind,'investigation');assert.doesNotMatch(next.brief,/counter widget/);
});

test('assistant completion claims cannot manufacture verified outcomes',()=>{
 const c=deriveIdleDraft(input([user('a','Fix the login error.'),{role:'assistant',text:'Done, everything is fixed.'}]));
 assert.ok(c);assert.match(c.brief,/Do not invent facts, test results or permissions/);
});

test('context notes preserve constraints but cannot create their own objective',()=>{
 const notes=[{id:'n1',text:'Never upload customer data.'}];
 const c=deriveIdleDraft({...build(),notes});assert.match(c.brief,/Never upload customer data/);assert.ok(c.sourceMessageIds.includes('n1'));
 assert.equal(deriveIdleDraft({...input([user('a','Hello')]),notes:[{id:'n2',text:'Build a site.'}]}),null);
});

test('prioritizes a concrete unresolved failure, deduplicates requests and caps the shortlist',()=>{
 const candidates=deriveIdleCandidates(input([user('a','Build an HTML form.'),user('b','Compare two interface layouts.'),user('c','Fix the login error.'),user('d','Build an HTML form.')]));
 assert.equal(candidates.length,2);assert.equal(candidates[0].kind,'investigation');assert.equal(candidates[1].kind,'prototype');
});

test('abstains instead of dropping old constraints, credentials or oversized history',()=>{
 assert.equal(deriveIdleDraft({...build(),notes:[{id:'large',text:'Never upload data. '.repeat(100)}]}),null);
 assert.equal(deriveIdleDraft(input([user('a','Build a counter. api_key=private_value')])),null);
 assert.equal(deriveIdleDraft(input(Array.from({length:201},(_,i)=>user(`m${i}`,'Build a counter.')))),null);
});

test('identifies a concrete failure question and preserves corrections in the brief',()=>{
 const c=deriveIdleDraft(input([user('a','Why does this widget crash?'),user('b','Correction: only use plain JavaScript, never React.')]));
 assert.equal(c.kind,'investigation');assert.match(c.brief,/Correction: only use plain JavaScript, never React/);
 assert.ok(c.brief.length<=4000);
});


test('counter verification metadata requires explicit increment and reset with no conflicting denial',()=>{
 const confirmed=input([user('goal','Build an HTML counter widget.'),user('details','Include Increment and Reset buttons.')]);
 const c=deriveIdleDraft(confirmed);assert.equal(c.browserCheck,'counter');assert.match(c.brief,/data-testid="counter-value"/);
 assert.ok(c.sourceMessageIds.includes('details'));assert.deepEqual(c.writeFiles,[]);
 assert.equal(deriveIdleDraft(build()).browserCheck,undefined);
 const denied=deriveIdleDraft({...confirmed,messages:[...confirmed.messages,user('deny','Do not include Reset.')]});
 assert.equal(denied.browserCheck,undefined);assert.match(denied.brief,/Do not include Reset/);
 const other=deriveIdleDraft(input([user('goal','Build an HTML form with Increment and Reset buttons.')]));
 assert.equal(other.browserCheck,undefined);
});
