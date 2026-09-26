# Stable local demo

Build and validate a new frontend snapshot without touching the running site:

```sh
npm run demo:build
```

The build goes into a unique staging directory under `.data/demo-frontend/`. Only a successful build with valid asset references is published. Every file is hashed; an atomic pointer selects the next snapshot. A failed build keeps the previous snapshot. Published snapshot directories are retained.

When active jobs are finished, stop the development supervisor and start:

```sh
npm run demo
```

Open [the homepage](http://127.0.0.1:5193/). This starts the API on port 5194, waits for its health endpoint, then starts the stable frontend on 5193. If the API is already running independently, use `npm run demo:web` instead. The existing local HTTPS helper is pinned to the stable frontend port in demo mode.

The frontend verifies and loads one snapshot into memory at startup. Source edits, merge conflicts, and later builds cannot change its served bytes or show a Vite overlay. `/api` requests proxy to the running local API, preserving the original Host, cookies, request body and streaming responses, including SSE. The API remains live; this mode does not freeze backend code or restart it when files change.

Publish another snapshot with `npm run demo:build`, then restart only the frontend when ready to display it. Refresh open browser tabs after switching snapshots. For rollback, the build output and `.data/demo-frontend/current.json` identify the previous snapshot:

```sh
OFFLOAD_DEMO_SNAPSHOT='<previous snapshot identifier>' npm run demo:web
```

`OFFLOAD_WEB_PORT` (or `VITE_PORT`) changes the frontend port; `PORT` changes the API port. Development commands remain unchanged. Do not run two frontends on the same port.
