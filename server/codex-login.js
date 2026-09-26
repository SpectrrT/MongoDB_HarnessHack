import crypto from 'node:crypto';
import {codexClient} from './codex-rpc.js';
export function createChatGPTLogin({createClient=codexClient,onConnected=()=>{}}={}){
 let active;const sessions=new Map();
 const view=session=>({id:session.id,status:session.status,...(session.status==='pending'?{url:session.url}:{}),...(session.error?{error:session.error}:{})});
 const finish=(session,status,error)=>{session.status=status;session.error=error;clearTimeout(session.timer);session.client.close();if(active===session)active=null;setTimeout(()=>sessions.delete(session.id),60000).unref();};
 return {
  async start(owner){
   if(active){if(active.owner!==owner||!active.url)throw Error('A ChatGPT sign-in is already open on this Mac.');return view(active);}
   const session={id:crypto.randomUUID(),owner,status:'pending',client:createClient()};active=session;sessions.set(session.id,session);
   session.timer=setTimeout(()=>finish(session,'expired','Sign-in expired. Try again.'),10*60*1000);session.timer.unref();
   session.client.subscribe(event=>{if(session.status==='pending'&&event.method==='account/login/completed'&&event.params.loginId===session.loginId){if(event.params.success){onConnected();finish(session,'connected');}else finish(session,'failed','ChatGPT sign-in was not completed.');}});
   try{
    await session.client.request('initialize',{clientInfo:{name:'offload',version:'0.2.0'},capabilities:{experimentalApi:true}});session.client.notify('initialized');
    const login=await session.client.request('account/login/start',{type:'chatgpt',useHostedLoginSuccessPage:true,appBrand:'chatgpt'});
    const url=new URL(login.authUrl);if(url.protocol!=='https:'||!['auth.openai.com','chatgpt.com','auth0.openai.com'].includes(url.hostname))throw Error('Unexpected sign-in destination.');
    session.loginId=login.loginId;session.url=url.href;return view(session);
   }catch(error){finish(session,'failed','Could not start ChatGPT sign-in. Make sure Codex is installed.');throw Error(session.error);}
  },
  get(owner,id){const session=sessions.get(id);return session?.owner===owner?view(session):null;},
  async cancel(owner,id){const session=sessions.get(id);if(!session||session.owner!==owner)return false;if(session.status==='pending'){try{await session.client.request('account/login/cancel',{loginId:session.loginId});}finally{finish(session,'cancelled');}}return true;},
 };
}
