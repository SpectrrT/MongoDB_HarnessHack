# Native OpenRouter context selection

Set `OFFLOAD_COMPACTION=jev` alongside MongoDB and a private TypeSafe or OpenRouter decision key. Connect the answer
model through the existing OpenRouter account flow. Only models with tools use this adapter, since omitted evidence
must remain recoverable. The Codex provider continues to manage its own context.

The adapter groups each assistant tool-call message with all its results before selection. Initial conversation instructions and images are preserved outside the tool-history selection budget.
Non-read effects are pinned. Only complete read-only exchanges may be omitted. Archive scope hashes
the workspace owner and request id. `context_list` and `context_read` cannot choose another scope. The same local tool
approval handler remains responsible for file writes and shell commands.

Each task usage record includes answer-model and selection overhead, with nested decision counters. Missing usage
is explicitly unknown. Failed selection preserves known usage and makes no subsequent answer-model request. The
source history stays in memory for the existing maximum of 40 tool steps; MongoDB stores omitted source parts.
This is not a native cross-turn durable runner. REM's separate transcript store handles longer durable sessions.

## Quantitative check

One paired scripted-provider task, seven real local file reads, exact archived-key check: baseline 1/1 success,
compacted 1/1 success. Serialized prompt input totals are 111,805 versus 45,148 characters, a 59.62% reduction.
Peak prompt sizes are 26,825 versus 8,470 characters. The compacted path makes 9 model requests versus 8 and uses
15 scripted decision calls, including one archive recovery. Stub token counters verify accounting only and must not
be reported as actual model tokens or savings.

Reproduce with `node scripts/benchmark-native-context.mjs docs/evidence/native-context-paired.json`.
The native regression suite now also verifies intact 40,000-character image data, usage after cancellation, and invalid tool protocol. A cancelled second selector batch preserves the first 105 reported tokens. A malformed paid answer preserves 130 reported tokens and $0.002 instead of dropping them. Duplicate tool IDs produce zero approval requests and zero files. These are injected-provider accounting checks, not live charges.

Run `node --test tests/chat-context.test.js tests/openrouter.test.js tests/model.test.js` to reproduce.
