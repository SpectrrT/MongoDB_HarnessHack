# Sleep context compaction update: September 26

Local branch `ryan/jev-context` adds live Jev selection to the REM planner/executor prompt path, MongoDB archives and
run-scoped recovery, state-keyed decision reuse, exact read deduplication, context pause/resume, and a Context memory tab
inside Sleep. No push or deployment. Separate native chat paths are not integrated by this change.

Measured paired benchmark: 20/20 exact answers on each path, 26,640 full-context tokens versus 14,878 including Jev
(44.15% fewer) across four snapshots answered five times each. Initial single answers cost more with compaction.
97 unit/API tests passed, one optional Atlas search smoke skipped, four desktop/mobile browser checks passed, build passed.
See README.md for the baseline table and docs/sleep-context-compaction.md for reproduction and scale limits.

---

# Session update — new repository history

Repository: `SpectrrT/MongoDB_HarnessHack`. Branch: `floyd/session-capture`, based on its `main` at `1a94250`. The previous agent/UI changes were reapplied as a new commit, without merging the old repository ancestry. `rem/`, `server/harness/`, and `server/sleep/` are preserved.

Screen, Microphone, and Both now record until Stop, browser Stop sharing, or closing the app tab. Closing only the panel keeps recording active. Chunks persist in IndexedDB for download. An image-capable model can receive the current screen with a message; microphone transcription remains separate work.

The server loads `.env` only at executable startup, so imported API tests never pick up the venue Atlas credentials.

---

# Current checkpoint — September 26

This section supersedes the historical notes below.

- ChatGPT/Codex: persistent App Server sessions, live tool calls, image attachments, working folders, approvals, Stop, and downloadable outputs.
- OpenRouter: PKCE account connection, model catalog, vision support, local file/command tools, and manual write/command approvals. Credentials stay local.
- Atlas: connection and read/write checks passed. API workspace storage supports Atlas with optimistic concurrency. Current browser-local data is unchanged; set `VITE_STORAGE_MODE=api` to opt into server storage.
- UI: smooth reasoning control, right-side profile/settings menu, editable profile image/name/email, wider suggestions, consistent dark frame and bottom edge, functional attachment button.
- Local HTTPS setup: documented in `docs/LOCAL-HTTPS.md`; hosts-file and certificate-trust installation still require administrator approval on each Mac.
- Verified: native image recognition → file write → follow-up file read, OpenRouter file tool approval, Atlas read/write, unit/API suite, and web build.
- Still outstanding: real third-party app integrations, Jev compaction in the runtime, unattended overnight scheduling, consented transcription, team authentication, rebuilt/signed desktop distribution. Jev decisions API was tested separately; it is not integrated.
- No public deployment. Secrets, tokens, certificates, user workspaces and generated files are excluded from Git.

---

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
- File-backed Express local API with atomic writes and per-visitor isolation, request validation and origin checks.
- Cross-tab browser writes coordinated with the Web Locks API.
- Actual Thinking Orbs, original Beautiful UI code and Evil Charts ECharts bar component. All 21 Beautiful UI previews render in Settings > Component library. See THIRD_PARTY.md for adaptations and distribution caveat.

## What is mocked

External account access, model responses, workflow detection and routine generation. No real OAuth credentials, LLM, MongoDB, transcription, sending, autonomous computer control, cloud jobs, multi-user production auth or cross-device sync. Keep local labels until replacing these with verified integrations.

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

Replace local transitions with a durable runner. Store observations, versioned skills, grants, runs and action receipts in Atlas. Add user auth and scoped OAuth. Keep secrets outside model context. Add held-out task evaluations before enabling autonomous execution. Use a real scheduler if the app must continue after its window closes. The static Vercel config is ready for a public isolated local; the local API is not a multi-user production service.

## Hackathon admin

GitHub invitation accepted. Floyd’s Cerebral Valley hackathon application is approved; Luma MongoDB.local registration is confirmed. The offer is 1,250 Codex credits, not $1,250. Redemption code is distributed after onsite check-in from 10:30 a.m. September 26. Teammates need their own approvals. No credit code has been received or applied yet.

Final checks: 7 unit/API tests and 6 desktop/mobile end-to-end tests passed. Production root and deep routes were opened and reloaded in Chrome. The desktop bundle excludes web build dependencies (application payload about 2 MB, plus Electron runtime).
