#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const defaultStore=path.join(projectRoot,'.data/demo-frontend');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.wasm':'application/wasm','.txt':'text/plain; charset=utf-8'};

async function readBuild(directory){
 const files=new Map();let total=0;
 const visit=async(relative='')=>{
  for(const entry of await fs.readdir(path.join(directory,relative),{withFileTypes:true})){
   const name=path.posix.join(relative,entry.name);
   if(entry.isSymbolicLink())throw Error('Build contains a symlink: '+name);
   if(entry.isDirectory()){await visit(name);continue;}
   if(!entry.isFile())throw Error('Build contains an unsupported file: '+name);
   const data=await fs.readFile(path.join(directory,name));total+=data.length;
   if(total>250*1024*1024)throw Error('Demo build exceeds 250 MB.');
   files.set(name,data);
  }
 };
 await visit();
 const html=files.get('index.html')?.toString();
 if(!html||!html.includes('id="root"')||html.includes('/@vite/client'))throw Error('Expected a completed Offload frontend build.');
 for(const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)){
  if(/^(?:[a-z]+:|\/\/|#)/i.test(match[1]))continue;
  const name=decodeURIComponent(match[1].split(/[?#]/)[0]).replace(/^\//,'');
  if(name&&!files.has(name))throw Error('Build references a missing asset: '+name);
 }
 return files;
}

async function viteBuild({root,output}){
 await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--outDir',output,'--emptyOutDir'],{cwd:root,env:process.env,stdio:'inherit'});
  child.once('error',reject);child.once('exit',(code,signal)=>code===0?resolve():reject(Error(`Demo build failed (${signal||code}); the previous snapshot is unchanged.`)));
 });
}

export async function publishDemoBuild({root=projectRoot,store=defaultStore,build=viteBuild}={}){
 await fs.mkdir(path.join(store,'snapshots'),{recursive:true});
 const staging=await fs.mkdtemp(path.join(store,'.building-'));
 try{
  await build({root,output:staging});
  const files=await readBuild(staging);
  const snapshot=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID();
  const manifest={snapshot,builtAt:new Date().toISOString(),files:Object.fromEntries([...files].map(([name,data])=>[name,{bytes:data.length,sha256:hash(data)}]))};
  await fs.writeFile(path.join(staging,'.snapshot.json'),JSON.stringify(manifest,null,2)+'\n');
  await fs.rename(staging,path.join(store,'snapshots',snapshot));
  let previousSnapshot=null;try{previousSnapshot=JSON.parse(await fs.readFile(path.join(store,'current.json'),'utf8')).snapshot;}catch(error){if(error.code!=='ENOENT')throw error;}
  const pointer=path.join(store,'current-'+crypto.randomUUID()+'.tmp');
  await fs.writeFile(pointer,JSON.stringify({snapshot,previousSnapshot,publishedAt:new Date().toISOString()},null,2)+'\n');
  await fs.rename(pointer,path.join(store,'current.json'));
  return {snapshot,previousSnapshot,files:files.size,bytes:[...files.values()].reduce((total,data)=>total+data.length,0)};
 }catch(error){await fs.rm(staging,{recursive:true,force:true});throw error;}
}

export async function loadDemoSnapshot({store=defaultStore,snapshot=process.env.OFFLOAD_DEMO_SNAPSHOT}={}){
 if(!snapshot){try{snapshot=JSON.parse(await fs.readFile(path.join(store,'current.json'),'utf8')).snapshot;}catch(error){if(error.code==='ENOENT')throw Error('No demo snapshot is published. Run npm run demo:build first.');throw error;}}
 if(typeof snapshot!=='string'||!/^\d{4}-[\w-]+$/.test(snapshot))throw Error('Invalid demo snapshot identifier.');
 const directory=path.join(store,'snapshots',snapshot);
 const manifest=JSON.parse(await fs.readFile(path.join(directory,'.snapshot.json'),'utf8'));
 if(manifest.snapshot!==snapshot)throw Error('Demo snapshot metadata does not match.');
 const files=await readBuild(directory);files.delete('.snapshot.json');
 if(files.size!==Object.keys(manifest.files).length)throw Error('Demo snapshot file inventory changed.');
 for(const [name,data] of files){const expected=manifest.files[name];if(!expected||expected.bytes!==data.length||expected.sha256!==hash(data))throw Error('Demo snapshot verification failed: '+name);}
 return {snapshot,files};
}

export function createDemoServer({snapshot,apiPort=Number(process.env.PORT||5194)}={}){
 if(!snapshot?.files?.has('index.html'))throw Error('Load a verified demo snapshot before serving.');
 if(!Number.isInteger(apiPort)||apiPort<1||apiPort>65535)throw Error('Invalid API port.');
 return http.createServer((req,res)=>{
  if(!/^(?:(?:127\.0\.0\.1|localhost)(?::\d+)?|offload\.ai)$/.test(req.headers.host||'')){res.writeHead(403).end('Local demo only.');return;}
  let pathname;try{if(!req.url.startsWith('/'))throw Error();pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);}catch{res.writeHead(400).end('Invalid path.');return;}
  if(pathname==='/api'||pathname.startsWith('/api/')){
   const upstream=http.request({hostname:'127.0.0.1',port:apiPort,path:req.url,method:req.method,headers:req.headers},response=>{
    res.writeHead(response.statusCode,response.headers);res.flushHeaders();response.pipe(res);
    response.on('error',()=>res.destroy());
   });
   upstream.on('error',()=>{if(res.headersSent)res.destroy();else{res.writeHead(502,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'The local API is reconnecting. Please retry.'}));}});
   req.on('aborted',()=>upstream.destroy());res.on('close',()=>upstream.destroy());req.pipe(upstream);return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{'Allow':'GET, HEAD'}).end();return;}
  let name=pathname.replace(/^\//,'');
  if(!name||!snapshot.files.has(name)&&!path.posix.extname(name))name='index.html';
  const data=snapshot.files.get(name);
  if(!data){res.writeHead(404).end('Not found.');return;}
  res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream','Content-Length':data.length,'X-Content-Type-Options':'nosniff','X-Offload-Demo-Snapshot':snapshot.snapshot,'Cache-Control':name.startsWith('assets/')?'public, max-age=31536000, immutable':'no-store'});
  res.end(req.method==='HEAD'?undefined:data);
 });
}

export async function waitForDemoApi({port=Number(process.env.PORT||5194),signal,timeoutMs=90000,pollMs=250}={}){
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){
  signal?.throwIfAborted();
  try{
   const response=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(1000)]):AbortSignal.timeout(1000)});
   if(response.ok&&(await response.json()).ok)return;
  }catch{}
  await delay(pollMs,undefined,{signal});
 }
 throw Error('The Offload API did not become ready; the demo frontend was not started.');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const mode=process.argv[2]||'serve';
  if(mode==='build')console.log(JSON.stringify(await publishDemoBuild(),null,2));
  else if(mode==='serve'){
   const snapshot=await loadDemoSnapshot(),port=Number(process.env.VITE_PORT||process.env.OFFLOAD_WEB_PORT||5193);
   if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid frontend port.');
   const server=createDemoServer({snapshot});
   server.on('error',error=>{console.error(error.message);process.exitCode=1;});
   server.listen(port,'127.0.0.1',()=>console.log(`Offload stable demo: http://127.0.0.1:${port}/ · ${snapshot.snapshot}`));
   const stop=()=>{server.close(()=>{process.exitCode=0;});server.closeAllConnections();};process.once('SIGTERM',stop);process.once('SIGINT',stop);
  }else throw Error('Choose build or serve.');
 }catch(error){console.error(error.message);process.exitCode=1;}
}
