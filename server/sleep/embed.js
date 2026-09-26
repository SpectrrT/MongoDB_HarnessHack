import { createHash } from 'node:crypto';

export const DIMENSIONS = 1024;

// Voyage AI embeddings. The same request shape works against the Atlas
// Embedding and Reranking API by changing EMBEDDINGS_BASE_URL.
export function voyageEmbedder({ key = process.env.VOYAGE_API_KEY, model = process.env.VOYAGE_MODEL || 'voyage-4',
  baseUrl = process.env.EMBEDDINGS_BASE_URL || 'https://api.voyageai.com/v1', dimensions = DIMENSIONS, batch = 64 } = {}) {
  const embed = async (texts, inputType = 'document') => {
    if (!key) throw new Error('Configure VOYAGE_API_KEY.');
    const vectors = [];
    for (let i = 0; i < texts.length; i += batch) {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/embeddings`, {
        method: 'POST', signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: texts.slice(i, i + batch), model, input_type: inputType, output_dimension: dimensions }),
      });
      if (!response.ok) {
        const error = new Error('Embedding provider request failed.');
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      const body = await response.json();
      const data = [...(body.data || [])].sort((a, b) => a.index - b.index).map(d => d.embedding);
      if (data.length !== Math.min(batch, texts.length - i) || data.some(v => v?.length !== dimensions))
        throw new Error('Embedding provider returned an unexpected shape.');
      vectors.push(...data);
    }
    return vectors;
  };
  embed.model = model;
  embed.dimensions = dimensions;
  return embed;
}

// Deterministic bag-of-words hashing embedder. Tests and offline development only:
// it measures shared vocabulary, not meaning.
const stop = new Set('a an and are as at be by did do for from has have in is it its not of on or so that the this to was were will with'.split(' '));
const stem = w => w.replace(/(ing|ed|es|s)$/, '');
export function testEmbedder(dimensions = DIMENSIONS) {
  const embed = async texts => texts.map(text => {
    const v = new Array(dimensions).fill(0);
    for (const word of text.toLowerCase().match(/[a-z0-9]+/g) || []) {
      if (stop.has(word)) continue;
      const h = createHash('sha256').update(stem(word)).digest();
      v[h.readUInt32BE(0) % dimensions] += h[4] & 1 ? 1 : -1;
    }
    const norm = Math.hypot(...v) || 1;
    return v.map(x => x / norm);
  });
  embed.model = 'test-hashing';
  embed.dimensions = dimensions;
  return embed;
}

// Same scale as Atlas vectorSearchScore for cosine: (1 + cosine) / 2.
export function similarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return (1 + dot / (Math.sqrt(na * nb) || 1)) / 2;
}
