import test from 'node:test';import assert from 'node:assert/strict';import {toolPresentation} from '../shared/tool-events.js';
test('tool activity names the actual source and never turns a failure into success',()=>{
 assert.equal(toolPresentation({type:'mcpToolCall',label:'gmail.search_emails',status:'inProgress'}).label,'Search email');
 assert.equal(toolPresentation({type:'mcpToolCall',label:'gmail.read_email',status:'failed'}).status,'Failed');
 const e={type:'mcpToolCall',status:'completed',detail:JSON.stringify({server:'cua_repl',tool:'js',arguments:{code:'await tab.goto("https://courseworks.columbia.edu")'}})};
 assert.equal(toolPresentation(e).label,'Check CourseWorks');
 e.detail=JSON.stringify({server:'cua_repl',tool:'js',arguments:{code:'https://gradescope.com'},error:{message:'Sign in required'}});assert.equal(toolPresentation(e).status,'Failed');
});
