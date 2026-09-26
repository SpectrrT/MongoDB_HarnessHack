// Hybrid search = vector ranking + keyword ranking fused by reciprocal rank fusion (k = 60):
// the app-side equivalent of Atlas $rankFusion.
import { cosine, tokenize } from "./embed.js";

export const RRF_K = 60;

export async function vectorOf(embedder, text) {
  return (await embedder.embed([text]))[0];
}

export function bm25Rank(docs, query, textOf) {
  const q = [...new Set(tokenize(query))];
  const toks = docs.map((d) => tokenize(textOf(d)));
  const avg = toks.reduce((s, t) => s + t.length, 0) / (toks.length || 1) || 1;
  const df = new Map(q.map((term) => [term, toks.filter((t) => t.includes(term)).length]));
  const N = docs.length;
  return docs
    .map((doc, i) => {
      let score = 0;
      for (const term of q) {
        const tf = toks[i].filter((t) => t === term).length;
        if (!tf) continue;
        const idf = Math.log(1 + (N - df.get(term) + 0.5) / (df.get(term) + 0.5));
        score += (idf * tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (toks[i].length / avg)));
      }
      return { doc, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function hybridRank(docs, { query, queryVector, textOf, vectorOf: vec, k = 5, minVector = 0 }) {
  const vectorHits = docs
    .map((doc) => ({ doc, score: cosine(queryVector, vec(doc)) }))
    .filter((x) => x.score > minVector)
    .sort((a, b) => b.score - a.score);
  const keywordHits = bm25Rank(docs, query, textOf);
  const fused = new Map();
  vectorHits.forEach(({ doc, score }, rank) =>
    fused.set(doc, { doc, rrf: 1 / (RRF_K + rank + 1), vectorScore: score, vectorRank: rank + 1 }),
  );
  keywordHits.forEach(({ doc, score }, rank) => {
    const hit = fused.get(doc) || { doc, rrf: 0, vectorScore: cosine(queryVector, vec(doc)) };
    hit.rrf += 1 / (RRF_K + rank + 1);
    hit.keywordScore = score;
    hit.keywordRank = rank + 1;
    fused.set(doc, hit);
  });
  return [...fused.values()].sort((a, b) => b.rrf - a.rrf || b.vectorScore - a.vectorScore).slice(0, k);
}

// Atlas: the same query as one aggregation. Verified on the event sandbox (8.0.32, autoEmbed voyage-4):
// $rankFusion runs natively and both query shapes ({ text } and a plain string) are accepted.
// vectorMode "explicit" queries the stored `embedding` field with the app's own vector instead.
export function vectorLeg({ query, queryVector, vectorMode = "auto", vectorIndex, path, filter = {}, k = 5 }) {
  const shape = vectorMode === "explicit" ? { path: "embedding", queryVector } : { path, query: { text: query } };
  return [{ $vectorSearch: { index: vectorIndex, ...shape, numCandidates: k * 20, limit: k * 4, filter } }];
}

export function rankFusionPipeline({ query, queryVector, vectorMode = "auto", vectorIndex, textIndex, path, filter = {}, k = 5 }) {
  return [
    {
      $rankFusion: {
        input: {
          pipelines: {
            vector: vectorLeg({ query, queryVector, vectorMode, vectorIndex, path, filter, k }),
            keyword: [
              { $search: { index: textIndex, text: { query, path } } },
              { $match: filter },
              { $limit: k * 4 },
            ],
          },
        },
        combination: { weights: { vector: 1, keyword: 1 } },
        scoreDetails: true,
      },
    },
    { $limit: k },
    { $addFields: { score: { $meta: "score" } } },
  ];
}

// Filter paths each vector index declares; anything else is applied after retrieval.
export const VECTOR_FILTER_PATHS = Object.freeze({
  episodes: ["kind", "day", "split", "night", "tags"],
  memories: ["active"],
  skills: ["status"],
  edits: ["type"],
});
const splitFilter = (name, filter) => {
  const allowed = new Set(VECTOR_FILTER_PATHS[name] || []);
  const indexed = {},
    post = {};
  for (const [k, v] of Object.entries(filter)) (allowed.has(k) ? indexed : post)[k] = v;
  return { indexed, post };
};
const RRF_MAX = 2 / (RRF_K + 1);
const DAY = 86400000;
const ageFactor = (doc, halfLife, now) => {
  const at = doc.recency || doc.createdAt;
  return halfLife && at && now ? 0.5 ** (Math.max(0, now - new Date(at).getTime()) / DAY / halfLife) : 1;
};

// Recall policy applied after retrieval: kinds, recency decay, minimum score, top k.
function applyRecall(hits, recall, now) {
  if (!recall) return hits;
  return hits
    .filter((h) => !recall.kinds || recall.kinds.includes(h.doc.kind))
    .map((h) => {
      const decay = ageFactor(h.doc, recall.recencyHalfLifeDays, now);
      return { ...h, decay, score: h.score * decay };
    })
    .filter((h) => h.score >= recall.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, recall.k);
}

// Search over a collection. On Atlas (db.atlasSearch) the legs run in the database: $rankFusion for
// hybrid, $vectorSearch alone for vector, $search alone for lexical. Elsewhere, the same fusion in
// process over documents that carry an explicit `embedding`. `recall` (a genome recall policy)
// picks the mode and applies kinds, recency decay, minScore and k; without it, hybrid top-k.
export async function searchCollection(db, name, { query, embedder, filter = {}, k = 5, textField = "text", recall = null, now = null }) {
  const mode = recall?.mode || "hybrid";
  const depth = recall ? Math.max(recall.k * 4, 20) : k;
  let hits;
  if (db.kind === "mongo" && db.atlasSearch) {
    const { indexed, post } = splitFilter(name, filter);
    const vectorMode = db.vectorMode || "auto";
    const queryVector = vectorMode === "explicit" ? await vectorOf(embedder, query) : null;
    const vectorIndex = vectorMode === "explicit" ? `${name}_vec` : `${name}_vector`;
    const args = { query, queryVector, vectorMode, vectorIndex, textIndex: `${name}_text`, path: textField, filter: indexed, k: depth };
    const tail = [...(Object.keys(post).length ? [{ $match: post }] : []), { $project: { embedding: 0, identityEmbedding: 0 } }];
    const coll = db.collection(name);
    if (mode === "vector") {
      const docs = await coll.aggregate([...vectorLeg(args), { $addFields: { _score: { $meta: "vectorSearchScore" } } }, ...tail]).toArray();
      hits = docs.map((doc) => ({ doc, score: doc._score, vectorScore: doc._score, fusion: "vector" }));
    } else if (mode === "lexical") {
      const docs = await coll
        .aggregate([{ $search: { index: args.textIndex, text: { query, path: textField } } }, { $match: indexed }, { $limit: depth }, { $addFields: { _score: { $meta: "searchScore" } } }, ...tail])
        .toArray();
      const top = docs[0]?._score || 1;
      hits = docs.map((doc) => ({ doc, score: doc._score / top, vectorScore: null, fusion: "text" }));
    } else {
      const docs = await coll.aggregate([...rankFusionPipeline(args).slice(0, 1), { $limit: depth }, { $addFields: { _score: { $meta: "score" } } }, ...tail]).toArray();
      hits = docs.map((doc) => ({ doc, rrf: doc._score, score: doc._score / RRF_MAX, vectorScore: null, fusion: "rankFusion" }));
    }
    for (const h of hits) delete h.doc._score;
  } else {
    const docs = await db.collection(name).find(filter).toArray();
    if (!docs.length) return [];
    const queryVector = await vectorOf(embedder, query);
    const textOf = (d) => d[textField];
    if (mode === "vector")
      hits = docs
        .map((doc) => ({ doc, score: cosine(queryVector, doc.embedding), fusion: "local-vector" }))
        .sort((a, b) => b.score - a.score)
        .slice(0, depth)
        .map((h) => ({ ...h, vectorScore: h.score }));
    else if (mode === "lexical") {
      const ranked = bm25Rank(docs, query, textOf).slice(0, depth);
      const top = ranked[0]?.score || 1;
      hits = ranked.map(({ doc, score }) => ({ doc, score: score / top, vectorScore: null, fusion: "local-lexical" }));
    } else
      hits = hybridRank(docs, { query, queryVector, k: depth, textOf, vectorOf: (d) => d.embedding }).map((h) => ({
        ...h,
        score: h.rrf / RRF_MAX,
        fusion: "local-rrf",
      }));
  }
  if (!recall) return hits.slice(0, k);
  return applyRecall(hits, recall, now);
}

// autoEmbed indexes sync a few seconds after writes. Wait until every document with the indexed text
// field is visible to $vectorSearch (or the timeout passes), and report what was waited for.
const TEXT_FIELDS = { memories: "text", skills: "description", episodes: "summary", edits: "description" };
export async function settleSearch(db, names, { timeoutMs = 60000, interval = 1000 } = {}) {
  if (db.kind !== "mongo" || !db.atlasSearch || (db.vectorMode || "auto") !== "auto") return { waitedMs: 0, skipped: true };
  const started = Date.now();
  const out = {};
  for (const name of names) {
    const path = TEXT_FIELDS[name];
    const want = await db.collection(name).countDocuments({ [path]: { $exists: true, $type: "string" } });
    let seen = 0;
    while (want) {
      const [row] = await db
        .collection(name)
        .aggregate([{ $vectorSearch: { index: `${name}_vector`, path, query: { text: "status" }, numCandidates: Math.min(10000, want * 2), limit: want } }, { $count: "n" }])
        .toArray();
      seen = row?.n || 0;
      if (seen >= want || Date.now() - started > timeoutMs) break;
      await new Promise((r) => setTimeout(r, interval));
    }
    out[name] = { want, seen };
  }
  return { waitedMs: Date.now() - started, ...out };
}
