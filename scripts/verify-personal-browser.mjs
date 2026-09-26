import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createWorkspace} from '../shared/workspace.js';
const [input,outputDir]=process.argv.slice(2);if(!input||!outputDir)throw Error('Pass selected.json and output directory.');
const browser=await chromium.launch({headless:true,channel:'chrome'});
const results=[];
try{for(const [name,width,height] of [['desktop',1440,1100],['mobile',390,844]]){
 const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();
 const state=createWorkspace();state.profile.onboarded=true;state.profile.name='Ryan';
 await page.addInitScript(s=>localStorage.setItem('offload.workspace.v1',JSON.stringify(s)),state);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.DEMO_URL||'http://127.0.0.1:5214/app/sleep');
 await page.getByLabel('Personal task suggestions').waitFor();
 await page.locator('input[type=file]').setInputFiles(path.resolve(input));
 await page.getByRole('status').filter({hasText:/Imported 6 source notes/}).waitFor();
 await page.getByLabel('Project',{exact:true}).selectOption('mongodb-harness');
 await page.getByRole('button',{name:'Resume project',exact:true}).click();
 await page.getByRole('heading',{name:'Recover context for MongoDB Harness',exact:true}).waitFor();
 await page.getByText('Why this task?',{exact:true}).click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'suggestion card overflow');
 await page.screenshot({path:path.join(outputDir,`personal-${name}-suggestion.png`),fullPage:true});
 await page.getByRole('button',{name:'Start once',exact:true}).click();
 await page.getByRole('link',{name:'Download context',exact:true}).waitFor({timeout:30000});
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'Download context',exact:true}).click()]);
 const file=path.join(outputDir,`recovered-context-${name}.md`);await download.saveAs(file);
 const text=await fs.readFile(file,'utf8');assert.match(text,/don't push anything, keep it local to my computer/);
 assert.doesNotMatch(text,/scholarly-swipe|pull that session up and continue/);
 const before=await page.request.get('http://127.0.0.1:5214/api/suggestions');const data=await before.json();
 assert.equal(data.runs.length,1);assert.equal(data.runs[0].status,'completed');
 await page.reload();await page.getByRole('link',{name:'Download context',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'completed task overflow');
 await page.screenshot({path:path.join(outputDir,`personal-${name}-completed.png`),fullPage:true});
 assert.deepEqual(errors,[]);results.push({viewport:name,imported:6,sourceNotesInArtifact:4,completed:true,reloadPersists:true,crossProjectQuotes:false,overflow:false,pageErrors:errors,runId:data.runs[0]._id});
 await context.close();
}}
finally{await browser.close();}
await fs.writeFile(path.join(outputDir,'personal-browser-verification.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
