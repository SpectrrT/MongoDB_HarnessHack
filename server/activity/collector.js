// Records computer history: every few seconds, the frontmost app, window title and browser page go to
// MongoDB Atlas (activity_events); every 15 seconds they are folded into sessions. Pausing from the app
// reaches this process through a change stream.
//   npm run activity:collector              record (needs MONGODB_URI in .env)
//   npm run activity:collector -- --dry-run print samples, store nothing
import { MongoClient } from 'mongodb';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { sample, captureStatus } from './capture.js';
import { createActivity, deviceId, workspaceId, SAMPLE_MS } from './store.js';

const FLUSH_MS = 15000;
const time = (d = new Date()) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// Managed by the local app. Construction never records; resume requires saved, explicit consent.
export function createActivityCollector({activity,workspace=workspaceId(),device=deviceId(),sampleFn=sample,permissionStatus=captureStatus,platform=process.platform,intervalMs=SAMPLE_MS,flushMs=FLUSH_MS,now=Date.now}={}){
  let settings=null,running=false,timer=null,inFlight=null,generation=0,buffer=[],lastSampleAt=null,lastSavedAt=null,lastFlush=0,error=null,unwatch=null,closed=false;
  const supported=platform==='darwin',canStart=supported&&!!activity;
  const status=()=>({supported,canStart,enabled:!!settings?.collectorEnabled,running,state:!supported?'unsupported':running?(error?'error':lastSampleAt?'recording':'starting'):settings?.paused?'paused':'stopped',lastSampleAt,lastSavedAt,error,permissions:permissionStatus(),scope:{appNames:true,windowTitles:settings?.captureTitles??true,browserUrls:settings?.collectorEnabled?!!settings.captureUrls:false},device});
  const halt=()=>{running=false;generation++;clearTimeout(timer);timer=null;buffer=[];};
  const schedule=delay=>{clearTimeout(timer);timer=setTimeout(cycle,delay);timer.unref?.();};
  const cycle=()=>{
    if(!running||closed||inFlight)return;
    const version=generation;
    inFlight=(async()=>{
      try{
        settings=await activity.settings(workspace);
        if(!running||version!==generation)return;
        if(settings.paused||!settings.collectorEnabled){halt();return;}
        const value=await sampleFn({titles:settings.captureTitles,urls:settings.captureUrls,excludedApps:settings.excludedApps});
        if(!running||version!==generation)return;
        if(value&&value.source!=='seed'){buffer.push(value);lastSampleAt=new Date(now()).toISOString();}
        if(buffer.length&&(lastSavedAt===null||now()-lastFlush>=flushMs)){
          const batch=buffer;buffer=[];
          let ingested=false;
          try{
            const result=await activity.ingest(workspace,device,batch);
            ingested=true;
            if(!running||version!==generation)return;
            if(result.paused){halt();return;}
            if(result.inserted>0)lastSavedAt=new Date(now()).toISOString();
            await activity.sessionize(workspace,device);
            lastFlush=now();
          }catch(cause){if(!ingested&&running&&version===generation)buffer=batch.concat(buffer).slice(-5000);throw cause;}
        }
        error=value?null:'The front app could not be read. Recording will retry.';
      }catch{
        if(running&&version===generation)error='Computer history could not be saved. Check the local service and MongoDB connection; recording will retry.';
      }
    })().finally(()=>{inFlight=null;if(running&&!closed)schedule(Math.max(10,intervalMs));});
  };
  const begin=()=>{if(!canStart||closed||running)return;running=true;generation++;error=null;lastSampleAt=null;lastFlush=0;if(!inFlight)schedule(0);};
  const refresh=async()=>{
    if(!activity||closed)return status();
    settings=await activity.settings(workspace);
    if(settings.collectorEnabled&&!settings.paused)begin();else halt();
    return status();
  };
  const watch=()=>{if(!unwatch&&activity?.watchSettings){try{unwatch=activity.watchSettings(workspace,()=>{void refresh().catch(()=>{});});}catch{}}};
  return {
    status,
    async resume(){watch();return refresh();},
    async start(){
      if(!canStart)throw Object.assign(Error(supported?'Computer history needs its database connection.':'Computer history recording is available on macOS.'),{status:503});
      if(closed)throw Error('The recorder has stopped. Reopen Offload.');
      const prior=await activity.settings(workspace);
      settings=await activity.updateSettings(workspace,{collectorEnabled:true,paused:false,...(!prior.collectorEnabled?{captureUrls:false}:{})});
      watch();begin();return status();
    },
    async pause(){halt();if(activity)settings=await activity.updateSettings(workspace,{paused:true});error=null;return status();},
    refresh,
    async stop(){closed=true;halt();if(unwatch){await unwatch();unwatch=null;}await inFlight;},
  };
}

async function dryRun(intervalMs) {
  console.log('Dry run: printing samples, storing nothing. Ctrl-C to stop.');
  for (;;) {
    console.log(JSON.stringify(await sample()));
    await sleep(intervalMs);
  }
}

async function main() {
  const intervalMs = Math.max(1000, Number(process.env.ACTIVITY_INTERVAL_MS) || SAMPLE_MS);
  if (process.argv.includes('--dry-run')) return dryRun(intervalMs);
  if (!process.env.MONGODB_URI) {
    console.error('Set MONGODB_URI in .env (see .env.example), or run with --dry-run.');
    process.exit(1);
  }
  const workspace = workspaceId(), device = deviceId();
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const activity = await createActivity(client.db(process.env.MONGODB_DATABASE || 'offload_hackathon'), {
    log: (message) => console.warn(message),
  });

  let settings = await activity.settings(workspace);
  const refresh = async () => {
    const was = settings.paused;
    settings = await activity.settings(workspace);
    if (was !== settings.paused) console.log(`${time()}  ${settings.paused ? 'Paused from the app.' : 'Recording again.'}`);
  };
  let stopWatching = () => {};
  try {
    stopWatching = activity.watchSettings(workspace, () => refresh().catch(() => {}));
  } catch {
    // Change streams need a replica set; Atlas always has one. Polling below covers the rest.
  }
  const poll = setInterval(() => refresh().catch(() => {}), 30000);

  let buffer = [];
  const flush = async () => {
    const batch = buffer;
    buffer = [];
    if (batch.length) {
      try {
        await activity.ingest(workspace, device, batch);
      } catch (error) {
        buffer = batch.concat(buffer).slice(-5000); // keep samples for the next try, e.g. after Wi-Fi drops
        throw error;
      }
    }
    await activity.sessionize(workspace, device);
    const last = batch.at(-1);
    const today = await activity.sessions.countDocuments({ workspace, device, day: activity.today(), idle: false });
    const now = last ? (last.idle ? 'away' : [last.app, last.title].filter(Boolean).join(' — ')) : 'paused';
    console.log(`${time()}  ${batch.length} samples saved · ${today} sessions today · ${now}`.slice(0, 160));
  };

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(poll);
    stopWatching();
    try {
      await flush();
    } finally {
      await client.close();
      process.exit(0);
    }
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  console.log(
    `Recording computer history for ${workspace} on ${device} every ${intervalMs / 1000}s.\n` +
      'Only app names, window titles and page addresses. No screenshots, no keystrokes. Ctrl-C to stop.\n' +
      'macOS may ask to allow Accessibility (window titles) and Automation (browser pages); without them, app names only.',
  );
  let lastFlush = Date.now();
  while (!stopping) {
    if (!settings.paused) {
      const s = await sample({ titles: settings.captureTitles, urls: settings.captureUrls, excludedApps: settings.excludedApps });
      if (s) buffer.push(s);
    }
    if (Date.now() - lastFlush >= FLUSH_MS) {
      lastFlush = Date.now();
      await flush().catch((error) => console.error(`${time()}  Could not save: ${error.message}`));
    }
    await sleep(intervalMs);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
