import {test,expect} from '@playwright/test';
import {createWorkspace} from '../../shared/workspace.js';

test('Idle Sleep consent persists, background work leaves chat usable, and resumed activity pauses it',async({page},info)=>{
  const conversationId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const state=createWorkspace();state.profile.onboarded=true;state.profile.name='Tester';state.settings.modelConnected=true;
  state.settings.modelSelection='fixture';state.conversations=[{id:conversationId,title:'Build a counter',createdAt:Date.now(),messages:[{id:'user-goal',role:'user',text:'Build an isolated local counter prototype.',createdAt:Date.now()}]}];
  state.conversations[0].messages.push({id:'paused-result',role:'assistant',text:'Sleep paused before verification.',sleep:true,usage:{total_tokens:123,unknown_reservations:1},createdAt:Date.now()});
  await page.addInitScript(s=>{if(!localStorage.getItem('offload.workspace.v1'))localStorage.setItem('offload.workspace.v1',JSON.stringify(s));},state);
  let sleep={enabled:false,state:'off',configured:true},consent,activity=0,connected=true;
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/model/**',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname==='/api/model/status')return route.fulfill({json:{connected,models:[{id:'fixture',name:'Fixture',efforts:['low']}]}});
    if(url.pathname==='/api/model/openrouter/status')return route.fulfill({json:{connected:false,models:[]}});
    if(url.pathname.endsWith('/activity')){activity++;sleep={...sleep,state:'paused',error:'User activity paused Sleep.'};return route.fulfill({json:sleep});}
    if(url.pathname.includes('/sleep/')){
      if(req.method()==='POST'){const body=req.postDataJSON();consent=body.consent;sleep={...sleep,enabled:body.enabled,state:body.enabled?'waiting':'off'};}
      return route.fulfill({json:sleep});
    }
    return route.fulfill({status:404,json:{error:'No other model call expected in this rendering fixture.'}});
  });
  await page.goto('/app/chat/'+conversationId);
  await expect(page.getByText('123 total tokens including conservative unknown-usage reservations')).toBeVisible();
  const toggle=page.getByRole('button',{name:'Sleep for this conversation',exact:true});
  await expect(page.getByText(/Allows isolated offline prototype checks/)).toBeVisible();
  await toggle.click();
  await expect(page).toHaveURL(/\/app\/memory\?tab=sleep$/);
  await expect(page.getByRole('link', {name:'Build a counter Sleep enabled'})).toBeVisible();
  await page.goto('/app/chat/'+conversationId);
  await expect(toggle).toHaveAttribute('aria-pressed','true');
  expect(consent).toMatchObject({scope:'isolated-local-drafts',budget:10000,durationMs:1200000,offlinePrototypeChecks:true});
  sleep={...sleep,state:'running',jobId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
  await expect(page.getByText(/Sleep is drafting a candidate/)).toBeVisible({timeout:8000});
  const composer=page.locator('.chat-composer textarea');await expect(composer).toBeEnabled();
  await composer.fill('I am back.');await expect.poll(()=>activity).toBeGreaterThan(0);
  await expect(page.getByText(/User activity paused Sleep/)).toBeVisible();
  connected=false;await page.reload();await expect(toggle).toBeEnabled();
  await toggle.click();await expect(toggle).toHaveAttribute('aria-pressed','false');
  expect(consent).toBeUndefined();
  expect(sleep.enabled).toBe(false);expect(errors).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:`test-results/idle-sleep-${info.project.name}.png`,fullPage:true});
});
