import {test,expect} from '@playwright/test';
import {createWorkspace} from '../../shared/workspace.js';

test('Sleep names the section correctly and shows context metrics on desktop and mobile',async({page},info)=>{
 const state=createWorkspace();state.profile.onboarded=true;state.profile.name='Tester';
 await page.addInitScript(s=>localStorage.setItem('offload.workspace.v1',JSON.stringify(s)),state);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/app/sleep');
 await page.getByRole('button',{name:'Context memory',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Sleep',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Context memory',exact:true})).toBeVisible();
 await expect(page.getByText('No context selections recorded yet.')).toBeVisible();
 // A rendering fixture, explicitly separate from the live benchmark.
 await page.route('**/api/rem/state',route=>route.fulfill({json:{engine:{compaction:'fixture selector',database:'test',model:'test'},runs:[{runId:'render-test',title:'UI fixture: release evidence',usage:{compactionInputTokens:123,compactionOutputTokens:4},compaction:{status:'compacted',source:'fixture selector',beforeChars:7200,afterChars:150,retained:3,archived:12,decisionCalls:2,cacheHits:10,latencyMs:500,inputTokens:123,outputTokens:4,usageKnown:true,errors:[]}},{runId:'byte-overflow',title:'UI fixture: checkpoint limit',status:'needs_review',compaction:{source:'working-transcript',status:'needs_review',beforeBytes:70000,budgetBytes:65536}}]}}));
 await expect(page.getByRole('heading',{name:'UI fixture: release evidence'})).toBeVisible({timeout:10000});
 await expect(page.getByText(/127 reported decision tokens/)).toBeVisible();
 await expect(page.getByText('Working transcript: 70,000 bytes. Budget: 65,536 bytes.')).toBeVisible();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
 expect(overflow).toBe(false);expect(errors).toEqual([]);
 await page.screenshot({path:`test-results/context-${info.project.name}.png`,fullPage:true});
});
