import {findCodex} from './codex-installation.js';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const exec = promisify(execFile);
const binary = findCodex();
const environment = () => Object.fromEntries(['HOME','PATH','USER','TMPDIR','CODEX_HOME'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
let cached;
export function clearCodexCache(){cached=null;}
export async function codexStatus() {
  try {
    const {stdout,stderr} = await exec(binary, ['login','status'], {env:environment(), timeout:5000});
    const authenticated = /Logged in using ChatGPT/.test(stdout + stderr);
    if (!authenticated) return {connected:false, models:[], message:'Sign in with ChatGPT using codex login on this Mac.'};
    if (!cached || Date.now() - cached.at > 120000) cached = {at:Date.now(), models:await listModels()};
    return {connected:true, models:cached.models, capabilities:{agent:true,images:true,tools:true}, message:'ChatGPT is signed in on this Mac.'};
  } catch { return {connected:false, models:[], message:'Start Codex and sign in with ChatGPT on this Mac, then check again.'}; }
}
function listModels() {
  return new Promise((resolve,reject) => {
    const child = spawn(binary, ['app-server','--stdio'], {env:environment(), stdio:['pipe','pipe','ignore']});
    let buffer='', done=false;
    const finish = (error, value) => {if(done)return; done=true; clearTimeout(timer);child.kill();error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(Error('Model list timed out.')),15000);
    child.on('error', e=>finish(e));child.on('close',()=>{if(!done)finish(Error('Cannot read models.'));});
    child.stdout.on('data',data=>{buffer+=data;while(buffer.includes('\n')){const i=buffer.indexOf('\n'),line=buffer.slice(0,i);buffer=buffer.slice(i+1);try{const m=JSON.parse(line);if(m.id===1){child.stdin.write(JSON.stringify({method:'initialized'})+'\n');child.stdin.write(JSON.stringify({id:2,method:'model/list',params:{limit:50,includeHidden:false}})+'\n');}if(m.id===2){if(m.error)return finish(Error('Cannot read models.'));finish(null,(m.result?.data || []).filter(m=>!m.hidden).map(m=>({id:m.model,name:m.displayName,isDefault:m.isDefault,efforts:m.supportedReasoningEfforts?.map(e=>e.reasoningEffort)||[],defaultEffort:m.defaultReasoningEffort})));}}catch{}}});
    child.stdin.write(JSON.stringify({id:1,method:'initialize',params:{clientInfo:{name:'offload',version:'0.1.0'},capabilities:{experimentalApi:true}}})+'\n');
  });
}
export {runAgent as runCodex} from './agent-session.js';
