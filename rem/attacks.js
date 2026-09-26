// Adversarial challenge, ported from the Sleep Lab: an edit that passed validation must also hold on
// the tasks it flipped when their evidence is presented differently. Every attack preserves the
// ground truth (the checkers' answer does not change); only order, noise and distractors do.
import { GYM, runGymTask } from "./gym.js";

export const ATTACKS = Object.freeze({
  reorder: "reverse the line order of every document",
  distract: "append irrelevant notes to every document",
  duplicate: "repeat every blocker and decision line",
  "unknown-state": "add status lines the parser does not know",
  "memory-noise": "add six recent, irrelevant memories",
  contradiction: "add an old memory that contradicts a current decision",
});

const NOISE = [
  "Team lunch moved to Friday",
  "Remember the offsite survey",
  "Parking validation is at the front desk now",
  "New espresso machine on floor 3",
  "Book the all-hands room early",
  "Laptop refresh requests are due next month",
];

const mapFiles = (ws, fn) => ({ ...ws, files: ws.files.map((f) => ({ ...f, body: fn(String(f.body || "")) })) });

export function attackTask(t, name) {
  const ws = t.workspace;
  switch (name) {
    case "reorder":
      return { ...t, workspace: mapFiles(ws, (b) => b.split("\n").reverse().join("\n")) };
    case "distract":
      return { ...t, workspace: mapFiles(ws, (b) => `${b}\nNOTE: Parking garage closes early on Friday\nNOTE: Offsite playlist suggestions welcome`) };
    case "duplicate":
      return { ...t, workspace: mapFiles(ws, (b) => b.split("\n").flatMap((l) => (/^(BLOCKER|DECISION)\b/.test(l) ? [l, l] : [l])).join("\n")) };
    case "unknown-state":
      return { ...t, workspace: mapFiles(ws, (b) => `${b}\nSTATUS: pending triage for an unnamed ticket`) };
    case "memory-noise":
      return { ...t, memories: [...t.memories, ...NOISE.map((text, i) => ({ text, ageDays: 1 + i }))] };
    case "contradiction":
      return { ...t, memories: [...t.memories, { text: "Decision: Release day → Friday (as of W20)", ageDays: 90 }] };
    default:
      throw new Error(`Unknown attack ${name}.`);
  }
}

const ALL = [...GYM.train, ...GYM.heldOut];

// Run every attack on each listed task under `genome`. Held = the attacked task still passes.
export async function challenge(genome, taskIds, opts) {
  const results = [];
  for (const t of ALL.filter((x) => taskIds.includes(x.id)))
    for (const name of Object.keys(ATTACKS)) {
      const r = await runGymTask(attackTask(t, name), genome, opts);
      results.push({ taskId: t.id, attack: name, pass: r.pass, failures: r.failures });
    }
  return {
    attacks: results.length,
    held: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).map(({ taskId, attack, failures }) => ({ taskId, attack, failures: failures.slice(0, 3) })),
  };
}
