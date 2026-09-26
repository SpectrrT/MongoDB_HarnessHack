import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {publishDemoBuild,loadDemoSnapshot,createDemoServer,waitForDemoApi} from '../scripts/serve-demo.mjs';

const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});
const close=server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
async function fixture(t){const store=await fs.mkdtemp(path.join(os.tmpdir(),'offload-stable-demo-'));t.after(()=>fs.rm(store,{recursive:true,force:true}));return store;}
const build=version=>async({output})=>{await fs.mkdir(path.join(output,'assets'),{recursive:true});await fs.writeFile(path.join(output,'index.html'),`<title>Offload</title><div id="root">${version}</div><script src="/assets/app-abcdefgh.js"></script>`);await fs.writeFile(path.join(output,'assets/app-abcdefgh.js'),`console.log('${version}');`);};

test('failed or incomplete builds keep the previous verified snapshot and running bytes',async t=>{
 const store=await fixture(t),first=await publishDemoBuild({store,build:build('first')});
 const pointer=await fs.readFile(path.join(store,'current.json'),'utf8');
 await assert.rejects(publishDemoBuild({store,build:async({output})=>{await fs.writeFile(path.join(output,'index.html'),'partial');throw Error('Source merge conflict');}}),/Source merge conflict/);
 assert.equal(await fs.readFile(path.join(store,'current.json'),'utf8'),pointer);
 await assert.rejects(publishDemoBuild({store,build:async({output})=>{await build('broken')({output});await fs.rm(path.join(output,'assets/app-abcdefgh.js'));}}),/missing asset/);
 assert.equal((await loadDemoSnapshot({store})).snapshot,first.snapshot);
 const server=createDemoServer({snapshot:await loadDemoSnapshot({store})}),port=await listen(server);t.after(()=>close(server));
 const second=await publishDemoBuild({store,build:build('second')});assert.equal(second.previousSnapshot,first.snapshot);
 await fs.writeFile(path.join(store,'snapshots',first.snapshot,'assets/app-abcdefgh.js'),'tampered');
 assert.equal(await(await fetch(`http://127.0.0.1:${port}/assets/app-abcdefgh.js`)).text(),"console.log('first');");
 const home=await fetch(`http://127.0.0.1:${port}/app/chat`);assert.match(await home.text(),/>first</);assert.equal(home.headers.get('x-offload-demo-snapshot'),first.snapshot);
 assert.equal((await fetch(`http://127.0.0.1:${port}/src/main.jsx`)).status,404);
 await assert.rejects(loadDemoSnapshot({store,snapshot:first.snapshot}),/verification failed/);
});

test('demo proxy preserves host, cookies and request bodies and streams SSE immediately',async t=>{
 const store=await fixture(t);await publishDemoBuild({store,build:build('proxy')});
 let finishStream,streamFinished=false;
 const api=http.createServer((req,res)=>{
  if(req.url==='/api/stream'){
   res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});res.write('event: ready\ndata: live\n\n');
   finishStream=()=>{streamFinished=true;res.end();};return;
  }
  const chunks=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({host:req.headers.host,origin:req.headers.origin,cookie:req.headers.cookie,client:req.headers['x-offload-client'],body:Buffer.concat(chunks).toString()}));});
 });
 const apiPort=await listen(api);t.after(()=>close(api));
 const server=createDemoServer({snapshot:await loadDemoSnapshot({store}),apiPort}),port=await listen(server);t.after(()=>close(server));
 const response=await new Promise((resolve,reject)=>{
  const outgoing=http.request({hostname:'127.0.0.1',port,path:'/api/echo',method:'POST',headers:{Host:'offload.ai',Origin:'https://offload.ai',Cookie:'session=test','X-Offload-Client':'local'}},incoming=>{
   let body='';incoming.on('data',chunk=>body+=chunk);incoming.on('end',()=>resolve(JSON.parse(body)));
  });outgoing.on('error',reject);outgoing.end('exact request bytes');
 });
 assert.deepEqual(response,{host:'offload.ai',origin:'https://offload.ai',cookie:'session=test',client:'local',body:'exact request bytes'});
 const stream=await fetch(`http://127.0.0.1:${port}/api/stream`),reader=stream.body.getReader();
 const first=await reader.read();assert.match(new TextDecoder().decode(first.value),/data: live/);assert.equal(streamFinished,false);
 finishStream();await reader.cancel();
});

test('demo startup waits for a healthy API and remains cancellable',async t=>{
 let requests=0;
 const api=http.createServer((req,res)=>{requests++;res.writeHead(requests===1?503:200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:requests>1}));});
 const port=await listen(api);t.after(()=>close(api));
 await waitForDemoApi({port,pollMs:1,timeoutMs:1000});assert.equal(requests,2);
 const controller=new AbortController();controller.abort();
 await assert.rejects(waitForDemoApi({port,signal:controller.signal}),{name:'AbortError'});assert.equal(requests,2);
});
