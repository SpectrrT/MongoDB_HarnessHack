# Build plan, demo script, Q&A prep, and risk register

Hacking window: **10:30 AM – 5:00 PM ET** (about 6.5 hours including lunch). Everything here assumes the REM concept with the
Lamarck spine as the fallback; adjust roles to the actual team at kickoff.

## Stack (default; confirm at kickoff)

> Update, Sat Sep 26: the team built in JavaScript instead (React 19 + Vite, Express, the MongoDB Node
> driver). CLAUDE.md has the current layout; the defaults below are the original plan.

- **Engine:** Python — `pymongo`, OpenAI SDK pointed at OpenRouter, `voyageai` (only if `autoEmbed` preview misbehaves),
  asyncio for concurrent gym runs. LangGraph + MongoDB checkpointer optional for the daytime agent.
- **UI:** thin Next.js page deployed on Vercel, subscribing to a change-stream SSE endpoint. Three panels max: generation /
  day timeline, current genome with diff highlights, live episode feed. The UI is a window, not the product.
- **Models via OpenRouter:** a fast/cheap model for the inner agent so evolution has headroom; a strong model for the
  proposer/consolidator; log cost per call (routing is part of the genome).
- **Embeddings:** Atlas `autoEmbed` (Voyage 4) on `episodes.summary`, `memories.text`, `skills.description`,
  `edits.description`; fallback to explicit Voyage calls.
- **Repo hygiene:** public GitHub repo from the first commit; README with an architecture diagram; commit often (judges may
  check history).

## Team split (four people)

- **A — Gym + daytime agent:** fixture data, 8 training tasks + 4 held-out, deterministic checkers (end state, collateral
  damage, steps, cost), the tool-calling agent loop, per-run scratch DB isolation, concurrency, effects ledger + checkpoints,
  the auth-interrupt path (paused_for_auth → change-stream resume).
- **B — Night loop:** Replay/Merge (vector clustering, provenance, contradiction handling, TTL), Distill (repeat mining →
  skill + test → sandbox practice), Evolve (weakness mining, proposer with predictions, hybrid search over past edits,
  held-out validation, no-regression gate, versioned commits, track-record aggregation), asks queue, morning brief.
- **C — Data layer:** Atlas sandbox setup, collection schemas and indexes (vector/autoEmbed, unique effect key, TTL,
  time-series), `$rankFusion` query (or app-side RRF), change streams → SSE, metric aggregations, all API keys, seeding.
- **D — UI + demo + submission:** Next.js page, README + architecture diagram, one-minute video, demo script and rehearsal,
  submission form, timekeeping.

If the team is three: fold D into C and keep the UI to a terminal narrative plus one page. If two: build the Lamarck spine
(gym + evolve + effects ledger + ask) and skip Distill.

## Timeline

- **10:30–11:15** Kickoff decisions: full REM vs spine; stack; **agree on document schemas and interfaces first** — those
  are the contracts that let four people work in parallel. Create repo, Atlas collections, indexes, env vars, credit codes.
- **11:15–1:00** Build core pieces in parallel (A: gym + agent loop; B: night loop skeleton; C: indexes, change streams,
  SSE; D: UI shell + README skeleton).
- **1:00–1:30** Lunch, quick.
- **1:30–3:00** Integrate. Target: a tiny end-to-end run (one task, one interrupt, one night, one accepted edit, one ask)
  by ~2:30. Fix what breaks.
- **3:00–4:00** Run real evolution to accumulate history (simulated days); tune the baseline harness so improvements are
  visible; capture the learning curve.
- **4:00–4:30** Record the one-minute video (compressed version of the demo arc). Freeze features.
- **4:30–4:50** README final, submission form, repo public check, demo link check, all members added.
- **4:50–5:00** Submit. Then rehearse the 3-minute demo twice before 5:15.

## Three-minute live demo script

- **0:00–0:20 Problem.** Harness engineering is manual (OpenAI's post); agents repeat yesterday's mistakes and stop for
  logins. REM is a harness with a day/night cycle; MongoDB is its long-term memory of what it tried and why.
- **0:20–1:00 Day one, live.** Start the weekly brief. Revoke the token mid-run. It pauses, asks once, you reconnect, it resumes
  and finishes. Show the effects ledger: the email was sent exactly once.
- **1:00–1:50 Night, live.** Trigger sleep. Show the counts: episodes → memories merged, noise dropped; a skill distilled and
  its test passed; one harness edit accepted with its prediction, one rejected for a held-out regression; the commit with
  lineage.
- **1:50–2:35 Morning.** The ask appears; approve. Run the same task again: fewer steps, lower cost, no interventions. Show the
  gen-0-vs-today harness diff (rules it learned, a guardrail it added, a scope it revoked/granted, a cheaper model it routed to).
- **2:35–3:00 Curve + close.** Five simulated days: pass rate up, cost down, memory smaller and more precise. "Harness-as-data
  means any new agent forks the fittest ancestor." Repo is public; built on Atlas Vector Search + autoEmbed, `$rankFusion`,
  change streams, TTL, time series.

Rehearse twice. Keep one live step per beat and pre-run everything else. Have a recorded fallback of each beat ready in a tab.

## One-minute video

Same arc compressed: 10 s problem, 15 s interrupt + exactly-once, 15 s sleep counts, 15 s morning ask + improved run + diff,
5 s close. Screen recording with a voiceover; no slides.

## Q&A prep

- **Where does the harness evolve itself?** At night: rules, guardrails, tool scopes, context policy, model routing — each edit
  is a document with a prediction and an outcome; show `edits` and the lineage.
- **How do you prevent overfitting?** Train/held-out split, no-regression gate, predictions checked against outcomes, track
  record by edit type.
- **How do you prevent reward hacking?** The gym (fixtures, checkers, tests) is injected at evaluation time and is read-only to
  the agent; the proposer edits only the harness. Cite Weng's seven bottlenecks and which ones we defend against.
- **Why MongoDB and not Postgres/pgvector?** The genome and memory schemas change shape as the system evolves (schema-evolving
  workload); vector + text hybrid in one `$rankFusion` query; change streams for live feed and resume triggers; `autoEmbed`
  removed an embedding pipeline; TTL and time-series built in; LangGraph store/checkpointer are first-party.
- **Isn't sleep just Letta's sleep-time compute?** That's prior art we stand on; ours validates consolidation against hard
  metrics, distills tested skills, and evolves the harness in the same cycle.
- **Token refresh exists already.** Yes (Nango, Composio); our contribution is exactly-once side effects via the effects
  ledger and resuming under a new harness version — durable execution for agents.
- **What's the hard metric for Statement Two?** Retrieval precision and duplicate ratio as memory grows; task success/steps/
  cost per day; exactly-once effect count under injected failures.
- **What did you build today vs. use off the shelf?** Everything in the repo; off-the-shelf = Atlas, Voyage, OpenRouter,
  optional LangGraph checkpointer, Next.js. Point at the commit history.

## Risk register

- **Evolution shows no improvement** → deliberately bare baseline harness; gym tasks with obvious convention traps; mid-tier
  inner model; pre-run generations before judging.
- **Live Google OAuth on venue wifi** → local Drive/Gmail mock; real test account only for the interrupt beat; deterministic
  "revoke" by deleting the token document.
- **OpenRouter rate limits** → modest parallelism, retries, a backup key funded tonight.
- **`autoEmbed` preview flakiness** → explicit Voyage embeddings behind the same interface.
- **Cluster < 8.1 (no `$rankFusion`)** → app-side reciprocal rank fusion.
- **Time** → the spine list in `03-rem-concept.md`; cut Distill first, then UI polish; terminal narrative can carry the demo.
- **Demo flake** → one live step per beat; everything else pre-run; recorded fallback per beat.
- **"Dashboard as main feature" disqualifier** → spend demo time on the engine's behavior; UI is three panels max.
