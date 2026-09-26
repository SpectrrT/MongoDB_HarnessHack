import test from 'node:test';import assert from 'node:assert/strict';
import {createChatGPTLogin} from '../server/codex-login.js';
function harness(url='https://auth.openai.com/oauth/authorize?state=test'){
 let notify,closed=0;const calls=[];
 const client={request:async(method,params)=>{calls.push({method,params});return method==='account/login/start'?{loginId:'native-login',authUrl:url}:{};},subscribe:fn=>{notify=fn},notify:()=>{},close:()=>closed++};
 let connected=0;const manager=createChatGPTLogin({createClient:()=>client,onConnected:()=>connected++});return {manager,calls,notify:event=>notify(event),closed:()=>closed,connected:()=>connected};
}
test('ChatGPT login is owner-bound and only completes for the native login ID',async()=>{
 const h=harness(),pending=await h.manager.start('owner');assert.equal(pending.status,'pending');assert.equal(h.manager.get('other',pending.id),null);
 await assert.rejects(h.manager.start('other'),/already open/);assert.equal(await h.manager.cancel('other',pending.id),false);
 h.notify({method:'account/login/completed',params:{loginId:'wrong',success:true}});assert.equal(h.connected(),0);
 h.notify({method:'account/login/completed',params:{loginId:'native-login',success:true}});assert.equal(h.connected(),1);assert.equal(h.manager.get('owner',pending.id).status,'connected');assert.equal(h.manager.get('owner',pending.id).url,undefined);assert.equal(h.closed(),1);
 assert.deepEqual(h.calls.find(c=>c.method==='account/login/start').params,{type:'chatgpt',useHostedLoginSuccessPage:true,appBrand:'chatgpt'});
});
test('cancel closes the native login, and unexpected auth destinations fail closed',async()=>{
 const h=harness(),pending=await h.manager.start('owner');await h.manager.cancel('owner',pending.id);assert.equal(h.manager.get('owner',pending.id).status,'cancelled');assert.ok(h.calls.some(c=>c.method==='account/login/cancel'&&c.params.loginId==='native-login'));
 const bad=harness('https://example.com/collect');await assert.rejects(bad.manager.start('owner'),/Could not start/);assert.equal(bad.closed(),1);
});
