# Todos

English | [中文](README.zh-CN.md)

A task and focus workspace for Codex. Manage tasks, projects, OKRs, and daily plans, track focus time, and review AI deliveries in one place. Data is stored locally in SQLite.

## Why Todos?

When several Codex tasks run in parallel, you have to switch between chats to check their status. There is no single view of which chats are running, waiting for input, or ready for review.

Todos brings chat activity and task progress together on one board, so you can see what needs your attention without opening each chat. When activity cannot be observed, it is shown as unknown.

## Screenshots

### Task and chat board

![Task and Codex chat status in one board (Chinese interface)](docs/screenshots/board.png)

### Timeline

![Task schedules in the timeline (Chinese interface)](docs/screenshots/timeline.png)

## Install

Requires a Codex CLI and desktop app with plugin support, Git, and **Node.js 24+**. Make sure `node` and `codex` are available on Codex's PATH.

```sh
codex plugin marketplace add denvey/ai-todos
codex plugin add ai-todos@ai-todos
```

The plugin is prebuilt; no npm install or compilation is needed.

Start a new Codex chat and ask **“Open the ai-todos workspace.”** If your client does not display the workspace, open the local `browserUrl` returned by the tool.

### Review and trust the 8 lifecycle hooks

The plugin automatically registers **8 hooks**, one for each event below. Installing or enabling the plugin does not trust them automatically. For complete hook-based live activity tracking:

1. Run `codex` in a terminal and open `/hooks`, or open the hook settings in your Codex desktop app.
2. Find the hooks from **ai-todos**, review all 8 against the table below, and enable and trust them.
3. Save your choices. You do not need to add duplicate hooks to your global configuration.

| Hook event | What ai-todos does |
| --- | --- |
| `SessionStart` | Records the session as idle and supplies its trusted ID and any linked task ID as background context. |
| `UserPromptSubmit` | Marks the session as running and supplies the session and linked task context for the new turn. |
| `PreToolUse` | Refreshes the running state before a tool call. |
| `PostToolUse` | Refreshes the running state after a tool call; the turn may still be active. |
| `PermissionRequest` | Marks the session as waiting for approval. It does not approve or deny the request. |
| `Stop` | Marks the turn as idle. It does not complete or accept a business task. |
| `Interrupt` | Records that the turn was interrupted. |
| `SessionEnd` | Records that the session ended. It does not accept a business task. |

All 8 run the same local `hooks/observe.js` script with a 3-second timeout. It records session identity, working directory, event, turn ID, activity time and observed state in local SQLite; it does not save prompt text or tool input/output content. Hooks observe activity separately from task delivery and human acceptance.

Without trust, Codex skips these hooks. Task management and historical chat synchronization remain available, but hook-based live updates are unavailable. See the official [Codex hook trust documentation](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks).

## Update

```sh
codex plugin marketplace upgrade ai-todos
codex plugin add ai-todos@ai-todos
```

Start a new chat and reopen the workspace. Restart Codex if the old interface remains loaded.

Keep using the same plugin source, `ai-todos@ai-todos`. The hook settings may show a versioned cache path such as `.../0.1.10/hooks/observe.js`; the definition uses `${PLUGIN_ROOT}`, which Codex resolves to the installed version when it loads the plugin. There is no path to edit manually. With the same source and unchanged hook definitions, a version upgrade alone does not require trusting the 8 hooks again. If Codex marks a hook as new or changed, review and trust its current definition; switching marketplace sources also creates a new trust identity.

## Use

- **Home:** capture tasks and plan your day. Press Enter to add a task to today, or Option/Alt + Enter to save it to the inbox.
- **Inbox:** collect ideas, preview AI suggestions, and turn ideas into tasks.
- **Tasks:** optionally add a description and acceptance criteria, set priorities and schedules, and track progress on the board or timeline. Click **Confirm complete** to move a stopped task to **Completed** and close its dialog. Submitted deliveries keep their evidence review flow.
- **Codex chats:** open a task's linked chat or create one with task details prefilled. Send the prompt in Codex when you are ready to continue.
- **Projects and OKRs:** organize tasks by project and track objectives and key results.
- **Focus:** start, pause, resume, and end a timer. An active timer keeps running through sleep or closing Codex until you pause or end it.
- **Review:** inspect the delivery summary and evidence, then accept or request changes. AI stopping does not automatically complete or accept a task.
- **Settings:** choose Automatic, Simplified Chinese, or English, Language changes apply immediately; your content stays in its original language.


## Run from source

Requires Node.js 24+ and npm.

```sh
git clone https://github.com/denvey/ai-todos.git
cd ai-todos
npm ci
npm run package:plugin
npm run open
```

This starts the local service and opens `http://127.0.0.1:16943`. The first workspace is empty. Run `npm run stop` from the checkout to stop the service.

## Releases

Every push to `main` runs the release workflow: it increments the patch version, builds the portable plugin with Node.js 24, commits the version and prebuilt plugin back to `main`, and publishes a `v<version>` GitHub Release with `.zip` and `.tar.gz` bundles and generated release notes. The release commit uses `GITHUB_TOKEN`, so it does not trigger another release run. Concurrent merges are released from the latest `main` checkout and may share one release.

The workflow needs `contents: write`; repository rules must allow `github-actions[bot]` to push release commits to `main`. If another commit reaches `main` during the build, the atomic push fails without overwriting it; rerun the workflow. Rerunning a tagged release reuses its version and uploads the bundles again. You can also run **Release** manually from the Actions tab on `main`.

## Local data

The database is stored at `~/.ai-todos/ai-todos.sqlite`. The service listens only on `127.0.0.1`. Uninstalling the plugin does not delete your data or stop the service.

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_TODOS_DATA_DIR` | `~/.ai-todos` | Data directory |
| `AI_TODOS_PORT` | `16943` | Local HTTP port |

Use the same settings for the service, MCP, and hooks. Stop the service and ensure hooks have stopped writing before backing up or restoring the database.

Community friend link: [Linux DO](https://linux.do/)
