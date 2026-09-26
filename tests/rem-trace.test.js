import test from "node:test";
import assert from "node:assert/strict";
import { annotate, genomeSummary, summarize, traceable, traceModel, tracingEnabled } from "../rem/trace.js";
import { GEN0 } from "../rem/harness.js";

// Every test that flips LANGSMITH_API_KEY restores it, so the rest of the suite (and any later file)
// still runs with tracing off, as it does by default.
function withEnv(vars, fn) {
  const before = {};
  for (const k of Object.keys(vars)) before[k] = process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(before)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}

test("tracingEnabled is false with no key, true once a key is set, and LANGSMITH_TRACING=false overrides it", () => {
  withEnv({ LANGSMITH_API_KEY: undefined, LANGSMITH_TRACING: undefined }, () => {
    assert.equal(tracingEnabled(), false);
  });
  withEnv({ LANGSMITH_API_KEY: "test-key", LANGSMITH_TRACING: undefined }, () => {
    assert.equal(tracingEnabled(), true);
  });
  withEnv({ LANGSMITH_API_KEY: "test-key", LANGSMITH_TRACING: "true" }, () => {
    assert.equal(tracingEnabled(), true);
  });
  withEnv({ LANGSMITH_API_KEY: "test-key", LANGSMITH_TRACING: "false" }, () => {
    assert.equal(tracingEnabled(), false);
  });
});

test("traceable(fn) is fn itself with no key: identical reference, no wrapping, so no call can reach the network", () => {
  const fn = async (x) => x * 2;
  withEnv({ LANGSMITH_API_KEY: undefined }, () => {
    assert.equal(traceable(fn), fn);
    assert.equal(traceable(fn, { name: "whatever" }), fn);
  });
});

test("traceable(fn) calls fn directly and returns its exact value with no key", async () => {
  const calls = [];
  const fn = async (x) => (calls.push(x), x + 1);
  const wrapped = withEnv({ LANGSMITH_API_KEY: undefined }, () => traceable(fn));
  assert.equal(wrapped, fn);
  assert.equal(await wrapped(41), 42);
  assert.deepEqual(calls, [41]);
});

test("traceable(fn) returns a different, wrapping function once a key is set (structural only; never invoked here, so no network call happens in this test)", () => {
  const fn = async (x) => x;
  withEnv({ LANGSMITH_API_KEY: "test-key", LANGSMITH_TRACING: "true" }, () => {
    const wrapped = traceable(fn, { name: "probe" });
    assert.notEqual(wrapped, fn);
    assert.equal(typeof wrapped, "function");
  });
});

test("annotate is a no-op with no key: it never throws and never touches the current run", () => {
  withEnv({ LANGSMITH_API_KEY: undefined }, () => {
    assert.doesNotThrow(() => annotate({ metadata: { a: 1 }, tags: ["x"] }));
    assert.doesNotThrow(() => annotate());
  });
});

test("traceModel returns the same model object with no key: identical chat, identical replies", async () => {
  const model = { name: "scripted", chat: async ({ model: id }) => ({ final: `ok ${id}`, usage: { inputTokens: 1, outputTokens: 1 } }) };
  const wrapped = withEnv({ LANGSMITH_API_KEY: undefined }, () => traceModel(model, { costOf: () => 999 }));
  assert.equal(wrapped, model);
  const reply = await wrapped.chat({ model: "m1", messages: [] });
  assert.deepEqual(reply, { final: "ok m1", usage: { inputTokens: 1, outputTokens: 1 } });
});

test("summarize truncates long strings, caps arrays, and redacts credential-shaped keys at any depth", () => {
  const longString = "x".repeat(3000);
  const bigArray = Array.from({ length: 50 }, (_, i) => i);
  const out = summarize({
    apiKey: "sk-super-secret",
    nested: { token: "abc", authorization: "Bearer zzz", ok: "fine" },
    connectionString: "mongodb+srv://user:pass@host/db",
    body: longString,
    items: bigArray,
    when: new Date("2026-01-01T00:00:00Z"),
    nothing: null,
    missing: undefined,
  });
  assert.equal(out.apiKey, "[redacted]");
  assert.equal(out.nested.token, "[redacted]");
  assert.equal(out.nested.authorization, "[redacted]");
  assert.equal(out.nested.ok, "fine");
  assert.equal(out.connectionString, "[redacted]");
  assert.ok(out.body.length < longString.length);
  assert.match(out.body, /truncated, 3000 chars/);
  assert.equal(out.items.length, 21);
  assert.match(out.items[20], /30 more/);
  assert.equal(out.when, "2026-01-01T00:00:00.000Z");
  assert.equal(out.nothing, null);
});

test("summarize is depth-limited and does not throw on deeply nested plain data", () => {
  let deep = { leaf: "bottom" };
  for (let i = 0; i < 10; i++) deep = { child: deep };
  const out = summarize(deep);
  assert.doesNotThrow(() => JSON.stringify(out));
});

test("genomeSummary describes a genome without its rule text or guardrail predicates in full", () => {
  const s = genomeSummary(GEN0);
  assert.deepEqual(s.rules, []);
  assert.deepEqual(s.guardrails, []);
  assert.deepEqual(s.toolScopes, GEN0.toolScopes);
  assert.equal(s.routing.planner, "large");
  assert.equal(s.contextPolicy.stepBudget, 40);
  assert.equal(genomeSummary(null), null);
});
