// Collections and indexes from docs/03-rem-concept.md "MongoDB shape".
export const COLLECTIONS = Object.freeze({
  context_archive: "context_archive",
  context_decisions: "context_decisions",
  episodes: "episodes",
  episode_archive: "episode_archive",
  episode_archive_parts: "episode_archive_parts",
  memories: "memories",
  skills: "skills",
  harnesses: "harnesses",
  edits: "edits",
  checkpoints: "checkpoints",
  effects: "effects",
  connections: "connections",
  asks: "asks",
  metrics: "metrics",
  briefs: "briefs",
});

export const INDEXES = Object.freeze({
  context_archive: [{key: {runId: 1, unitId: 1, part: 1}, name: "context_run_unit"}],
  context_decisions: [{key: {runId: 1}, name: "context_decisions_run"}],
  episode_archive: [
    { key: { runId: 1, _id: 1 }, name: "archive_run" },
    { key: { kind: 1, _id: 1 }, name: "archive_kind" },
  ],
  episode_archive_parts: [{ key: { archiveKey: 1, part: 1 }, name: "archive_parts", unique: true }],
  episodes: [
    { key: { expireAt: 1 }, name: "episodes_ttl", expireAfterSeconds: 0 },
    { key: { day: 1, runId: 1, seq: 1 }, name: "episodes_day_run" },
    { key: { kind: 1, consolidated: 1 }, name: "episodes_kind" },
  ],
  memories: [
    { key: { subject: 1, active: 1 }, name: "memories_subject" },
    { key: { active: 1, recency: -1 }, name: "memories_active" },
  ],
  skills: [
    { key: { name: 1 }, name: "skills_name", unique: true },
    { key: { status: 1 }, name: "skills_status" },
  ],
  harnesses: [
    { key: { version: 1 }, name: "harnesses_version", unique: true },
    { key: { parentId: 1 }, name: "harnesses_parent" },
  ],
  edits: [
    { key: { night: 1 }, name: "edits_night" },
    { key: { type: 1, "outcome.status": 1 }, name: "edits_type_outcome" },
    { key: { signature: 1 }, name: "edits_signature" },
  ],
  checkpoints: [
    { key: { runId: 1 }, name: "checkpoints_run", unique: true },
    { key: { status: 1, provider: 1 }, name: "checkpoints_status" },
  ],
  effects: [
    { key: { effectKey: 1 }, name: "effects_key", unique: true },
    { key: { runId: 1, step: 1 }, name: "effects_run" },
  ],
  connections: [{ key: { provider: 1 }, name: "connections_provider", unique: true }],
  asks: [
    { key: { dedupeKey: 1 }, name: "asks_dedupe", unique: true },
    { key: { status: 1, createdAt: -1 }, name: "asks_status" },
  ],
  briefs: [{ key: { night: -1 }, name: "briefs_night" }],
});

export const TIME_SERIES = Object.freeze({
  metrics: { timeseries: { timeField: "ts", metaField: "meta", granularity: "hours" } },
});

// Atlas Vector Search (autoEmbed, public preview) + Atlas Search definitions. The memory db records
// them; tomorrow's setup creates them with createSearchIndex on the Atlas Sandbox.
const autoEmbed = (path) => ({ type: "autoEmbed", path, model: "voyage-4", modality: "text" });
export const SEARCH_INDEXES = Object.freeze({
  episodes: [
    {
      name: "episodes_vector",
      type: "vectorSearch",
      definition: {
        fields: [
          autoEmbed("summary"),
          { type: "filter", path: "kind" },
          { type: "filter", path: "day" },
          { type: "filter", path: "split" },
          { type: "filter", path: "night" },
          { type: "filter", path: "tags" },
        ],
      },
    },
    {
      name: "episodes_text",
      type: "search",
      definition: { mappings: { dynamic: false, fields: { summary: { type: "string" } } } },
    },
  ],
  memories: [
    {
      name: "memories_vector",
      type: "vectorSearch",
      definition: { fields: [autoEmbed("text"), { type: "filter", path: "active" }] },
    },
    {
      name: "memories_text",
      type: "search",
      definition: { mappings: { dynamic: false, fields: { text: { type: "string" } } } },
    },
  ],
  skills: [
    {
      name: "skills_vector",
      type: "vectorSearch",
      definition: { fields: [autoEmbed("description"), { type: "filter", path: "status" }] },
    },
    {
      name: "skills_text",
      type: "search",
      definition: { mappings: { dynamic: false, fields: { description: { type: "string" } } } },
    },
  ],
  edits: [
    {
      name: "edits_vector",
      type: "vectorSearch",
      definition: { fields: [autoEmbed("description"), { type: "filter", path: "type" }] },
    },
    {
      name: "edits_text",
      type: "search",
      definition: {
        mappings: {
          dynamic: false,
          fields: { description: { type: "string" }, pattern: { type: "string" } },
        },
      },
    },
  ],
});

// "auto": the autoEmbed indexes above (verified READY on the event sandbox, Sep 26: text indexes in
// 60 to 92 s, vector indexes in 72 to 116 s). "explicit": the same indexes over the app's stored
// `embedding` (Voyage or the local embedder), named `<collection>_vec`, for clusters without autoEmbed.
export function searchIndexesFor({ mode = "auto", dims = 1024 } = {}) {
  if (mode !== "explicit") return SEARCH_INDEXES;
  return Object.fromEntries(
    Object.entries(SEARCH_INDEXES).map(([name, specs]) => [
      name,
      specs.map((spec) =>
        spec.type !== "vectorSearch"
          ? spec
          : {
              name: `${name}_vec`,
              type: "vectorSearch",
              definition: {
                fields: spec.definition.fields.map((f) =>
                  f.type === "autoEmbed" ? { type: "vector", path: "embedding", numDimensions: dims, similarity: "cosine" } : f,
                ),
              },
            },
      ),
    ]),
  );
}

// Explicit-embedding fallback (Voyage called by the app, vectors stored on the document).
export const VECTOR_FIELDS = Object.freeze({
  episodes: { text: "summary", vector: "embedding" },
  memories: { text: "text", vector: "embedding" },
  skills: { text: "description", vector: "embedding" },
  edits: { text: "description", vector: "embedding" },
});
