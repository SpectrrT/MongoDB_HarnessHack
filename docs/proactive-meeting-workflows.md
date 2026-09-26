# Meeting notes and weekly routines

Sleep's Next actions view can prepare a local meeting brief or an action checklist from explicitly saved notes. It does not read a meeting transcript from an app title, join a meeting, send messages, change a calendar, or enable recording.

## Evidence and timing

The existing `POST /api/suggestions/import` accepts user-selected events. A meeting note uses this shape:

```json
{
  "sourceId": "note-unique-id",
  "sessionId": "meeting-launch-review",
  "projectId": "launch",
  "projectTitle": "Launch",
  "timestamp": "2026-09-26T15:00:00Z",
  "kind": "meeting-note",
  "origin": "user",
  "locator": "https://example.com/meeting-notes",
  "text": "Decision: Keep the rollout limited.\nAction: Ryan to prepare a local release checklist.",
  "meeting": {
    "id": "launch-review",
    "title": "Launch review",
    "startsAt": "2026-09-26T14:00:00Z",
    "endsAt": "2026-09-26T15:00:00Z",
    "status": "completed"
  }
}
```

This is an illustrative input, not an observed meeting. Wrap events in `{"events":[...]}`. Source timestamps must not be in the future. Meeting end must follow start.

- A scheduled meeting starting within 24 hours creates a preparation suggestion.
- A completed meeting ending within the past seven days creates a follow-up suggestion.
- A later source with the same meeting ID corrects the meeting metadata. Mark it cancelled to withdraw the suggestion. Source IDs are immutable.
- Follow-up checklists quote only lines explicitly labeled `Action:`, `Action item:`, `Todo:`, or `Follow-up:` in the latest saved meeting note. Earlier notes and constraints remain available as sources. Owners, due dates, and completion are never invented.
- A `routine` source is an explicitly saved activity. The same text observed on the same UTC weekday and hour in at least three separate weeks can suggest a routine plan. Duplicate sessions in one week do not count as extra weeks. This does not schedule recurring work. App visits alone do not establish that the task was performed.

## Starting and checking

`GET /api/suggestions` derives supported suggestions. `POST /api/suggestions/:id/decision` with `{"decision":"accept"}` is the explicit Start once action. Meeting and routine drafts perform four bounded, fenced checkpoints through the ordinary local server: read sources, prepare exact quotations, verify them, and persist the artifact. There are zero model calls for these drafts. No separate worker is needed for them.

A completed run means the local draft passed source checks. Action items remain `not_started`. Recover-context tasks retain their existing worker and optional model behavior. `POST /api/suggestions/runs/:id/cancel` cancels an owned queued/running task; stale workers cannot commit afterward.

Repeated or concurrent starts share one durable run and one artifact. Repeating Start once resumes queued checkpoints after a restart. Importing corrected evidence invalidates pending cards and stops stale accepted tasks at the next checkpoint. Artifact downloads recheck source availability and timing.

## Verification

`node --test tests/personal-suggestions.test.js` covers the existing recovery workflow plus meeting preparation, exact action quotes, correction/cancellation, three-week support, stale accepted work, fenced cancellation, concurrent starts, restart recovery, HTTP delivery, and workspace isolation. The meeting/routine checks are deterministic integration tests against a temporary MongoDB server. They are not live calendar or meeting-service benchmarks.

## Current boundaries

The meeting form imports selected notes. Automatic calendar ingestion, meeting transcription, recurring scheduling, and execution of external action items are not connected. A weekly UTC pattern is only a suggestion to review, especially across timezone and daylight-saving changes. Source links are provided by the person importing notes; source checks confirm quotations, not the authenticity of a remote document. The public static site requires the local service for these features.

## Hand one action to Sleep

A checked meeting checklist exposes `draftSupported` for each exact quoted action. Local text-draft actions such as draft, write, prepare, summarize, outline, document, list, review, and design can be handed to the existing assigned-task executor. Send, buy, delete, book, and other external-only actions are not supported by this bridge.

`POST /api/suggestions/runs/:runId/actions/:index/draft` accepts a future `deadline` in milliseconds, a total `budget` of 1,000 to 100,000 tokens, and `maxAttempts` from one to three. It returns HTTP 202 with `task`, `workerEnabled`, and the limited completion meaning. Repeating the handoff returns the existing task, including if that task was cancelled. It never silently recreates a cancelled action.

The worker produces `action-draft.md` and `source-evidence.md` from the supplied notes. The generated files pause for review under the existing exact-draft approval mechanism before being written. The action quote and source markers are checked. The files remain unverified drafts; structural checks do not prove that the original meeting action was completed. No new executor or external tool permissions are introduced.

The handoff creates a queued task, not a completed action. The existing Sleep worker and model credentials must be configured to generate the draft. This feature does not enable a worker automatically. Source changes or withdrawal cancel the task at the next worker fence and withdraw artifact downloads. If a model reservation was in flight, its full reserved usage is conservatively charged when actual usage is unavailable. Sources are bounded rather than silently truncated; oversized note sets ask for a narrower import.
