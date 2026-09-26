import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssistantTextState} from '../server/assistant-text.js';

test('visible commentary stays separate through tools and a partial final answer',()=>{
 const state=createAssistantTextState();
 state.accept({type:'messageStart',id:'progress',phase:'commentary'});
 state.accept({type:'delta',id:'progress',text:'Checking the query.'});
 assert.deepEqual(state.snapshot(),{commentary:[{id:'progress',text:'Checking the query.'}],stream:''});
 state.accept({type:'message',id:'progress',phase:'commentary',text:'Checking the query.'});
 assert.equal(state.accept({type:'commandExecution',id:'tool',text:'output'}),false);
 assert.equal(state.accept({type:'reasoning',id:'private',text:'Never display this'}),false);
 state.accept({type:'messageStart',id:'answer',phase:'final_answer'});
 state.accept({type:'delta',id:'answer',text:'The index '});
 assert.equal(state.snapshot().stream,'The index ');
 state.accept({type:'delta',id:'answer',text:'reduced scans.'});
 state.accept({type:'message',id:'answer',phase:'final_answer',text:'The index reduced scans.'});
 assert.deepEqual(state.snapshot(),{commentary:[{id:'progress',text:'Checking the query.'}],stream:'The index reduced scans.'});
});

test('snapshots and replayed starts/completions do not duplicate an item',()=>{
 const state=createAssistantTextState();
 state.accept({type:'delta',id:'note',text:'Looking'});
 state.accept({type:'message',id:'note',phase:'commentary',text:'Looking at the plan.'});
 state.accept({type:'messageStart',id:'note',phase:'commentary'});
 state.accept({type:'delta',id:'note',text:'Looking'});
 state.accept({type:'message',id:'note',phase:'commentary',text:'Looking at the plan.'});
 assert.deepEqual(state.snapshot(),{commentary:[{id:'note',text:'Looking at the plan.'}],stream:''});
});

test('missing phase preserves legacy output and partial answers',()=>{
 const state=createAssistantTextState();
 state.accept({type:'message',id:'preamble',text:'Let me check.'});
 state.accept({type:'delta',id:'answer',text:'The result'});
 assert.equal(state.snapshot().stream,'The result');
 state.accept({type:'message',id:'answer',text:'The result is ready.'});
 assert.deepEqual(state.snapshot(),{commentary:[],stream:'The result is ready.'});
});
