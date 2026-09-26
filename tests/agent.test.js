import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {approvalResponse,sessionFolder} from '../server/agent-session.js';
import {collectArtifacts} from '../server/agent-artifacts.js';
test('approval adapter grants only the requested turn permissions and rejects unknown methods',()=>{
 const permissions={network:{enabled:true}};
 assert.deepEqual(approvalResponse('item/permissions/requestApproval',{permissions},{action:'approve'}),{permissions,scope:'turn'});
 assert.deepEqual(approvalResponse('item/permissions/requestApproval',{permissions},{action:'deny'}),{permissions:{},scope:'turn'});
 assert.deepEqual(approvalResponse('item/commandExecution/requestApproval',{}, {action:'approve'}),{decision:'accept'});
 assert.throws(()=>approvalResponse('unknown',{}, {action:'approve'}));
});
test('artifact snapshots reject symlinks, hardlinks and hidden files',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'offload-artifacts-')),cwd=path.join(temp,'work'),dest=path.join(temp,'out');await fs.mkdir(cwd);
 await fs.writeFile(path.join(temp,'outside.txt'),'private');await fs.symlink(path.join(temp,'outside.txt'),path.join(cwd,'linked.txt'));await fs.link(path.join(temp,'outside.txt'),path.join(cwd,'hardlink.txt'));await fs.writeFile(path.join(cwd,'.private.txt'),'private');await fs.writeFile(path.join(cwd,'result.txt'),'result');
 const files=await collectArtifacts(cwd,dest,0);assert.deepEqual(files.map(f=>f.name),['result.txt']);await fs.writeFile(path.join(cwd,'result.txt'),'changed');assert.equal(await fs.readFile(path.join(dest,files[0].id),'utf8'),'result');await fs.rm(temp,{recursive:true,force:true});
});
test('agent workspace cannot contain the running authorization code',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'offload-folder-'));
 await assert.rejects(sessionFolder(dir,'owner','conversation',process.cwd()),/outside Offload/);
 await fs.rm(dir,{recursive:true,force:true});
});
test('stopping during approval prevents file execution',async()=>{
 const {executeLocalTool}=await import('../server/local-tools.js');
 const cwd=await fs.mkdtemp(path.join(os.tmpdir(),'offload-stop-')),controller=new AbortController();
 await assert.rejects(executeLocalTool('write_file',{path:'stopped.txt',content:'should not exist'},{cwd,signal:controller.signal,onRequest:async()=>{controller.abort();return {action:'approve'};}}),/Stopped/);
 await assert.rejects(fs.stat(path.join(cwd,'stopped.txt')),/ENOENT/);await fs.rm(cwd,{recursive:true,force:true});
});
