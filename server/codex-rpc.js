import {spawn} from 'node:child_process';
import os from 'node:os';import path from 'node:path';
const clients=new Set();process.once('exit',()=>{for(const client of clients)client.close();});
export function codexClient(){
 const child=spawn(process.env.OFFLOAD_CODEX_BIN||path.join(os.homedir(),'.local/bin/codex'),['app-server','--stdio'],{env:Object.fromEntries(['HOME','PATH','USER','TMPDIR','CODEX_HOME'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),stdio:['pipe','pipe','ignore']});
 const requests=new Map(),listeners=new Set();let sequence=0,buffer='',closed=false;
 const client={
  request(method,params={}){return new Promise((resolve,reject)=>{if(closed)return reject(Error('Codex connection closed.'));const id=++sequence,timer=setTimeout(()=>{requests.delete(id);reject(Error('Codex did not respond.'));},20000);requests.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,method,params})+'\n');});},
  notify(method,params){if(!closed)child.stdin.write(JSON.stringify({method,params})+'\n');},
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  close(){if(closed)return;closed=true;clients.delete(client);for(const request of requests.values()){clearTimeout(request.timer);request.reject(Error('Codex connection closed.'));}requests.clear();child.kill();},
 };
 child.on('error',()=>client.close());child.on('close',()=>client.close());
 child.stdout.on('data',data=>{buffer+=data;if(buffer.length>16*1024*1024)return client.close();while(buffer.includes('\n')){const i=buffer.indexOf('\n'),line=buffer.slice(0,i);buffer=buffer.slice(i+1);let event;try{event=JSON.parse(line);}catch{continue;}const request=requests.get(event.id);if(request){clearTimeout(request.timer);requests.delete(event.id);event.error?request.reject(Error('Codex could not complete the request.')):request.resolve(event.result);}else if(event.method){for(const listener of listeners)listener(event);}}});
 clients.add(client);return client;
}
