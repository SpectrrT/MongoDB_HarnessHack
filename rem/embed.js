// Deterministic local embedding (feature hashing of tokens + bigrams) standing in for Voyage.
const STOP = new Set(
  "a an and are as at be by for from has have in into is it its of on or that the this to was were will with".split(" "),
);

const stem = (t) => (t.length > 4 && t.endsWith("s") && !t.endsWith("ss") && !t.includes("@") ? t.slice(0, -1) : t);

export const tokenize = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/→/g, " ")
    .split(/[^a-z0-9@.]+/)
    .map((t) => stem(t.replace(/^\.+|\.+$/g, "")))
    .filter((t) => t && !STOP.has(t));

function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function embedText(text, dims = 256) {
  const v = new Array(dims).fill(0);
  const tokens = tokenize(text);
  const add = (feature, weight) => {
    const h = fnv1a(feature);
    v[h % dims] += (h & 0x80000000 ? -1 : 1) * weight;
  };
  tokens.forEach((t, i) => {
    add(t, 1);
    if (i) add(`${tokens[i - 1]} ${t}`, 0.6);
  });
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => Math.round((x / norm) * 1e6) / 1e6);
}

export const cosine = (a, b) => {
  if (!a || !b) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
};

export function createLocalEmbedder({ dims = 256 } = {}) {
  return {
    name: `local-hash-${dims}`,
    dims,
    embed: async (texts) => texts.map((t) => embedText(t, dims)),
    embedOne: (text) => embedText(text, dims),
  };
}

// TOMORROW: used only when VOYAGE_API_KEY is set (explicit-embedding fallback if autoEmbed misbehaves).
export function createVoyageEmbedder({ apiKey = process.env.VOYAGE_API_KEY, model = "voyage-4" } = {}) {
  if (!apiKey) throw new Error("Set VOYAGE_API_KEY to use Voyage embeddings.");
  const cache = new Map();
  const call = async (texts, inputType) => {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ input: texts, model, input_type: inputType }),
    });
    if (!res.ok) throw new Error(`Voyage embeddings failed: ${res.status} ${await res.text()}`);
    return (await res.json()).data.map((d) => d.embedding);
  };
  return {
    name: model,
    dims: null,
    embed: async (texts) => {
      const missing = texts.filter((t) => !cache.has(t));
      if (missing.length) (await call(missing, "document")).forEach((v, i) => cache.set(missing[i], v));
      return texts.map((t) => cache.get(t));
    },
    embedOne: () => {
      throw new Error("Voyage embeddings are async; use embed().");
    },
  };
}

// Opt-in: REM_EMBEDDINGS=voyage plus VOYAGE_API_KEY. Otherwise the local hashing embedder.
export function createEmbedder() {
  return process.env.REM_EMBEDDINGS === "voyage" && process.env.VOYAGE_API_KEY
    ? createVoyageEmbedder()
    : createLocalEmbedder();
}
