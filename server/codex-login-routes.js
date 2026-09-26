import {createChatGPTLogin} from './codex-login.js';
export function mountCodexLogin(app,{status,onConnected,isBusy=()=>false,manager=createChatGPTLogin({onConnected})}){
 app.post('/api/model/login',async(req,res)=>{try{if((await status()).connected)return res.json({connected:true});if(isBusy())return res.status(409).json({error:'Stop the active task before changing the ChatGPT sign-in.'});res.json(await manager.start(req.workspaceKey));}catch(e){res.status(409).json({error:e.message});}});
 app.get('/api/model/login/:id',(req,res)=>{const session=manager.get(req.workspaceKey,req.params.id);if(!session)return res.status(404).json({error:'Sign-in session not found.'});res.json(session);});
 app.post('/api/model/login/:id/cancel',async(req,res)=>{try{if(!await manager.cancel(req.workspaceKey,req.params.id))return res.status(404).json({error:'Sign-in session not found.'});res.json({ok:true});}catch{res.status(503).json({error:'Could not cancel sign-in.'});}});
}
