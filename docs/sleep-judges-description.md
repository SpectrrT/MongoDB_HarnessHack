# Judge-facing description: Sleep

Problem Statement Two is Long Horizon Engineering: coherent memory over long sessions, continued progress toward goals,
and learning from hard metric signals. Sleep combines bounded working memory, source recovery, verified execution and
persisted improvement. Jev is actually integrated; it estimates retention probability for each record. The harness
protects constraints, keeps complete tool exchanges, archives source records and owns the stopping rules.

Current live repeated-context evidence: four synthetic snapshots, five answers per path, GPT-4o-mini on both paths.
Both score 20/20. Full context uses 26,640 tokens; selected context including Jev uses 15,543, or 41.66% fewer.
First use costs more. A separate three-task, twelve-stage evolving suite scores 11/12 on both paths and costs 29.95%
more overall, because rescoring outweighs answer-model savings. Shortening the decision prompt reduces Jev overhead
19.86% without changing those checks. Both adverse runs are retained. [Raw evidence and conditions](context-evolving-evidence.md).

The checkpoint no longer contains the whole transcript. In a 300-step deterministic session with interruption and source
recovery, the maximum working checkpoint is 18,852 bytes versus a reconstructed 1,245,224-byte full-history checkpoint.
The 1,242,822-byte canonical source remains intact. This is byte evidence, not live token savings. Real local MongoDB
testing exposed and fixed three stale-worker races. An actual SIGKILL after a fixture send and before ledger commit
recovers in a different process with exactly one send and one provider receipt. This proves that fixture-provider
restart case, not generic exactly-once behavior for real Gmail or Drive. [Storage evidence](sleep-transcript-storage.md).

Sleep executes assigned local drafts with persisted budgets, deadlines, approvals and independent file checks. Three
live GPT-4.1-mini tasks improved from 2/3 checked artifacts with 1,721 tokens and seven calls to 3/3 with 815 tokens and
three calls. Provider cost for the second run was $0.000608. One approval pause resumed without regenerating its proposal.
These short synthetic checks verify declared phrases, size and JSON syntax, not broad semantic correctness. An
eight-attempt scripted task with no progress now pauses after three calls; explicit resume completes on call four.
[Before/after execution evidence](sleep-task-execution.md).

Opt-in native OpenRouter selection is tested with real local file tools and a scripted provider: one exact archived-key
task passes on both paths, with 111,805 versus 45,148 cumulative prompt characters. It requires one extra model request
and 15 scripted decision calls. Those are integration measurements, not live token savings. Images remain intact,
malformed tool IDs cannot execute, and known usage survives cancellation. [Native evidence](native-context.md).

Source-backed next actions can turn a repeated context-recovery habit into a supported task, four durable checkpoints,
a checked artifact and a tested policy update. Explicitly selected history supplies provenance; import alone does not
start execution. Five Atlas reads beside 10,000 unrelated rows improved from a 1,474 ms median to 436 ms while examining
three source documents. [Personal workflow and limits](personal-suggestions.md).

The implementation is local and tested. It does not demonstrate billion-token sessions, weeks of autonomous operation,
calibrated completion probabilities, or universal savings. Waiting more slowly is not itself a token optimization.

A separate source-interpretation probe improves 2/3 to 3/3 exact answers on the original routing failure and two new
shipping variants. Tokens increase 5,666 to 7,870, which is retained as an adverse result while the full combined
optimization is measured. [Probe evidence](evidence/evidence-policy-probe.json).
