# MongoDB engineer example

This demonstration uses pre-given sample data. The real model drafts a proposed workflow from it. It does not capture an engineer's computer, run explain plans, create indexes, edit issues, or measure new database performance.

The shared `mongodbDemoSources()` fixture and computer-history seed use the same story: three weekly orders-query reviews, Atlas to source code to issue notes, with example p95 latency of 180 ms and a timeout rate of 0.6%. The user explicitly starts the checklist, selects its action, and chooses a local draft budget and deadline.

## Rehearsal commands

The ordinary UI route is Sleep, Next actions, Try an example, Start once, then Draft this. The model worker must be configured. Generated file changes wait for exact-draft approval. A completed task means checked local drafts, not a database change.

For a repeatable recorded run, use an existing privately configured MongoDB connection and OpenRouter key. No credential values belong in commands or receipts.

```sh
node scripts/demo-meeting-workflow.mjs --prepare-only --output work/demo-inputs
node scripts/demo-meeting-workflow.mjs --live --output work/demo-generation
```

Preparation makes no network or model calls. `--live` makes at most one model attempt through the existing Sleep executor with a 20,000-token total budget, a 3,000-token output limit, and a 20-minute deadline. Its isolated workspace is printed in the result. `OFFLOAD_MODEL` selects the model, otherwise it uses GPT-4.1-mini. The generated draft and raw request, response, usage, source inputs, and declared content checks stay in the output directory.

Review `pending-draft.json` and its checks before approving. Approval must name the exact task and workspace printed by generation and use a fresh receipt directory:

```sh
node scripts/demo-meeting-workflow.mjs --approve-task TASK_ID --workspace WORKSPACE --output work/demo-approved
```

This second command reuses the exact pending draft, makes zero new model calls, checks the actual files, verifies their hashes, and copies them beside the new receipt. If generation, source checks, or content checks fail, retain that failed receipt. Do not substitute the prepared example and call it a successful live run.

## Prepared fallback

`public/evidence/mongodb-example-workflow.md` is a separately labeled, previously prepared example. Its source label is always visible. The document is manually prepared, not claimed as a previous model run. A later successful live artifact may be published separately with its actual receipt and date. The content checker validates stated concepts and boundaries; it is not a database benchmark or a broad semantic correctness guarantee.
