# Offload

A local workflow companion with a monochrome website and a React JavaScript app.

## Run

Requires Node 22.12+ or 24 and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5193 . The default browser demo stores each workspace in localStorage. It does not contact external accounts. To use the real local REST service instead, copy `.env.example` to `.env`, set `VITE_STORAGE_MODE=api`, and restart. API data lives in `.data/`, which is ignored by Git.

```sh
npm test
npm run build
npm start
```

The built site and app are served at http://127.0.0.1:5194 . `npm run test:e2e` runs desktop and mobile Chrome checks against the development server.

## Desktop

```sh
npm run desktop:setup
npm run desktop
npm run desktop:package
```

The desktop wrapper uses Electron with Node integration disabled, context isolation, a sandbox, explicit capture permissions, and no remote page access. Build packaging is unsigned until your team configures Apple signing. Alternatively install the site from Chrome as a web app. Do not enable recording without participants' agreement.

## What works now

- Landing site with actual Vanta NET, black and white, and Instrument Serif.
- Onboarding, collapsible navigation, and a persistent searchable suggestions panel.
- Saved conversations, memory, notes sessions, routine review and approval, drafts, exports, and settings.
- Deterministic mock tasks with checkpoints. Reconnect a sample account and resume without duplicate receipts.
- Local microphone/screen recordings that start only after permission. Recordings can be downloaded. Closing the session window ends capture.
- Scheduled local sleep reviews while the app is open.
- Original Beautiful UI components, Thinking Orbs, and Evil Charts. See THIRD_PARTY.md.

## Deliberately mocked

Account authorization, model replies, workflow detection, and routine generation use sample data and a deterministic script. Sleep uses local keyword-based grouping and evidence checks on saved notes, not model-generated routines or task-quality evaluations. No actual email is read or sent. No MongoDB connection, live LLM, audio transcription, autonomous desktop control, cloud scheduler, multi-user authentication, or cross-device sync is enabled. The interface labels these boundaries. This is a runnable prototype prepared for backend integration, not a production autonomous agent.

## Upload online

`npm run build` produces `dist/`. Deploy the static output to Vercel using `vercel.json`. Keep the default `VITE_STORAGE_MODE=browser` for a public isolated demo. Never expose the local API as a multi-user production service without replacing demo sessions with authentication, adding a database and production limits, and reviewing security.

## MongoDB handoff

`shared/workspace.js` owns the mock transitions. `src/store.jsx` is the client adapter. `server/index.js` exposes `GET /api/state`, `POST /api/action`, and `POST /api/reset`. Replace file persistence with Atlas collections for workspaces, observations, skills, runs and action receipts. Preserve the API shape and use a durable job runner. Keep credentials out of model context and store only grant metadata in routine records. Add OAuth, an actual model provider, evaluation fixtures and consented transcription behind server interfaces.

## Team workflow

Use separate feature branches and pull main first. Recommended ownership: `src/` interface; `server/` + `shared/` data/runner; `desktop/` capture/integrations. Coordinate changes to the shared state contract. The repository is private; review event submission requirements before changing visibility.

See HANDOFF.md for the latest verified checkpoint and remaining work.

## Sleep reviews

Sleep reviews take a snapshot of saved memories, consolidate exact duplicates, and propose draft-only routines when at least two distinct notes support a weekly update, follow-up, release handoff or meeting. The page includes cancellation, progress, supporting notes, checks, approval filters, version history and daily local scheduling. New notes wait for the next review; deleted notes are excluded when the review completes.

Unchanged candidates retain their version and approval. Changed evidence or instructions create a new version that requires approval again. Approval records a preference only; it does not launch execution. Review history records created, updated and unchanged candidates, including reviews with no candidates. Existing workspaces remain compatible.

This is a deterministic local implementation. Keyword matches do not establish actual repeated behavior, checks do not measure agent performance, and scheduled reviews require the app to remain open. MongoDB persistence, a model-backed discovery provider, held-out task evaluation and a durable background scheduler remain integration work.
