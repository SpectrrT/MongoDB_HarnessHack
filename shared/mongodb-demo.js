// Explicit example inputs for the MongoDB engineer demo. These are synthetic, not captured history.
export const MONGODB_DEMO = Object.freeze({
  title: 'Example: Orders query review',
  projectId: 'mongodb-demo',
  projectTitle: 'Example: Orders service',
  meetingId: 'orders-query-review',
  routineText: 'Example weekly workflow: review Atlas slow queries for the orders service, inspect the GitHub query code, update the issue tracker, then draft review notes. Compare explain plans in staging and draft an index rollout and rollback checklist. Do not create indexes or run database writes.',
});

export function mongodbDemoOccurrences(now = new Date()) {
  const hour = new Date(now);
  if (!Number.isFinite(+hour)) throw new TypeError('The example needs a valid date.');
  hour.setUTCMinutes(0, 0, 0);
  return [20, 13, 6].map(days => new Date(+hour - days * 86400e3).toISOString());
}

export function mongodbDemoSources(now = new Date()) {
  const clock = new Date(now);
  const occurrences = mongodbDemoOccurrences(clock);
  const base = { projectId: MONGODB_DEMO.projectId, projectTitle: MONGODB_DEMO.projectTitle, origin: 'user' };
  const events = occurrences.map(timestamp => {
    const day = timestamp.slice(0, 10);
    return { ...base, sourceId: `example-orders-routine-${day}`, sessionId: `example-orders-${day}`,
      timestamp, kind: 'routine', text: MONGODB_DEMO.routineText,
      locator: `example://mongodb/weekly-orders-review/${day}` };
  });
  const sessionId = `example-orders-meeting-${clock.toISOString().slice(0, 10)}`;
  const meeting = { id: MONGODB_DEMO.meetingId, title: MONGODB_DEMO.title,
    startsAt: new Date(+clock - 35 * 60e3).toISOString(), endsAt: new Date(+clock - 5 * 60e3).toISOString(), status: 'completed' };
  events.push({ ...base, sourceId: `${sessionId}:notes`, sessionId, timestamp: new Date(+clock - 4 * 60e3).toISOString(), kind: 'meeting-note', meeting,
    locator: 'example://mongodb/orders-query-review/meeting-notes',
    text: 'Example meeting notes, supplied for this demonstration. Orders query p95 latency is 180 ms and timeout rate is 0.6%. Compare explain plans in staging and check query shape, examined documents and index coverage before proposing any change.\nAction: Draft an orders query rollout and rollback checklist.\nInclude baseline metrics, staging checks, a proposed rollout plan, rollback criteria and a place for the owner to review. These are example metrics, not live measurements.' });
  events.push({ ...base, sourceId: `${sessionId}:constraint`, sessionId, timestamp: new Date(+clock - 3 * 60e3).toISOString(), kind: 'constraint',
    locator: 'example://mongodb/orders-query-review/constraints',
    text: 'Example workflow constraint: Do not run database writes or create indexes. Compare explain plans in staging only. Prepare a local draft for human review; do not publish an issue, send a message or change a database.' });
  return events;
}
