import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {collectArtifacts,resolveGeneratedArtifact} from '../server/agent-artifacts.js';

async function workspace(t){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'offload-generated-artifacts-'));
 const cwd=path.join(directory,'work');await fs.mkdir(cwd);
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const write=async(name,data='example')=>{const file=path.join(cwd,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,data);return file;};
 return {directory,cwd,write,since:Date.now()-1000};
}

test('generated PDF, Markdown and query-report JSON return verified bytes',async t=>{
 const {cwd,write,since}=await workspace(t);
 for(const [name,data] of [['reports/analysis.pdf','%PDF-1.4\nTemporary fixture\n%%EOF\n'],['query-regression-investigation.md','# Findings\n'],['.data/query-demo/run-1/report.json','{"orderedResultsIdentical":true}']]){
  await write(name,data);
  const result=await resolveGeneratedArtifact(cwd,name,since);
  assert.equal(result.name,name);assert.equal(result.size,Buffer.byteLength(data));assert.equal(result.data.toString(),data);assert.equal(result.image,false);
 }
});

test('paths must stay normalized and confined to the workspace',async t=>{
 const {cwd,write,since}=await workspace(t);await write('report.json','{}');
 for(const name of ['../report.json','sub/../report.json','./report.json','sub//report.json',path.join(cwd,'report.json'),'sub\\report.json','report.json\0','report.json\n'])assert.equal(await resolveGeneratedArtifact(cwd,name,since),null,name);
 assert.equal(await resolveGeneratedArtifact(cwd,'report.json',NaN),null);
 assert.equal(await resolveGeneratedArtifact(cwd,'report.json',null),null);
 assert.equal(await resolveGeneratedArtifact(cwd,'missing.json',since),null);
});

test('symlinks and hardlinks cannot expose files inside or outside the workspace',async t=>{
 const {directory,cwd,write,since}=await workspace(t);
 const original=await write('reports/source.json','{}'),outside=path.join(directory,'outside.json');await fs.writeFile(outside,'private');
 await fs.symlink(outside,path.join(cwd,'linked.json'));
 await fs.symlink(original,path.join(cwd,'inside-link.json'));
 await fs.symlink(path.join(cwd,'reports'),path.join(cwd,'linked-reports'));
 await fs.link(outside,path.join(cwd,'hardlink.json'));
 for(const name of ['linked.json','inside-link.json','linked-reports/source.json','hardlink.json'])assert.equal(await resolveGeneratedArtifact(cwd,name,since),null,name);
 const rootLink=path.join(directory,'linked-work');await fs.symlink(cwd,rootLink);
 assert.equal(await resolveGeneratedArtifact(rootLink,'reports/source.json',since),null);
});

test('credential and hidden paths are rejected at every segment',async t=>{
 const {cwd,write,since}=await workspace(t);
 for(const name of ['credentials/report.json','reports/secret-store/result.pdf','reports/access-token.json','env/report.json','reports/environment.json','api-key/report.json','.env.json','.data/openrouter/key.json','.data/query-demo/.private/report.json','node_modules/result.json','vendor/result.json']){
  await write(name);assert.equal(await resolveGeneratedArtifact(cwd,name,since),null,name);
 }
});

test('old, unsupported and oversized files cannot become generated downloads',async t=>{
 const {cwd,write,since}=await workspace(t);
 const old=await write('old.json');await fs.utimes(old,new Date(since-10000),new Date(since-10000));
 await write('program.exe');
 const huge=await write('huge.pdf');const handle=await fs.open(huge,'r+');await handle.truncate(20*1024*1024+1);await handle.close();
 for(const name of ['old.json','program.exe','huge.pdf'])assert.equal(await resolveGeneratedArtifact(cwd,name,since),null,name);
});

test('collection snapshots the five legacy benchmark reports alongside ordinary artifacts',async t=>{
 const {directory,cwd,write,since}=await workspace(t),destination=path.join(directory,'snapshots');
 const expected=new Map([['findings.md','# Findings']]);
 for(const filename of ['report.json','baseline-explain.json','baseline-results.json','candidate-explain.json','candidate-results.json'])expected.set(`.data/query-demo/run-1/${filename}`,JSON.stringify({fixture:filename}));
 for(const [name,data] of expected)await write(name,data);
 const artifacts=await collectArtifacts(cwd,destination,since);
 assert.deepEqual(artifacts.map(item=>item.name).sort(),[...expected.keys()].sort());
 for(const artifact of artifacts){
  await write(artifact.name,'changed after collection');
  assert.equal(await fs.readFile(path.join(destination,artifact.id),'utf8'),expected.get(artifact.name));
  assert.equal(artifact.size,Buffer.byteLength(expected.get(artifact.name)));assert.equal(artifact.image,false);
 }
});

test('legacy benchmark collection rejects other hidden files, secrets, links, old and oversized reports',async t=>{
 const {directory,cwd,write,since}=await workspace(t),destination=path.join(directory,'snapshots');
 for(const name of ['.data/query-demo/report.json','.data/query-demo/run-1/other.json','.data/query-demo/run-1/report.pdf','.data/query-demo/run-1/nested/report.json','.data/query-demo/secret-run/report.json','.data/query-demo/.private/report.json','.data/query-demo/environment/report.json','.data/unrelated/run/report.json','.private/report.json'])await write(name,'must not be collected');
 const outside=path.join(directory,'outside.json');await fs.writeFile(outside,'outside');
 const linked=await write('.data/query-demo/symlink/report.json');await fs.rm(linked);await fs.symlink(outside,linked);
 const hardlink=await write('.data/query-demo/hardlink/report.json');await fs.rm(hardlink);await fs.link(outside,hardlink);
 await fs.symlink(path.join(cwd,'.data/query-demo/run-1'),path.join(cwd,'.data/query-demo/linked-run'));
 const old=await write('.data/query-demo/old/report.json');await fs.utimes(old,new Date(since-10000),new Date(since-10000));
 const large=await write('.data/query-demo/large/report.json'),handle=await fs.open(large,'r+');await handle.truncate(20*1024*1024+1);await handle.close();
 assert.deepEqual(await collectArtifacts(cwd,destination,since),[]);
});

test('legacy benchmark collection does not follow a linked hidden directory',async t=>{
 const {directory,cwd,since}=await workspace(t),outside=path.join(directory,'outside'),destination=path.join(directory,'snapshots');
 await fs.mkdir(path.join(outside,'query-demo','run-1'),{recursive:true});await fs.writeFile(path.join(outside,'query-demo','run-1','report.json'),'outside');
 await fs.symlink(outside,path.join(cwd,'.data'));
 assert.deepEqual(await collectArtifacts(cwd,destination,since),[]);
});
