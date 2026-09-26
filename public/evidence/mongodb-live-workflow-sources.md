Unverified draft

Not executed

Action: Draft an orders query rollout and rollback checklist.

[source:e1291b6a0df86d9e95d8b5d076aa2c211ac44443834047f0ef803ddf88a900e5] Example meeting notes, supplied for this demonstration. Orders query p95 latency is 180 ms and timeout rate is 0.6%. Compare explain plans in staging and check query shape, examined documents and index coverage before proposing any change.

[source:71a1c70ee593d1dca41a7dcecef1b8e1d4ad7755ccfcbfb88eeec3ab0b0fc2da] Example workflow constraint: Do not run database writes or create indexes. Compare explain plans in staging only. Prepare a local draft for human review; do not publish an issue, send a message or change a database.

What still needs review:
- Verification of the proposed rollout and rollback criteria against live data.
- Confirmation of the owner responsible for the review.