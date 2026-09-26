import fs from 'node:fs/promises';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { SleepExecutionStore } from '../server/sleep/execution-store.js';
import { sleepExecutionTick, taskDirectory } from '../server/sleep/execution.js';
import { sleepOpenRouterExecutor } from '../server/sleep/execution-provider.js';
import { updateOvernight } from '../shared/overnight.js';

const live = process.argv.includes('--live');
const mode = live ? 'live' : 'scripted';
const root = path.resolve('work/sleep-execution-' + mode);
const evidenceFile = path.resolve('docs/evidence/sleep-execution-' + mode + '.json');
const cases = [
  { title: 'Release handoff', brief: 'Write a local Markdown handoff from these facts: Release blocked. Owner Maya. Next step: security review. Do not invent dates or other facts.',
    path: 'handoff.md', contains: ['Release blocked', 'Owner Maya', 'security review'], json: false, grant: true },
  { title: 'Meeting preparation', brief: 'Write a local Markdown preparation note using exactly these facts: Budget $5000. Meeting Tuesday. Ask for approval. Do not invent attendees or spending decisions.',
    path: 'meeting.md', contains: ['Budget $5000', 'Meeting Tuesday', 'Ask for approval'], json: false, grant: false },
  { title: 'Project state record', brief: 'Create a valid JSON file for the project with status blocked, owner Maya, next_action security review. Use those exact values.',
    path: 'project.json', contains: ['blocked', 'Maya', 'security review'], json: true, grant: true },
];
const mongo = await MongoMemoryServer.create(), client = new MongoClient(mongo.getUri());
await client.connect();
const store = new SleepExecutionStore(client.db('sleep_demo'));
await store.initialize();
const provider = live ? sleepOpenRouterExecutor({ model: process.env.SLEEP_BENCH_MODEL || 'openai/gpt-4.1-mini' }) : async ({ task }) => ({
  plan: { summary: 'Scripted fixture output', files: [{ path: task.input.checks[0].path,
    content: task.input.checks[0].json ? JSON.stringify({ status: 'blocked', owner: 'Maya', next_action: 'security review' }) : task.input.checks[0].contains.join('\n') }] },
  usage: { input_tokens: 100, output_tokens: 50, cost: 0 }, provider: 'scripted-fixture', model: 'fixture',
});
const results = [], baseline = { overnight: [] }, started = performance.now();
try {
  for (const [index, fixture] of cases.entries()) {
    const input = { title: fixture.title, brief: fixture.brief, deadline: Date.now() + 300000, budget: 20000,
      checks: [{ path: fixture.path, contains: fixture.contains, minBytes: 10, json: fixture.json }],
      writeFiles: fixture.grant ? [fixture.path] : [], maxAttempts: 3 };
    updateOvernight(baseline, input, Date.now());
    const created = await store.enqueue('synthetic-evidence', 'case-' + index, input), caseStart = performance.now();
    let task, approvalCount = 0;
    for (let step = 0; step < 8; step++) {
      task = await sleepExecutionTick(store, provider, { root });
      if (task.status === 'approval') {
        approvalCount++;
        const restarted = new SleepExecutionStore(client.db('sleep_demo'));
        await restarted.control('synthetic-evidence', created._id, 'approve');
      } else if (['completed', 'incomplete', 'cancelled'].includes(task.status)) break;
    }
    const artifacts = [];
    for (const artifact of task.artifacts) {
      const content = await fs.readFile(path.join(taskDirectory(root, task), artifact.directory, artifact.path), 'utf8');
      artifacts.push({ path: artifact.path, sha256: artifact.sha256, bytes: artifact.bytes, content });
    }
    results.push({ title: fixture.title, status: task.status, reason: task.reason, checks: task.checkResults,
      model: task.model, provider: task.provider, tokensUsed: task.tokensUsed, tokensReserved: task.tokensReserved,
      usageUnknown: task.usageUnknown, costUSD: task.cost, calls: task.calls, repairs: task.repairs,
      approvalCount, elapsedMs: Math.round(performance.now() - caseStart), artifacts, events: task.events });
  }
  const evidence = { generatedAt: new Date().toISOString(), mode, storage: 'temporary-local-mongodb',
    taskCount: cases.length, baseline: { implementation: 'shared/overnight.js saved briefs, runner unconfigured',
      saved: baseline.overnight.length, completed: baseline.overnight.filter(t => t.status === 'completed').length,
      artifacts: 0, modelCalls: 0, tokensUsed: 0 },
    current: { completed: results.filter(t => t.status === 'completed').length, artifacts: results.flatMap(t => t.artifacts).length,
      modelCalls: results.reduce((sum,t) => sum+t.calls,0), tokensUsed: results.reduce((sum,t) => sum+t.tokensUsed,0),
      costUSD: results.reduce((sum,t) => sum+t.costUSD,0), elapsedMs: Math.round(performance.now()-started),
      approvalPauses: results.reduce((sum,t) => sum+t.approvalCount,0), usageUnknown: results.reduce((sum,t) => sum+t.usageUnknown,0) },
    limitations: ['Three short synthetic drafting tasks, not a quality or long-horizon benchmark.',
      'Temporary local MongoDB validates the driver path, not Atlas deployment.',
      'Exact phrase, size and JSON checks validate only declared criteria, not semantic correctness.',
      'The queue-only baseline has zero usage because it could not execute. No token-saving claim follows.',
      'Approval is programmatically granted for a synthetic task after its draft is persisted.'], results };
  await fs.mkdir(path.dirname(evidenceFile), { recursive: true });
  await fs.writeFile(evidenceFile, JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({ evidenceFile, mode, baseline: evidence.baseline, current: evidence.current },null,2));
  if (evidence.current.completed !== cases.length) process.exitCode = 1;
} finally { await client.close(); await mongo.stop(); }
