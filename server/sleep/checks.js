// Deterministic guardrail checks over a handoff draft. Sleep may only select
// checks from this registry; it never generates executable code.
const text = draft => [draft.summary, ...draft.claims.map(c => c.text)].join('\n');
const notesText = notes => notes.map(n => n.text).join('\n');
const blockerWords = /\b(block(ed|er|ers|ing)?|waiting on|pending|stuck|risk)\b/i;
const owners = notes => [...new Set([...notesText(notes).matchAll(/\b([A-Z][a-z]+) (?:owns|will|is handling|is on)\b/g)].map(m => m[1]))];

export const CHECKS = {
  citations: {
    description: 'Every claim cites at least one supplied source ID.',
    run: (draft, notes) => {
      const ids = new Set(notes.map(n => n.id));
      return draft.claims.length > 0 && draft.claims.every(c => c.sourceIds.length && c.sourceIds.every(id => ids.has(id)));
    },
  },
  'mentions-blockers': {
    description: 'When notes describe a blocker, the handoff states it.',
    applies: notes => blockerWords.test(notesText(notes)),
    run: draft => blockerWords.test(text(draft)),
  },
  'names-owners': {
    description: 'Every owner named in the notes appears in the handoff.',
    applies: notes => owners(notes).length > 0,
    run: (draft, notes) => owners(notes).every(name => text(draft).includes(name)),
  },
  'states-next-steps': {
    description: 'The handoff states concrete next steps.',
    run: draft => /\b(next steps?|action items?|to do|todo|follow[- ]up)\b/i.test(text(draft)),
  },
  'max-summary-length': {
    description: 'The summary stays under 600 characters.',
    run: draft => draft.summary.length <= 600,
  },
};
export const CHECK_IDS = Object.keys(CHECKS);

// Returns per-check results. Checks that do not apply to a case pass as n/a.
export function runChecks(ids, draft, notes) {
  return Object.fromEntries(ids.map(id => {
    const check = CHECKS[id];
    if (!check) return [id, { passed: false, applies: true, error: 'Unknown check.' }];
    if (check.applies && !check.applies(notes)) return [id, { passed: true, applies: false }];
    return [id, { passed: !!check.run(draft, notes), applies: true }];
  }));
}
