# Offload

A local workflow companion with a monochrome website and a React JavaScript app.

## Run

Requires Node 22.12+ or 24 and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5193 . The default browser local stores each workspace in localStorage. It does not contact external accounts. To use the real local REST service instead, copy `.env.example` to `.env`, set `VITE_STORAGE_MODE=api`, and restart. API data lives in `.data/`, which is ignored by Git.

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
- Deterministic mock tasks with checkpoints. Reconnect a example account and resume without duplicate receipts.
- Local microphone/screen recordings that start only after permission. Recordings can be downloaded. Closing the session window ends capture.
- Scheduled local sleep reviews while the app is open.
- Original Beautiful UI components, Thinking Orbs, and Evil Charts. See THIRD_PARTY.md.

## Deliberately mocked

Account authorization, model replies, workflow detection, and routine generation use example data and a deterministic script. Sleep checks are fixed local fixtures. No actual email is read or sent. No MongoDB connection, live LLM, audio transcription, autonomous desktop control, cloud scheduler, multi-user authentication, or cross-device sync is enabled. The interface labels these boundaries. This is a runnable prototype prepared for backend integration, not a production autonomous agent.

## Upload online

`npm run build` produces `dist/`. Deploy the static output to Vercel using `vercel.json`. Keep the default `VITE_STORAGE_MODE=browser` for a public isolated local. Never expose the local API as a multi-user production service without replacing local sessions with authentication, adding a database and production limits, and reviewing security.

## MongoDB handoff

`shared/workspace.js` owns the mock transitions. `src/store.jsx` is the client adapter. `server/index.js` exposes `GET /api/state`, `POST /api/action`, and `POST /api/reset`. Replace file persistence with Atlas collections for workspaces, observations, skills, runs and action receipts. Preserve the API shape and use a durable job runner. Keep credentials out of model context and store only grant metadata in routine records. Add OAuth, an actual model provider, evaluation fixtures and consented transcription behind server interfaces.

## Team workflow

Use separate feature branches and pull main first. Recommended ownership: `src/` interface; `server/` + `shared/` data/runner; `desktop/` capture/integrations. Coordinate changes to the shared state contract. The repository is private; review event submission requirements before changing visibility.

See HANDOFF.md for the latest verified checkpoint and remaining work.

## ChatGPT on this Mac

Run `npm run dev`, open Connections, and choose **Use ChatGPT**. Offload reuses the Codex CLI sign-in on this computer. If needed, run `codex login` in Terminal first. Credentials stay in Codex. Set `OFFLOAD_CODEX_BIN` when the executable is elsewhere.

The composer lists models from Codex's `model/list`. GPT-5.5 has completed a live check on this machine. Other listed models can still be unavailable at execution time. Failed requests show an error and keep the conversation.

Chat uses the original Beautiful UI Prompt Bar, Streaming Text, Loading State and Context Cards. The sidebar uses its published Sidebar Nav. Offload sends its identity, up to four relevant notes of 360 characters each, and at most five earlier messages. Retrieval uses keyword matches with a small preference for saved rules. There is no embedding service. Codex adds its own system context, which appears in the token receipt.

The local bridge accepts only the loopback app origins and requires the app request header. It runs one model task at a time. Child runs use read-only permissions, an empty temporary folder, and disabled shell, app, plugin, hook, image, web and agent tools. It does not copy credentials into the browser. The bridge is disabled when `NODE_ENV=production`. This is a single-user local integration, not a public authentication service.

Overnight tasks save a brief, deadline and token target. They do not execute until an overnight worker is connected. Jev and external app authorization remain unconfigured. The desktop package must be rebuilt separately; this change is running in the local browser app. No deployment or push was made.

## Appearance and reasoning

Settings ends with 17 palettes, including monochrome, Codex-style light/dark, Claude-style light/dark and common editor palettes. System matching is available for the Codex and Claude families. Paste a `codex-theme-v1` export to import any other Codex palette. These are Offload adaptations, not a claim that every editor palette ships with the Codex desktop app. Fonts and layout stay consistent while the colors change.

The composer has Light, Medium, High, Extra high, Max and Ultra reasoning options. Levels not advertised for the selected model are disabled. The selected supported level is sent to Codex. Reduced-motion preferences remove the sliding animation.
