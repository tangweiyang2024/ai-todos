# Wiki Experience Review Implementation Plan

**Goal:** Extract reusable experience from a selected Codex session into local, human-reviewed candidates and apply only explicitly approved Wiki changes.

**Architecture:** Read the selected thread through paginated Codex app-server APIs and generate structured suggestions using an isolated read-only Codex thread. Persist candidates, user edits and audit history in SQLite. Prepare a review containing exact file contents and base hashes; an authenticated browser-only approval checks revisions and file hashes before applying the reviewed changes.

**Tech Stack:** Node.js, TypeScript, SQLite, Codex app-server, React.

## Constraints

- Preserve existing uncommitted work and never write to the real Wiki during development or tests.
- Manual trigger only; completion hooks do not initiate extraction.
- Explicit human approval is required for all formal Wiki writes.
- Surface incomplete retrieval, failures, duplicate and conflict uncertainty; never silently truncate.
- Restrict targets to the configured Wiki root, reject traversal and symlinks; preview every affected file.
- Persist candidate revisions, review notes, decisions and write outcomes.

## Steps

1. Test and implement candidate persistence, revision checks, preview and approval with temporary Wiki fixtures; test stale content and unsafe paths.
2. Test and implement complete paginated Codex thread item reading with size limits and structured read-only generation; include Wiki index and relevant page contents.
3. Add authenticated UI-only routes, session entry, persistent review/edit/reject, full preview and approval flows.
4. Run targeted tests, typecheck, build, full suite and isolated end-to-end checks; document limitations.
