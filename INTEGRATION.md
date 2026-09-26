# Offload product handoff — September 26

Target repository: `SpectrrT/MongoDB_HarnessEngineering`. Branch: `MyName`. Base: `295734c` on `main`. This branch preserves that UI update and adds screen transitions. It does not implement or configure the live backend.

## Completed in this branch

- Fade between the landing site and workspace, between workspace screens, and between onboarding steps.
- Keep the navigation shell mounted while the content changes.
- Make departing screens inert so an old button cannot receive another click during its fade.
- Use the installed Thinking Orbs library for workspace opening, lazy content, and pending replies. Remove the artificial reply delay.
- Add subtle panel and dialog entrances. Respect reduced-motion preferences in the new transitions and workspace orbs.

The running development app is `http://127.0.0.1:5193/`. `npm run build` creates the static distribution. No public deployment or Atlas migration was performed in this task.

## Verification

Seven unit/API tests and all six desktop/mobile Chrome end-to-end tests passed. The production build passed. The onboarding test exercises successive button clicks during screen exits; departing content is inert to prevent duplicate actions.

## Required backend integration

Use the event-provided **MongoDB Atlas Hackathon Sandbox**. The product requires Atlas persistence, agentic memory tooling, and actual Atlas Vector Search. Local storage and deterministic demo transitions do not satisfy those requirements.

Keep these responsibilities distinct:

| Component | Required behavior |
| --- | --- |
| Atlas persistence | Save task state, checkpoints, results, corrections, versioned rules, and evaluation results. |
| Agent memory tools | Let the agent remember, retrieve, revise, and forget scoped memories, with source references. Separate run checkpoints from cross-session knowledge. |
| Atlas Vector Search | Retrieve relevant prior corrections and procedures by meaning. Filter by authenticated workspace before retrieval. Generate document/query embeddings with the same pinned model and dimensions. |
| Codex connection | Run locally using each user's own signed-in Codex account. This Mac's CLI reports a ChatGPT sign-in. Give other users their own local connection; never route them through Floyd's identity. |
| Execution and recovery | Save progress before moving to the next stage. Use action identifiers and reconciliation so a retry does not repeat a completed external action. |
| Sleep review | Propose a rule from a real correction, evaluate it on separate cases, store an immutable version, and expose approval and rollback. |

The official Codex app-server supports account status and ChatGPT login, and provides thread/turn execution. Keep credentials in the local Codex runtime, outside browser storage and Atlas. A public website needs a properly paired local companion; an ordinary hosted page cannot assume access to the visitor's local Codex process. Account ownership, pairing, workspace authorization, and disconnect behavior still need implementation and verification.

Voyage embeddings are a possible fit for Atlas Vector Search. Confirm the sandbox's embedding access and indexing permissions. MongoDB's automated embedding feature is currently documented as Preview; do not assume it is enabled or production-supported in the event sandbox.

## First real workflow

1. Give Offload source notes for a Friday product update and generate a real draft.
2. Correct it: include unresolved bugs and omit customer names.
3. Run sleep review. Extract the proposed rule and persist its version in Atlas.
4. Evaluate the candidate on held-out inputs. Promote only if the measured checks improve without a regression.
5. Start a new update, retrieve relevant memory through Atlas Vector Search, and apply the approved rule without another reminder.
6. Interrupt execution, restart, and resume from Atlas. Verify that the output is not duplicated.

Record the first and improved outputs, correctness checks, correction counts, tool calls, and retrieved memory IDs. Keep the current demo labels until the corresponding live paths actually pass. A fixed script or a saved note alone is not evidence of learning.

## Existing integration points

- `src/store.jsx`: browser/API adapter.
- `server/index.js`: local Express API; currently file-backed, loopback-only, and based on anonymous demo cookies.
- `shared/workspace.js`: deterministic sample transitions, including chat, runs, and sleep.
- `src/pages/Workspace.jsx`: connections, tasks, memory, and sleep screens.
- `desktop/main.cjs`: existing Electron wrapper; currently serves static files and capture controls only.
- `src/components/ScreenTransition.jsx`: reusable transitions and accessible orb loading states.

Preserve teammate work on `main` and `ryan/work`. Keep database credentials and local workspaces out of Git. The organization task owns event logistics and credit claims.

References: [Codex app-server](https://learn.chatgpt.com/docs/app-server), [MongoDB agent memory](https://www.mongodb.com/company/blog/technical/agent-memory-inside-harness), [Atlas Vector Search](https://www.mongodb.com/docs/vector-search/), [automated embedding status](https://www.mongodb.com/docs/vector-search/crud-embeddings/automated-embedding/).
