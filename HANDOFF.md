# Offload handoff

## Current scope
React JavaScript local app + public landing site. Black and white, Instrument Serif wordmark/headings. Collapsible sidebar and persistent suggestions panel. Onboarding, sample connections, sessions, memory, sleep review, task drafts, and saved progress. MongoDB integration happens at the hackathon; current backend is explicitly a local demo.

## Checkpoint 1
- Repository invite accepted. This is the shared SpectrrT/MongoDB_Harness repository.
- Added deterministic shared demo state engine and Express API with per-browser state, atomic file saves, origin checks, and request limits.
- Downloaded original Beautiful UI component source and Evil Charts registry source. Upstream files are preserved under vendor/.
- Dependencies and frontend implementation are in progress. This checkpoint is not yet runnable.

## Required libraries
Vanta NET (monochrome landing only), thinking-orbs (real package), Beautiful UI (original copied components), Evil Charts ECharts bar chart (original source). Keep attribution and upstream copies.

## Remaining
Finish UI, adapt library dependencies, desktop wrapper, tests, responsive review, README. Do not imply real Google OAuth, model execution, MongoDB, or cloud scheduling is connected. Never collect account passwords in the demo.

## Team workflow
Use separate branches. Pull main before starting. Suggested ownership: frontend; MongoDB/API; capture/agent runner. Avoid simultaneous changes to shared/workspace.js.
