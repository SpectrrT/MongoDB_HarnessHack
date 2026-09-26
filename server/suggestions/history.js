import { createHash } from 'node:crypto';
import { z } from 'zod';
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const identifier = z.string().regex(/^[a-zA-Z0-9_.:-]{1,120}$/);
export const eventSchema = z.object({
  sourceId: identifier, sessionId: identifier, projectId: identifier,
  projectTitle: z.string().trim().min(1).max(120), timestamp: z.iso.datetime({ offset: true }),
  text: z.string().trim().min(1).max(4000),
  kind: z.enum(['request', 'constraint', 'correction', 'commitment', 'decision']).default('request'),
  origin: z.enum(['claude', 'codex', 'user']).default('user'),
  locator: z.string().max(240).default('User import'),
}).strict();
const SECRET = /(?:Bearer\s+[\w.-]{12,}|sk-[\w-]{15,}|AIza[\w-]{15,}|mongodb(?:\+srv)?:\/\/|(?:password|api[_ -]?key|access[_ -]?token)\s*[:=]\s*\S+)/i;
export function normalizeEvent(raw) {
  const event = eventSchema.parse(raw);
  if (SECRET.test(event.text) || SECRET.test(event.locator)) throw Error('Source contains a possible credential. Remove it before importing.');
  if (/<(?:system-reminder|task-notification|local-command|pasted_content)/i.test(event.text)) throw Error('Import a user request, not pasted system or tool content.');
  const normalized = event.text.toLowerCase().replace(/\s+/g, ' ').trim();
  const family = /\b(?:find|recover|remember|review|pull|context|look|go through)\b.{0,100}\b(?:sessions?|conversations?)\b|\b(?:find|recover|review|pull|look)\b.{0,60}\b(?:previous|prior|our|that|last)\s+chat\b|\b(?:session|conversation)\b.{0,100}\b(?:find|context|remember|done)\b/i.test(normalized) ? 'recover-context' : null;
  const protectedRecord = event.kind !== 'request' || /\b(must|never|do not|don't|correction|unresolved|pending|permission|deadline)\b/i.test(event.text);
  return { ...event, family, protectedRecord, textHash: digest(normalized), timestamp: new Date(event.timestamp) };
}

// Streaming-friendly adapters emit only authored user text. Tool results and compacted summaries are excluded.
export function authoredRequest(record, { projectId, projectTitle, origin, sessionId }) {
  let text, sourceId = record.uuid || record.id;
  if (origin === 'claude' && record.type === 'user' && !record.isMeta && !record.isCompactSummary) {
    const content = record.message?.content;
    text = typeof content === 'string' ? content : content?.filter(b => b.type === 'text').map(b => b.text).join('\n');
  } else if (origin === 'codex' && record.type === 'event_msg' && record.payload?.type === 'user_message') {
    text = record.payload.message;
    sourceId ||= digest([record.timestamp, text]);
  }
  if (!text || !sourceId || text.length > 4000 || /^This session is being continued|^<|^Last login:/.test(text.trim())) return null;
  try { return normalizeEvent({sourceId, sessionId, projectId, projectTitle, origin, text, timestamp: record.timestamp,
    locator: `${origin}:${sessionId}:${sourceId}`}); } catch { return null; }
}
