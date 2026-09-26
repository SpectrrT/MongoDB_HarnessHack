# Offload × REM: MongoDB "Harness Engineering & Model Wrangling" hackathon

Team entry for the MongoDB × Cerebral Valley hackathon in NYC on Saturday, September 26, 2026. Submissions are due at
**5:00 PM ET**; finalists demo at MongoDB.local NYC on Wednesday, September 30. Team: Tensae (lead), Floyd (UI),
Ryan (durable harness and Sleep). This repo is SpectrrT/MongoDB_HarnessHack; SpectrrT/MongoDB_Harness keeps the
earlier commit history.

## Read first (auto-imported)

@CONTEXT.md
@docs/00-hackathon-brief.md
@docs/03-rem-concept.md

Read when relevant: `docs/04-build-plan.md` (demo script, Q&A prep, risks), `docs/rem-engine.md` (REM architecture and
the Atlas switch), `docs/DEMO-NUMBERS.md`, `HARNESS_HANDOFF.md`, `SLEEP_HANDOFF.md` and `SLEEP_ENGINEERING_PLAN.md`
(Ryan), `HANDOFF.md` and `INTEGRATION.md` (Floyd), `THIRD_PARTY.md`.

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
- `server/harness/`: durable MongoDB harness with fenced workers. `server/sleep/`: Atlas-backed Sleep v2 with vector
  memory, versioned harness policy and held-out promotion (both Ryan).
- `desktop/`: Electron wrapper. `vendor/`: upstream UI sources, see `THIRD_PARTY.md`.

## Commands

- `npm ci`, then `npm run dev` (web on 5193, API on 5194), `npm test`, `npm run test:e2e`, `npm run build`.
- `npm run rem:demo`: the three-minute REM story in the terminal, with real numbers from the engine.
- `npm run harness:server`, `npm run harness:worker`, `npm run sleep:worker`: need a `.env` with `MONGODB_URI`.
- `.mcp.json` gives Claude Code a MongoDB MCP server that reads the same `MONGODB_URI`, read-only unless `.env` sets
  `MDB_MCP_READ_ONLY=false`. It loads when a session starts, so start a new one after editing `.env`.

## Where things stand (Sat Sep 26, about 1:30 PM ET)

- Merged and green: the UI and polish pass, Floyd's transitions, ASCII landing, ChatGPT chat through the local Codex
  CLI and SlowMode's overnight queue, REM, Ryan's durable harness and Sleep v2, Floyd's local agent tools, image
  attachments, Atlas workspace storage, OpenRouter chat and local HTTPS, and computer history.
- Floyd's `MyName` branch is built on the old repo's history; its work reaches main as separate commits. Start new work
  from main; merging `MyName` directly would delete `rem/`, `server/harness/` and `server/sleep/`.
- Atlas is connected. Cluster0 (MongoDB 8.0.32) has database users `Tensae` (admin), `ryan` and `floyd` (read and
  write). `$rankFusion`, Atlas Search and Vector Search all work on it (checked through the MCP server). Databases:
  `offload_hackathon` (harness runs, Sleep v2 memories and experiments, computer history) and `offload` (Floyd's
  workspace storage, `MONGODB_DB`). Only the `harness:*`, `sleep:*` and `activity:*` scripts load `.env`; `npm run dev`
  and `npm test` don't. OpenRouter and Voyage keys are not in Tensae's `.env` yet. The project `.mcp.json` MongoDB server
  and the hosted Atlas connector are both read-only.
- New: computer history (`server/activity/`, `/app/history`). `npm run activity:collector` records the frontmost app,
  window and page on macOS; sessions, hybrid search and routines are aggregations on Atlas. `npm run activity:seed`
  added a sample week to Atlas, labeled `source: "seed"` everywhere.
- REM's agent uses a scripted model until OpenRouter is configured. Say so if a judge asks.
- Open decisions: REM's night loop (`rem/`) and Sleep v2 (`server/sleep/`) overlap, so pick one for the demo or combine
  them. REM has no UI panel yet.
- Before the repo goes public (required for submission): `vendor/beautiful-ui` has no license. Before any public
  deploy: `/api/rem/reset` and `/api/rem/simulate` have no auth.
- Submission: public repo, demo link, one-minute video, every teammate added, by 5:00 PM ET.

## Conventions

- Use the `CONTEXT.md` vocabulary exactly (episode, memory, skill, harness, edit, prediction, checkpoint, effect, ask).
- The UI is a window into the engine. A project where a dashboard is the main feature is banned.
- Hard metrics or it didn't happen: pass rate, steps, cost, interventions, memory size, exactly-once effect counts.
- Defend against reward hacking by construction: the gym, fixtures and checkers are read-only to the proposer.
- Atlas: work inside the team's own project ("Tensae Harness Eng"). Org-level settings belong to the organizers.
- Never commit secrets. `.env` is gitignored; `.env.example` documents the variables.
