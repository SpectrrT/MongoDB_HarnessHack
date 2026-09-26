// Memory health: the searchable store (active memories + raw, not-yet-consolidated episodes),
// its size, duplicate ratio, unresolved contradictions, and retrieval precision@k on a probe set.
import { factsOf } from "./facts.js";
import { hybridRank, vectorOf } from "./search.js";
import { canonicalJson, round, weekNumber } from "./util.js";

export async function rawItems(db) {
  const raw = await db
    .collection("episodes")
    .find({ consolidated: false, kind: { $in: ["observation", "correction", "demonstration"] } })
    .toArray();
  const items = [];
  for (const e of raw) {
    const facts = factsOf(e);
    if (!facts.length && e.kind === "observation")
      items.push({ source: "episode", text: e.summary, subject: `noise: ${e.summary}`, value: null, embedding: e.embedding });
    for (const f of facts) items.push({ source: "episode", text: e.summary, subject: f.subject, value: f.value, embedding: e.embedding });
  }
  return items;
}

export async function searchableStore(db) {
  const memories = await db.collection("memories").find({ active: true }).toArray();
  return [
    ...memories.map((m) => ({ source: "memory", text: m.text, subject: m.subject, value: m.value, embedding: m.embedding })),
    ...(await rawItems(db)),
  ];
}

// Probes are generated from the fixture truth as of a week: current decisions, open blockers,
// the internal team list, and the customer-name preference.
export function probesFor(truth, asOf) {
  const weeks = Object.keys(truth.weeks)
    .filter((w) => weekNumber(w) <= weekNumber(asOf))
    .sort();
  const probes = [];
  for (const subject of ["Release day", "Design review"]) {
    const values = weeks.flatMap((w) => truth.weeks[w].decisions.filter((d) => d.subject === subject).map((d) => d.value));
    if (!values.length) continue;
    const current = values.at(-1),
      stale = [...new Set(values)].filter((v) => v !== current);
    probes.push({
      query: `What did we decide about the ${subject.toLowerCase()}?`,
      R: 1,
      relevant: (t) => t.includes(subject) && t.includes(current) && !stale.some((s) => t.includes(s)),
    });
  }
  const open = truth.weeks[asOf]?.open || [];
  if (open.length)
    probes.push({
      query: "Which blockers are still open?",
      R: open.length,
      relevant: (t) => /blocker/i.test(t) && !/resolved/i.test(t) && open.some((b) => t.includes(b.title)),
    });
  probes.push({
    query: "Who is on the team list for internal updates?",
    R: 1,
    relevant: (t) => truth.team.every((a) => t.includes(a)) && !/@(?!offload\.test)[a-z0-9.-]+\.[a-z]+/i.test(t),
  });
  probes.push({
    query: "How should customer names be handled in internal updates?",
    R: 1,
    relevant: (t) => /customer names/i.test(t),
  });
  return probes;
}

export async function storeMetrics(items, { embedder, truth, asOf }) {
  const subjects = new Map();
  for (const it of items) {
    if (!subjects.has(it.subject)) subjects.set(it.subject, new Set());
    subjects.get(it.subject).add(canonicalJson(it.value));
  }
  const probes = probesFor(truth, asOf);
  let precision = 0;
  for (const p of probes) {
    if (!items.length) continue;
    const hits = hybridRank(items, {
      query: p.query,
      queryVector: await vectorOf(embedder, p.query),
      textOf: (x) => x.text,
      vectorOf: (x) => x.embedding,
      k: p.R,
    });
    precision += hits.filter((h) => p.relevant(h.doc.text)).length / p.R;
  }
  return {
    size: items.length,
    memories: items.filter((i) => i.source === "memory").length,
    rawEpisodes: items.filter((i) => i.source === "episode").length,
    duplicateRatio: items.length ? round(1 - subjects.size / items.length, 3) : 0,
    contradictions: [...subjects.entries()].filter(([s, values]) => !s.startsWith("noise") && values.size > 1).length,
    precisionAtK: probes.length ? round(precision / probes.length, 3) : 0,
  };
}

export async function memoryMetrics({ db, embedder, workspace }, asOf) {
  return storeMetrics(await searchableStore(db), { embedder, truth: workspace.truth, asOf });
}
