# Episode archive upgrade and continuation evidence

This change fixes two locally reproduced recovery gaps. It uses synthetic records and a disposable local MongoDB replica set. It does not use Atlas, personal history, a paid model, or provider tokens.

## Surviving records from earlier versions

Earlier versions could mark an episode `consolidated: true` and assign `expireAt` without writing an archive. The new retirement loop skipped those records. In the baseline reproduction, one legacy episode produced **0 archives**, then became unrecoverable after the simulated TTL sweep.

REM startup now backfills existing consolidated records with a non-null expiration before normal startup proceeds. The regression recovers **1 of 1 legacy records** after expiry, while a previously archived current-version record retains its exact original snapshot. It never compares the current consolidation metadata against the earlier immutable archive digest or replaces that original version.

The batching fixture archives **61 of 61 records** using three nonempty identifier pages of at most **25 records**, followed by one empty page. Each transaction reads at most one raw source. A second migration archives **0 additional records** and performs **0 additional raw source reads**. A compound `consolidated, _id` index supports this scan. The scan still traverses matching metadata on each startup; it is not constant startup work.

The real MongoDB test performs the migration through a second connection, reruns it idempotently, removes the hot copy, and recovers the exact BSON record. The existing real MongoDB transaction-failure test still verifies that partial part writes roll back and the source survives. Explicit database reset removes archive manifests and parts along with other REM records.

This cannot recover episodes already deleted by TTL before the migration reads them. Existing TTL indexes remain enabled. The migration preserves surviving data and does not promise recovery across a deletion that already happened.

## Escaped JSON continuation

A valid BSON source can expand when control characters become six-character JSON escapes. The former **33,554,432-character** offset cap rejected a continuation returned by the preceding page.

The regression archives a **5,593,671-byte BSON record** whose JSON representation is **33,560,681 characters**. Starting at offset **33,552,000**, it reads **8,000 characters**, accepts the returned continuation **33,560,000**, reads the remaining **681 characters**, and reaches `nextOffset: null`. The concatenated **8,681-character** tail exactly matches the original JSON. Before the fix, the second request threw `Invalid episode page.`

The accepted offset bound is now six times MongoDB's 16 MiB document limit, or **100,663,296 characters**. Individual responses remain capped at **8,000 characters**. Manifest size and part-count checks and the SHA-256 integrity check are unchanged.

Paging bounds the model response, not total backend decoding work: each request currently loads and verifies one complete BSON episode, deserializes it, serializes JSON, and then slices the requested text. A maximum-size source can therefore require several in-memory copies and JSON expansion up to the stated character bound. Ordinary retirement still fetches at most 25 full source records before applying its approximately 1 MiB transaction write budget, with a single larger source allowed. These limits are separate from the smaller identifier-only startup scan. No constant-memory streaming or billion-token scale claim is made.

Validation: **10 of 10 archive tests passed**, including the real local MongoDB test. The existing consolidation, night and database checks added **20 passes**, with **1 optional Atlas smoke skipped**. `git diff --check` passed.

Reproduce: `node --test tests/episode-archive.test.js` and `node --test tests/rem-consolidation.test.js tests/rem-night.test.js tests/rem-db.test.js`.
