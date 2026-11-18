# Session Grouping and Bulk Confirmation Implementation Plan

> **For agentic workers:** Implement inline using focused test-first cycles; retain unrelated uncommitted changes.

**Goal:** Implement approved design A for project grouping, selectable bulk session completion, abnormal-session confirmation, and lifecycle-overlap date filters.

**Architecture:** Preserve Codex creation and activity timestamps in synchronized session records. Extend human-only confirmation with an explicit archive mode, retaining optimistic observation checks and never accepting linked business tasks. Project the archived session state separately from task acceptance. Apply status-specific range filtering before rendering the same items in grouped board and list views, and present explicit per-session selection before batch mutation.

**Tech Stack:** TypeScript, React, SQLite, Codex app-server, Node test runner, existing i18n and local service/MCP bridge.

## Global Constraints

- Existing uncommitted changes are user work and must remain intact.
- Group projects within each status; retain the existing ungrouped view.
- Default date filters to the last two days; pending and completed ranges are independent and use lifecycle overlap.
- Do not invent creation times for old sessions; keep unknown dates visible and label them unknown.
- User-confirmed archive records session state only; never infer task acceptance or stop Codex execution.
- A newer observation or catalog activity invalidates an older confirmation; stale requests fail.
- Batch selection defaults to pending and interrupted sessions; running sessions require explicit selection and a warning.
- Test with isolated databases and mock sessions; do not mutate real session statuses during validation.

### Task 1: Confirmation and lifetime data

**Files:** `src/domain.ts`, `src/types.ts`, `src/codex.ts`, `ui/execution-board.ts`, `test/session-confirm.test.js`, `test/execution-board.test.js`, `test/codex-sync.test.js`.

- [ ] Add failing isolated-store tests for archive confirmation across running/waiting/interrupted states, bound-task preservation, stale rejection, unchanged host sync, and invalidation after real activity.
- [ ] Add creation-time synchronization tests covering supplied timestamps and unknown historical creation times.
- [ ] Implement explicit human archive mode, current-state projection, and confirmed-version invalidation; retain legacy confirmation semantics.
- [ ] Run affected tests and type checking.

### Task 2: Project grouping, date filtering, and selectable batch UI

**Files:** `ui/app.tsx`, `ui/session-list.ts`, `ui/components/ExecutionView.tsx`, `ui/components/SessionList.tsx`, `ui/components/SessionBatchDialog.tsx`, `ui/workspace.css`, `src/locales/{en,zh-CN}.ts`, focused tests.

- [ ] Add failing tests for inclusive lifecycle-overlap boundaries, missing creation timestamps, project resolution, and selectable batch candidates.
- [ ] Implement independent pending/completed date controls, project group toggling, grouped rendering, session timestamps, and selectable batch dialog based on the approved prototype.
- [ ] Route each selected session through the human-only confirmation endpoint with its displayed observation; report failures without declaring success for failed items.
- [ ] Verify both embedded MCP and browser paths, running warnings, project-only selection, and ungrouped mode.

### Task 3: Verify and install

**Files:** generated plugin UI and server/MCP artifacts only.

- [ ] Run full test suite, typecheck, build, and whitespace checks.
- [ ] Verify UI with an isolated fixture and actual browser interaction; do not alter live data.
- [ ] Back up the existing local plugin artifacts, update artifacts built from the current worktree, and restart only after checking background work.
- [ ] Confirm the restarted service returns the new UI and explain whether plugin reload is required.
