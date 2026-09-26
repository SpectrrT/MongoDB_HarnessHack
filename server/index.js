import express from 'express';
import helmet from 'helmet';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {createWorkspace,transition,advanceWorkspace} from '../shared/workspace.js';
const here=path.dirname(fileURLToPath(import.meta.url));
const types=['onboard','settings','profile','connect','expire','suggestion','start-run','resume-run','cancel-run','save-draft','new-conversation','chat','delete-conversation','memory','delete-memory','session-start','session-note','session-end','sleep','skill'];
const schema=z.object({type:z.enum(types),payload:z.record(z.string(),z.unknown()).default({})}).strict();
export function createApp({dataDir=process.env.OFFLOAD_DATA_DIR||path.join(here,'../.data'),serveStatic=true}={}) {
 const app=express(),queues=new Map(),rate=new Map();
 app.disable('x-powered-by');app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:','blob:'],fontSrc:["'self'"],connectSrc:["'self'"],mediaSrc:["'self'",'blob:'],objectSrc:["'none'"]}}}));
 app.use(express.json({limit:'128kb'}));
 app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');const origin=req.get('origin');if(origin){let host;try{host=new URL(origin).hostname;}catch{return res.status(403).json({error:'Invalid origin.'});}if(!['localhost','127.0.0.1'].includes(host)&&new URL(origin).host!==req.get('host'))return res.status(403).json({error:'Origin not allowed.'});}next();});
 app.get('/api/health',(_,res)=>res.json({ok:true,mode:'demo',schema:1}));
 app.use('/api',async(req,res,next)=>{try{let token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('offload_demo='))?.slice(13);if(!/^[a-f0-9]{64}$/.test(token||'')){token=crypto.randomBytes(32).toString('hex');res.cookie('offload_demo',token,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',maxAge:30*86400000});}req.workspaceKey=crypto.createHash('sha256').update(token).digest('hex');const key=req.workspaceKey,now=Date.now(),recent=(rate.get(key)||[]).filter(t=>now-t<60000);if(recent.length>180)return res.status(429).json({error:'Too many requests. Try again shortly.'});rate.set(key,[...recent,now]);next();}catch(e){next(e);}});
 async function access(req,fn){const key=req.workspaceKey;const previous=queues.get(key)||Promise.resolve();const task=previous.catch(()=>{}).then(async()=>{await fs.mkdir(dataDir,{recursive:true,mode:0o700});const file=path.join(dataDir,key+'.json');let state;try{state=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state=createWorkspace();}state=advanceWorkspace(state);const next=await fn(state);const temp=file+'.'+crypto.randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(next),{mode:0o600});await fs.rename(temp,file);return next;});queues.set(key,task);try{return await task;}finally{if(queues.get(key)===task)queues.delete(key);}}
 app.get('/api/state',async(req,res,next)=>{try{res.json(await access(req,s=>s));}catch(e){next(e);}});
 app.post('/api/action',async(req,res,next)=>{try{const action=schema.parse(req.body);res.json(await access(req,s=>transition(s,action)));}catch(e){if(e instanceof z.ZodError)return res.status(400).json({error:'Invalid action payload.'});if(/not found|first|Unknown|Enter|Write|Only|cannot|not ready|current session|No active|memory before/.test(e.message))return res.status(400).json({error:e.message});next(e);}});
 app.post('/api/reset',async(req,res,next)=>{try{res.json(await access(req,()=>createWorkspace()));}catch(e){next(e);}});
 if(serveStatic){const dist=path.join(here,'../dist');app.use(express.static(dist));app.get('/{*path}',(req,res)=>res.sendFile(path.join(dist,'index.html')));}
 app.use((err,req,res,next)=>{console.error('Request failed:',err.message);res.status(err.status||500).json({error:err.status===413?'Request too large.':'The local service could not save this change.'});});
 return app;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT||4318);createApp().listen(port,'127.0.0.1',()=>console.log(`Offload local service: http://127.0.0.1:${port}`));}
