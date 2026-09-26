import {test,expect} from '@playwright/test';
import {createWorkspace} from '../../shared/workspace.js';
import snapshot from '../../src/components/history-workflow-snapshot.json' with {type:'json'};
async function prepare(page){
 const state=createWorkspace();state.profile.onboarded=true;state.profile.name='Tester';
 await page.addInitScript(value=>localStorage.setItem('offload.workspace.v1',JSON.stringify(value)),state);
 await page.route('**/api/model/status',route=>route.fulfill({json:{connected:false,models:[]}}));
}
test('history proposal save failure stays actionable and successful save never claims task execution',async({page})=>{
 await prepare(page);let header,posted;
 await page.route('**/api/activity/workflow',route=>{header=route.request().headers()['x-offload-client'];return route.fulfill({json:snapshot});});
 let saveWorks=false;
 await page.route('**/api/activity/workflows',route=>{posted=route.request().postDataJSON();return route.fulfill({status:saveWorks?201:503,json:saveWorks?{id:'saved-example',status:'saved-proposal'}:{error:'Storage unavailable. Try again.'}});});
 await page.goto('/app/chat');await page.getByRole('button',{name:/Find work to hand off/}).click();
 await expect(page.getByRole('button',{name:'Save proposal',exact:true})).toBeVisible();expect(header).toBe('local');
 await expect(page.locator('.history-workflow')).toContainText('Sample activity');
 await expect(page.locator('.history-workflow')).toContainText('Time savings have not been measured');
 await page.getByRole('button',{name:'Save proposal',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Storage unavailable');await expect(page.locator('.history-workflow')).not.toContainText('Proposal saved');
 expect(posted.provenance).toBe('seed');expect(posted.saves).toBeUndefined();
 saveWorks=true;await page.getByRole('button',{name:'Save proposal',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Proposal saved. No task has started');
 await expect(page.locator('.history-workflow')).not.toContainText('Handed off');
});
test('static-host fallback preserves sample provenance and cannot claim a saved handoff',async({page})=>{
 await prepare(page);
 await page.route('**/api/activity/**',route=>route.fulfill({contentType:'text/html',body:'<html>Static app</html>'}));
 await page.goto('/app/chat');await page.getByRole('button',{name:/Find work to hand off/}).click();
 await expect(page.locator('.history-workflow')).toContainText('Sample activity');
 await expect(page.locator('.history-workflow')).toContainText('last saved analysis of the sample week');
 await page.getByRole('button',{name:'Save proposal',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('local computer history service is unavailable');
 await expect(page.locator('.history-workflow')).not.toContainText('Proposal saved');
});
test('refining a sample proposal keeps its provenance and does not authorize external execution',async({page})=>{
 await prepare(page);
 await page.route('**/api/model/status',route=>route.fulfill({json:{connected:true,models:[{id:'gpt-5.5',name:'Fixture',efforts:['low']}]}}));
 await page.route('**/api/activity/workflow',route=>route.fulfill({json:snapshot}));
 let sent;
 await page.route('**/api/model/jobs',route=>{sent=route.request().postDataJSON();return route.fulfill({status:400,json:{error:'Stopped after inspecting the test request.'}});});
 await page.goto('/app/chat');await page.getByRole('button',{name:/Find work to hand off/}).click();
 await page.getByRole('button',{name:'Refine with Fixture'}).click();
 await expect.poll(()=>sent?.messages?.at(-1)?.text).toContain('Source: Sample activity');
 expect(sent.messages.at(-1).text).toContain('Do not claim task completion or authorize sends');
 expect(sent.messages.at(-1).text).not.toContain('looked at my computer history');
});
