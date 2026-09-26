// In-process stand-in for the MongoDB Node driver: same call shapes, so tomorrow's Atlas swap is
// createMongoDb() instead of createMemoryDb(). Reads can see uncommitted transaction writes.
import { EventEmitter } from "node:events";
import { randomBytes } from "node:crypto";
import { canonicalJson } from "../util.js";
import {
  MongoServerError,
  applyUpdate,
  clone,
  getPath,
  matches,
  project,
  runPipeline,
  sortDocs,
  upsertBase,
} from "./query.js";

export { MongoServerError };
const idKey = (id) => canonicalJson(id);

class MemoryCursor {
  constructor(producer, { sort, limit, skip, projection } = {}) {
    this.producer = producer;
    this.options = { sort, limit, skip, projection };
    this.mappers = [];
  }
  sort(spec) {
    this.options.sort = spec;
    return this;
  }
  limit(n) {
    this.options.limit = n;
    return this;
  }
  skip(n) {
    this.options.skip = n;
    return this;
  }
  project(spec) {
    this.options.projection = spec;
    return this;
  }
  map(fn) {
    this.mappers.push(fn);
    return this;
  }
  async toArray() {
    const { sort, limit, skip, projection } = this.options;
    let docs = await this.producer();
    if (sort) docs = sortDocs(docs, sort);
    if (skip) docs = docs.slice(skip);
    if (limit) docs = docs.slice(0, limit);
    if (projection) docs = docs.map((d) => project(d, projection));
    for (const fn of this.mappers) docs = docs.map(fn);
    return docs;
  }
  async next() {
    this.buffer ??= await this.toArray();
    return this.buffer.shift() ?? null;
  }
  async hasNext() {
    this.buffer ??= await this.toArray();
    return this.buffer.length > 0;
  }
  async close() {}
  async *[Symbol.asyncIterator]() {
    for (const doc of await this.toArray()) yield doc;
  }
}

class MemoryChangeStream extends EventEmitter {
  constructor(registry, pipeline = [], options = {}) {
    super();
    this.registry = registry;
    this.pipeline = pipeline;
    this.options = options;
    this.closed = false;
    this.buffer = [];
    this.waiters = [];
    registry.add(this);
  }
  push(event) {
    if (this.closed) return;
    if (this.pipeline.some((stage) => stage.$match && !matches(event, stage.$match))) return;
    if (
      event.operationType === "update" &&
      !["updateLookup", "required", "whenAvailable"].includes(this.options.fullDocument)
    )
      delete event.fullDocument;
    queueMicrotask(() => {
      if (this.closed) return;
      if (this.waiters.length) this.waiters.shift()(event);
      else if (this.iterating || !this.listenerCount("change")) this.buffer.push(event);
      try {
        this.emit("change", event);
      } catch (error) {
        if (this.listenerCount("error")) this.emit("error", error);
        else console.error("change stream listener failed:", error);
      }
    });
  }
  async next() {
    this.iterating = true;
    if (this.buffer.length) return this.buffer.shift();
    if (this.closed) return null;
    return new Promise((resolve) => this.waiters.push(resolve));
  }
  async tryNext() {
    this.iterating = true;
    return this.buffer.shift() ?? null;
  }
  [Symbol.asyncIterator]() {
    return {
      next: async () => {
        const value = await this.next();
        return value === null ? { value: undefined, done: true } : { value, done: false };
      },
      return: async () => {
        await this.close();
        return { value: undefined, done: true };
      },
    };
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    this.registry.delete(this);
    for (const resolve of this.waiters.splice(0)) resolve(null);
    this.emit("close");
  }
}

class MemorySession {
  constructor(db) {
    this.db = db;
    this.id = { id: ++db.sessionSeq };
    this.active = false;
    this.undo = [];
    this.events = [];
    this.hasEnded = false;
  }
  inTransaction() {
    return this.active;
  }
  startTransaction() {
    if (this.active) throw new MongoServerError("Transaction already in progress", { code: 256 });
    this.active = true;
    this.undo = [];
    this.events = [];
  }
  async commitTransaction() {
    this.active = false;
    const events = this.events;
    this.undo = [];
    this.events = [];
    for (const [collection, event] of events) this.db.dispatch(collection, event);
  }
  async abortTransaction() {
    this.active = false;
    for (const restore of this.undo.reverse()) restore();
    this.undo = [];
    this.events = [];
  }
  async withTransaction(fn) {
    this.startTransaction();
    try {
      const result = await fn(this);
      await this.commitTransaction();
      return result;
    } catch (error) {
      if (this.active) await this.abortTransaction();
      throw error;
    }
  }
  async endSession() {
    if (this.active) await this.abortTransaction();
    this.hasEnded = true;
  }
}

class MemoryCollection {
  constructor(db, name) {
    this.db = db;
    this.collectionName = name;
    this.docs = new Map();
    this.indexSpecs = [{ v: 2, key: { _id: 1 }, name: "_id_" }];
    this.searchIndexSpecs = [];
    this.streams = new Set();
    this.options = {};
  }
  get namespace() {
    return `${this.db.databaseName}.${this.collectionName}`;
  }
  scan(filter) {
    const out = [];
    for (const [key, doc] of this.docs) if (matches(doc, filter)) out.push([key, doc]);
    return out;
  }
  first(filter, sort) {
    const found = this.scan(filter);
    if (!sort || found.length < 2) return found[0];
    const order = sortDocs(
      found.map(([, doc]) => doc),
      sort,
    );
    return found.find(([, doc]) => doc === order[0]);
  }
  track(session, key, before) {
    if (!session?.inTransaction?.()) return;
    session.undo.push(() => (before === undefined ? this.docs.delete(key) : this.docs.set(key, before)));
  }
  emit(event, session) {
    if (session?.inTransaction?.()) session.events.push([this, event]);
    else this.db.dispatch(this, event);
  }
  duplicate(index, doc) {
    const keyValue = Object.fromEntries(Object.keys(index.key).map((f) => [f, getPath(doc, f) ?? null]));
    return new MongoServerError(
      `E11000 duplicate key error collection: ${this.namespace} index: ${index.name} dup key: ${JSON.stringify(keyValue)}`,
      { code: 11000, codeName: "DuplicateKey", keyPattern: index.key, keyValue },
    );
  }
  checkUnique(doc, ownKey) {
    for (const index of this.indexSpecs) {
      if (!index.unique) continue;
      if (index.partialFilterExpression && !matches(doc, index.partialFilterExpression)) continue;
      const fields = Object.keys(index.key);
      const value = canonicalJson(fields.map((f) => getPath(doc, f) ?? null));
      for (const [key, other] of this.docs) {
        if (key === ownKey) continue;
        if (index.partialFilterExpression && !matches(other, index.partialFilterExpression)) continue;
        if (canonicalJson(fields.map((f) => getPath(other, f) ?? null)) === value)
          throw this.duplicate(index, doc);
      }
    }
  }
  insertStored(stored, session) {
    const key = idKey(stored._id);
    if (this.docs.has(key)) throw this.duplicate(this.indexSpecs[0], stored);
    this.checkUnique(stored, null);
    this.docs.set(key, stored);
    this.track(session, key, undefined);
    this.emit(
      { operationType: "insert", documentKey: { _id: clone(stored._id) }, fullDocument: clone(stored) },
      session,
    );
  }
  replaceStored(key, current, next, session, description) {
    if (canonicalJson(next) === canonicalJson(current)) return false;
    this.checkUnique(next, key);
    this.docs.set(key, next);
    this.track(session, key, current);
    this.emit(
      description
        ? {
            operationType: "update",
            documentKey: { _id: clone(next._id) },
            updateDescription: description,
            fullDocument: clone(next),
          }
        : { operationType: "replace", documentKey: { _id: clone(next._id) }, fullDocument: clone(next) },
      session,
    );
    return true;
  }
  removeStored(key, doc, session) {
    this.docs.delete(key);
    this.track(session, key, doc);
    this.emit({ operationType: "delete", documentKey: { _id: clone(doc._id) } }, session);
  }

  async insertOne(doc, { session } = {}) {
    if (doc._id === undefined) doc._id = this.db.newId();
    this.insertStored(clone(doc), session);
    return { acknowledged: true, insertedId: doc._id };
  }
  async insertMany(docs, { session } = {}) {
    const insertedIds = {};
    for (const [i, doc] of docs.entries()) insertedIds[i] = (await this.insertOne(doc, { session })).insertedId;
    return { acknowledged: true, insertedCount: docs.length, insertedIds };
  }
  async findOne(filter = {}, { sort, projection } = {}) {
    const hit = this.first(filter, sort);
    return hit ? project(clone(hit[1]), projection) : null;
  }
  find(filter = {}, options = {}) {
    return new MemoryCursor(async () => this.scan(filter).map(([, doc]) => clone(doc)), options);
  }
  async countDocuments(filter = {}) {
    return this.scan(filter).length;
  }
  async estimatedDocumentCount() {
    return this.docs.size;
  }
  async distinct(field, filter = {}) {
    const seen = new Map();
    for (const [, doc] of this.scan(filter))
      for (const v of [getPath(doc, field)].flat()) if (v !== undefined) seen.set(canonicalJson(v), v);
    return [...seen.values()].map(clone);
  }
  upsert(filter, update, session, replacement) {
    const base = replacement ? { ...upsertBase(filter), ...clone(replacement) } : upsertBase(filter);
    if (!replacement) applyUpdate(base, update, { inserting: true });
    if (base._id === undefined) base._id = this.db.newId();
    this.insertStored(base, session);
    return base._id;
  }
  async updateOne(filter, update, { upsert = false, session, sort } = {}) {
    const hit = this.first(filter, sort);
    if (!hit) {
      if (!upsert) return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null };
      const upsertedId = this.upsert(filter, update, session);
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId };
    }
    const [key, current] = hit,
      next = clone(current);
    const description = applyUpdate(next, update);
    const modified = this.replaceStored(key, current, next, session, description);
    return { acknowledged: true, matchedCount: 1, modifiedCount: modified ? 1 : 0, upsertedCount: 0, upsertedId: null };
  }
  async updateMany(filter, update, { upsert = false, session } = {}) {
    const hits = this.scan(filter);
    if (!hits.length && upsert) {
      const upsertedId = this.upsert(filter, update, session);
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId };
    }
    let modifiedCount = 0;
    for (const [key, current] of hits) {
      const next = clone(current);
      const description = applyUpdate(next, update);
      if (this.replaceStored(key, current, next, session, description)) modifiedCount++;
    }
    return { acknowledged: true, matchedCount: hits.length, modifiedCount, upsertedCount: 0, upsertedId: null };
  }
  async replaceOne(filter, replacement, { upsert = false, session } = {}) {
    const hit = this.first(filter);
    if (!hit) {
      if (!upsert) return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null };
      const upsertedId = this.upsert(filter, null, session, replacement);
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId };
    }
    const [key, current] = hit;
    const next = { ...clone(replacement), _id: current._id };
    const modified = this.replaceStored(key, current, next, session, null);
    return { acknowledged: true, matchedCount: 1, modifiedCount: modified ? 1 : 0, upsertedCount: 0, upsertedId: null };
  }
  async findOneAndUpdate(filter, update, { upsert = false, session, sort, projection, returnDocument = "before" } = {}) {
    const hit = this.first(filter, sort);
    if (!hit) {
      if (!upsert) return null;
      const id = this.upsert(filter, update, session);
      return returnDocument === "after" ? project(clone(this.docs.get(idKey(id))), projection) : null;
    }
    const [key, current] = hit,
      next = clone(current);
    this.replaceStored(key, current, next, session, applyUpdate(next, update));
    return project(clone(returnDocument === "after" ? next : current), projection);
  }
  async findOneAndDelete(filter, { session, sort, projection } = {}) {
    const hit = this.first(filter, sort);
    if (!hit) return null;
    this.removeStored(hit[0], hit[1], session);
    return project(clone(hit[1]), projection);
  }
  async deleteOne(filter = {}, { session } = {}) {
    const hit = this.first(filter);
    if (hit) this.removeStored(hit[0], hit[1], session);
    return { acknowledged: true, deletedCount: hit ? 1 : 0 };
  }
  async deleteMany(filter = {}, { session } = {}) {
    const hits = this.scan(filter);
    for (const [key, doc] of hits) this.removeStored(key, doc, session);
    return { acknowledged: true, deletedCount: hits.length };
  }
  aggregate(pipeline = []) {
    return new MemoryCursor(async () =>
      runPipeline(
        [...this.docs.values()].map(clone),
        pipeline,
        (name) => [...this.db.collection(name).docs.values()].map(clone),
      ),
    );
  }
  async createIndex(key, options = {}) {
    const name = options.name || Object.entries(key).map(([k, v]) => `${k}_${v}`).join("_");
    if (this.indexSpecs.some((i) => i.name === name)) return name;
    const spec = { v: 2, key: { ...key }, name, ...options };
    if (spec.unique) {
      const seen = new Set();
      for (const doc of this.docs.values()) {
        if (spec.partialFilterExpression && !matches(doc, spec.partialFilterExpression)) continue;
        const value = canonicalJson(Object.keys(key).map((f) => getPath(doc, f) ?? null));
        if (seen.has(value)) throw this.duplicate(spec, doc);
        seen.add(value);
      }
    }
    this.indexSpecs.push(spec);
    return name;
  }
  async createIndexes(specs) {
    const names = [];
    for (const { key, ...options } of specs) names.push(await this.createIndex(key, options));
    return names;
  }
  async indexes() {
    return clone(this.indexSpecs);
  }
  listIndexes() {
    return new MemoryCursor(async () => clone(this.indexSpecs));
  }
  async dropIndex(name) {
    this.indexSpecs = this.indexSpecs.filter((i) => i.name !== name || name === "_id_");
  }
  async createSearchIndex(description) {
    this.searchIndexSpecs = this.searchIndexSpecs.filter((i) => i.name !== description.name);
    this.searchIndexSpecs.push(clone(description));
    return description.name;
  }
  async createSearchIndexes(descriptions) {
    const names = [];
    for (const d of descriptions) names.push(await this.createSearchIndex(d));
    return names;
  }
  listSearchIndexes() {
    return new MemoryCursor(async () =>
      this.searchIndexSpecs.map((i) => ({ ...clone(i), status: "READY", queryable: true, latestDefinition: clone(i.definition) })),
    );
  }
  watch(pipeline = [], options = {}) {
    return new MemoryChangeStream(this.streams, pipeline, options);
  }
  async drop() {
    for (const stream of [...this.streams]) await stream.close();
    this.db.collections.delete(this.collectionName);
    return true;
  }
}

class MemoryDb {
  constructor(name) {
    this.kind = "memory";
    this.databaseName = name;
    this.collections = new Map();
    this.streams = new Set();
    this.idSeq = 0;
    this.idPrefix = randomBytes(8).toString("hex");
    this.eventSeq = 0;
    this.sessionSeq = 0;
  }
  newId() {
    // A reset must not make old provenance ids point at new, unrelated records.
    return this.idPrefix + (++this.idSeq).toString(16).padStart(8, "0");
  }
  toId(id) {
    return String(id);
  }
  collection(name) {
    let c = this.collections.get(name);
    if (!c) this.collections.set(name, (c = new MemoryCollection(this, name)));
    return c;
  }
  async createCollection(name, options = {}) {
    const c = this.collection(name);
    c.options = clone(options);
    return c;
  }
  listCollections(filter = {}) {
    return new MemoryCursor(async () =>
      [...this.collections.values()]
        .map((c) => ({ name: c.collectionName, type: c.options.timeseries ? "timeseries" : "collection", options: clone(c.options) }))
        .filter((c) => matches(c, filter)),
    );
  }
  dispatch(collection, event) {
    const full = {
      _id: { _data: String(++this.eventSeq).padStart(12, "0") },
      ...event,
      ns: { db: this.databaseName, coll: collection.collectionName },
    };
    for (const stream of [...collection.streams, ...this.streams]) stream.push(clone(full));
  }
  watch(pipeline = [], options = {}) {
    return new MemoryChangeStream(this.streams, pipeline, options);
  }
  startSession() {
    return new MemorySession(this);
  }
  async withTransaction(fn) {
    const session = this.startSession();
    try {
      return await session.withTransaction(fn);
    } finally {
      await session.endSession();
    }
  }
  async sweepExpired(now = Date.now()) {
    let removed = 0;
    for (const collection of this.collections.values()) {
      for (const index of collection.indexSpecs) {
        if (index.expireAfterSeconds === undefined) continue;
        const field = Object.keys(index.key)[0];
        for (const [key, doc] of [...collection.docs]) {
          const dates = [getPath(doc, field)].flat().filter((v) => v instanceof Date);
          if (!dates.length) continue;
          if (Math.min(...dates.map((d) => d.getTime())) + index.expireAfterSeconds * 1000 <= now) {
            collection.removeStored(key, doc);
            removed++;
          }
        }
      }
    }
    return removed;
  }
  async dropDatabase() {
    for (const collection of [...this.collections.values()]) await collection.drop();
    return true;
  }
  async close() {
    for (const stream of [...this.streams]) await stream.close();
    for (const collection of this.collections.values())
      for (const stream of [...collection.streams]) await stream.close();
  }
}

export function createMemoryDb({ name = "rem" } = {}) {
  return new MemoryDb(name);
}
