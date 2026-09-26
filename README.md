# Offload

A local workflow companion with a monochrome website and a React JavaScript app.

## Run

Requires Node 22.12+ or 24 and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5193 . The browser stores each workspace in localStorage. Model requests use the local API bridge. To use the real local REST service instead, copy `.env.example` to `.env`, set `VITE_STORAGE_MODE=api`, and restart. With `MONGODB_URI` set, the API stores workspaces in Atlas. Otherwise it uses ignored `.data/` files. Existing browser workspaces are kept in place when Atlas is configured; switching storage modes does not automatically migrate them.

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
- ChatGPT through Codex and OpenRouter, with model selection and reasoning controls.
- Task previews with saved checkpoints.
- Local microphone/screen recordings that start only after permission. Recordings can be downloaded. Closing the session window ends capture.
- Scheduled local sleep reviews while the app is open.
- Original Beautiful UI components, Thinking Orbs, and Evil Charts. See THIRD_PARTY.md.

## Deliberately mocked

App integrations, workflow detection and routine generation still use fixture data. ChatGPT and OpenRouter model replies are live. Sleep checks are fixed local fixtures. No actual email is read or sent. Atlas workspace persistence and agent tools are implemented. Audio transcription, autonomous desktop monitoring, a cloud scheduler, multi-user authentication, and cross-device sync remain unfinished. The interface labels these boundaries. This is a runnable prototype prepared for backend integration, not a production autonomous agent.

## Upload online

`npm run build` produces `dist/`. Deploy the static output to Vercel using `vercel.json`. Keep the default `VITE_STORAGE_MODE=browser` for a public browser workspace. Never expose the local API as a multi-user production service without replacing local sessions with authentication, adding a database and production limits, and reviewing security.

## MongoDB handoff

Set `MONGODB_URI` and `MONGODB_DB=offload` in your private `.env`. The server loads that file; no credential is sent to the browser. `server/atlas.js` stores API workspaces with optimistic version checks to avoid overwriting concurrent changes. Set `VITE_STORAGE_MODE=api` and restart/rebuild to use Atlas from the interface. The current browser workspace is not migrated or deleted. Provider credentials and agent files remain local.

The API still uses a local browser session cookie, not team authentication. Teammates must each supply their own database and model access. Never commit `.env`, `.data`, or certificate private keys.

## Team workflow

Use separate feature branches and pull main first. Recommended ownership: `src/` interface; `server/` + `shared/` data/runner; `desktop/` capture/integrations. Coordinate changes to the shared state contract. The repository is private; review event submission requirements before changing visibility.

See HANDOFF.md for the latest verified checkpoint and remaining work.

## ChatGPT on this Mac

Run `npm run dev`, open Connections, and choose **Use ChatGPT**. Offload reuses the Codex CLI sign-in on this computer. If needed, run `codex login` in Terminal first. Credentials stay in Codex. Set `OFFLOAD_CODEX_BIN` when the executable is elsewhere.

The composer lists models from Codex's `model/list`. GPT-5.5 has completed a live check on this machine. Other listed models can still be unavailable at execution time. Failed requests show an error and keep the conversation.

Chat uses the original Beautiful UI Prompt Bar, Streaming Text, Loading State and Context Cards. The sidebar uses its published Sidebar Nav. Offload sends its identity, up to four relevant notes of 360 characters each, and bounded recent conversation history. Retrieval uses keyword matches with a small preference for saved rules. There is no embedding service. Codex adds its own system context, which appears in the token receipt.

The local bridge accepts only the loopback app origins and requires the app request header. It runs one model task at a time. Codex runs use App Server with persistent conversation threads, image input, workspace-write permissions, live tool activity, and approval prompts. Each chat has its own working folder under `~/.offload/workspaces`, unless a project folder is selected in Settings. Installed tools depend on the local Codex configuration and account. Additional permissions are requested for the current turn; inherited automatic app/tool approval settings are overridden. Stopping a run terminates its process group. Generated files are snapshotted for download; HTML and SVG files are never embedded as active content. It does not copy credentials into the browser. The bridge is disabled when `NODE_ENV=production`. This is a single-user local integration, not a public authentication service.

Overnight tasks save a brief, deadline and token target. They do not execute until an overnight worker is connected. Jev and external app authorization remain unconfigured. The desktop package must be rebuilt separately; this change is running in the local browser app. No public deployment was made. Code is on the MyName branch of SpectrrT/MongoDB_HarnessHack.

## Appearance and reasoning

Settings ends with 17 palettes, including monochrome, Codex-style light/dark, Claude-style light/dark and common editor palettes. System matching is available for the Codex and Claude families. Paste a `codex-theme-v1` export to import any other Codex palette. These are Offload adaptations, not a claim that every editor palette ships with the Codex desktop app. Fonts and layout stay consistent while the colors change.

The composer has Light, Medium, High, Extra high, Max and Ultra reasoning options. Only levels advertised for the selected model appear. The selected supported level is sent to Codex. Reduced-motion preferences remove the sliding animation.


## OpenRouter

Connections includes an OpenRouter authorization flow with PKCE. Sign in, set a credit limit in OpenRouter, and approve the local callback. Offload stores the resulting key in a private, ignored `.data/openrouter/` file with owner-only permissions. It never returns the key to the browser or includes it in workspace exports. Choose **Use OpenRouter** after authorization to switch providers. Disconnect removes the local key; revoke it in OpenRouter to invalidate it everywhere.

The model picker loads OpenRouter's current text model catalog and includes search. Responses have an 8,192-token output cap. Tool-capable models can list/read local files and request approval to write files or run commands, for up to 40 steps per turn. Vision-capable models accept attached images. Image-output models can return generated images. OpenRouter does not inherit Codex-specific tools or plugins. The reasoning slider sends the provider's low, medium or high setting when the model supports reasoning; models without reasoning support disable the slider. Codex models keep their own advertised effort levels. Keys are tied to this browser's local session. Do not expose the local server publicly.

## Local HTTPS address

See [Local HTTPS setup](docs/LOCAL-HTTPS.md) for https://offload.ai on this Mac. No public domain or DNS changes are needed.
