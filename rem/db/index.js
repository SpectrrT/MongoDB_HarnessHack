import { COLLECTIONS, INDEXES, SEARCH_INDEXES, TIME_SERIES } from "./schema.js";

export { createMemoryDb } from "./memory.js";
export { COLLECTIONS, INDEXES, SEARCH_INDEXES, TIME_SERIES, VECTOR_FIELDS } from "./schema.js";

// Memory: undo log + buffered change events. Atlas: client session transaction (see mongo.js).
export function withTransaction(db, fn) {
  return db.withTransaction(fn);
}

export async function ensureIndexes(db, { search = true } = {}) {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );
  for (const name of Object.values(COLLECTIONS))
    if (!existing.has(name)) await db.createCollection(name, TIME_SERIES[name] || {});
  for (const [name, specs] of Object.entries(INDEXES))
    for (const { key, ...options } of specs) await db.collection(name).createIndex(key, options);
  if (!search) return;
  for (const [name, specs] of Object.entries(SEARCH_INDEXES)) {
    const collection = db.collection(name);
    const present = new Set((await collection.listSearchIndexes().toArray()).map((i) => i.name));
    for (const spec of specs) if (!present.has(spec.name)) await collection.createSearchIndex(spec);
  }
}
