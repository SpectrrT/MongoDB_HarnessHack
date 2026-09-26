// Harness fit, step one: turn an agent's session log into turns. A turn is one human prompt and what the
// agent did about it (tool calls, blocks, errors, questions, silences), plus how the person reacted in
// their next message (corrections, insisting, impatience, repeating themselves, interrupting). Only
// short redacted excerpts are kept: never tool outputs, and never anything that looks like a secret.
import path from 'node:path';

// Secrets never leave this function: emails, connection strings, keys and tokens, and any long mixed
// letters-and-digits word such as a generated password.
export function redact(text, max = 280) {
  if (!text) return '';
  const clean = String(text)
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s@/]*:[^\s@/]*@\S+/gi, '[connection string]')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\b(sk|pk|rk|ghp|gho|xox[abp]|AKIA)[-_A-Za-z0-9]{8,}\b/g, '[key]')
    .replace(/\b(?=[A-Za-z0-9_-]{12,}\b)(?=[^\s]*[A-Z])(?=[^\s]*[a-z])(?=[^\s]*\d)[A-Za-z0-9_-]+\b/g, '[secret]')
    .replace(/\b(pass(word)?|pwd|token|secret|api[_ -]?key)(\s+(is|=|:))?\s+\S+/gi, '$1 [secret]')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

const words = (text) => String(text || '').toLowerCase().match(/[a-z0-9']{3,}/g) || [];
const jaccard = (a, b) => {
  const x = new Set(words(a)), y = new Set(words(b));
  if (x.size < 4 || y.size < 4) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
};

const CORRECTION = /^\s*(no|nope|wrong|stop|instead)\b|\bthat'?s (not|wrong)\b|\bi (said|meant|already (said|told))\b|\bnot what i\b/i;
const INSIST = /\bjust do (it|this)\b|\bi gave you (explicit )?permission\b|\bdon'?t ask\b|\bdont ask\b|\bdo it yourself\b|^\s*NO\b/;
const GRANT = /\b(yes,? )?you can (commit|push|login|log in|merge|deploy|sign in)\b/i;
const IMPATIENCE = /what'?s going on|why (are|aren'?t|is|isn'?t) (you|it)\b|are you (still )?(working|there)|taking (so|too) long|hurry|\?{2,}|!{2,}/i;
// Standing instructions, as opposed to one-off requests or pasted documents.
const STANDING = [
  /\b(always|never|from now on|going forward|every time|each time|remember (to|that)|keep this as a memory|as a memory)\b/i,
  /\b(don'?t|dont|do not|stop) (ask|asking|use|using|open|opening|look|looking|touch|touching|wait|waiting)\b/i,
  /\byou can (commit|push|login|log in|merge|deploy|sign in)\b/i,
  /\bjust (push|commit|run|use|merge)\b/i,
  /\bmake sure (that )?you\b/i,
];
// Harness notes that arrive inside a user turn; they are not the person's words.
const SYSTEM_NOTE = /Your response above was stopped by a safety classifier[\s\S]*$|This is how Claude Code surfaces messages[\s\S]*$/;
const ACT = /\b(add|build|make|fix|do|create|update|delete|drop|push|commit|run|set ?up|deploy|connect|start|implement|change|remove|write|copy|record|install)\b/i;

export function intentOf(prompt) {
  const p = String(prompt || '').trim();
  if (/what'?s going on|status|where (are|do) (we|things) stand/i.test(p)) return 'status';
  if (ACT.test(p) && !/^\s*(what|why|how|when|which|who|is|are|do|does|did|can you tell)\b/i.test(p)) return 'act';
  if (/\?\s*$/.test(p) || /^\s*(what|why|how|when|which|who|is|are|do|does|did)\b/i.test(p)) return 'ask';
  return 'act';
}

export function reactionTo(turn, next) {
  if (!next || next.session !== turn.session) return { any: false };
  const text = next.promptRaw || '';
  const r = {
    correction: CORRECTION.test(text),
    insist: INSIST.test(text),
    grant: GRANT.test(text),
    impatience: IMPATIENCE.test(text),
    redo: jaccard(turn.promptRaw, text) >= 0.45,
    minutesLater: Math.round((new Date(next.start) - new Date(turn.end || turn.start)) / 60000),
  };
  r.any = r.correction || r.insist || r.grant || r.impatience || r.redo;
  return r;
}

export function frictionOf(turn) {
  const r = turn.reaction || {};
  const score = 0.5 * !!r.correction + 0.6 * !!r.insist + 0.3 * !!r.grant + 0.6 * !!r.impatience + 0.3 * !!r.redo + 0.4 * !!turn.interrupted;
  return Math.min(1, Math.round(score * 100) / 100);
}

// What the person told the agent to do from now on, in their own words.
export function preferencesIn(prompt) {
  return String(prompt || '')
    .slice(0, 1200)
    .split(/(?<=[.!?])\s+|\n+|\(|\)/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12 && s.length <= 240 && STANDING.some((re) => re.test(s)) && !/\?\s*$/.test(s))
    .map((s) => redact(s, 160));
}

function summarize(name, input = {}) {
  if (name === 'Bash') return redact(input.description || String(input.command || '').split(/\s/)[0], 90);
  if (['Edit', 'Write', 'Read', 'NotebookEdit'].includes(name)) return input.file_path ? path.basename(input.file_path) : '';
  if (name === 'Agent') return redact(input.description, 90);
  if (name === 'AskUserQuestion') return redact(input.questions?.[0]?.question, 120);
  return '';
}

const textsOf = (content) =>
  typeof content === 'string' ? [content] : (content || []).filter((c) => c?.type === 'text').map((c) => c.text || '');
const isHuman = (e) =>
  e.type === 'user' &&
  (e.origin ? e.origin.kind === 'human' : typeof e.message?.content === 'string' && !/^\s*[<[]/.test(e.message.content)) &&
  !(Array.isArray(e.message?.content) && e.message.content.some((c) => c?.type === 'tool_result'));

// Claude Code session log (one JSON object per line) → turns with features and reactions.
export function turnsFromClaudeCode(lines, { agent = 'claude-code' } = {}) {
  const turns = [];
  const tools = new Map();
  let turn = null;
  for (const line of lines) {
    let e;
    try {
      e = typeof line === 'string' ? JSON.parse(line) : line;
    } catch {
      continue;
    }
    if (!e || e.isSidechain) continue;
    const content = e.message?.content;
    if (isHuman(e)) {
      const raw = textsOf(content).join('\n');
      if (/^\s*\[Request interrupted/.test(raw)) {
        if (turn) turn.interrupted = true;
        continue;
      }
      turn = {
        agent,
        session: e.sessionId,
        project: e.cwd ? path.basename(e.cwd) : null,
        start: e.timestamp,
        end: e.timestamp,
        promptRaw: raw.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ').replace(SYSTEM_NOTE, '').trim(),
        tools: [],
        replies: [],
        interrupted: false,
      };
      turns.push(turn);
      continue;
    }
    if (!turn) continue;
    if (e.type === 'user') {
      for (const text of textsOf(content)) if (/^\s*\[Request interrupted/.test(text)) turn.interrupted = true;
      for (const c of Array.isArray(content) ? content : []) {
        if (c?.type !== 'tool_result') continue;
        const t = tools.get(c.tool_use_id);
        if (!t) continue;
        const out = typeof c.content === 'string' ? c.content : JSON.stringify(c.content || '');
        t.ok = !c.is_error;
        if (c.is_error && /permission .*denied|denied by|not allowed|was blocked/i.test(out))
          t.blocked = /classifier|safety/i.test(out) ? 'safety' : 'permission';
      }
      continue;
    }
    if (e.type === 'assistant') {
      turn.end = e.timestamp || turn.end;
      for (const c of Array.isArray(content) ? content : []) {
        if (c?.type === 'tool_use') {
          const t = { name: c.name, summary: summarize(c.name, c.input), ok: true, blocked: null, at: e.timestamp };
          turn.tools.push(t);
          tools.set(c.id, t);
        } else if (c?.type === 'text' && c.text?.trim()) turn.replies.push({ at: e.timestamp, text: c.text });
      }
    }
  }
  return turns.map((t, i) => finish(t, turns[i + 1]));
}

function finish(t, next) {
  const times = [t.start, ...t.replies.map((r) => r.at), t.end].map((x) => +new Date(x)).filter(Boolean);
  let silenceSec = 0;
  for (let i = 1; i < times.length; i++) silenceSec = Math.max(silenceSec, (times[i] - times[i - 1]) / 1000);
  const last = t.replies.at(-1)?.text || '';
  const blocked = t.tools.filter((x) => x.blocked);
  const firstBlock = t.tools.findIndex((x) => x.blocked);
  const turn = {
    agent: t.agent,
    session: t.session,
    project: t.project,
    start: new Date(t.start),
    end: new Date(t.end),
    durationSec: Math.round((new Date(t.end) - new Date(t.start)) / 1000),
    silenceSec: Math.round(silenceSec),
    prompt: redact(t.promptRaw) || '[harness note]',
    promptRaw: t.promptRaw,
    intent: intentOf(t.promptRaw),
    tools: t.tools.map(({ at, ...x }) => x),
    toolCount: t.tools.length,
    toolNames: [...new Set(t.tools.map((x) => x.name))],
    errors: t.tools.filter((x) => !x.ok && !x.blocked).length,
    blockedSafety: blocked.filter((x) => x.blocked === 'safety').length,
    blockedPermission: blocked.filter((x) => x.blocked === 'permission').length,
    retriedAfterBlock: firstBlock >= 0 && t.tools.slice(firstBlock + 1).some((x) => x.name === t.tools[firstBlock].name),
    asked: t.tools.some((x) => x.name === 'AskUserQuestion') || /\?\s*$/.test(last.trim()) || /\b(want me to|should i|shall i)\b/i.test(last.slice(-300)),
    askedTool: t.tools.some((x) => x.name === 'AskUserQuestion'),
    declined: /\b(i can'?t|i cannot|i won'?t|not allowed|off-limits|isn'?t something i can)\b/i.test(last),
    // A refusal on safety grounds (credentials, security): the harness may make these smoother, never looser.
    boundary: /\b(i can'?t|i cannot|i won'?t|not allowed|off-limits)\b/i.test(last) && /pass(word)?|credential|secret|safety|security|keystroke|sign[- ]?in/i.test(last),
    reply: redact(last, 200),
    interrupted: t.interrupted,
    preferences: preferencesIn(t.promptRaw),
  };
  turn.reaction = reactionTo(turn, next && { ...next, promptRaw: next.promptRaw, start: next.start });
  turn.friction = frictionOf(turn);
  return turn;
}
