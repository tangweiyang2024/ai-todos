# Session Workspace Implementation Plan

**Goal:** Implement the approved session workspace mockup with list, board, and history, using actual Codex sessions and explicit human confirmations.

**Architecture:** Preserve existing domain state, session binding and actions. Add a unified session/task projection for attention-first list ordering and reuse the existing board and history. Present project filtering and navigation in the approved responsive shell.

**Tech Stack:** React, TypeScript, CSS, Node test runner.

## Tasks
- [ ] Test list grouping, ordering and session deduplication using real projection functions.
- [ ] Implement list cards with session descriptions, project, activity time, status and real callbacks.
- [ ] Implement responsive sidebar and list/board switch with session history navigation.
- [ ] Verify state, confirmation, filters, history, narrow layouts, typecheck, tests and build.
