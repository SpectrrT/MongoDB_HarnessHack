import { randomUUID } from 'node:crypto';
import { similarity } from './embed.js';

export const KINDS = ['note', 'correction', 'run_outcome', 'fact'];
export const INDEX = 'memory_vector';

// Agentic memory in Atlas. Every memory carries provenance (source, supportIds)
// and explicit supersession: consolidation never deletes, it marks the older
// record superseded and moves its lineage onto the survivor.
export class MemoryStore {
  // vectorMode 'atlas' uses $vectorSearch. 'local' scans with exact cosine in
  // process and exists only for tests against a plain mongod.
  constructor(db, embed, { vectorMode = process.env.SLEEP_VECTOR_MODE || 'atlas' } = {}) {
    this.db = db;
    this.memories = db.collection('memories');
    this.embed = embed;
    this.vectorMode = vectorMode;
  }
  async initialize() {
    await this.memories.createIndex({ workspace: 1, current: 1, kind: 1, createdAt: 1 });
    await this.memories.createIndex({ workspace: 1, key: 1 }, { unique: true, partialFilterExpression: { key: { $type: 'string' } } });
    if (this.vectorMode === 'atlas') await this.ensureSearchIndex();
  }
  async ensureSearchIndex() {
    try { await this.db.createCollection('memories'); } catch (error) { if (error.codeName !== 'NamespaceExists' && error.code !== 48) throw error; }
    const existing = await this.memories.listSearchIndexes(INDEX).toArray();
    if (existing.length) return existing[0];
    // One index total: free sandbox tiers allow at most three search indexes.
    await this.memories.createSearchIndex({ name: INDEX, type: 'vectorSearch', definition: { fields: [
      { type: 'vector', path: 'embedding', numDimensions: this.embed.dimensions || 1024, similarity: 'cosine' },
      { type: 'filter', path: 'workspace' }, { type: 'filter', path: 'kind' }, { type: 'filter', path: 'current' },
    ] } });
  }
  async remember(workspace, items) {
    const list = Array.isArray(items) ? items : [items];
    const vectors = await this.embed(list.map(m => m.text), 'document');
    const saved = [];
    for (const [i, m] of list.entries()) {
      if (!KINDS.includes(m.kind)) throw new Error('Unknown memory kind.');
      const doc = { _id: randomUUID(), workspace, kind: m.kind, text: m.text, embedding: vectors[i],
        source: m.source || { type: 'user' }, current: true, supersededBy: null, supportIds: [],
        createdAt: m.createdAt || new Date(), ...(m.key ? { key: m.key } : {}), ...(m.meta ? { meta: m.meta } : {}) };
      try { await this.memories.insertOne(doc); saved.push(doc); }
      catch (error) {
        if (error.code !== 11000 || !m.key) throw error;
        saved.push(await this.memories.findOne({ workspace, key: m.key }));
      }
    }
    return Array.isArray(items) ? saved : saved[0];
  }
  async recall(workspace, text, { k = 5, kinds = KINDS, exclude = [], vector } = {}) {
    const queryVector = vector || (await this.embed([text], 'query'))[0];
    const filter = { workspace, current: true, kind: { $in: kinds } };
    if (this.vectorMode === 'atlas') {
      const found = await this.memories.aggregate([
        { $vectorSearch: { index: INDEX, path: 'embedding', queryVector, numCandidates: Math.max(100, k * 20), limit: k + exclude.length, filter } },
        { $project: { embedding: 0, score: { $meta: 'vectorSearchScore' } } },
      ]).toArray();
      return found.filter(m => !exclude.includes(m._id)).slice(0, k);
    }
    const all = await this.memories.find({ ...filter, _id: { $nin: exclude } }).toArray();
    return all.map(({ embedding, ...m }) => ({ ...m, score: similarity(queryVector, embedding) }))
      .sort((a, b) => b.score - a.score).slice(0, k);
  }
  // Newer supersedes older. Guarded so a replayed stage cannot double-merge.
  async supersede(workspace, olderId, newerId) {
    const older = await this.memories.findOneAndUpdate({ _id: olderId, workspace, current: true },
      { $set: { current: false, supersededBy: newerId, consolidatedAt: new Date() } }, { returnDocument: 'after' });
    if (!older) return false;
    await this.memories.updateOne({ _id: newerId, workspace },
      { $addToSet: { supportIds: { $each: [olderId, ...older.supportIds] } }, $set: { consolidatedAt: new Date() } });
    return true;
  }
  get(workspace, id) { return this.memories.findOne({ _id: id, workspace }, { projection: { embedding: 0 } }); }
}
