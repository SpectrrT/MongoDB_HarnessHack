// Turns raw episodes into candidate facts for Merge. This is a deterministic extractor;
// the consolidator model (routing.consolidator) can produce the same shape.
export const NOISE_THRESHOLD = 0.3;

const owner = (o) => o || "none";

export function observationFact(fact) {
  const { type, title, week } = fact;
  switch (type) {
    case "SHIPPED":
    case "DONE":
      return { kind: "shipped", subject: `shipped: ${title}`, value: "shipped", owner: fact.owner ?? null, week, text: `Shipped: ${title} (owner: ${owner(fact.owner)}) in ${week}` };
    case "BLOCKER":
      return { kind: "blocker", subject: `blocker: ${title}`, value: "open", owner: fact.owner ?? null, week, text: `Blocker: ${title} (owner: ${owner(fact.owner)}) — open as of ${week}` };
    case "RESOLVED":
      return { kind: "blocker", subject: `blocker: ${title}`, value: "resolved", owner: null, week, text: `Resolved blocker: ${title} (as of ${week})` };
    case "DECISION":
      return { kind: "decision", subject: `decision: ${fact.subject}`, value: fact.value, week, text: `Decision: ${fact.subject} → ${fact.value} (as of ${week})` };
    case "ACTION":
    case "NEXT":
      return { kind: "action", subject: `action: ${title}`, value: "planned", owner: fact.owner ?? null, week, text: `Action: ${title} (owner: ${owner(fact.owner)}) — ${week}` };
    case "CHECK":
      return { kind: "check", subject: `release check: ${title}`, value: "check", owner: fact.owner ?? null, week, text: `Release checklist item: ${title} (owner: ${owner(fact.owner)})` };
    case "OPEN":
    case "DECISION NEEDED":
      return { kind: "question", subject: `open question: ${title}`, value: "open", week, text: `Open product question: ${title} (as of ${week})` };
    case "RECIPIENTS":
      return { kind: "recipients", subject: `thread: ${fact.subject}`, value: fact.value, week: fact.week, text: `Thread "${fact.subject}" reply-all: ${fact.value.join(", ")}` };
    default:
      return null;
  }
}

export function factsOf(episode) {
  if (episode.kind === "observation" && episode.fact) {
    if ((episode.importance ?? 0) < NOISE_THRESHOLD) return [];
    const f = observationFact(episode.fact);
    return f ? [{ ...f, importance: episode.importance }] : [];
  }
  return (episode.facts || []).map((f) => ({ importance: episode.importance ?? 0.9, ...f }));
}

// What a human correction or a demonstration note teaches, as preference facts.
export const PREFERENCES = Object.freeze({
  "customer-name-leak": { kind: "preference", subject: "preference: customer names", value: "exclude", text: "Keep customer names out of internal updates" },
  "external-recipient": { kind: "preference", subject: "preference: internal recipients", value: "internal-only", text: "Send internal updates only to internal recipients (@offload.test)" },
  "guessed-owner": { kind: "preference", subject: "preference: missing owners", value: "ask", text: "Ask when an action item has no owner instead of guessing" },
  "deleted-real-doc": { kind: "preference", subject: "preference: deleting drafts", value: "list-first", text: 'List drafts before deleting them; delete only titles starting with "Draft:"' },
});

export const teamFact = (team) => ({
  kind: "team",
  subject: "team list",
  value: team,
  text: `Team list for internal updates: ${team.join(", ")}`,
});
