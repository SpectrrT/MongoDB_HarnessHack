#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mode=process.argv[2]||'dev';
if(!['dev','web','start'].includes(mode))throw Error('Choose dev, web, or start.');
const children=[];
let stopping=false,exitCode=0;
function stop(code=0){
 if(stopping)return;
 stopping=true;exitCode=code;
 for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');
}
function launch(args){
 const child=spawn(process.execPath,args,{cwd:root,stdio:'inherit',env:process.env});
 children.push(child);
 child.on('error',error=>{console.error(error.message);stop(1);});
 child.on('exit',code=>{
  if(!stopping)stop(code||0);
  if(children.every(c=>c.exitCode!==null||c.signalCode!==null))process.exitCode=exitCode;
 });
}
process.on('SIGINT',()=>stop());
process.on('SIGTERM',()=>stop());
if(mode!=='web')launch([...(mode==='dev'&&process.env.OFFLOAD_WATCH_SERVER==='1'?['--watch']:[]),'server/index.js']);
if(mode!=='start')launch(['node_modules/vite/bin/vite.js','--host','127.0.0.1']);
// Domain setup is a local macOS convenience, never a production service.
if(process.platform==='darwin'&&process.env.NODE_ENV!=='production'&&process.env.OFFLOAD_LOCAL_DOMAIN!=='0'){
 launch(['scripts/local-https.mjs','watch']);
}
