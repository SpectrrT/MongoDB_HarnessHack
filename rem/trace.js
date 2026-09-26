// Optional LangSmith tracing. With no LANGSMITH_API_KEY (or LANGSMITH_TRACING=false), every export
// here is a strict pass-through: the wrapped function is the original function (same reference for
// `traceable`, or a direct call for `annotate`), so no LangSmith call is ever made and nothing about
// REM's behavior or return values changes (the `langsmith/traceable` import below only defines local
// helper functions; it makes no network call by itself). Set LANGSMITH_API_KEY (and LANGSMITH_TRACING=
// true) to trace a day run, a night, and the gym; see README.md for what gets traced.
import { traceable as lsTraceable, getCurrentRunTree } from "langsmith/traceable";

const MAX_STRING = 500;
const MAX_ARRAY = 20;
const MAX_DEPTH = 5;
// Key names that never leave this process in a trace, whatever they hold.
const SECRET_KEY = /key|token|secret|password|authorization|cookie|uri|connectionstring|credential/i;

export function tracingEnabled() {
  if (!process.env.LANGSMITH_API_KEY) return false;
  const flag = process.env.LANGSMITH_TRACING;
  return flag === undefined || flag === "true" || flag === "1";
}

// Depth-limited, redacting, truncating copy: no credential-shaped key, no string over MAX_STRING
// chars, no array over MAX_ARRAY entries ever reaches a trace payload. Used for both inputs and
// outputs so a fixture body or a full email never rides along on a run.
export function summarize(value, depth = 0) {
  if (value === null || value === undefined) return value ?? null;
  if (depth >= MAX_DEPTH) return "[depth limit]";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string")
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}... [truncated, ${value.length} chars]` : value;
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((v) => summarize(v, depth + 1));
    if (value.length > MAX_ARRAY) items.push(`... [${value.length - MAX_ARRAY} more]`);
    return items;
  }
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) ? "[redacted]" : summarize(v, depth + 1);
    return out;
  }
  return value;
}

// A pass-through wrapper: `fn` itself, unwrapped, when tracing is not configured (identical calls,
// identical return values, no network). When configured, `fn` becomes a LangSmith traceable run;
// any other traceable-wrapped function it calls during its own execution nests as a child run
// automatically (LangSmith follows the async call chain), so wrapping a handful of functions this
// way reconstructs the day-run / night-run trees without changing how REM calls them.
export function traceable(fn, config = {}) {
  if (!tracingEnabled()) return fn;
  return lsTraceable(fn, {
    processInputs: (i) => summarize(i),
    processOutputs: (o) => summarize(o),
    ...config,
  });
}

// Adds metadata and tags to whichever run is active in the current async context. A no-op when
// tracing is off, or when called outside a traced function (nothing active to annotate).
export function annotate({ metadata, tags } = {}) {
  if (!tracingEnabled()) return;
  const run = getCurrentRunTree();
  if (!run) return;
  if (metadata) run.metadata = { ...run.metadata, ...summarize(metadata) };
  if (tags?.length) run.tags = [...new Set([...(run.tags || []), ...tags])];
}

// A short, traceable description of a genome: rule and guardrail counts and ids, tool scopes,
// routing tiers and the recall/completion knobs. Never the rule text or guardrail predicates in
// full (summarize() still truncates them if they were included).
export function genomeSummary(genome) {
  if (!genome) return null;
  return {
    rules: genome.rules.map((r) => r.id),
    guardrails: genome.guardrails.map((g) => g.id),
    toolScopes: genome.toolScopes,
    routing: genome.routing,
    contextPolicy: {
      injectMemories: genome.contextPolicy.injectMemories,
      injectSkills: genome.contextPolicy.injectSkills,
      stepBudget: genome.contextPolicy.stepBudget,
      completionThreshold: genome.contextPolicy.completionThreshold,
      recall: genome.contextPolicy.recall,
    },
  };
}

// Wraps model.chat with a "model-call" child run: model id, token usage and cost (models.js's own
// pricing table, the same one agent.js bills against), plus which tool the model chose next. A
// pass-through (the same `model` object) when tracing is off.
export function traceModel(model, { costOf } = {}) {
  if (!tracingEnabled() || !model?.chat) return model;
  const chat = traceable(
    async (args) => {
      const reply = await model.chat(args);
      const usage = reply.usage || {};
      annotate({
        metadata: {
          modelId: args.model,
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          cost: costOf ? costOf(usage, args.model) : (usage.reportedCost ?? null),
          tool: reply.toolCall?.name ?? null,
        },
      });
      return reply;
    },
    { name: "model-call", run_type: "llm" },
  );
  return { ...model, chat };
}

export { getCurrentRunTree };
