// A durable fixture provider. These are simulated effects, never Gmail or Drive calls.
import { createWorld, ToolError } from './world.js';
import { canonicalJson, sha256 } from './util.js';

export async function createPersistentWorld(db, workspace, { worldId = 'demo' } = {}) {
  const worlds = db.collection('fixture_worlds');
  const receipts = db.collection('fixture_effects');
  const fingerprint = sha256(canonicalJson(workspace));
  let local = createWorld(workspace), revision = -1;
  // The default _id index makes concurrent initialization safe.
  try {
    await worlds.updateOne({ _id: worldId }, { $setOnInsert: { fingerprint, revision: 0, snapshot: local.snapshot() } }, { upsert: true });
  } catch (error) { if (error.code !== 11000) throw error; }
  const adopt = doc => {
    if (!doc || doc.fingerprint !== fingerprint) throw new Error('Persisted fixture world does not match this fixture version.');
    if (doc.revision >= revision) { local = createWorld(workspace, doc.snapshot); revision = doc.revision; }
  };
  adopt(await worlds.findOne({ _id: worldId }));
  const transact = async operation => {
    const outcome = await db.withTransaction(async session => {
      const doc = await worlds.findOne({ _id: worldId }, { session });
      if (!doc || doc.fingerprint !== fingerprint) throw new Error('Persisted fixture world does not match this fixture version.');
      const draft = createWorld(workspace, doc.snapshot);
      const result = await operation(draft, session);
      const next = { ...doc, revision: doc.revision + 1, snapshot: draft.snapshot() };
      // A conflicting Mongo transaction retries with the latest provider state.
      await worlds.updateOne({ _id: worldId }, { $set: { revision: next.revision, snapshot: next.snapshot } }, { session });
      return { doc: next, result };
    });
    adopt(outcome.doc);
    return outcome.result;
  };
  return {
    workspace, user: workspace.user, persistence: 'mongo-fixture',
    get state() { return local.state; },
    get executed() { return local.executed; },
    isEffect: name => local.isEffect(name),
    snapshot: () => local.snapshot(),
    // Recovery at startup uses the restored provider state. Execute also checks the
    // durable receipt if another process committed after this process's last read.
    findEffect: key => local.findEffect(key),
    async call(name, args) {
      adopt(await worlds.findOne({ _id: worldId }));
      return local.call(name, args);
    },
    async execute(name, args = {}, meta = {}) {
      if (typeof meta.effectKey !== 'string' || !meta.effectKey || typeof meta.runId !== 'string' || !meta.runId)
        throw new ToolError('Persistent fixture effects require an effect key and run ID.');
      const key = sha256(canonicalJson([worldId, meta.effectKey]));
      const inputHash = sha256(canonicalJson({ name, args, runId: meta.runId }));
      return transact(async (draft, session) => {
        const previous = await receipts.findOne({ _id: key }, { session });
        if (previous) {
          if (previous.inputHash !== inputHash) throw new ToolError('Effect key was reused with different arguments.');
          return previous.result;
        }
        const result = await draft.execute(name, args, meta);
        await receipts.insertOne({ _id: key, worldId, effectKey: meta.effectKey, inputHash, tool: name,
          runId: meta.runId, result }, { session });
        return result;
      });
    },
    async restoreFiles(ids) {
      const selected = new Set(ids);
      return transact(async draft => {
        for (const file of draft.state.files) if (selected.has(file.id)) file.trashed = false;
        draft.state.trash = draft.state.trash.filter(t => !selected.has(t.id));
      });
    },
  };
}
