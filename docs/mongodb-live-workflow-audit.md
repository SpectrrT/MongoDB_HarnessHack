# Model-generated MongoDB example

One real GPT-4o call through OpenRouter produced a local rollout and rollback checklist from explicitly supplied sample meeting notes. It used **963 input tokens and 457 output tokens**, **1,420 total**, at a reported cost of **$0.0069775**. The draft paused for review. Approval reused it with zero further model calls.

All eight declared content checks and both local file checks passed. The two published artifact hashes match the approved files byte for byte. These checks establish local draft delivery and content presence, not database performance or broad semantic correctness.

The source notes supply **180 ms p95 latency** and **0.6% timeouts** as example baselines. The generated **200 ms** and **1%** rollback thresholds are proposed choices requiring owner review. They are neither measured values nor source facts, and no database execution was approved.

Public artifacts:

- `/evidence/mongodb-live-workflow.json`: compact usage, provenance, checks, and hashes.
- `/evidence/mongodb-live-workflow.md`: exact generated draft.
- `/evidence/mongodb-live-workflow-sources.md`: exact generated source notes.

No queries ran, no indexes changed, no issues were updated, and no messages were sent. Account identifiers, credentials, task-owner identifiers, and private filesystem paths are omitted from the public receipt.
