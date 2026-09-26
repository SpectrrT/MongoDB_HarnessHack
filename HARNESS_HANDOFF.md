# Durable harness implementation, September 26

## Repository and provenance

Active destination: SpectrrT/MongoDB_Harness, branch ryan/durable-harness.
Ryan's teammate will manually transfer to SpectrrT/MongoDB_HarnessEngineering later.
Do not change remotes or publish to the new repository during this work.

Base: main 295734c. Imported yesterday's Sleep change e933a06 as b8bc428.
Those are pre-event contributions. New server/harness code, harness endpoints,
Harness page and integration tests are the September 26 milestone. Preserve
this distinction in submission materials and confirm baseline eligibility.

## Start

1. npm ci
2. Create an ignored .env from .env.example. Configure MONGODB_URI using the
   event sandbox, MONGODB_DATABASE, OPENROUTER_API_KEY and OFFLOAD_MODEL.
   Use a model supporting JSON output. Credentials stay on the server.
3. npm run build
4. npm run harness:server
5. In another terminal: npm run harness:worker
6. Open http://127.0.0.1:5194/app/harness and complete onboarding if needed.

The worker continues with the browser closed while its process is running.
It is not yet deployed or managed by a service supervisor. The existing demo
workspace remains local; the new harness runs are separately MongoDB-backed.

## Implemented and boundaries

- Atlas-compatible MongoDB driver and indexes. No silent file fallback.
- Idempotent enqueue scoped to the visitor; changed payload returns conflict.
- Atomic worker claim, renewable leases and a unique token fencing stale workers.
- Four persisted steps: context, model draft, citation integrity, internal artifact.
- Checkpoint, output and receipt update in one atomic document operation.
- Temporary model failures retry with backoff; malformed output fails closed.
- Bounded inputs and outputs; no tool execution from model output.
- UI submits notes, restores the last run and displays receipts and artifacts.
- No external write side effects. Receipt guarantees concern internal artifacts
  only. A crash can repeat a model call and incur another charge; this is not
  a claim of exactly-once model execution or arbitrary external actions.
- Citation integrity is not semantic factuality or a held-out quality evaluation.
- Browser cookie isolation is not production authentication. Keep server bound
  to loopback until authentication, budgets and deployment controls exist.

## Verification

npm test runs the existing suite and six MongoDB integration scenarios against
an actual disposable local mongod, with a deterministic provider stub.
Coverage: concurrent enqueue, competing claims, abandoned lease recovery,
stale-writer rejection, fresh-connection checkpoint recovery, invalid citations,
provider retry, visitor isolation, input validation and missing configuration.
No live Atlas or paid provider verification is claimed until credentials exist.

## Next work in priority order

1. Connect event sandbox and model key, verify a real end-to-end handoff.
2. Persist cross-run memories with provenance and explicit supersession.
3. Add policy versions for context selection, validation and allowed tools.
4. Capture corrections and failed checks as adaptation inputs.
5. Propose a policy change, evaluate on held-out fixtures, promote only if
   improved with no regression, and support rollback. No fabricated scores.
6. Inject real process death and demonstrate recovery across independent workers.
7. Add one read-only repository connector and production auth before hosting.
8. Rehearse 60-second video and three-minute live demo using actual outputs.
9. Resolve prior-work eligibility and vendor rights, then make submission repo
   public with teammate, verify accessible link and video playback, add all members.

## Event resource guide reviewed

Required: event-provided Atlas sandbox. OpenRouter event credits and Codex
credits arrive after check-in. LangSmith provides tracing/deployment resources;
Voyage provides embedding/reranking resources. Neither is required for this
first durable execution milestone. Credit activation requiring billing details
remains a user action. Partner offers are document claims, not redeemed credits.

## Design references

MongoDB atomic compound operations:
https://www.mongodb.com/docs/drivers/node/current/crud/compound-operations/
OpenRouter chat API:
https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request
