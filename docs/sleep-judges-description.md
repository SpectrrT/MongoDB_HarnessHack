# Judge-facing description: Sleep context compaction

Sleep lets the harness continue deliberate work with a smaller active memory. Jev assigns retention probabilities to
older tool exchanges, while MongoDB preserves the originals, decision cache, and run checkpoints. The agent can recover
omitted evidence by id. Critical records stay protected, identical reads are deduplicated without model calls, and
unchanged task states reuse decisions after a restart.

At the earlier `00a412b` revision, in a live Atlas-backed microbenchmark using the same GPT-4o-mini answer model on both paths, four synthetic task snapshots
were answered five times each. Both paths passed all 20 exact-answer checks. Sleep used 14,878 total tokens including
Jev screening, versus 26,640 with full context: 44.15% fewer. The first answer cost more; savings came from repeated use
of the selected context. Batching storage operations brought observed selection latency from 4.45-8.22 seconds to
0.96-1.82 seconds. A separate four-case challenge set also passed on both paths.

This implements a measurable part of Statement Two, Long Horizon Engineering. It does not demonstrate billions of tokens
or prove savings on arbitrary evolving tasks. The canonical REM checkpoint still retains the full trace; moving that
trace to an indexed event stream is the next scale milestone. The feature is integrated into REM and shown inside Sleep,
with 97 passing unit/API checks, one optional Atlas search smoke skipped, four passing desktop/mobile browser checks, and
a passing production build. Code changes remain local.

Raw measurements and reproduction commands are linked from README.md and docs/sleep-context-compaction.md.

The native OpenRouter tool loop now also uses the selector when enabled. In a separate scripted-provider test with real
local file tools, both paths recover the same archived key; serialized prompt text is 111,805 versus 45,148 characters
(59.62% lower). The compacted path needs one additional model request (8 to 9) and 15 scripted decision calls. This
checks integration and overhead accounting, not live model token efficiency. Evidence: `docs/evidence/native-context-paired.json`.
