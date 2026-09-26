import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { SleepExecutionStore } from '../server/sleep/execution-store.js';
import { sleepExecutionTick, taskDirectory } from '../server/sleep/execution.js';
import { sleepOpenRouterExecutor } from '../server/sleep/execution-provider.js';
import { LeaseLost } from '../server/harness/store.js';
import { createApp } from '../server/index.js';

const input = overrides => ({ title: 'Prepare local handoff', brief: 'Write a handoff. Release blocked. Owner Maya. Next: security review.',
  deadline: Date.now() + 600000, budget: 20000,
  checks: [{ path: 'handoff.md', contains: ['Release blocked', 'Owner Maya', 'security review'], minBytes: 20 }],
  writeFiles: ['handoff.md'], maxAttempts: 3, ...overrides });
const good = { summary: 'Prepared a handoff', files: [{ path: 'handoff.md', content: 'Release blocked\nOwner Maya\nNext: security review\n' }] };
const executor = async () => ({ plan: good, usage: { input_tokens: 100, output_tokens: 50, cost: 0.001 }, provider: 'scripted-test', model: 'fixture' });

test('Sleep assigned tasks: durable local execution and independent checks', async t => {
  const mongo = await MongoMemoryServer.create(), client = new MongoClient(mongo.getUri());
  await client.connect();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sleep-tasks-'));
  let serial = 0;
  async function make(options) {
    const store = new SleepExecutionStore(client.db('sleep' + (++serial)), options);
    await store.initialize(); return store;
  }
  const tick = (store, run = executor, options = {}) => sleepExecutionTick(store, run, { root, ...options });
  try {
    await t.test('writes a real local file and verifies every independent acceptance check', async () => {
      const store = await make(), task = await store.enqueue('owner', 'first', input());
      const done = await tick(store);
      assert.equal(done.status, 'completed'); assert.equal(done.tokensUsed, 150); assert.equal(done.cost, 0.001);
      assert.equal(done.calls, 1); assert.ok(done.checkResults.every(c => c.passed));
      assert.equal(await fs.readFile(path.join(taskDirectory(root, task), done.artifacts[0].directory, 'handoff.md'), 'utf8'), good.files[0].content);
    });
    await t.test('failed checks trigger bounded repair, not a completion claim', async () => {
      const store = await make(); await store.enqueue('owner', 'repair', input());
      let calls = 0;
      const repair = async ({ prompt }) => {
        if (calls > 0) {
          const context = JSON.parse(prompt);
          assert.equal(context.priorDraft.files[0].content, 'Looks good.');
          assert.ok(context.priorFailedChecks[0].failed.includes('missing: Owner Maya'));
        }
        return { ...await executor(), plan: ++calls === 1 ? { summary: 'Done', files: [{ path: 'handoff.md', content: 'Looks good.' }] } : good };
      };
      const first = await tick(store, repair); assert.equal(first.status, 'queued'); assert.equal(first.repairs, 1);
      const second = await tick(store, repair); assert.equal(second.status, 'completed'); assert.equal(second.tokensUsed, 300); assert.equal(calls, 2);
    });
    await t.test('nested JSON content is rejected and its schema error reaches the bounded repair', async () => {
      const store=await make(),document={status:'draft',count:2};
      const task=await store.enqueue('owner','json-contract',input({checks:[{path:'artifact.json',contains:[],minBytes:2,json:true}],writeFiles:['artifact.json'],maxAttempts:2}));
      let calls=0;
      const repair=async({prompt})=>{
        const context=JSON.parse(prompt);assert.match(context.instruction,/content MUST be a STRING/);
        if(calls===0)assert.equal(context.priorOutputError,null);
        else{assert.match(context.priorOutputError,/files\.0\.content/);assert.match(context.priorOutputError,/expected string, received object/);}
        return {...await executor(),plan:{summary:'JSON draft',files:[{path:'artifact.json',content:++calls===1?document:JSON.stringify(document)}]}};
      };repair.retrySafe=true;
      const rejected=await tick(store,repair);assert.equal(rejected.status,'queued');assert.equal(rejected.artifacts.length,0);assert.equal(rejected.tokensUsed,150);
      await assert.rejects(fs.access(taskDirectory(root,task)),{code:'ENOENT'});
      const done=await tick(store,repair);assert.equal(done.status,'completed');assert.equal(done.calls,2);assert.equal(done.tokensUsed,300);assert.equal(done.error,null);
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(taskDirectory(root,task),done.artifacts[0].directory,'artifact.json'),'utf8')),document);
    });
    await t.test('repeated invalid file content stops at the existing attempt limit without writing', async () => {
      const store=await make();await store.enqueue('owner','invalid-json-limit',input({maxAttempts:2}));
      const invalid=async()=>({...await executor(),plan:{summary:'Invalid',files:[{path:'handoff.md',content:{text:'Never coerce this object'}}]}});invalid.retrySafe=true;
      assert.equal((await tick(store,invalid)).status,'queued');
      const done=await tick(store,invalid);assert.equal(done.status,'incomplete');assert.equal(done.calls,2);assert.equal(done.tokensUsed,300);assert.equal(done.artifacts.length,0);
      assert.match(done.error,/files\.0\.content/);assert.equal(await tick(store,invalid),null);
    });
    await t.test('exhausted checks produce explicit incomplete with evidence', async () => {
      const store = await make(); await store.enqueue('owner', 'bad', input({ maxAttempts: 1 }));
      const done = await tick(store, async () => ({ ...await executor(), plan: { summary: 'Done', files: [{ path: 'handoff.md', content: 'Missing facts' }] } }));
      assert.equal(done.status, 'incomplete'); assert.equal(done.reason, 'acceptance-checks-failed'); assert.equal(done.checkResults[0].passed, false);
    });
    await t.test('unchanged failed checks pause larger budgets after three calls and retain progress across workers', async () => {
      const store = await make(), task = await store.enqueue('owner', 'stall', input({ maxAttempts: 8 }));
      const unchanged = async () => ({ ...await executor(), plan: { summary: 'Done', files: [{ path: 'handoff.md', content: 'Missing facts' }] } });
      assert.equal((await tick(store, unchanged)).stalledAttempts, 0);
      assert.equal((await tick(store, unchanged)).stalledAttempts, 1);
      const paused = await tick(store, unchanged);
      assert.equal(paused.status, 'paused'); assert.equal(paused.reason, 'no_verified_progress'); assert.equal(paused.calls, 3);
      assert.equal(await tick(store, unchanged), null);
      await store.control('owner', task._id, 'resume');
      const done = await tick(store); assert.equal(done.status, 'completed'); assert.equal(done.calls, 4);
    });
    await t.test('expired deadline prevents a model call or file write', async () => {
      let now = Date.now(); const store = await make({ clock: () => now });
      await store.enqueue('owner', 'late', input({ deadline: now + 1000 })); now += 1001;
      let called = false; const done = await tick(store, async () => { called = true; return executor(); });
      assert.equal(done.status, 'incomplete'); assert.equal(done.reason, 'deadline'); assert.equal(called, false);
    });
    await t.test('budget refuses a call when conservative input reservation cannot fit', async () => {
      const store = await make(); await store.enqueue('owner', 'small', input({ budget: 1000, brief: 'a'.repeat(2000) }));
      let called = false; const done = await tick(store, async () => { called = true; return executor(); });
      assert.equal(done.status, 'incomplete'); assert.equal(done.reason, 'budget'); assert.equal(done.tokensUsed, 0); assert.equal(called, false);
    });
    await t.test('missing provider usage charges the reserved upper estimate', async () => {
      const store = await make(); await store.enqueue('owner', 'missing', input());
      const done = await tick(store, async () => ({ plan: good }));
      assert.equal(done.status, 'completed'); assert.equal(done.usageUnknown, 1); assert.ok(done.tokensUsed > 2000); assert.equal(done.tokensReserved, 0);
    });
    await t.test('provider exceeding remaining budget cannot write or complete', async () => {
      const store = await make(); await store.enqueue('owner', 'over', input());
      const done = await tick(store, async () => ({ plan: good, usage: { input_tokens: 21000, output_tokens: 20 } }));
      assert.equal(done.status, 'incomplete'); assert.equal(done.reason, 'provider-exceeded-budget'); assert.equal(done.artifacts.length, 0);
    });
    await t.test('approval pause persists exact draft and resume does not repeat model work', async () => {
      const store = await make(), task = await store.enqueue('owner', 'approval', input({ writeFiles: [] }));
      let calls = 0; const tracked = async () => { calls++; return executor(); };
      const paused = await tick(store, tracked); assert.equal(paused.status, 'approval'); assert.equal(paused.artifacts.length, 0);
      assert.equal(await tick(store, tracked), null);
      await store.control('owner', task._id, 'approve');
      const restarted = new SleepExecutionStore(store.tasks.dbName ? client.db(store.tasks.dbName) : client.db('sleep' + serial));
      const done = await tick(restarted, tracked); assert.equal(done.status, 'completed'); assert.equal(calls, 1);
    });
    await t.test('concurrent workers generate and commit once', async () => {
      const store = await make(); await store.enqueue('owner', 'once', input());
      let calls = 0; const tracked = async () => { calls++; return executor(); };
      const values = await Promise.all([tick(store, tracked), tick(store, tracked)]);
      assert.equal(values.filter(Boolean).length, 1); assert.equal(calls, 1);
    });
    await t.test('expired claim is fenced and unknown billed call is charged on restart', async () => {
      const store = await make(); const task = await store.enqueue('owner', 'crash', input());
      const stale = await store.claim('dead'); await store.reserve(stale, 1500);
      await store.tasks.updateOne({ _id: task._id }, { $set: { leaseUntil: new Date(0) } });
      const done = await tick(store);
      assert.equal(done.status, 'completed'); assert.equal(done.tokensUsed, 1650); assert.equal(done.usageUnknown, 1); assert.equal(done.calls, 2);
      await assert.rejects(store.finish(stale, 'completed'), LeaseLost);
    });
    await t.test('cancellation during a provider call aborts it and prevents artifacts', async () => {
      const store = await make(), task = await store.enqueue('owner', 'cancel', input());
      let start; const started = new Promise(resolve => { start = resolve; });
      const running = tick(store, async ({ signal }) => { start(); return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); }, { heartbeatMs: 5 });
      await started; await store.control('owner', task._id, 'cancel');
      const done = await running; assert.equal(done.status, 'cancelled'); assert.equal(done.artifacts.length, 0);
      assert.ok(done.tokensUsed > 0); assert.equal(done.tokensReserved, 0); assert.equal(done.usageUnknown, 1);
    });
    await t.test('worker shutdown parks a task and preserves usage accounting', async () => {
      const store = await make(); await store.enqueue('owner', 'shutdown', input());
      const controller = new AbortController();
      const done = await tick(store, async () => { controller.abort(); return new Promise(() => {}); }, { signal: controller.signal });
      assert.equal(done.status, 'paused'); assert.ok(done.tokensUsed > 0); assert.equal(done.tokensReserved, 0);
    });
    await t.test('deadline reached during model call aborts promptly', async () => {
      let now = Date.now(); const store = await make({ clock: () => now });
      await store.enqueue('owner', 'during', input({ deadline: now + 100 }));
      const done = await tick(store, async () => { now += 101; return new Promise(() => {}); }, { heartbeatMs: 5 });
      assert.equal(done.status, 'incomplete'); assert.equal(done.reason, 'deadline'); assert.equal(done.artifacts.length, 0);
    });
    await t.test('uncooperative executor still has a bounded call timeout', async () => {
      const store = await make(); await store.enqueue('owner', 'timeout', input());
      const done = await tick(store, async () => new Promise(() => {}), { callTimeoutMs: 10 });
      assert.equal(done.status, 'incomplete'); assert.ok(done.tokensUsed > 0); assert.equal(done.usageUnknown, 1);
    });
    await t.test('only explicitly retry-safe generation can retry failure', async () => {
      const store = await make(); await store.enqueue('owner', 'retry', input());
      let calls = 0; const retry = async () => { if (++calls === 1) throw Error('temporary provider issue'); return executor(); }; retry.retrySafe = true;
      assert.equal((await tick(store, retry)).status, 'queued');
      const done = await tick(store, retry); assert.equal(done.status, 'completed'); assert.equal(done.usageUnknown, 1); assert.equal(calls, 2);
    });
    await t.test('model cannot create unchecked outputs or traverse directories', async () => {
      const store = await make(); await store.enqueue('owner', 'scope', input());
      const done = await tick(store, async () => ({ ...await executor(), plan: { summary: 'attempt', files: [{ path: '../secret.txt', content: 'bad' }] } }));
      assert.equal(done.status, 'incomplete'); assert.equal(done.artifacts.length, 0);
    });
    await t.test('task keys are idempotent and cannot change permissions on replay', async () => {
      const store = await make(), original = input({ writeFiles: [] });
      const a = await store.enqueue('owner', 'same', original), b = await store.enqueue('owner', 'same', original);
      assert.equal(a._id, b._id);
      await assert.rejects(store.enqueue('owner', 'same', { ...original, writeFiles: ['handoff.md'] }), /another task/);
    });
    await t.test('HTTP task, approval, artifact and cancellation routes enforce ownership', async () => {
      const store = await make(), app = createApp({ dataDir: path.join(root, 'api'), serveStatic: false, sleepTasks: store, sleepTaskRoot: root });
      const a = request.agent(app), b = request.agent(app);
      const queued = await a.post('/api/sleep/tasks').send({ requestKey: 'api', input: input({ writeFiles: [] }) }).expect(202);
      const id = queued.body.id; assert.equal(queued.body.workspace, undefined); assert.equal(queued.body.leaseToken, undefined);
      await b.get(`/api/sleep/tasks/${id}`).expect(404);
      await b.post(`/api/sleep/tasks/${id}/control`).send({ action: 'cancel' }).expect(404);
      await tick(store);
      const draft = await a.get(`/api/sleep/tasks/${id}`).expect(200); assert.equal(draft.body.status, 'approval');
      await a.post(`/api/sleep/tasks/${id}/control`).send({ action: 'approve' }).expect(200);
      await tick(store);
      const download = await a.get(`/api/sleep/tasks/${id}/artifacts/handoff.md`).expect(200); assert.equal(download.text, good.files[0].content);
      await b.get(`/api/sleep/tasks/${id}/artifacts/handoff.md`).expect(404);
      await a.post(`/api/sleep/tasks/${id}/control`).send({ action: 'resume' }).expect(409);
      const stored = await store.tasks.findOne({ _id: id });
      await fs.writeFile(path.join(taskDirectory(root, stored), stored.artifacts[0].directory, 'handoff.md'), 'tampered');
      await a.get(`/api/sleep/tasks/${id}/artifacts/handoff.md`).expect(409);
    });
    await t.test('provider adapter caps output, preserves usage, and has no tools', async () => {
      let body;
      const run = sleepOpenRouterExecutor({ apiKey: 'test-placeholder', model: 'fixture-model', fetcher: async (_url, options) => {
        body = JSON.parse(options.body); return { ok: true, json: async () => ({ model: 'fixture-model', usage: { prompt_tokens: 80, completion_tokens: 25 }, choices: [{ message: { content: JSON.stringify(good) } }] }) };
      } });
      const value = await run({ task: { workspace: 'w' }, prompt: 'brief', maxOutputTokens: 500, signal: new AbortController().signal });
      assert.equal(body.max_tokens, 500); assert.equal(body.tools, undefined); assert.equal(value.usage.input_tokens, 80); assert.deepEqual(value.plan, good);
    });
  } finally { await client.close(); await mongo.stop(); await fs.rm(root, { recursive: true, force: true }); }
});
