#!/usr/bin/env node
import fs from 'node:fs/promises';
import {localDomainConfig} from './local-domain-config.mjs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'.data/local-https'), ca=path.join(dir,'ca');
const config=path.join(dir,'Caddyfile'), socket=path.join(os.homedir(),'.offload','https',crypto.createHash('sha256').update(root).digest('hex').slice(0,12),'admin.sock');
const begin='# BEGIN OFFLOAD LOCAL HTTPS', end='# END OFFLOAD LOCAL HTTPS';
const block=`${begin}\n127.0.0.1 offload.ai\n::1 offload.ai\n${end}\n`;
const cmd=process.argv[2]||'status';
const run=(bin,args=[],options={})=>execFileSync(bin,args,{encoding:'utf8',...options});
const exists=async file=>!!await fs.stat(file).catch(()=>false);
const env={...process.env,CAROOT:ca,TRUST_STORES:'system'};
async function hostsChange(add){
 const file='/etc/hosts',text=await fs.readFile(file,'utf8');
 const escaped=begin.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const clean=text.replace(new RegExp(escaped+'\\n[\\s\\S]*?'+end+'\\n?','g'),'');
 if(add&&clean.split('\n').some(line=>line.split('#')[0].trim().split(/\s+/).slice(1).includes('offload.ai')))throw Error('An existing offload.ai hosts entry needs review. Nothing changed.');
 if(add&&!await exists(path.join(dir,'hosts.before')))await fs.writeFile(path.join(dir,'hosts.before'),text,{mode:0o600});
 if(add&&process.env.SUDO_UID&&process.env.SUDO_GID)await fs.chown(path.join(dir,'hosts.before'),Number(process.env.SUDO_UID),Number(process.env.SUDO_GID));
 await fs.writeFile(file,add?clean.replace(/\n?$/,'\n')+block:clean);
 run('/usr/bin/dscacheutil',['-flushcache']);
 spawnSync('/usr/bin/killall',['-HUP','mDNSResponder']);
}
async function detectPort(){
 if(process.env.OFFLOAD_PORT){const port=Number(process.env.OFFLOAD_PORT);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid OFFLOAD_PORT');return await probe(port,true);}
 const ports=[...new Set(run('/usr/sbin/lsof',['-nP','-iTCP','-sTCP:LISTEN']).split('\n').flatMap(line=>{const m=line.match(/(?:127\.0\.0\.1|\*|\[::1\]):(\d+) \(LISTEN\)/);return m?[Number(m[1])]:[]}))];
 const sites=(await Promise.all(ports.map(port=>probe(port).catch(()=>null)))).filter(Boolean);
 const dev=sites.filter(s=>s.vite), choices=dev.length?dev:sites;
 if(choices.length!==1)throw Error(choices.length?'Multiple Offload sites found. Set OFFLOAD_PORT to choose one.':'Start Offload with npm run dev first.');
 return choices[0];
}
async function probe(port,explicit=false){
 const res=await fetch(`http://127.0.0.1:${port}/`,{signal:AbortSignal.timeout(1000),redirect:'error'});
 const html=await res.text();
 if(!res.ok||!/<title>Offload\b/i.test(html)||!html.includes('id="root"'))throw Error(`${port} is not serving the Offload frontend.`);
 return {port,vite:html.includes('/@vite/client')};
}
async function startProxy(site,checkOnly=false){
  if(!await exists(path.join(dir,'offload.pem')))throw Error('Run npm run local:https:prepare first.');
  if(!checkOnly&&!(await fs.readFile('/etc/hosts','utf8')).includes(block))throw Error('Run install-admin first.');
  const {port,vite}=site;
  await fs.mkdir(path.dirname(socket),{recursive:true,mode:0o700});
  await fs.writeFile(config,localDomainConfig({port,socket,certificate:path.join(dir,'offload.pem'),key:path.join(dir,'offload-key.pem')}),{mode:0o600});
  run('caddy',['validate','--config',config,'--adapter','caddyfile'],{stdio:'inherit'});
  if(checkOnly){console.log('Validated local domain configuration on port '+port);return;}
  if(await exists(socket)){try{run('caddy',['reload','--address','unix/'+socket,'--config',config,'--adapter','caddyfile'],{stdio:'inherit'});}catch{throw Error('Proxy reload failed. Run stop, then start.');}}
  else run('caddy',['start','--config',config,'--adapter','caddyfile','--pidfile',path.join(dir,'pid')],{stdio:'inherit'});
  console.log(`https://offload.ai → 127.0.0.1:${port} (${vite?'development':'built site'})`);
}

await fs.mkdir(ca,{recursive:true,mode:0o700});
try{
 if(process.platform!=='darwin')throw Error('This setup supports macOS. Do not run its admin steps on another OS.');
 if(cmd==='prepare'){
  run('mkcert',['-cert-file',path.join(dir,'offload.pem'),'-key-file',path.join(dir,'offload-key.pem'),'offload.ai'],{env,stdio:'inherit'});
  await fs.chmod(path.join(dir,'offload-key.pem'),0o600);
  const {port,vite}=await detectPort();
  console.log(`Prepared certificate; detected ${vite?'Vite development':'built'} frontend on ${port}.\nNext: sudo node scripts/local-https.mjs install-admin`);
 }else if(cmd==='install-admin'||cmd==='undo-admin'){
  if(process.getuid()!==0)throw Error('Run this step with sudo in your Terminal.');
  if(!await exists(path.join(ca,'rootCA.pem')))throw Error('Run prepare first.');
  if(cmd==='install-admin'){
   // Validate conflicts before changing the trust store.
   const hosts=await fs.readFile('/etc/hosts','utf8');
   if(!hosts.includes(begin)&&hosts.split('\n').some(l=>l.split('#')[0].trim().split(/\s+/).slice(1).includes('offload.ai')))throw Error('Existing offload.ai mapping: review it first.');
   run('/usr/bin/security',['add-trusted-cert','-d','-r','trustRoot','-k','/Library/Keychains/System.keychain',path.join(ca,'rootCA.pem')]);
   await hostsChange(true);
   console.log('Installed only the Offload hosts block and dedicated development CA.');
  }else{
   await hostsChange(false);
   const pem=path.join(ca,'rootCA.pem');
   const fingerprint=run('/usr/bin/openssl',['x509','-in',pem,'-noout','-fingerprint','-sha1']).trim().split('=')[1].replaceAll(':','');
   const result=spawnSync('/usr/bin/security',['delete-certificate','-Z',fingerprint,'/Library/Keychains/System.keychain'],{encoding:'utf8'});
   if(result.status!==0&&!result.stderr.includes('could not be found'))throw Error(result.stderr);
   console.log('Removed the Offload hosts block and its dedicated CA trust. Other entries and certificates are unchanged.');
  }
 }else if(cmd==='check'){
  await startProxy(await detectPort(),true);
 }else if(cmd==='start'){
  await startProxy(await detectPort());
 }else if(cmd==='watch'){
  let stopping=false,lastPort=null,lastMessage='';
  const stop=()=>{stopping=true;};process.on('SIGINT',stop);process.on('SIGTERM',stop);
  console.log('Local domain: watching for the Offload frontend.');
  while(!stopping){
   try{
    const site=await detectPort();
    if(site.port!==lastPort||!await exists(socket)){await startProxy(site);lastPort=site.port;lastMessage='';}
   }catch(e){if(e.message!==lastMessage){console.log('Local domain: '+e.message);lastMessage=e.message;}}
   if(!stopping)await delay(2000);
  }
  if(lastPort&&await exists(socket))spawnSync('caddy',['stop','--address','unix/'+socket],{stdio:'inherit'});
 }else if(cmd==='stop'){
  if(await exists(socket))run('caddy',['stop','--address','unix/'+socket],{stdio:'inherit'});
  console.log('Offload HTTPS proxy stopped. The development app is unchanged.');
 }else if(cmd==='status'){
  console.log(`Hosts entry: ${(await fs.readFile('/etc/hosts','utf8')).includes(block)}\nProxy socket: ${await exists(socket)}\nPrivate certificate directory: ${dir}`);
 }else throw Error('Use prepare, install-admin, check, start, watch, stop, status, or undo-admin.');
}catch(e){console.error(e.message);process.exitCode=1;}
