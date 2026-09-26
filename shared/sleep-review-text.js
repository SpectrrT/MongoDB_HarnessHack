// Format known saved Sleep reports for reading. The stored report stays unchanged.
export function sleepReviewText(text) {
  if (typeof text !== 'string' || !/^Sleep (?:produced a local candidate draft|paused before verifying the candidate)\./.test(text)) return text;
  return text.split(/\n\n/).map(paragraph => {
    if (paragraph === 'Sleep produced a local candidate draft.') return 'Your draft is ready to review.';
    if (paragraph.startsWith('Goal: ')) return paragraph.replace(/^Goal: (?:Explore|Investigate|Draft prototype): /, 'Goal: ');
    if (paragraph.startsWith('Hypotheses are unverified: ')) {
      try {
        const hypotheses = JSON.parse(paragraph.slice('Hypotheses are unverified: '.length));
        const statements = Array.isArray(hypotheses) ? hypotheses.map(item => typeof item === 'string' ? item : item?.text).filter(item => typeof item === 'string') : [];
        return statements.length ? 'Working assumption, still unverified: ' + statements.join(' ') : '';
      } catch { return 'The working assumptions still need review. See the evidence file.'; }
    }
    if (paragraph.startsWith('Offline counter execution: ')) {
      try {
        const result = JSON.parse(paragraph.slice('Offline counter execution: '.length));
        const details = value => Array.isArray(value) ? value.map(details).join('; ') : value && typeof value === 'object' ? Object.entries(value).map(([key, item]) => `${key.replace(/([a-z])([A-Z])/g, '$1 $2')}: ${details(item)}`).join(', ') : String(value);
        return `Offline counter check: ${result.passed ? 'passed' : 'did not pass'}.${Array.isArray(result.observedStates) ? ' Observed values: ' + result.observedStates.join(', ') + '.' : ''}${!result.passed && result.checks ? ' Details: ' + details(result.checks) : ''}`;
      } catch { return 'Offline counter check details could not be displayed. Review the original report before relying on this check.'; }
    }
    if (paragraph === 'These checks verify the declared file criteria, not semantic correctness or completion of the broader goal.') return 'File checks confirm the required draft files and contents. They do not prove the proposed solution is correct.';
    if (paragraph === 'Outcome: completed') return '';
    if (paragraph.startsWith('Unfinished work: ')) return 'Next: review the draft and test it against the original goal before applying it.';
    return paragraph;
  }).filter(Boolean).join('\n\n');
}
