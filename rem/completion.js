import { traceable } from "./trace.js";

// Probabilistic termination: before a day run may finish, estimate P(goal satisfied | evidence).
// Jev (TypeSafe's decision model, through OpenRouter's decisions endpoint) answers one yes/no
// question with a probability. The deterministic stub is used for offline evaluation when
// Jev is not selected. Every verdict identifies its source.
import { hasCompletionEvidence } from "./completion-record.js";

export const JEV_MODEL = "typesafe/jev-1.13";
const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
const QUESTION =
  "The checks field holds deterministic end-state checks and is authoritative when available. " +
  "Given the task, the steps taken, the final answer and the checks, is the task goal satisfied?";

const lastSteps = (cp, n = 12) =>
  (cp.transcript || []).slice(-n).map((t) => `${t.step}. ${t.call.name} ${t.error ? `error: ${t.error}` : "ok"}`);

// Only reported valid components are counted. A subtotal is not a complete usage receipt.
export function decisionUsage(usage) {
  const tokenCount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const inputTokens = tokenCount(usage?.input_tokens ?? usage?.prompt_tokens);
  const outputTokens = tokenCount(usage?.output_tokens ?? usage?.completion_tokens);
  const subtotal = (inputTokens ?? 0) + (outputTokens ?? 0);
  const tokens = (inputTokens !== null || outputTokens !== null) && Number.isSafeInteger(subtotal) ? subtotal : null;
  const cost = Number.isFinite(usage?.cost) && usage.cost >= 0 ? usage.cost : null;
  return { inputTokens, outputTokens, tokens, cost,
    usageKnown: inputTokens !== null && outputTokens !== null && tokens !== null && usage?.usageKnown !== false,
    costKnown: cost !== null && usage?.costKnown !== false };
}
const noCallUsage = () => decisionUsage({ input_tokens: 0, output_tokens: 0, cost: 0 });

// What the decision sees: the task, the plan, the last steps, the final answer and, when the
// harness can run them, the end-state checks' findings.
export function evidenceState({ cp, final, evidence }) {
  return {
    task: String(cp.instruction || "").slice(0, 600),
    plan: (cp.plan || []).slice(0, 8).join(" | ").slice(0, 600),
    steps: lastSteps(cp).join("\n").slice(0, 1200),
    final: String(final || "").slice(0, 1500),
    checks: hasCompletionEvidence(evidence)
      ? evidence.failures.length
        ? `failing: ${evidence.failures.join("; ")}`.slice(0, 800)
        : evidence.pass === false ? "end-state checks failed" : "all end-state checks pass"
      : "not available",
  };
}

// Deterministic estimate from the same evidence.
export function stubVerdict({ cp, final, evidence }) {
  const reasons = [];
  let p = 0.92;
  if (!hasCompletionEvidence(evidence)) (p = Math.min(p, 0.2)), reasons.push("acceptance evidence unavailable");
  if (evidence?.pass === false) (p = Math.min(p, 0.3)), reasons.push("acceptance checks failed");
  if (!String(final || "").trim()) (p = Math.min(p, 0.2)), reasons.push("no final answer");
  const last = (cp.transcript || []).at(-1);
  if (last?.error) (p = Math.min(p, 0.45)), reasons.push(`last step failed: ${last.error.slice(0, 80)}`);
  if (evidence?.failures?.length) (p = Math.min(p, 0.3 - Math.min(0.2, 0.05 * (evidence.failures.length - 1)))), reasons.push(...evidence.failures.slice(0, 4));
  return { p: Math.round(p * 100) / 100, reasons };
}

export function createStubGate() {
  return {
    name: "stub",
    async check(input) {
      return { ...stubVerdict(input), source: "stub", available: true, ...noCallUsage() };
    },
  };
}

export function createJevGate({ apiKey = process.env.OPENROUTER_API_KEY, model = JEV_MODEL, timeoutMs = 15000, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error("Set OPENROUTER_API_KEY to use Jev through OpenRouter.");
  return {
    name: "jev",
    async check(input) {
      let receipt = decisionUsage();
      const fallback = (why) => ({ p: null, available: false, source: `jev unavailable: ${why}`, reasons: ["Configured completion evaluator is unavailable. Completion is unverified."], ...receipt });
      try {
        const res = await fetchImpl(DECISIONS_URL, {
          method: "POST",
          signal: AbortSignal.timeout(timeoutMs),
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model, state: evidenceState(input), questions: { satisfied: { type: "noul", instructions: QUESTION } } }),
        });
        let body;
        try { body = await res.json(); } catch {}
        receipt = decisionUsage(body?.usage);
        if (!res.ok) return fallback(res.status === 402 ? "402 payment required" : `HTTP ${res.status}`);
        const p = body?.answers?.satisfied?.noul;
        if (!Number.isFinite(p) || p < 0 || p > 1) return fallback("invalid probability in reply");
        const reasons = input.evidence?.failures?.slice(0, 4) || [];
        return { p: Math.round(p * 1000) / 1000, available: true, reasons, source: model, ...receipt };
      } catch (error) {
        return fallback(error.name === "TimeoutError" ? "timeout" : "request failed");
      }
    },
  };
}

// Child run: the completion gate's verdict (p, threshold, passed) for one finishing turn.
function traceGate(gate) {
  return { ...gate, check: traceable(gate.check.bind(gate), { name: "completion-gate", run_type: "chain" }) };
}

// An explicitly configured Jev gate never silently becomes a successful stub.
export function createCompletionGate() {
  const gate = process.env.REM_COMPLETION === "jev"
    ? process.env.OPENROUTER_API_KEY ? createJevGate() : {
      name: "jev", check: async () => ({ p: null, available: false, source: "jev unavailable: missing key", reasons: ["Configure the completion evaluator before verifying this task."], ...noCallUsage() }),
    }
    : createStubGate();
  return traceGate(gate);
}
