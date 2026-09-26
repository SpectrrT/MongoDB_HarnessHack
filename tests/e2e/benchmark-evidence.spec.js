import {test, expect} from '@playwright/test';
import fs from 'node:fs';
const evidence=JSON.parse(fs.readFileSync(new URL('../../src/data/benchmark-evidence.json',import.meta.url),'utf8'));
test('landing evidence follows the complete hero and exposes measured conditions without overflow',async({page})=>{
 await page.goto('/');
 const card=page.getByRole('region',{name:evidence.title});
 await expect(card).toBeVisible();
 expect(await card.evaluate(el=>el.previousElementSibling.classList.contains('hero') && !!el.previousElementSibling.querySelector('h1') && !!el.previousElementSibling.querySelector('.button'))).toBe(true);
 await expect(card.getByText(evidence.baselineTokens.toLocaleString('en-US'),{exact:true})).toBeVisible();
 await expect(card.getByText(evidence.offloadTokens.toLocaleString('en-US'),{exact:true})).toBeVisible();
 await card.getByText('See the test conditions').click();
 await expect(card.getByText(evidence.limitation,{exact:true})).toBeVisible();
 const response=await page.request.get(evidence.receipt);expect(response.ok()).toBe(true);
 const raw=await response.json();expect(raw.summary.baselineTotal).toBe(evidence.baselineTokens);expect(raw.summary.compactedTotal).toBe(evidence.offloadTokens);
 await card.getByRole('button',{name:'Repeated context',exact:true}).click();
 await expect(card.getByText(evidence.repeated.offloadTokens.toLocaleString('en-US'),{exact:true})).toBeVisible();
 const repeated=await (await page.request.get(evidence.repeated.receipt)).json();expect(repeated.summary.compactedTotal).toBe(evidence.repeated.offloadTokens);
 for(const item of evidence.reliability){await expect(card.getByRole('heading',{name:item.title,exact:true})).toBeVisible();expect((await page.request.get(item.receipt)).ok()).toBe(true);}
 const width=await page.evaluate(()=>({content:document.documentElement.scrollWidth,viewport:innerWidth}));expect(width.content).toBeLessThanOrEqual(width.viewport+1);
});
