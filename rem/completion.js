// Probabilistic termination: before a day run may finish, estimate P(goal satisfied | evidence).
// Jev (TypeSafe's decision model, through OpenRouter's decisions endpoint) answers one yes/no
// question with a probability. The stub is deterministic, used by tests and whenever Jev is off
// or unreachable, and every verdict says which one produced it.
export const JEV_MODEL = "typesafe/jev-1.13";
const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
const QUESTION =
  "The checks field holds deterministic end-state checks and is authoritative when available. " +
  "Given the task, the steps taken, the final answer and the checks, is the task goal satisfied?";

const lastSteps = (cp, n = 12) =>
  (cp.transcript || []).slice(-n).map((t) => `${t.step}. ${t.call.name} ${t.error ? `error: ${t.error}` : "ok"}`);

// What the decision sees: the task, the plan, the last steps, the final answer and, when the
// harness can run them, the end-state checks' findings.
export function evidenceState({ cp, final, evidence }) {
  return {
    task: String(cp.instruction || "").slice(0, 600),
    plan: (cp.plan || []).slice(0, 8).join(" | ").slice(0, 600),
    steps: lastSteps(cp).join("\n").slice(0, 1200),
    final: String(final || "").slice(0, 1500),
    checks: evidence
      ? evidence.failures.length
        ? `failing: ${evidence.failures.join("; ")}`.slice(0, 800)
        : "all end-state checks pass"
      : "not available",
  };
}

// Deterministic estimate from the same evidence.
export function stubVerdict({ cp, final, evidence }) {
  const reasons = [];
  let p = 0.92;
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
      return { ...stubVerdict(input), source: "stub" };
    },
  };
}

export function createJevGate({ apiKey = process.env.OPENROUTER_API_KEY, model = JEV_MODEL, timeoutMs = 15000, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error("Set OPENROUTER_API_KEY to use Jev through OpenRouter.");
  return {
    name: "jev",
    async check(input) {
      const fallback = (why) => ({ ...stubVerdict(input), source: `stub (jev unavailable: ${why})` });
      try {
        const res = await fetchImpl(DECISIONS_URL, {
          method: "POST",
          signal: AbortSignal.timeout(timeoutMs),
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model, state: evidenceState(input), questions: { satisfied: { type: "noul", instructions: QUESTION } } }),
        });
        if (!res.ok) return fallback(res.status === 402 ? "402 payment required" : `HTTP ${res.status}`);
        const body = await res.json();
        const p = body.answers?.satisfied?.noul;
        if (typeof p !== "number") return fallback("no probability in reply");
        const tokens = (body.usage?.input_tokens || 0) + (body.usage?.output_tokens || 0);
        const reasons = input.evidence?.failures?.slice(0, 4) || [];
        return { p: Math.round(p * 1000) / 1000, reasons, source: model, tokens, cost: body.usage?.cost ?? null };
      } catch (error) {
        return fallback(error.name === "TimeoutError" ? "timeout" : error.message.slice(0, 60));
      }
    },
  };
}

// REM_COMPLETION=jev uses Jev when OPENROUTER_API_KEY exists; stub otherwise (and by default).
export function createCompletionGate() {
  return process.env.REM_COMPLETION === "jev" && process.env.OPENROUTER_API_KEY ? createJevGate() : createStubGate();
}
