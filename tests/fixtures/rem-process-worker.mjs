import { createMongoDb } from '../../rem/db/mongo.js';
import { createPersistentWorld } from '../../rem/persistent-world.js';
import { LIVE_WORKSPACE } from '../../rem/fixtures.js';
import { createAgent } from '../../rem/agent.js';
import { currentHarness } from '../../rem/harness.js';
import { createScriptedModel } from '../../rem/model.js';
import { createLocalEmbedder } from '../../rem/embed.js';
import { createClock } from '../../rem/util.js';
import { describeTask, taskParams } from '../../rem/tasks.js';

process.once('message', async ({ uri, mode, runId }) => {
  const db = await createMongoDb({ uri, dbName: 'rem_process_restart' });
  db.atlasSearch = false;
  try {
    const world = await createPersistentWorld(db, LIVE_WORKSPACE);
    const agent = createAgent({ db, world, model: createScriptedModel(), embedder: createLocalEmbedder(),
      clock: createClock(), harness: async () => currentHarness(db), episodes: false,
      chaos: mode === 'crash' ? { expireNow: () => false, point: async point => {
        if (point === 'after-effect') {
          process.send({ type: 'effect-persisted' });
          await new Promise(() => {});
        }
      } } : null,
    });
    if (mode === 'crash') {
      const task = describeTask('weekly-brief', taskParams('weekly-brief', 'W36'));
      await agent.startRun({ ...task, week: 'W36', runId });
      throw new Error('Crash checkpoint was not reached.');
    }
    const limit = Date.now() + 40000;
    while (Date.now() < limit) {
      const run = await agent.resumeRun(runId);
      if (['done', 'incomplete', 'failed'].includes(run.status)) {
        process.send({ type: 'terminal', status: run.status, sent: world.state.sent.length });
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('REM process recovery timed out.');
  } catch (error) {
    process.send({ type: 'error', name: error.name, message: error.message });
    process.exitCode = 1;
  } finally { await db.close(); process.disconnect(); }
});
