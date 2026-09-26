import test from 'node:test';import assert from 'node:assert/strict';import {toolPresentation,activityGroups} from '../shared/tool-events.js';
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
