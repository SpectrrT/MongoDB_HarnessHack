import {test, expect} from '@playwright/test';
import fs from 'node:fs';
const evidence=JSON.parse(fs.readFileSync(new URL('../../src/data/benchmark-evidence.json',import.meta.url),'utf8'));
test('landing comparisons are flat, readable and link complete evidence',async({page})=>{
 await page.goto('/');
 const section=page.getByRole('region',{name:'Fewer tokens. Checked results.'});
 await expect(section).toBeVisible();
 await expect(section.locator('figure')).toHaveCount(2);
 await expect(section.locator('button, select, details')).toHaveCount(0);
 await expect(section).not.toContainText('Offload + Jev');
 const rows=evidence.presentationComparisons || [evidence,evidence.repeated];
 for(const row of rows){
   await expect(section.getByText(row.baselineTokens.toLocaleString('en-US'),{exact:true})).toBeVisible();
   await expect(section.getByText(row.offloadTokens.toLocaleString('en-US'),{exact:true})).toBeVisible();
 }
 const appearance=await section.evaluate(el=>({background:getComputedStyle(el).backgroundColor,radius:getComputedStyle(el).borderRadius,font:getComputedStyle(el).fontFamily,bodyFont:getComputedStyle(document.body).fontFamily,width:document.documentElement.scrollWidth,viewport:innerWidth}));
 expect(appearance.background).toBe('rgba(0, 0, 0, 0)');expect(appearance.radius).toBe('0px');expect(appearance.font).toBe(appearance.bodyFont);expect(appearance.width).toBeLessThanOrEqual(appearance.viewport+1);
 await section.getByRole('link',{name:'Methods and all results'}).click();
 await expect(page.getByRole('heading',{name:'Benchmark methods and all results'})).toBeVisible();
 await expect(page.getByText('Neither artifact fully passes.',{exact:false}).first()).toBeVisible();
});
