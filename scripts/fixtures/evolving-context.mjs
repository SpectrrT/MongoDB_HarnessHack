// Synthetic chronological inputs. Expected answers stay in the evaluator, never
// in decision or answer-model requests. Each stage reveals only its new records.
const newsletters = Array.from({length: 12}, (_, i) => ({id: `newsletter-${i}`, text: `Office newsletter ${i}. ${'The film club watched a comedy. Cafeteria lunch features lentils, bread, and fruit. The garden club planted flowers beside the lobby. '.repeat(4)}`}));
const stage = (id, goal, append, expected, options = {}) => ({id, goal, append, expected, ...options});

export const evolvingCases = [
  {
    id: 'revived-routing',
    initial: [
      {id: 'route-j17', text: 'Routing plan J17 assigns eu-central-1.'},
      ...newsletters.slice(0, 6),
      {id: 'route-k88', text: 'Routing plan K88 assigns ap-southeast-2.'},
      ...newsletters.slice(6),
    ],
    stages: [
      stage('initial-region', 'Return JSON with region for the Atlas migration using its latest routing decision.', [{id: 'region-initial', text: 'At 09:00, Atlas migration region is us-west-2.'}], {region: 'us-west-2'}),
      stage('revived-j17', 'Return JSON with region for the Atlas migration using its latest routing decision.', [{id: 'route-update', text: 'At 10:00, Atlas migration now follows routing plan J17.'}], {region: 'eu-central-1'}, {required: ['route-j17', 'route-update']}),
      stage('corrected-k88', 'Return JSON with region for the Atlas migration using its latest routing decision.', [{id: 'route-correction', text: 'CORRECTION at 11:00: Atlas migration must follow routing plan K88 instead of J17.'}], {region: 'ap-southeast-2'}, {required: ['route-k88', 'route-correction']}),
      stage('same-read-new-step', 'Return JSON with region for the Atlas migration using its latest routing decision.', [{id: 'region-verify', text: 'At 11:15, the routing API confirms the Atlas migration target is ap-southeast-2.', dedupeKey: 'routing-api:ap-southeast-2'}], {region: 'ap-southeast-2'}),
    ],
  },
  {
    id: 'old-commitment',
    initial: [
      {id: 'release-policy', text: 'COMMITMENT: Orion release must have a signed security appendix and a passing checksum check before publishing. A reopened security issue blocks publication.'},
      {id: 'release-owner', text: 'At 09:00, the Orion release owner is Avery Chen.'},
      ...newsletters,
    ],
    stages: [
      stage('missing-appendix', 'Return JSON with owner and ready for the Orion release according to the recorded acceptance criteria and latest evidence.', [{id: 'release-state', text: 'At 09:10, the checksum check passed, but the signed security appendix is missing.'}], {owner: 'Avery Chen', ready: false}, {required: ['release-policy', 'release-owner', 'release-state']}),
      stage('owner-correction', 'Return JSON with owner and ready for the Orion release according to the recorded acceptance criteria and latest evidence.', [{id: 'owner-correction', text: 'CORRECTION at 10:00: Priya Raman now owns the Orion release. The security appendix is awaiting a signature.'}], {owner: 'Priya Raman', ready: false}),
      stage('evidence-complete', 'Return JSON with owner and ready for the Orion release according to the recorded acceptance criteria and latest evidence.', [{id: 'release-verified', text: 'At 11:00, Orion has a signed security appendix, its checksum check passed, and there are zero open security issues.'}], {owner: 'Priya Raman', ready: true}),
      stage('reopened', 'Return JSON with owner and ready for the Orion release according to the recorded acceptance criteria and latest evidence.', [{id: 'release-reopened', text: 'At 12:00, the Orion security issue was reopened after a failed access check. Publication is blocked.'}], {owner: 'Priya Raman', ready: false}),
    ],
  },
  {
    id: 'goal-change-and-recovery',
    initial: [
      {id: 'archive-bundle', text: 'Rollback bundle artifact: bundle-a41.zip. Exact sha: 7b31a90c4d20.'},
      ...newsletters.slice(0, 6),
      {id: 'invoice-receipt', text: 'Invoice delivery receipt INV-4827 reports delivered=true.'},
      ...newsletters.slice(6),
    ],
    stages: [
      stage('meeting', 'Return JSON with start and timezone for the customer review meeting.', [{id: 'meeting-state', text: 'Customer review starts at 09:30 in America/New_York.'}], {start: '09:30', timezone: 'America/New_York'}),
      stage('invoice-goal', 'Return JSON with key and delivered for the invoice delivery receipt.', [{id: 'invoice-goal-note', text: 'The meeting summary is complete. The current work is reconciling the invoice delivery receipt.'}], {key: 'INV-4827', delivered: true}),
      stage('archive-recovery', 'Return JSON with artifact and sha for the rollback bundle. Recover missing source evidence before answering.', [{id: 'recovery-pointer', text: 'The rollback bundle evidence is the earlier record archive-bundle. If its contents are absent, read that archived record to verify the exact artifact and sha.'}], {artifact: 'bundle-a41.zip', sha: '7b31a90c4d20'}, {workingSetOnly: true, requiredRetrieval: 'archive-bundle'}),
      stage('corrected-bundle', 'Return JSON with artifact and sha for the latest rollback bundle.', [{id: 'bundle-correction', text: 'CORRECTION: the latest rollback bundle replaces the old bundle. Its artifact is bundle-b72.zip and exact sha is 8c42b01d5e31.'}], {artifact: 'bundle-b72.zip', sha: '8c42b01d5e31'}),
    ],
  },
];

export function exactAnswer(actual, expected) {
  return Boolean(actual && typeof actual === 'object' && !Array.isArray(actual) && Object.keys(actual).length === Object.keys(expected).length && Object.entries(expected).every(([key, value]) => actual[key] === value));
}
