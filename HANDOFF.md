# Offload handoff

September 26 product update: see [INTEGRATION.md](INTEGRATION.md) for the `MyName` branch's transition changes and the agreed Atlas, agent memory, Vector Search, and per-user local Codex requirements. The backend descriptions below still describe the mock prototype.

## Run it

```sh
npm ci
npm run dev
```

Site and app: http://127.0.0.1:5193 . Node API: http://127.0.0.1:5194 . Default storage is isolated browser-local state. Set `VITE_STORAGE_MODE=api` in `.env` to use the local API.

The Mac app is built locally at `release/mac-arm64/Offload.app` (not committed). Rebuild with `npm run desktop:setup` and `npm run desktop:package`. The app is unsigned. Desktop data uses a stable local origin on port 5195 and a persistent Electron partition.

## Implemented

- Monochrome Instrument Serif landing site, original outlined wordmark, real Vanta NET background.
- React JavaScript app with onboarding, collapsible sidebar, persistent suggestions panel, search and filters, snooze and dismiss.
- Local conversations and memory, notes sessions, explicit microphone/screen capture with downloadable recordings.
- Mock account connect/expire/reconnect, task checkpoints, cancel/resume, editable drafts and export.
- Sleep review, duplicate-note consolidation, candidate routines, approval/pause, local scheduling while open.
- File-backed Express demo API with atomic writes and per-visitor isolation, request validation and origin checks.
- Cross-tab browser writes coordinated with the Web Locks API.
- Actual Thinking Orbs, original Beautiful UI code and Evil Charts ECharts bar component. All 21 Beautiful UI previews render in Settings > Component library. See THIRD_PARTY.md for adaptations and distribution caveat.

## What is mocked

External account access, model responses, workflow detection and routine generation. No real OAuth credentials, LLM, MongoDB, transcription, sending, autonomous computer control, cloud jobs, multi-user production auth or cross-device sync. Keep demo labels until replacing these with verified integrations.

## Verification

- Unit/API tests cover checkpoint recovery, duplicate prevention, sleep versioning, snooze, sessions, visitor isolation and invalid payloads.
- Desktop and mobile Chrome flow tests cover onboarding, persistence, suggestions, reconnect, draft editing, sleep approval, notes sessions and chat.
- Layout checks at 375, 390, 768, 1496 and 1920 px: no page overflow or runtime errors; landing pages pass automated WCAG A/AA checks.
- App overview, memory, sleep, connections and settings checked at 375, 768 and 1496 px with no automated WCAG A/AA findings.
- All 21 Beautiful UI examples smoke-tested. Actual Vanta canvas verified. Packaged Mac app opened successfully.
- These are responsive and functional tests, not statistical A/B testing or real agent-quality measurements.

## Suggested team ownership

- UI: `src/pages`, `src/components`, `src/styles.css`.
- Backend/Atlas: `server/`, `shared/workspace.js`, the API adapter in `src/store.jsx`.
- Agent/capture: `desktop/`, session controls, transcription and execution providers.

Use separate feature branches and pull main first. Coordinate edits to the state contract. Source is readable JavaScript; original vendor TypeScript is retained only for provenance.

## Next backend work

Replace demo transitions with a durable runner. Store observations, versioned skills, grants, runs and action receipts in Atlas. Add user auth and scoped OAuth. Keep secrets outside model context. Add held-out task evaluations before enabling autonomous execution. Use a real scheduler if the app must continue after its window closes. The static Vercel config is ready for a public isolated demo; the local API is not a multi-user production service.

## Hackathon admin

GitHub invitation accepted. Floyd’s Cerebral Valley hackathon application is approved; Luma MongoDB.local registration is confirmed. The offer is 1,250 Codex credits, not $1,250. Redemption code is distributed after onsite check-in from 10:30 a.m. September 26. Teammates need their own approvals. No credit code has been received or applied yet.

Final checks: 7 unit/API tests and 6 desktop/mobile end-to-end tests passed. Production root and deep routes were opened and reloaded in Chrome. The desktop bundle excludes web build dependencies (application payload about 2 MB, plus Electron runtime).
