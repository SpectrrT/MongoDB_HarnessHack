import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const exec = promisify(execFile);
const binary = process.env.OFFLOAD_CODEX_BIN || path.join(os.homedir(), '.local/bin/codex');
const environment = () => Object.fromEntries(['HOME','PATH','USER','TMPDIR','CODEX_HOME'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
let cached;
export async function codexStatus() {
  try {
    const {stdout,stderr} = await exec(binary, ['login','status'], {env:environment(), timeout:5000});
    const authenticated = /Logged in using ChatGPT/.test(stdout + stderr);
    if (!authenticated) return {connected:false, models:[], message:'Sign in with ChatGPT using codex login on this Mac.'};
    if (!cached || Date.now() - cached.at > 120000) cached = {at:Date.now(), models:await listModels()};
    return {connected:true, models:cached.models, message:'ChatGPT is signed in on this Mac.'};
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
export async function runCodex({prompt, model, effort = "low", signal}) {
  const cwd=await fs.mkdtemp(path.join(os.tmpdir(),'offload-run-'));
  try { return await new Promise((resolve,reject)=>{
    const args=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--json','--model',model,'-c','approval_policy="never"','-c','project_doc_max_bytes=0','-c','agents.enabled=false','-c','web_search="disabled"','-c','tools.view_image=false','-c',`model_reasoning_effort="${effort}"`];
    for(const flag of ['apps','plugins','hooks','shell_tool','unified_exec','code_mode','code_mode_host','multi_agent'])args.push('--disable',flag);
    args.push('-');
    const child=spawn(binary,args,{cwd,env:environment(),stdio:['pipe','pipe','ignore']});
    let buffer='',answer='',usage=null,completed=false,failed=false,bytes=0,timedOut=false;
    const abort=()=>child.kill('SIGTERM');
    const timer=setTimeout(()=>{timedOut=true;abort();},180000);
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
    child.on('error',()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(Error('Codex could not start. Check its installation.'));});
    child.stdout.on('data',data=>{bytes+=data.length;if(bytes>1048576){failed=true;abort();return;}buffer+=data;while(buffer.includes('\n')){const i=buffer.indexOf('\n'),line=buffer.slice(0,i);buffer=buffer.slice(i+1);try{const m=JSON.parse(line);if(m.type==='item.completed'&&m.item?.type==='agent_message')answer=m.item.text;if(m.type==='turn.completed'){completed=true;usage=m.usage;}if(m.type==='turn.failed')failed=true;}catch{}}});
    child.on('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(signal?.aborted)return reject(Error('Stopped.'));if(timedOut)return reject(Error('The model took too long. Try a shorter request.'));if(code!==0||failed||!completed||!answer)return reject(Error('This model could not complete the request. Check Codex access or try another model.'));resolve({text:answer,usage,model});});
    child.stdin.on('error',()=>{});child.stdin.end(prompt);
  }); } finally {await fs.rm(cwd,{recursive:true,force:true});}
}
