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

// TOMORROW on Atlas (8.1+): the same query as one aggregation using the autoEmbed vector index.
export function rankFusionPipeline({ query, vectorIndex, textIndex, path, filter = {}, k = 5 }) {
  return [
    {
      $rankFusion: {
        input: {
          pipelines: {
            vector: [
              { $vectorSearch: { index: vectorIndex, path, query: { text: query }, numCandidates: k * 20, limit: k * 4, filter } },
            ],
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

// Hybrid search over a collection. On Atlas with REM_ATLAS_SEARCH=1 this is one $rankFusion
// aggregation over the autoEmbed vector index + Atlas Search index (TOMORROW, untested tonight);
// otherwise app-side RRF over documents that carry an explicit `embedding`.
export async function searchCollection(db, name, { query, embedder, filter = {}, k = 5, textField = "text" }) {
  if (db.kind === "mongo" && db.atlasSearch) {
    const pipeline = rankFusionPipeline({ query, vectorIndex: `${name}_vector`, textIndex: `${name}_text`, path: textField, filter, k });
    const docs = await db.collection(name).aggregate(pipeline).toArray();
    return docs.map((doc) => ({ doc, rrf: doc.score, vectorScore: null }));
  }
  const docs = await db.collection(name).find(filter).toArray();
  if (!docs.length) return [];
  const queryVector = await vectorOf(embedder, query);
  return hybridRank(docs, {
    query,
    queryVector,
    k,
    textOf: (d) => d[textField],
    vectorOf: (d) => d.embedding,
  });
}
