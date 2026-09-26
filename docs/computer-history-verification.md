# Computer History verification

Computer History records app names, window titles and page addresses from an explicitly started local collector. It does not transcribe meetings, read document contents, capture screenshots or record keystrokes. Saving a routine records a preference; it does not execute the routine.

## Verified September 26, 2026

The Atlas store was inspected without exporting personal activity. Its current 41,142 raw samples, 180 sessions and three cached routines were all marked `source: seed`. Both search indexes were ready. No recorded personal history was present at that check. Raw samples have a seven-day TTL; derived sessions persist until forgotten.

A separate, temporary Atlas database was used for an explicitly synthetic end-to-end check:

| Check | Result |
| --- | --- |
| Ingest synthetic observations | 324 samples |
| Aggregate sessions | 9 sessions over 3 days |
| Daily duration | 540 seconds, matching the fixture |
| Retrieve with native Atlas hybrid search | 3 results, all labeled synthetic |
| Detect repeated sequence | 1 routine across 3 distinct days |
| Forget history | 324 samples, 9 sessions and 1 derived routine removed |

Receipts: `docs/evidence/activity-atlas-validation.json` and `docs/evidence/activity-atlas-validation-v2.json`. The final source version is verified again in `docs/evidence/activity-atlas-validation-v3.json`. The first run passed the data checks but the Atlas account did not permit dropping the database itself. All four dedicated collections were subsequently removed. The verifier now cleans up its own collections directly. It does not touch the shared activity namespace.

Run again with the existing MongoDB environment configured:

```sh
node --env-file=.env scripts/verify-activity-atlas.mjs
```

The verifier creates only a unique `offload_activity_verify_*` database, uses local hashing embeddings, marks every sample `source: seed`, records source hashes, and removes its own collections. It makes no paid model calls and does not turn on capture.

## Reliability changes

- Sessions distinguish different URLs with the same page title and split foreground activity at local midnight.
- Search and routine counts keep seeded and recorded activity separate.
- Consecutive visits to the same app retain their full duration. A 75-minute working block can no longer appear as a 10-minute routine.
- Weekly patterns require three separate weeks on the same local weekday, within a one-hour time window. They are inferred app sequences, not proof that a task was completed.
- Routines must still have source evidence. Forgetting history also clears derived routine titles and counts. Remaining sessions can generate fresh candidates.
- A failed embedding provider falls back to keyword retrieval.
- Chrome incognito mode is checked before collecting a tab's title or address. Private-mode support in other browsers still depends on the existing title checks.
- Computer History APIs require the local app, including its explicit mutation header. They are disabled in production server mode.

Focused verification: `node --test tests/activity.test.js tests/rem-access.test.js`. The checks use a real temporary MongoDB server, including native aggregation, source separation, retrieval, deletion and access boundaries. Desktop capture itself has not been activated or claimed as tested against a user's live activity.

## MongoDB engineer example

`shared/mongodb-demo.js` supplies the same clearly labeled example inputs to Computer History and Sleep: three weekly orders-service reviews, followed by example meeting notes. The supplied numbers are p95 latency of 180 ms and a 0.6% timeout rate. They are not measurements from the user's database.

The history follows Atlas metrics, GitHub query code, an issue tracker, and review notes. Its intended next action is a local draft describing staging explain-plan checks, a proposed index rollout, rollback criteria and human review. No index creation, database mutation, issue publication or message sending is authorized by this fixture.

Prepare the history in a separate demo database:

```sh
node --env-file=.env server/activity/engineering-seed.js --database offload_engineering_demo
```

Then run the local app against that database by setting `MONGODB_DATABASE=offload_engineering_demo`. The seed script deliberately ignores the shared database name in `.env`. It inserts 720 synthetic samples and derives 12 sessions over three separate weeks, producing one weekly app-sequence pattern. Raw samples older than seven days still expire normally; derived sessions retain the labeled example history.

The default is idempotent. `--reset` replaces only `source: seed` records on the dedicated `example-mongodb-engineer` device. It preserves unrelated recorded and sample activity. The script uses local embeddings, starts no collector and makes no paid model calls.

The separate structured source fixture exports `mongodbDemoSources(now)` for explicit import through Sleep. Its completed meeting note includes the action `Draft an orders query rollout and rollback checklist.` Any generated draft must be labeled as a real model output from example inputs, not observed production work.
