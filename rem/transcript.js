// Canonical exchanges live outside the checkpoint. Nothing is deleted by context selection.
import { canonicalJson, sha256 } from "./util.js";
import { ContextBudgetError } from "../server/context/compaction.js";

export const TRANSCRIPT_PART_CHARS = 16000;
export const WORKING_TRANSCRIPT_BYTES = 65536;
export const RETURN_TRANSCRIPT_BYTES = 262144;
const PAGE_SIZE = 16;
const readyByDb = new WeakMap();
const sizeOf = value => Buffer.byteLength(JSON.stringify(value));
const key = (...values) => sha256(canonicalJson(values));
const filterOf = (args = {}) => Object.fromEntries(
  ["folder", "week", "query", "titlePrefix", "olderThan"].filter(k => args[k] !== undefined).map(k => [k, args[k]]),
);

export class RunOwnershipError extends Error {
  constructor() {
    super("Run ownership changed before the checkpoint write.");
    this.name = "RunOwnershipError";
  }
}

// Separate helper keeps this migration additive for callers with an existing schema initializer.
export function ensureTranscriptIndexes(db) {
  if (!readyByDb.has(db)) readyByDb.set(db, (async () => {
    for (const [name, specs] of Object.entries({
      rem_transcript_events: [
        {key: {runId: 1, step: 1}, name: "transcript_run_step", unique: true},
      ],
      rem_transcript_parts: [
        {key: {runId: 1, step: 1, part: 1}, name: "transcript_run_part", unique: true},
      ],
      rem_transcript_guards: [
        {key: {runId: 1, tool: 1, kind: 1, proof: 1}, name: "transcript_guard_proof", unique: true},
      ],
    })) {
      await db.createCollection(name);
      await db.collection(name).createIndexes(specs);
    }
  })().catch(error => { readyByDb.delete(db); throw error; }));
  return readyByDb.get(db);
}

export function createTranscriptStore(db) {
  const events = db.collection("rem_transcript_events");
  const parts = db.collection("rem_transcript_parts");
  const guards = db.collection("rem_transcript_guards");
  const checkpoints = db.collection("checkpoints");

  async function write(runId, entry, session) {
    const text = JSON.stringify(entry), digest = sha256(text);
    const existing = await events.findOne({runId, step: entry.step}, {session});
    if (existing && existing.digest !== digest) throw Error(`Transcript step ${entry.step} already has different evidence.`);
    // Existing events were committed atomically with their parts and proofs. Replaying a legacy
    // snapshot must not roll the latest guard proof back to an older step.
    if (existing) return existing.bytes;
    const count = Math.max(1, Math.ceil(text.length / TRANSCRIPT_PART_CHARS));
    for (let part = 0; part < count; part++) await parts.updateOne(
      {_id: key(runId, entry.step, part)},
      {$setOnInsert: {runId, step: entry.step, part, text: text.slice(part * TRANSCRIPT_PART_CHARS, (part + 1) * TRANSCRIPT_PART_CHARS)}},
      {upsert: true, session},
    );
    await events.updateOne({_id: key(runId, entry.step)}, {$setOnInsert: {
      runId, step: entry.step, parts: count, bytes: Buffer.byteLength(text), digest,
      tool: entry.call.name.slice(0, 200), effectKey: entry.effectKey || null,
    }}, {upsert: true, session});
    // Keep just the proof needed by prior-list guards. Arbitrarily long ids and filters are hashed.
    // The latest matching filter has the same semantics as checkGuardrails.findLast().
    if (!entry.error) {
      const proofs = [{kind: "filter", proof: key(filterOf(entry.call.args)), count: Number.isFinite(entry.result?.count) ? entry.result.count : null},
        ...(Array.isArray(entry.result?.files) ? entry.result.files : []).map(file => ({kind: "file", proof: key(file.id)}))];
      for (const proof of proofs) await guards.updateOne(
        {_id: key(runId, entry.call.name, proof.kind, proof.proof)},
        {$set: {runId, tool: entry.call.name.slice(0, 200), step: entry.step, ...proof}},
        {upsert: true, session},
      );
    }
    return Buffer.byteLength(text);
  }

  async function readPage(runId, {afterStep = 0, throughStep = Number.MAX_SAFE_INTEGER, limit = PAGE_SIZE} = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(afterStep) || afterStep < 0 || !Number.isSafeInteger(throughStep) || throughStep < 0)
      throw Error("Invalid transcript page.");
    const docs = await events.find({runId, step: {$gt: afterStep, $lte: throughStep}}, {sort: {step: 1}, limit}).toArray();
    const entries = [];
    for (const doc of docs) {
      const chunks = await parts.find({runId, step: doc.step}, {sort: {part: 1}}).toArray();
      const text = chunks.map(chunk => chunk.text).join("");
      if (chunks.length !== doc.parts || chunks.some((chunk, i) => chunk.part !== i) || sha256(text) !== doc.digest)
        throw Error(`Transcript integrity check failed at step ${doc.step}.`);
      entries.push(JSON.parse(text));
    }
    return {entries, nextStep: docs.length === limit ? docs.at(-1).step : null};
  }

  async function readThrough(runId, afterStep, throughStep) {
    const entries = [];
    while (afterStep < throughStep) {
      const page = await readPage(runId, {afterStep, throughStep});
      entries.push(...page.entries);
      if (!page.entries.length) throw Error("Canonical transcript is missing a committed step.");
      afterStep = page.entries.at(-1).step;
    }
    return entries;
  }

  function budgetError(transcript) {
    return new ContextBudgetError({source: "working-transcript", status: "needs_review", beforeBytes: sizeOf(transcript), budgetBytes: WORKING_TRANSCRIPT_BYTES});
  }

  return {
    ready: () => ensureTranscriptIndexes(db),
    readPage,
    async read({runId, id, part = 0, digest}) {
      if (typeof id !== "string" || !/^step-[1-9]\d*$/.test(id) || !Number.isSafeInteger(part) || part < 0 ||
          (digest !== undefined && (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest))))
        throw Error("Invalid context part.");
      const step = Number(id.slice(5));
      const event = await events.findOne({runId, step, ...(digest ? {digest} : {})});
      const chunk = event && await parts.findOne({runId, step, part});
      if (!chunk) return {error: "No archived context in this run matches that id and part."};
      return {id, digest: event.digest, part, parts: event.parts, text: chunk.text};
    },
    async list({runId, offset = 0}) {
      if (!Number.isSafeInteger(offset) || offset < 0) throw Error("Invalid context offset.");
      const docs = await events.find({runId, step: {$gt: offset}}, {sort: {step: 1}, limit: 20}).toArray();
      return {records: docs.map(doc => ({id: `step-${doc.step}`, digest: doc.digest, parts: doc.parts})), nextOffset: docs.length === 20 ? docs.at(-1).step : null};
    },
    async migrate(cp) {
      if (cp.transcriptState?.version === 1) return cp;
      // Legacy checkpoints remain intact until every canonical exchange is safely written.
      // Per-entry transactions let interrupted migration restart without replaying effects.
      let bytes = 0;
      for (const entry of cp.transcript || []) bytes += await db.withTransaction(session => write(cp.runId, entry, session));
      const fits = sizeOf(cp.transcript || []) <= WORKING_TRANSCRIPT_BYTES;
      await checkpoints.updateOne({runId: cp.runId, step: cp.step, "transcriptState.version": {$ne: 1}, ...(cp.driver ? {driver: cp.driver} : {})}, {$set: {
        transcriptState: {version: 1, count: cp.step, bytes},
        transcript: fits ? cp.transcript || [] : [], transcriptThrough: fits ? cp.step : 0,
      }});
      return checkpoints.findOne({runId: cp.runId});
    },
    async append(cp, entry, session) {
      const bytes = await write(cp.runId, entry, session);
      const working = [...cp.transcript, entry];
      const fits = (cp.transcriptThrough ?? 0) === cp.step && sizeOf(working) <= WORKING_TRANSCRIPT_BYTES;
      return {
        transcript: fits ? working : cp.transcript,
        transcriptThrough: fits ? entry.step : cp.transcriptThrough,
        transcriptState: {version: 1, count: entry.step, bytes: (cp.transcriptState?.bytes || 0) + bytes},
      };
    },
    async pending(cp) {
      return readThrough(cp.runId, cp.transcriptThrough || 0, cp.step);
    },
    async select(cp, transcript, revision) {
      if (sizeOf(transcript) > WORKING_TRANSCRIPT_BYTES) throw budgetError(transcript);
      const state = {transcript, transcriptThrough: cp.step, transcriptRevision: revision};
      const updated = await checkpoints.updateOne({runId: cp.runId, step: cp.step,
        ...(cp.driver ? {driver: cp.driver} : {}), ...(cp.status ? {status: cp.status} : {}),
      }, {$set: state});
      if (!updated.matchedCount) throw new RunOwnershipError();
      Object.assign(cp, state);
    },
    async result(cp) {
      if (!cp?.transcriptState) return cp;
      // Preserve existing small-run API consumers without materializing long histories.
      const complete = cp.transcriptState.bytes <= RETURN_TRANSCRIPT_BYTES;
      return {...cp, transcript: complete ? await readThrough(cp.runId, 0, cp.step) : cp.transcript, transcriptComplete: complete};
    },
    async guardHistory(cp, genome, call) {
      const history = [];
      for (const g of genome.guardrails) {
        const p = g.predicate;
        if (p.tool !== call.name || p.type !== "prior-list") continue;
        if (Array.isArray(call.args?.ids)) {
          for (const id of call.args.ids) {
            const found = await guards.findOne({runId: cp.runId, tool: p.listTool, kind: "file", proof: key(id), step: {$lte: cp.step}});
            if (found) history.push({step: found.step, call: {name: p.listTool, args: {}}, result: {files: [{id}]}});
          }
        } else {
          const found = await guards.findOne({runId: cp.runId, tool: p.listTool, kind: "filter", proof: key(filterOf(call.args)), step: {$lte: cp.step}});
          if (found) history.push({step: found.step, call: {name: p.listTool, args: call.args}, result: {count: found.count}});
        }
      }
      return history;
    },
  };
}
