# Wiki Model Selection Implementation Plan

> **For agentic workers:** Execute this plan inline with test-driven changes; preserve existing uncommitted work. No parallel agents are needed.

**Goal:** Let users choose the model and reasoning effort for experience extraction and remember that choice.

**Architecture:** Read the current Codex `model/list` catalog, validate the selection, and pin it to each analysis job. Pass the selected model and effort to every model call, persist it on completed candidates, and reuse it for Wiki comparison. The UI uses existing select controls and requires a selection before starting.

**Tech Stack:** TypeScript, Zod, React/Radix, Node SQLite, Codex App Server.

## Global Constraints

- Do not change Codex global configuration or approve/write the personal Wiki.
- Preserve old candidates and show unknown model metadata as unknown.
- Do not silently replace an unavailable model or mix checkpoints across models.
- Support the existing legacy API requests while new UI starts only after selection.

## Tasks

- [x] Add failing storage and API tests: dynamic catalog, parameter propagation, invalid selections, active-job pinning, retries, history and comparison.
- [x] Add `src/wiki-models.ts` for catalog parsing/pagination and selection validation; expose catalog through the existing Wiki bridge.
- [x] Extend job/candidate metadata and persist the last started selection; retain old records unchanged.
- [x] Pin `thread/start` model/config and `turn/start` model/effort, check the effective model, and include selection in checkpoint identity.
- [x] Add model/effort selectors and progress/history labels; remove automatic extraction on first open.
- [x] Run typecheck and regression tests; use an isolated browser fixture to exercise selection, cancellation, restart and comparison.
- [x] Check the real model catalog and a small real-model extraction, package the plugin, back up and replace the installed files when no job is running.
