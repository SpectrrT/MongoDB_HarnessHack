import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {documentRuntimeInstructions} from '../server/agent-session.js';

test('document runtime hints include only verified executables and prefer overrides',async t=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'offload-document-runtime-'));
 t.after(()=>fs.rm(home,{recursive:true,force:true}));
 assert.equal(await documentRuntimeInstructions(home),'');
 const root=path.join(home,'.cache/codex-runtimes/codex-primary-runtime/dependencies');
 const file=async(relative,mode=0o700)=>{const target=path.join(root,relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,'#!/bin/sh\nexit 0\n',{mode});return target;};
 const python=await file('python/bin/python3');
 const override=await file('bin/override/pdfinfo');
 const fallback=await file('bin/fallback/pdfinfo');
 const renderer=await file('bin/fallback/pdftoppm');
 const hint=await documentRuntimeInstructions(home);
 for(const target of [python,override,renderer])assert.ok(hint.includes(JSON.stringify(target)));
 assert.ok(!hint.includes(JSON.stringify(fallback)));
 await fs.chmod(python,0o600);await fs.unlink(override);await fs.unlink(renderer);
 const partial=await documentRuntimeInstructions(home);
 assert.ok(!partial.includes('Bundled Python:'));assert.ok(!partial.includes('PDF page rendering:'));
 assert.ok(partial.includes(JSON.stringify(fallback)));
});
