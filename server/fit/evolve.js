// Harness fit, step two: from turns to a better harness. Each mechanism is a bounded edit to an agent's
// harness (a rule, a context policy, a guardrail, or tool access) with a test over recorded turns: which
// frustrated turns it would have addressed, and which turns it could have made worse. The gate is a
// backtest on the person's own history: accept only edits that address at least MIN_HITS frustrated
// turns and more turns than they put at risk. Edits never loosen a guardrail or widen tool access on
// their own; those become asks. Safety refusals are made smoother, never removed.
export const MIN_HITS = 2;

const r = (t) => t.reaction || {};
export const MECHANISMS = [
  {
    id: 'act-without-asking',
    type: 'rule',
    text: 'Do routine steps yourself (commands, commits, pushes, browser clicks) and report what you did. Ask only for passwords, payments or destructive changes.',
    pattern: 'You had to push or grant permission for routine work',
    addresses: (t) => (r(t).insist || r(t).grant) && !t.boundary,
    risks: (t) => t.askedTool && !r(t).any && !t.interrupted,
    riskLabel: 'turns where a question from the agent was answered calmly',
  },
  {
    id: 'boundary-handoff',
    type: 'rule',
    text: 'When a safety rule stops you (credentials, security), say so in one sentence and hand over the fastest path the person can run themselves: one command or one click path.',
    pattern: 'A safety refusal left you stuck',
    addresses: (t) => t.boundary && (r(t).insist || r(t).correction || r(t).impatience),
    risks: () => false,
  },
  {
    id: 'status-updates',
    type: 'context',
    text: 'During long work, post a one-line status every two to three minutes and say what you are waiting on. Never end a turn idle while background work or a decision is pending.',
    pattern: 'Long or silent work, then impatience',
    addresses: (t) => r(t).impatience || (t.interrupted && (t.durationSec >= 600 || t.silenceSec >= 180)),
    risks: () => false,
  },
  {
    id: 'respect-blocks',
    type: 'guardrail',
    text: 'After a permission or safety block, do not retry the same outcome through another tool. Stop, explain what is needed, and give the person the steps.',
    pattern: 'Blocked tool calls, then frustration or retries',
    addresses: (t) => t.blockedSafety > 0 && (r(t).any || t.interrupted || t.retriedAfterBlock),
    risks: () => false,
  },
  {
    id: 'confirm-target',
    type: 'rule',
    text: 'Before multi-step work, restate the goal and the target (repo, branch, project, database) in one line.',
    pattern: 'You corrected where the work went',
    addresses: (t) => r(t).correction && !r(t).insist && !t.boundary && t.toolCount >= 3,
    risks: (t) => t.intent === 'act' && t.toolCount <= 2 && !t.friction,
    riskLabel: 'quick tasks that went fine and would get an extra step',
  },
];

// Standing instructions the person gave, grouped by topic and kept in their own words.
const TOPICS = [
  { id: 'git', type: 'rule', label: 'Git workflow', re: /\b(commit|push|pushing|main|merge|pr|branch|reconcile)\b/i },
  { id: 'tools', type: 'tool-access', label: 'Tools to prefer', re: /\b(mcp|tabs?|browser|chrome|terminal|atlas)\b/i },
];

export function toolUsage(turns) {
  const byTool = new Map();
  for (const t of turns)
    for (const x of t.tools) {
      const row = byTool.get(x.name) || { tool: x.name, calls: 0, inFrustratedTurns: 0, errors: 0, blocked: 0 };
      row.calls++;
      if (t.friction > 0) row.inFrustratedTurns++;
      if (!x.ok && !x.blocked) row.errors++;
      if (x.blocked) row.blocked++;
      byTool.set(x.name, row);
    }
  return [...byTool.values()].sort((a, b) => b.calls - a.calls);
}

export function analyze(turns) {
  const frustrated = turns.filter((t) => t.friction > 0);
  const totalFriction = turns.reduce((s, t) => s + t.friction, 0) || 1;
  const proposals = [];
  for (const m of MECHANISMS) {
    const hits = turns.filter(m.addresses);
    const risks = turns.filter(m.risks);
    const share = hits.reduce((s, t) => s + t.friction, 0) / totalFriction;
    const accepted = hits.length >= MIN_HITS && hits.length > risks.length;
    proposals.push({
      id: m.id,
      type: m.type,
      text: m.text,
      pattern: m.pattern,
      source: 'mechanism',
      prediction: { addresses: hits.length, risks: risks.length, frictionShare: Math.round(share * 100) / 100 },
      evidence: hits.slice(0, 5).map((t) => ({ turn: t._id, prompt: t.prompt, signals: signalsOf(t) })),
      riskLabel: m.riskLabel || null,
      decision: accepted ? 'accepted' : 'rejected',
      reason: accepted
        ? `addresses ${hits.length} frustrated turns, risks ${risks.length}`
        : hits.length < MIN_HITS
          ? `addresses ${hits.length} turn${hits.length === 1 ? '' : 's'}; needs ${MIN_HITS}`
          : `risks ${risks.length} turns (${m.riskLabel}) against ${hits.length} addressed`,
    });
  }
  const said = turns.flatMap((t) => t.preferences.map((text) => ({ text, turn: t._id, start: t.start })));
  for (const topic of TOPICS) {
    const quotes = said.filter((p) => topic.re.test(p.text)).sort((a, b) => new Date(b.start) - new Date(a.start));
    if (!quotes.length) continue;
    proposals.push({
      id: `preference-${topic.id}`,
      type: topic.type,
      text: `${topic.label}, in your words: ${quotes.slice(0, 2).map((q) => `"${q.text}"`).join(' ')}`,
      pattern: 'You stated this directly',
      source: 'preference',
      prediction: { addresses: quotes.length, risks: 0, frictionShare: 0 },
      evidence: quotes.slice(0, 3).map((q) => ({ turn: q.turn, prompt: q.text, signals: ['stated'] })),
      decision: 'accepted',
      reason: `stated ${quotes.length} time${quotes.length === 1 ? '' : 's'}`,
    });
  }
  const permissionBlocks = new Map();
  for (const t of turns) for (const x of t.tools) if (x.blocked === 'permission') permissionBlocks.set(x.name, (permissionBlocks.get(x.name) || 0) + 1);
  for (const [tool, n] of permissionBlocks)
    if (n >= MIN_HITS)
      proposals.push({
        id: `allow-${tool}`,
        type: 'tool-access',
        text: `Allow ${tool} in this project without a prompt.`,
        pattern: 'The same tool was blocked by a permission prompt',
        source: 'mechanism',
        prediction: { addresses: n, risks: 0, frictionShare: 0 },
        evidence: [],
        decision: 'ask',
        reason: 'widens tool access, so a person decides',
      });
  return {
    turns: turns.length,
    sessions: new Set(turns.map((t) => t.session)).size,
    toolCalls: turns.reduce((s, t) => s + t.toolCount, 0),
    frustrated: frustrated.length,
    safetyBlocks: turns.reduce((s, t) => s + t.blockedSafety, 0),
    permissionBlocks: [...permissionBlocks.values()].reduce((a, b) => a + b, 0),
    tools: toolUsage(turns),
    proposals,
  };
}

export const signalsOf = (t) =>
  ['correction', 'insist', 'grant', 'impatience', 'redo'].filter((k) => r(t)[k]).concat(t.interrupted ? ['interrupted'] : []);

// The accepted edits as a block for the agent's own instructions file (CLAUDE.md for Claude Code).
export function harnessPatch(version) {
  const line = (e) => `- ${e.text}`;
  const group = (types) => version.edits.filter((e) => types.includes(e.type));
  const parts = [`## Learned from how we work (Offload harness fit, v${version.version})`, ''];
  const sections = [
    ['Rules', ['rule']],
    ['Context', ['context']],
    ['Guardrails', ['guardrail']],
    ['Tools', ['tool-access']],
  ];
  for (const [title, types] of sections) {
    const edits = group(types);
    if (edits.length) parts.push(`${title}:`, ...edits.map(line), '');
  }
  return parts.join('\n').trim() + '\n';
}
