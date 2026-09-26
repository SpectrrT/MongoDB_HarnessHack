import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { IDLE_SCOPE } from './sleep/idle-execution.js';
export const IDLE_MS = 30 * 60 * 1000;
export const DEFAULT_IDLE_LIMITS = { scope: IDLE_SCOPE, budget: 10000, durationMs: 20 * 60 * 1000 };

export function createIdleReviews({ dataDir, launch, getJob, cancel, isBusy, now = Date.now, interval = 30000 }) {
  const rows = new Map(), writes = new Map(); let ticking = false;
  const dir = path.join(dataDir, 'idle-reviews'), key = (owner,id) => owner + ':' + id;
  const save = async row => {
    const id = key(row.owner,row.id), snapshot = JSON.stringify(row), prior = writes.get(id) || Promise.resolve();
    const task = prior.catch(() => {}).then(async () => {
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      const name = crypto.createHash('sha256').update(id).digest('hex'), temp = path.join(dir,name + '.' + crypto.randomUUID() + '.tmp');
      await fs.writeFile(temp,snapshot,{mode:0o600}); await fs.rename(temp,path.join(dir,name + '.json'));
    });
    writes.set(id,task); try { await task; } finally { if (writes.get(id) === task) writes.delete(id); }
  };
  const ready = (async () => {
    for (const name of await fs.readdir(dir).catch(() => [])) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      try {
        const row = JSON.parse(await fs.readFile(path.join(dir,name),'utf8'));
        // Old review-only consent must not silently become permission to create files.
        if (row.consent?.scope !== IDLE_SCOPE) { row.enabled = false; row.state = 'off'; row.error = 'Enable Sleep again to allow bounded local drafts.'; }
        rows.set(key(row.owner,row.id),row);
      } catch {}
    }
  })();
  const view = row => row ? { enabled: row.enabled, state: row.state, nextAt: row.nextAt, jobId: row.jobId,
    model: row.latest?.model, effort: row.latest?.effort, error: row.error, consent: row.consent, outcome: row.outcome } : { enabled: false, state: 'off' };
  const reconcile = async row => {
    if (row && ['running','starting'].includes(row.state) && row.jobId) {
      const job = await getJob(row.owner,row.jobId);
      if (job && job.status !== 'running') { row.state = job.status === 'completed' ? 'done' : 'paused'; row.error = job.error; row.outcome = job.result?.sleep; await save(row); }
    }
  };
  async function pause(row, reason) {
    row.generation++; row.state = row.enabled ? 'paused' : 'off'; row.error = reason;
    if (row.jobId) await cancel(row.owner,row.jobId);
    await save(row);
  }
  const api = {
    async set(owner,id,enabled,consent) {
      await ready;
      if (enabled && (consent?.scope !== IDLE_SCOPE || !Number.isInteger(consent.budget) || consent.budget < 1000 || consent.budget > 20000 ||
        !Number.isInteger(consent.durationMs) || consent.durationMs < 1000 || consent.durationMs > 3600000)) throw Error('Choose bounded isolated-local-draft permission and valid limits.');
      let row = rows.get(key(owner,id));
      if (!row) { row = { owner,id,enabled:false,state:'off',generation:0 }; rows.set(key(owner,id),row); }
      if (row.jobId && ['running','starting'].includes(row.state)) await cancel(owner,row.jobId);
      row.generation++; row.enabled = enabled; row.nextAt = now() + IDLE_MS; row.state = enabled ? 'waiting' : 'off'; row.error = null;
      if (enabled) row.consent = { ...consent, grantedAt: now() };
      await save(row); return view(row);
    },
    async observe(owner,p) {
      await ready; const row = rows.get(key(owner,p.conversationId)); if (!row) return;
      if (row.jobId && ['running','starting'].includes(row.state)) await cancel(owner,row.jobId);
      const previous=row.latest?.messages||[],incoming=p.messages||[];
      let overlap=Math.min(previous.length,incoming.length);
      while(overlap>0&&!previous.slice(-overlap).every((m,index)=>m.role===incoming[index].role&&m.text===incoming[index].text))overlap--;
      const messages=[...previous,...incoming.slice(overlap)];
      row.generation++; row.latest = { ...p, messages, images: [], notes: [], folder: '' }; row.nextAt = now() + IDLE_MS;
      row.state = row.enabled ? 'waiting' : 'off'; row.error = null; await save(row);
      if(messages.length>200||messages.reduce((n,m)=>n+m.text.length,0)>100000){row.state='paused';row.error='The conversation exceeds the bounded source limit. Start a scoped task without dropping its constraints.';await save(row);}
    },
    async touch(owner,id) {
      await ready; const row = rows.get(key(owner,id));
      if (row?.enabled) {
        if (['starting','running'].includes(row.state)) await pause(row,'User activity paused Sleep. Send a message to rearm the idle window.');
        else if (row.state === 'waiting') { row.nextAt = now() + IDLE_MS; await save(row); }
      }
      return view(row);
    },
    async activity(owner) {
      await ready; for (const row of rows.values()) if (row.owner === owner && ['starting','running'].includes(row.state)) await pause(row,'A new chat message paused Sleep.');
    },
    async get(owner,id) { await ready; const row = rows.get(key(owner,id)); await reconcile(row); return view(row); },
    async reset(owner) { await ready; for (const row of rows.values()) if (row.owner === owner) await api.set(owner,row.id,false); },
    async tick() {
      await ready; if (ticking) return; ticking = true;
      try { for (const row of rows.values()) {
        await reconcile(row);
        if (!row.enabled || !row.latest || isBusy(row.owner)) continue;
        const recovering = ['running','starting'].includes(row.state) && row.runPayload;
        if (!recovering && (row.state !== 'waiting' || row.nextAt > now())) continue;
        const generation = row.generation;
        if (!recovering) {
          row.state = 'starting'; row.jobId = crypto.randomUUID();
          const last = await getJob(row.owner,row.latest.requestId);
          row.runPayload = { ...row.latest, requestId: row.jobId, images: [], notes: [], folder: '', background: true,
            scope: row.consent.scope, budget: row.consent.budget, deadline: now() + row.consent.durationMs,
            generation, messages: [...row.latest.messages,...(last?.result?.text ? [{role:'assistant',text:last.result.text.slice(0,16000)}] : [])] };
          await save(row);
        }
        try {
          const result = await launch(row.owner,row.runPayload);
          if (!row.enabled || generation !== row.generation) { await cancel(row.owner,row.jobId); continue; }
          row.state = result?.skipped ? 'done' : 'running'; row.error = result?.skipped ? result.reason : null;
        } catch (e) { if (row.enabled && generation === row.generation) { row.state = 'paused'; row.error = e.message; } }
        await save(row);
      } } finally { ticking = false; }
    },
    close() { clearInterval(timer); },
  };
  const timer = interval ? setInterval(() => { void api.tick().catch(() => {}); },interval) : null;
  timer?.unref(); return api;
}
