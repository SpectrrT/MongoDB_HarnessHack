import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {authoredRequest,eventSchema} from '../server/suggestions/history.js';
// Manifest entries explicitly select one file, project and source IDs. No directory crawling.
const [manifestPath,outputPath]=process.argv.slice(2);
if(!manifestPath||!outputPath)throw Error('Usage: node scripts/import-selected-history.mjs manifest.json selected.json');
const manifest=JSON.parse(await fs.promises.readFile(manifestPath,'utf8'));
if(!Array.isArray(manifest.sessions)||manifest.sessions.length>100)throw Error('Select at most 100 sessions.');
const events=[],seen=new Set();let scanned=0,excluded=0;
for(const entry of manifest.sessions){
 if(!['claude','codex'].includes(entry.origin)||!Array.isArray(entry.sourceIds)||!entry.sourceIds.length)throw Error('Each session needs an origin and explicit sourceIds.');
 const allowed=new Set(entry.sourceIds);
 const lines=readline.createInterface({input:fs.createReadStream(path.resolve(path.dirname(manifestPath),entry.path)),crlfDelay:Infinity});
 for await(const line of lines){
  if(line.length>2_000_000){excluded++;continue;}
  let record;try{record=JSON.parse(line);}catch{excluded++;continue;}
  scanned++;const parsed=authoredRequest(record,entry);if(!parsed||!allowed.has(parsed.sourceId))continue;
  const key=`${entry.origin}:${parsed.sourceId}`;if(seen.has(key))continue;seen.add(key);
  const event=eventSchema.parse({...Object.fromEntries(Object.keys(eventSchema.shape).map(key=>[key,parsed[key]])),timestamp:parsed.timestamp.toISOString(),kind:entry.kinds?.[parsed.sourceId]||'request'});
  events.push(event);
  if(events.length>5000)throw Error('Select at most 5000 requests.');
 }
}
await fs.promises.mkdir(path.dirname(path.resolve(outputPath)),{recursive:true});
await fs.promises.writeFile(outputPath,JSON.stringify({events},null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({selected:events.length,scanned,excluded,output:path.resolve(outputPath)}));
