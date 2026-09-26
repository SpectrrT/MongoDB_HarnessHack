import test from 'node:test';
import assert from 'node:assert/strict';
import {idleControlIntent} from '../server/suggestions/idle-intent.js';
import {deriveIdleDraft} from '../server/suggestions/idle-candidates.js';
const STOP="Let's stop here and then evaluate what everyone has been doing.";
const source=(id,text,role='user')=>({id,text,role});
const initial=[source('goal','Build a local HTML counter prototype with Increment and Reset buttons.'),source('rule','Do not deploy it. Keep all data local.')];
const draft=(messages,extra={})=>deriveIdleDraft({conversationId:'checkpoint-control',messages,...extra});

test('compound pauses include the exact checkpoint request and typographic variants',()=>{
 for(const text of [STOP,"Let’s stop here and then evaluate what everyone has been doing.",
  "Okay, let's pause implementation and review the progress.",
  'Please stop working on this. What is left?',
  'Stop here; draft a progress report.',
  'Do not continue yet. Show the status.',
  "Let's hold off on implementation while we assess."]){
  assert.equal(idleControlIntent(text),'pause',text);
  assert.equal(draft([...initial,source('pause',text)]),null,text);
 }
});

test('assessment, acknowledgements and timer generations never implicitly resume paused work',()=>{
 const stopped=[...initial,source('pause',STOP)];
 for(const text of ['What needs to be done and the progress?','Okay.','Draft a status report.',
   'Continue the progress review.','Resume the assessment.',"Let's continue after the review."]){
  const history=JSON.parse(JSON.stringify([...stopped,source('assessment',text)]));
  assert.equal(draft(history,{generation:100}),null,text);
 }
});

test('explicit continuation restores the unfinished goal and includes original constraints and control provenance',()=>{
 const old=draft(initial);
 for(const text of ['Continue.','Please resume.',"Let's continue from the checkpoint.",'Everyone continue.', 'Do not stop.']){
  const resumed=draft([...initial,source('pause',STOP),source('status','What is the progress?'),source('resume',text)]);
  assert.ok(resumed,text);assert.equal(resumed.goalKey,old.goalKey);
  assert.ok(resumed.sourceMessageIds.includes('pause'));assert.ok(resumed.sourceMessageIds.includes('resume'));
  assert.match(resumed.brief,/Do not deploy it/);assert.match(resumed.brief,/explicitly resumed unfinished work/);
  assert.deepEqual(resumed.writeFiles,[]);
 }
});

test('a later pause wins, including a pause and future continuation in the same request',()=>{
 for(const last of [STOP,"Let's stop here, then continue after the review."])
  assert.equal(draft([...initial,source('pause',STOP),source('resume','Continue.'),source('pause-again',last)]),null);
});

test('do not stop is continuation, while quoted and technical stop descriptions are not control commands',()=>{
 assert.equal(idleControlIntent('Do not stop working.'),'resume');
 assert.equal(idleControlIntent('Please don’t stop.'),'resume');
 for(const text of ['How do I implement a stop button?','Stop the counter when it reaches ten.',
  'The worker should pause after a timeout.', 'Explain the phrase "let us stop here".', '"Let us stop here."'])
  assert.equal(idleControlIntent(text),null,text);
 const stillActive=draft([...initial,source('keep-going','Do not stop working.')]);assert.ok(stillActive);
});

test('new explicit work replaces paused goals without reviving older objectives',()=>{
 const next=draft([...initial,source('pause',STOP),source('new','Build a local HTML contact form.')]);
 assert.ok(next);assert.equal(next.objective,'Build a local HTML contact form.');
 assert.notEqual(next.goalKey,draft(initial).goalKey);assert.match(next.brief,/Earlier paused goals remain closed/);
 assert.equal(next.sourceMessageIds.includes('goal'),false);assert.match(next.brief,/Do not deploy it/);
});

test('assistant text, notes and background messages cannot resume user-paused work',()=>{
 const paused=[...initial,source('pause',STOP)];
 assert.equal(draft([...paused,source('assistant-resume','Continue.','assistant')]),null);
 assert.equal(draft([...paused,{...source('background','Continue.'),sleep:true}]),null);
 assert.equal(draft(paused,{notes:[{id:'note',text:'Continue.'}]}),null);
});

test('cancelled and explicitly completed goals stay closed after a bare continuation',()=>{
 for(const text of ['Cancel this task and show the progress.','That is done.'])
  assert.equal(draft([...initial,source('closed',text),source('resume','Continue.')]),null,text);
});


test('typographic denials remain exact source constraints and suppress conflicting tasks and checks',()=>{
 const rows=[source('private-rule','Don’t mention the customer name.'),source('goal','Build a local HTML counter with Increment and Reset.'),source('pause',STOP),source('resume','Continue.')];
 const candidate=draft(rows);assert.ok(candidate);assert.ok(candidate.sourceMessageIds.includes('private-rule'));
 assert.match(candidate.brief,/Don’t mention the customer name/);
 assert.equal(draft([...initial,source('deny','Don’t build that.')]),null);
 const noReset=draft([...rows,source('no-reset','Don’t include Reset.')]);
 assert.equal(noReset.browserCheck,undefined);assert.match(noReset.brief,/Don’t include Reset/);
});
