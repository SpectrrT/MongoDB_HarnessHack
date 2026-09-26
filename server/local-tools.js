import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
export const localTools=[
 ['list_files','List files inside the working folder.',{path:{type:'string'}}],
 ['read_file','Read a text file inside the working folder.',{path:{type:'string'}}],
 ['write_file','Write a text file inside the working folder.',{path:{type:'string'},content:{type:'string'}}],
 ['run_command','Run a shell command on this Mac after the user approves the exact command. Use this for installed tools, tests and other local work.',{command:{type:'string'}}],
].map(([name,description,properties])=>({type:'function',function:{name,description,parameters:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}}}));
export async function executeLocalTool(name,args,{cwd,onRequest,signal}){
 if(signal?.aborted)throw Error('Stopped.');
 if(name==='run_command'){
  if(typeof args.command!=='string'||args.command.length>10000)throw Error('Invalid command.');
  const answer=await onRequest({method:'item/commandExecution/requestApproval',params:{command:args.command,cwd,reason:'OpenRouter wants to run this command on your Mac. This execution is outside the Codex sandbox; approve only this command.'}});
  if(signal?.aborted)throw Error('Stopped.');
  if(answer.action!=='approve')return 'The user declined this command.';
  return await new Promise((resolve,reject)=>{const child=spawn('/bin/zsh',['-lc',args.command],{cwd,detached:true,env:Object.fromEntries(['HOME','PATH','USER','TMPDIR'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]))});let output='';const kill=()=>{try{process.kill(-child.pid,'SIGTERM');}catch{};setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},1000).unref();};const timer=setTimeout(kill,120000);signal?.addEventListener('abort',kill,{once:true});child.stdout.on('data',data=>{output=(output+data).slice(-30000)});child.stderr.on('data',data=>{output=(output+data).slice(-30000)});child.on('error',reject);child.on('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',kill);signal?.aborted?reject(Error('Stopped.')):resolve(`Exit ${code}\n${output}`);});if(signal?.aborted)kill();});
 }
 if(!['list_files','read_file','write_file'].includes(name))throw Error('Unknown tool.');
 if(typeof args.path!=='string'||args.path.includes('\0'))throw Error('Invalid path.');
 const root=await fs.realpath(cwd),target=path.resolve(root,args.path),inside=p=>p===root||p.startsWith(root+path.sep);
 if(!inside(target))throw Error('This tool is limited to the working folder.');
 if(name==='write_file'){
  if(typeof args.content!=='string'||args.content.length>1000000)throw Error('File is too large.');
  const parent=await fs.realpath(path.dirname(target));if(!inside(parent))throw Error('Path leaves the working folder.');
  const existing=await fs.lstat(target).catch(()=>null);if(existing?.isSymbolicLink())throw Error('Writing through symlinks is not allowed.');
  const answer=await onRequest({method:'item/fileChange/requestApproval',params:{reason:`Write ${args.content.length} characters to ${args.path}`,changes:[{path:target,content:args.content.slice(0,12000)}]}});
  if(signal?.aborted)throw Error('Stopped.');
  if(answer.action!=='approve')return 'The user declined this file change.';
  if(await fs.realpath(path.dirname(target))!==parent)throw Error('The destination changed while waiting for approval.');
  const after=await fs.lstat(target).catch(()=>null);if(after?.isSymbolicLink()||after?.nlink>1)throw Error('Choose a regular file without links.');
  const handle=await fs.open(target,(await import('node:fs')).constants.O_NOFOLLOW|(await import('node:fs')).constants.O_WRONLY|(await import('node:fs')).constants.O_CREAT|(await import('node:fs')).constants.O_TRUNC,0o600);try{await handle.writeFile(args.content);}finally{await handle.close();}return `Wrote ${args.path}`;
 }
 const real=await fs.realpath(target);if(!inside(real))throw Error('Path leaves the working folder.');
 if(name==='list_files')return (await fs.readdir(real,{withFileTypes:true})).slice(0,200).map(f=>f.name+(f.isDirectory()?'/':'')).join('\n');
 const stat=await fs.stat(real);if(!stat.isFile()||stat.size>1000000)throw Error('Choose a text file under 1 MB.');return (await fs.readFile(real,'utf8')).slice(0,30000);
}
