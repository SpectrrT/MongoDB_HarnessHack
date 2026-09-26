import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { executionInput } from './execution-store.js';
import { sleepExecutionTick, taskDirectory } from './execution.js';

export const IDLE_SCOPE = 'isolated-local-drafts';
const terminal = new Set(['completed', 'incomplete', 'cancelled', 'paused', 'approval']);

// This is an executor for the existing idle-review lifecycle, not another scheduler.
export function createIdleExecution({ store, executor, root, derive, clock = Date.now, tickOptions = {} }) {
  const active = new Map(), interrupted = new Set();
  const find = (owner, jobId) => store.tasks.findOne({ workspace: owner, origin: 'idle', $or:[{requestKey:'idle:' + jobId},{'idle.jobIds':jobId}] });
  const configuration=async owner=>executor.configuration?executor.configuration(owner):{configured:true,provider:'injected',model:'fixture'};
  async function getJob(owner, jobId) {
    const task = await find(owner, jobId);
    if (!task) return null;
    const running = ['queued', 'running'].includes(task.status);
    const status = running ? 'running' : task.status === 'completed' ? 'completed' : 'paused';
    const artifacts = task.artifacts.map((a, index) => ({ id: String(index), name: a.path, size: a.bytes }));
    const text = [task.status === 'completed' ? 'Sleep produced a local candidate draft.' : 'Sleep paused before verifying the candidate.',
      'Goal: ' + task.input.title,
      'Hypotheses are unverified: ' + JSON.stringify(task.idle.hypotheses || []).slice(0,1600),
      'File checks: ' + (task.checkResults.length ? task.checkResults.map(c => c.path + ': ' + (c.passed ? 'passed' : c.failed.join(', '))).join('; ') : 'not completed'),
      ...task.checkResults.filter(c=>c.verification).map(c=>'Offline counter execution: '+JSON.stringify({passed:c.passed,observedStates:c.verification.observed?.map(state=>state.actual),checks:c.verification.checks})),
      'These checks verify the declared file criteria, not semantic correctness or completion of the broader goal.',
      'Outcome: ' + (task.reason || task.status),
      'Unfinished work: review the candidate and verify it against the original goal before applying it.',
    ].join('\n\n');
    return { id: jobId, owner, status, background: true, createdAt: +task.createdAt,
      events: task.events.map((event,index) => ({ id: 'idle-' + index, type: 'sleep', label: event.type, status: 'completed' })),
      approvals: [], usage: { total_tokens: task.tokensUsed, unknown_reservations: task.usageUnknown },
      ...(running ? {} : { result: { text, model: task.model, usage: { total_tokens: task.tokensUsed, unknown_reservations: task.usageUnknown },
        agent: { jobId, artifacts, events: [], scope: IDLE_SCOPE },
        sleep: { taskId: task._id, outcome: task.status, hypotheses: task.idle.hypotheses, sourceMessageIds: task.idle.sourceMessageIds,
          verification:task.checkResults.filter(c=>c.verification).map(c=>c.verification) } } }) };
  }
  async function launch(owner, payload) {
    if (payload.scope !== IDLE_SCOPE) throw Error('Sleep needs explicit permission for isolated local drafts.');
    const key = owner + ':' + payload.requestId;
    if (interrupted.has(key)) return { skipped: true, reason: 'User activity paused Sleep.' };
    let task = await find(owner, payload.requestId);
    if (!task) {
      if(!(await configuration(owner)).configured)throw Error('Sleep requires its OpenRouter connection. The selected chat model is separate.');
      if (!Number.isSafeInteger(payload.budget) || payload.budget < 1000 || payload.budget > 20000 ||
        !Number.isFinite(payload.deadline) || payload.deadline <= clock() || payload.deadline > clock() + 3600000) throw Error('Sleep limits are missing or expired.');
      const prior = await store.tasks.find({ workspace: owner, origin: 'idle', 'idle.conversationId': payload.conversationId }).limit(100).toArray();
      const priorAttempts = prior.filter(t=>t.status!=='paused').map(t => ({ id: t.idle.candidateId, candidateId: t.idle.candidateId, goalKey: t.idle.goalKey,
        status: t.status === 'incomplete' ? 'failed' : t.status === 'paused' || t.status === 'approval' ? 'queued' : t.status }));
      const candidate = await derive({ messages: payload.messages, conversationId: payload.conversationId,
        generation: payload.generation, priorAttempts });
      if (interrupted.has(key)) return { skipped: true, reason: 'User activity paused Sleep.' };
      if (!candidate) return { skipped: true, reason: 'No supported unfinished local draft remains in this conversation.' };
      const input = executionInput.parse({ title: candidate.title, brief: candidate.brief,
        deadline: payload.deadline, budget: payload.budget, checks: candidate.checks,
        // Candidate recommendations cannot grant authority. Persisted toggle consent
        // authorizes only these checked filenames in a new isolated task folder.
        writeFiles: candidate.checks.map(check => check.path), maxAttempts: 3 });
      if(candidate.browserCheck==='counter'&&payload.offlinePrototypeChecks===true)input.browserCheck='counter';
      const paused=prior.find(t=>t.status==='paused'&&t.idle.goalKey===candidate.goalKey);
      if(paused){
        const sameDraft=paused.input.brief===input.brief&&JSON.stringify(paused.input.checks)===JSON.stringify(input.checks)&&paused.input.browserCheck===input.browserCheck;
        const remainingCalls=Math.max(0,paused.input.maxAttempts-paused.calls);
        if(!remainingCalls)throw Error('This candidate exhausted its generation limit. Assign a new scoped task.');
        const renewed={...input,budget:Math.min(1000000,paused.tokensUsed+payload.budget)};
        task=await store.tasks.findOneAndUpdate({_id:paused._id,workspace:owner,status:'paused'},{$set:{input:renewed,status:'queued',leaseUntil:new Date(0),stalledAttempts:0,
          grants:input.writeFiles,pending:sameDraft?paused.pending:null,lastDraft:paused.lastDraft||paused.pending||null,
          'idle.generation':payload.generation,'idle.provenance':candidate.provenance||[],'idle.sourceMessageIds':candidate.sourceMessageIds||[]},
          $addToSet:{'idle.jobIds':payload.requestId},$push:{'idle.windows':{jobId:payload.requestId,budget:payload.budget,deadline:payload.deadline,startingTokens:paused.tokensUsed}}},
          {returnDocument:'after',includeResultMetadata:false});
        if(!task)throw Error('The paused candidate changed. Retry the next idle pass.');
      }else task = await store.enqueue(owner, 'idle:' + payload.requestId, input, { origin: 'idle', idle: {
        conversationId: payload.conversationId, candidateId: candidate.id, goalKey: candidate.goalKey,
        generation: payload.generation, scope: IDLE_SCOPE, hypotheses: candidate.hypotheses || [],
        sourceMessageIds: candidate.sourceMessageIds || [], provenance: candidate.provenance || [],
        unfinishedWork: candidate.objective || candidate.title,
        jobIds:[payload.requestId],windows:[{jobId:payload.requestId,budget:payload.budget,deadline:payload.deadline,startingTokens:0}],
      } });
    }
    if (interrupted.has(key)) { await pause(owner, payload.requestId); return { skipped: true, reason: 'User activity paused Sleep.' }; }
    if(!terminal.has(task.status)&&!(await configuration(owner)).configured){
      await store.control(owner,task._id,'pause');
      throw Error('Sleep paused because its OpenRouter connection is unavailable. No new model call was made.');
    }
    if (!terminal.has(task.status) && !active.has(key)) {
      const controller = new AbortController();
      const work = { controller }; active.set(key, work);
      work.done = (async () => {
        // No second timer. The existing lifecycle starts or recovers this bounded pass.
        for (let step = 0; step < 4 && !controller.signal.aborted; step++) {
          const result = await sleepExecutionTick(store, executor, { ...tickOptions, root, signal: controller.signal,
            taskId: task._id, workspace: owner });
          if (!result || terminal.has(result.status)) break;
        }
      })().catch(() => {}).finally(() => active.delete(key));
    }
    return { job: await getJob(owner, payload.requestId), created: true };
  }
  async function pause(owner, jobId) {
    interrupted.add(owner + ':' + jobId);
    const task = await find(owner, jobId);
    if (task && !terminal.has(task.status)) await store.control(owner, task._id, 'pause');
    active.get(owner + ':' + jobId)?.controller.abort(Error('User activity paused Sleep.'));
  }
  async function getArtifact(owner, jobId, artifactId) {
    const task = await find(owner, jobId), artifact = task?.artifacts[Number(artifactId)];
    if (!artifact || String(Number(artifactId)) !== artifactId) return null;
    const content = await fs.readFile(path.join(taskDirectory(root, task), artifact.directory, artifact.path));
    if (createHash('sha256').update(content).digest('hex') !== artifact.sha256) throw Error('The candidate changed after verification.');
    return { content, name: artifact.path };
  }
  async function settle() { await Promise.all([...active.values()].map(work => work.done)); }
  return { launch, getJob, pause, getArtifact, settle, configuration, configured: !!store && !!executor };
}
