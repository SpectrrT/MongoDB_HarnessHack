# Offload on https://offload.ai

This address works only on the Mac where you set it up. No domain purchase, public DNS change or public deployment is involved. The local hosts entry temporarily takes precedence over the real public domain. Undo restores normal resolution.

## First setup (macOS)

From the repository folder:

```sh
brew install caddy mkcert
npm run dev
```

Leave the app running. In another Terminal, in the same folder:

```sh
npm run local:https:prepare
sudo node scripts/local-https.mjs install-admin
npm run local:https
```

Enter your Mac password in Terminal when asked. Open **https://offload.ai**. The admin step adds a marked block to `/etc/hosts` and trusts a dedicated local development CA. Private keys stay in the ignored `.data/local-https/` folder. Never share that folder or commit certificates.

The proxy binds only to `127.0.0.1` and `::1`, uses the local certificate and makes no public certificate request. Browser certificate checks stay enabled. Caddy's control socket is private to your user; no admin port is exposed. No login service is installed. The proxy runs with the app, not at Mac login.

## Start

After the one-time admin setup, run:

```sh
npm run dev
```

Open **http://offload.ai** or **https://offload.ai**. HTTP redirects to HTTPS, including the path and query. The app's start command now starts the local proxy automatically. `npm start` does the same for the built app; run `npm run build` first. `npm run dev:web` starts the frontend and proxy when your API is already running.

The proxy checks listening ports every two seconds, verifies the Offload page, and prefers Vite over the built site. It reloads when the frontend port changes. If more than one Offload frontend is open, explicitly choose one:

```sh
OFFLOAD_PORT=6200 PORT=6201 OFFLOAD_WEB_PORT=6200 npm run dev
```

For teammates, `OFFLOAD_WEB_PORT` sets the web port and `PORT` sets the API port. Each Mac needs its own hosts entry and certificate; never share private keys. The default web port is 5193 and API port is 5194.

Both HTTP and HTTPS bind only to loopback. The proxy passes WebSockets for live updates. Vite allows `offload.ai`; the model bridge accepts the local HTTPS origin. No public DNS is changed. This automatic setup is disabled outside macOS and under `NODE_ENV=production`.

To run without the domain proxy:

```sh
OFFLOAD_LOCAL_DOMAIN=0 npm run dev
```

## Stop

Control-C stops the app and its automatically started proxy. The hosts entry remains until undo, so offload.ai points locally even while the app is stopped; it does not fall back to the public website.

For a proxy started manually:

```sh
npm run local:https:stop
```

If `npm run dev` was already running before this update, restart it after saving your work. Alternatively, run `node scripts/local-https.mjs watch` in another Terminal until the next restart.

## Undo

```sh
npm run local:https:stop
sudo node scripts/local-https.mjs undo-admin
```

Undo removes only the marked Offload hosts block and this setup's dedicated CA from the system trust store. It preserves other hosts entries and certificates. The original hosts file is saved at `.data/local-https/hosts.before` for reference; undo does not overwrite later unrelated changes with that snapshot.

The ignored certificate files remain on disk so the setup is reusable. After undo, you may delete `.data/local-https/` if you no longer need them. Leave `.data/openrouter/` alone to preserve the model connection. Homebrew packages remain installed and can be removed with `brew uninstall caddy mkcert` if nothing else uses them.

## Check or troubleshoot

```sh
npm run local:https:status
curl --fail https://offload.ai/api/health
```

If Chrome has cached an earlier certificate error, close that tab and open a fresh one after setup. Do not bypass the warning or turn off browser security. A second app already on port 443 causes a clear bind failure; stop or reconfigure that app yourself rather than replacing it.

Browser data and cookies are isolated by origin. The new HTTPS address starts with its own workspace and may need onboarding or OpenRouter authorization again. Existing chats at `http://127.0.0.1:5193` remain there. Use Export workspace in Settings to keep a backup of the previous workspace. ChatGPT through Codex uses the same local account regardless of origin.

Teammates run the setup separately on their own Macs. Do not copy your CA key or OpenRouter credentials to them. Phones and other computers cannot reach this loopback-only proxy.

References: [mkcert](https://github.com/FiloSottile/mkcert), [Caddy local bind](https://caddyserver.com/docs/caddyfile/directives/bind), [Vite allowed hosts](https://vite.dev/config/server-options#server-allowedhosts).
