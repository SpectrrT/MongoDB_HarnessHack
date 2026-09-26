# Run Offload with your own Codex

Use Node 22.12+ or 24. Install Codex and sign in to your own ChatGPT account, then run:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. In Connections, select ChatGPT and sign in if needed. Offload discovers Codex on your PATH or in `~/.local/bin`. Set `OFFLOAD_CODEX_BIN` if you installed it elsewhere. Each teammate runs their own local instance; do not share `.env`, `.data`, Codex credentials, or development certificate keys.

The native model picker reads the models available to that account. Native Codex models appear first. Its agent sessions inherit the local Codex approval policy, sandbox, apps, and tools. Required tool or browser approvals still appear when the runtime requests them. OpenRouter is a separate connection with its own model list and local file/command tools.

Up to eight conversations can run at once, with one active turn in each. Switching pages does not stop a run. A rotating circle identifies running conversations. Hover or keyboard-focus a conversation for Sleep, Archive, and Delete. Deleted conversations go to Trash and can be restored from the archive button beside Conversations. Chat titles are generated separately by an available lightweight Codex model; a first-message title remains if naming fails.

If a connection drops, Offload keeps checking for the reply. Restarting the backend still interrupts its active Codex processes; the saved agent thread is available when you continue the conversation. The default development command does not restart the backend when files change. Restart it manually after backend edits, once active tasks finish. For backend development only, set `OFFLOAD_WATCH_SERVER=1`; that mode interrupts runs when backend files change.

For a verified read-only walkthrough, select a native Codex model with Gmail connected and ask:

> Search my connected Gmail for the last seven days and give me the five emails that most need my attention. Read the relevant messages and include who sent each one, why it matters, any deadline, and a link. Use the Gmail connector tools, not the browser. Do not send, archive, delete, or change any emails.

This flow was verified locally with real Gmail searches and thread reads. CourseWorks and Gradescope browser access has not been verified. A standalone agent session encountered a browser request-policy error; do not present those integrations as tested.

For `https://offload.ai` on this Mac, follow [LOCAL-HTTPS.md](LOCAL-HTTPS.md). It requires a one-time administrator step. Until that step is complete, use the loopback URL. Public DNS and production are unchanged.

Scheduled tasks live under Tasks → Add task. Choose a description, start date, time, and Once/Daily/Weekly/Monthly. The agent opens a planning conversation before you activate the schedule. Runs use the selected account and tools, keep their results under View latest run, and pause if a run fails. Keep the local service running; closing the browser does not stop the scheduler, but shutting down the Mac does.
