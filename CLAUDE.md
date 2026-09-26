# Offload × REM: MongoDB "Harness Engineering & Model Wrangling" hackathon

Team entry for the MongoDB × Cerebral Valley hackathon in NYC on Saturday, September 26, 2026. Submissions are due at
**5:00 PM ET**; finalists demo at MongoDB.local NYC on Wednesday, September 30. Team: Tensae (lead), Floyd (UI),
Ryan (durable harness and Sleep). This repo is SpectrrT/MongoDB_HarnessHack; SpectrrT/MongoDB_Harness keeps the
earlier commit history.

## Read first (auto-imported)

@CONTEXT.md
@docs/00-hackathon-brief.md
@docs/03-rem-concept.md

Read when relevant: `docs/rem-engine.md` (REM architecture, "One Sleep" and the Atlas switch), `docs/DEMO-NUMBERS.md`
and `docs/DEMO-NUMBERS-ATLAS.md`, `docs/LOCAL-HTTPS.md`, `THIRD_PARTY.md`.

## What we're building

**Offload** is the product: it learns the work you repeat, so next time you can hand it over. **REM** (Replay · Evolve ·
Merge) is the engine idea: a harness with a day/night cycle. By day it runs durable tasks with exactly-once effects; at
night it consolidates memory and evolves its own harness against a held-out gym; in the morning it asks once for any new
authority. It targets Statement One (recursive harnessing) and Statement Two (long-horizon memory with hard metrics).

## Layout (JavaScript everywhere)

- `src/`: React 19 + Vite UI (Floyd). The design pass lives in `src/polish.css`, loaded after `styles.css`.
- `server/index.js`: Express API. `shared/workspace.js` is the original mock engine the UI still runs on.
- `rem/`: the REM engine, served at `/api/rem/*` by `server/rem.js`. Tonight's stand-ins (an in-memory, driver-shaped
  store, a scripted model, local embeddings) switch to Atlas, OpenRouter and Voyage by env vars; see `docs/rem-engine.md`.
- `server/harness/`: durable MongoDB harness with fenced workers (Ryan). Its `connectStore()` is the server's MongoDB
  connection. `server/activity/`: computer history.
- `desktop/`: Electron wrapper. `vendor/`: upstream UI sources, see `THIRD_PARTY.md`.

## Commands

- `npm ci`, then `npm run dev` (web on 5193, API on 5194), `npm test`, `npm run test:e2e`, `npm run build`.
- `npm run rem:demo`: the three-minute REM story in the terminal, with real numbers from the engine.
- `npm run harness:server`, `npm run harness:worker`: need a `.env` with `MONGODB_URI`.
- `.mcp.json` gives Claude Code a MongoDB MCP server that reads the same `MONGODB_URI`, read-only unless `.env` sets
  `MDB_MCP_READ_ONLY=false`. It loads when a session starts, so start a new one after editing `.env`.

## REM night: Rehearse and Calibrate (Ryan, 2:30 PM)

- Night phases: Replay, Merge, Distill, Rehearse, Evolve, Calibrate, Asks.
- Rehearse (`rem/rehearse.js`) stress-tests the harness: truth-preserving attacks stacked on train tasks it already
  passes, ranked by how likely they are to break it (`REM_REHEARSE_JUDGE=jev` asks Jev), top six run. A break is kept
  and Evolve validates every edit against it until a version passes it; when all hold, the next level is harder.
  Held-out tasks are never rehearsed. Idle rehearsal is opt-in (`REM_REHEARSE_IDLE=1`), so idle time goes to idle
  Sleep (`ryan/jev-context`), which works on the owner's own goal. On the scripted model nothing breaks after night 1
  (it is a parser). With real models at the medium tier, one session (Calibrate plus Rehearse, 2:20 PM) cost $0.02
  and found a break: Project recap under all six attacks missed a shipped item.
- Calibrate (`rem/calibrate.js`) grades the completion gate against the checkers each night: false accepts, false
  rejects and Brier, with the checks as evidence and blind. It commits a new `completionThreshold` only if blind errors
  fall on train and do not rise on held-out. Real models, stub gate, blind: 4 false accepts on train, 5 on held-out.
- `REM_PROPOSER=llm` lets a model on OpenRouter propose edits beyond the catalog, validated like any other.
- `/api/rem/rehearse` is local-only like reset and simulate (`server/rem-guard.js`). `npm test` runs 137 (1 skip).
- Open: ask Jev three questions (required items present, no collateral, final answer matches evidence) and take the
  lowest. `rem/completion.js` belongs to `ryan/jev-context` right now, so that change goes there.
- Merging `ryan/jev-context`: take its side of `tests/e2e/app.spec.js` (its Sleep execution steps replace the
  Overnight tasks tab steps).

## Where things stand (Sat Sep 26, about 1:45 PM ET)

- Merged and green: the UI and polish pass, Floyd's transitions, ASCII landing, ChatGPT chat through the local Codex
  CLI and SlowMode's overnight queue, REM, Ryan's durable harness, Floyd's local agent tools, image
  attachments, Atlas workspace storage, OpenRouter chat and local HTTPS, computer history, and Ryan's REM work: REM on
  Atlas, the REM panel (`/app/rem`), the adversarial suite, the Jev completion gate, cost per verified success and
  LangSmith tracing.
- Floyd's `MyName` branch is built on the old repo's history; its work reaches main as separate commits. Start new work
  from main; merging `MyName` directly would delete `rem/` and `server/harness/`.
- Atlas is connected. Cluster0 (MongoDB 8.0.32) has database users `Tensae` (admin), `ryan` and `floyd` (read and
  write). `$rankFusion`, Atlas Search and Vector Search all work on it (checked through the MCP server). Databases:
  `offload_hackathon` (harness runs, Sleep v2 memories and experiments, computer history) and `offload` (Floyd's
  workspace storage, `MONGODB_DB`). The API server (`npm run dev`, `npm start`) loads `.env` through `server/env.js`, as
  do the `harness:*`, `activity:*` and `rem:langsmith` scripts; `npm test` doesn't. `OFFLOAD_SKIP_ENV=1`
  keeps the server on in-memory stores. OpenRouter is funded (hackathon credit) and its key is in Ryan's `.env`. The
  project `.mcp.json` MongoDB server and the hosted Atlas connector are both read-only.
- New: computer history (`server/activity/`, `/app/history`). `npm run activity:collector` records the frontmost app,
  window and page on macOS; sessions, hybrid search and routines are aggregations on Atlas. `npm run activity:seed`
  added a sample week to Atlas, labeled `source: "seed"` everywhere.
- REM's agent runs on the scripted model by default. `REM_MODEL=openrouter` works (tested 1:30 PM): three real-model
  day runs cost $0.99 in total and all three failed the completion check (a customer-name leak, missed standup items, a
  stale blocker). The demo stays on the scripted model. Say so if a judge asks.
- REM is the single Sleep engine (Ryan's `ryan/sleep-consolidated`, merged 1:13 PM). Sleep v2's recall and lessons
  ideas live in `rem/`, REM runs on Atlas and has a REM page, and `server/sleep/` was removed in the cleanup. See
  `docs/rem-engine.md`, "One Sleep". The moon "Sleep" nav item is the Sleep page as Floyd and Tensae built it, kept as
  is.
- Not merged yet: Ryan's Codex branch `ryan/jev-context` (Jev context compaction, bounded checkpoints, runs whose
  completion gate never clears end `incomplete` instead of `done`) and `ryan/suggestive-tasks` (evidence-backed task
  suggestions). `ryan/jev-context` also re-adds `server/sleep/` for Sleep task execution, which the 1:43 PM cleanup
  removed; decide that before merging it.
- LangSmith: `rem/trace.js` traces day runs, night phases, recall, effects and model calls when `LANGSMITH_API_KEY` is
  set, and does nothing without it. `npm run rem:langsmith` runs the gym as two LangSmith experiments side by side.
- Tests: `npm test` runs 107 (1 Atlas-only skip). `npm run test:e2e` passes 12 of 12 against a server started with
  `OFFLOAD_SKIP_ENV=1` (point `PW_BASE_URL` at it). Floyd's 1:12 PM redesign lands onboarding on the Overview and drops
  the in-app recording checkbox (the browser's permission prompt remains); the e2e suite follows both.
- The team has permission to use `vendor/beautiful-ui` (Tensae, Sep 26). `/api/rem/reset` and `/api/rem/simulate`
  only answer requests from this machine (`server/rem-guard.js`); set `REM_ADMIN_TOKEN` and send it as
  `x-rem-admin-token` to allow them on a public deploy. The other REM routes stay open.
- Submission: public repo, demo link, one-minute video, by 5:00 PM ET. All three teammates are on the repo. At 1:45 PM
  the repo was still private (only Tensae is an admin), with no demo link or video yet.

## Conventions

- Use the `CONTEXT.md` vocabulary exactly (episode, memory, skill, harness, edit, prediction, checkpoint, effect, ask).
- The UI is a window into the engine. A project where a dashboard is the main feature is banned.
- Hard metrics or it didn't happen: pass rate, steps, cost, interventions, memory size, exactly-once effect counts.
- Defend against reward hacking by construction: the gym, fixtures and checkers are read-only to the proposer.
- Atlas: work inside the team's own project ("Tensae Harness Eng"). Org-level settings belong to the organizers.
- Never commit secrets. `.env` is gitignored; `.env.example` documents the variables.
