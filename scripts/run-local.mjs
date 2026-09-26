#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {prepareQueryDemo} from './prepare-query-demo.mjs';
import {loadDemoSnapshot,waitForDemoApi} from './serve-demo.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mode=process.argv[2]||'dev';
if(!['dev','web','start','demo','demo-web'].includes(mode))throw Error('Choose dev, web, start, demo, or demo-web.');
const demo=mode==='demo'||mode==='demo-web';
if(demo){const snapshot=await loadDemoSnapshot();process.env.OFFLOAD_DEMO_SNAPSHOT=snapshot.snapshot;process.env.OFFLOAD_PORT=String(process.env.VITE_PORT||process.env.OFFLOAD_WEB_PORT||5193);}
await prepareQueryDemo().catch(error=>console.warn('Query demo setup unavailable: '+error.message));
const children=[];
const readyController=new AbortController();
let stopping=false,exitCode=0;
function stop(code=0){
 if(stopping)return;
 stopping=true;exitCode=code;process.exitCode=code;readyController.abort();
 for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');
}
// An optional helper (the local HTTPS domain) may exit on its own without taking the app down.
function launch(args,{optional=false}={}){
 const child=spawn(process.execPath,args,{cwd:root,stdio:'inherit',env:process.env});
 children.push(child);
 child.on('error',error=>{console.error(error.message);if(!optional)stop(1);});
 child.on('exit',code=>{
  if(!stopping&&!optional)stop(code||0);
  if(children.every(c=>c.exitCode!==null||c.signalCode!==null))process.exitCode=exitCode;
 });
}
process.on('SIGINT',()=>stop());
process.on('SIGTERM',()=>stop());
if(!['web','demo-web'].includes(mode))launch([...(mode==='dev'&&process.env.OFFLOAD_WATCH_SERVER==='1'?['--watch']:[]),'server/index.js']);
if(demo){
 console.log('Waiting for the local API before starting the stable demo…');
 try{await waitForDemoApi({signal:readyController.signal});}catch(error){if(!stopping){console.error(error.message);stop(1);}}
 if(!stopping)launch(['scripts/serve-demo.mjs','serve']);
}
else if(mode!=='start')launch(['node_modules/vite/bin/vite.js','--host','127.0.0.1']);
// Domain setup is a local macOS convenience, never a production service.
if(!stopping&&process.platform==='darwin'&&process.env.NODE_ENV!=='production'&&process.env.OFFLOAD_LOCAL_DOMAIN!=='0'){
 launch(['scripts/local-https.mjs','watch'],{optional:true});
}
