# Personal next actions

This vertical slice learns that a user repeatedly requests previous-session context. When the user explicitly resumes a project, it proposes a source-checked recovery task. Accepting it uses the existing durable harness checkpoint/lease machinery, produces an actual Markdown file, and records its exact source checks before declaring completion.

## Run locally

Run `npm run build`, then `node scripts/suggestions-local.mjs`. Open `http://127.0.0.1:5214/app/sleep`, complete onboarding, and use Next actions. This demo stores MongoDB files under `.data/personal-demo`; restarting it retains imported notes and runs. The demo worker services only this context workflow. The normal application uses the existing `npm run harness:worker` loop with its configured MongoDB database. No additional Sleep execution worker is introduced.

Import a JSON object with an `events` array. Each event has `sourceId`, `sessionId`, `projectId`, `projectTitle`, ISO `timestamp`, `text`, and optional `kind`, `origin`, and `locator`. Requests, constraints, corrections, commitments and decisions are supported. Imports are limited to 500 events per API batch; the UI chunks up to 5,000. Known credential patterns and pasted system blocks are rejected. This is a filter, not a guarantee that arbitrary text has no personal information.

For Claude/Codex JSONL, run `node scripts/import-selected-history.mjs manifest.json selected.json`. A manifest has `sessions`, each containing a JSONL `path`, `origin` (`claude` or `codex`), `sessionId`, project fields, and an explicit `sourceIds` allowlist. Optional `kinds` maps source IDs to event kinds. Only authored user requests are exported. Nothing crawls session directories automatically. The selected JSON can be imported through the UI. Raw personal history is not committed to the repository.

## Behavior and boundaries

- At least two distinct nonduplicate requests on two days establish the context-recovery habit. Fork copies cannot manufacture support. Support can come from other projects, but recovered facts come only from the selected project.
- Import alone does not generate cards. A project-resume event does. Three cards maximum, 24-hour expiry, cooldown, snooze and project mute bound interruptions. Changed evidence invalidates pending cards. Accepted/rejected cards are not repeated for the same source revision.
- A repeated acceptance is idempotent. Accepted cards with a missing queue link are reconciled by the worker after restart. Four fenced steps select sources, draft exact quotations, check citations and protected-note recall, and atomically publish the artifact with its final receipt.
- Source withdrawal clears affected task outputs and invalidates downloads. Every request is scoped by the existing local workspace cookie. This does not add production account authentication.
- The workflow is deterministic and does not need a paid model call. `createPersonalSuggestions({db, compactor})` accepts the shared Jev compactor for bounded selection when context must be reused. Default personal recovery keeps all selected records. Do not enable remote scoring of private context implicitly.
- Two recorded dismissals can propose a bounded cooldown change in the actual shared harness policy store. Promotion requires improvement on feedback cases and on 18 frozen engineering cases with no case-level regression. Versions persist, and rollback compares the active head before changing it. Those cases verify the gate; they are not a blind usefulness study or proof of generalized learning.

## Verification

`node --test tests/personal-suggestions.test.js` exercises imports, false-positive social chats, deduplication, event timing, persistence, tenant/project isolation, source checks, withdrawal, policy promotion/rollback, protected Jev context and API downloads.

With credentials already configured, `node scripts/verify-personal-atlas.mjs result.json` creates its own unique Atlas database and verifies connection restart, concurrent acceptance, policy persistence/rollback, source removal and indexed reads alongside 10,000 unrelated synthetic records. It removes only those scale fixtures and retains small namespaced evidence. It uploads no personal history.

With the local demo running, `node scripts/verify-personal-browser.mjs selected.json outputs` checks a six-note MongoDB Harness demonstration on desktop and mobile. It verifies the downloaded artifact, source separation, reload persistence and layout. This is a specific replay, not a generic test fixture.

Scope: real context recovery is implemented. Arbitrary task execution belongs to the separate Sleep execution module. Long-term suggestion acceptance and billion-token reliability require prospective testing; neither is established by these checks.
