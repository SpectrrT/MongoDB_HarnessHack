import test from 'node:test';
import assert from 'node:assert/strict';
import {artifactTarget} from '../shared/artifact-target.js';
const agent={jobId:'job',cwd:'/home/user/work',artifacts:[{id:'report',name:'artifacts/investigation.pdf'}]};
test('answer links resolve generated PDFs and reports without navigating to local file paths',()=>{
 assert.deepEqual(artifactTarget('/home/user/work/artifacts/investigation.pdf',agent),{path:'artifacts/investigation.pdf',name:'investigation.pdf',artifactId:'report'});
 assert.equal(artifactTarget('file:///home/user/work/artifacts/investigation.pdf',agent).artifactId,'report');
 assert.equal(artifactTarget('./.data/query-demo/run/report.json',agent).path,'.data/query-demo/run/report.json');
 assert.equal(artifactTarget('sandbox:/mnt/data/artifacts/investigation.pdf',agent).artifactId,'report');
});
test('external links, traversal, credentials and paths outside the job are never local downloads',()=>{
 for(const href of ['https://example.com/report.pdf','#notes','../other.json','%2e%2e/other.json','/home/user/work-other/report.pdf','file://other-host/home/user/work/report.pdf','secrets/report.json','.env.local.json','private-key.json','sandbox:/mnt/data/missing.pdf'])assert.equal(artifactTarget(href,agent),null,href);
});

test('a shortened owner segment is confined to the same managed conversation',()=>{
 const managed={jobId:'j',cwd:'/Users/user/.offload/workspaces/owner-complete/conversation-1'};
 assert.equal(artifactTarget('/Users/user/.offload/workspaces/owner-short/conversation-1/.data/query-demo/run/report.json',managed).path,'.data/query-demo/run/report.json');
 assert.equal(artifactTarget('/Users/user/.offload/workspaces/owner-short/conversation-2/report.json',managed),null);
});
