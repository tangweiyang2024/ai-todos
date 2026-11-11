import { readFileSync } from 'node:fs';
import type { CallToolResult, ListToolsResult } from '@modelcontextprotocol/sdk/types.js';
import type { ResourceMetadata } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { commandSchema, sessionConfirmSchema, taskCompleteSchema, errorPayload } from './domain.ts';
import { codexActionSchema } from './codex.ts';
import { ensureService, service } from './service-client.ts';
import { origin } from './paths.ts';
import pkg from '../package.json' with { type: 'json' };
await ensureService();
const icons = [{ src: `data:image/png;base64,${readFileSync(new URL('../assets/icon.png', import.meta.url)).toString('base64')}`, mimeType: 'image/png' }];
const server = new McpServer({ name: 'ai-todos', title: 'Todos', version: pkg.version, icons });
const uri = 'ui://ai-todos/app.html';
const result = (value: Record<string, unknown>): CallToolResult => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
const guarded = <T,>(fn: (args: T) => Promise<Record<string, unknown>>) => async (args: T): Promise<CallToolResult> => { try { return result(await fn(args)); } catch (error) { const payload = errorPayload(error); return { isError: true, content: [{ type: 'text', text: String(payload.error) }], structuredContent: payload }; } };
const openToolConfig = {
  icons,
  title: '任务', description: 'Open the local ai-todos session and task workspace. If this host cannot render MCP Apps, open browserUrl in its browser.',
  inputSchema: z.object({}), annotations: { readOnlyHint: true, openWorldHint: false },
  _meta: { ui: { resourceUri: uri }, 'openai/ui': { entrypoints: [{ type: 'global' }, { type: 'thread' }] } },
};
registerAppTool(server, 'ai_todos_open', openToolConfig, guarded(async () => ({ browserUrl: origin })));
server.registerTool('ai_todos_workspace', { description: 'Read workspace state for the ai-todos interface.', inputSchema: z.object({}), annotations: { readOnlyHint: true, openWorldHint: false }, _meta: { ui: { visibility: ['app'] } } }, async () => {
  try { return { content: [{ type: 'text' as const, text: 'Workspace state ready.' }], structuredContent: await service('state') }; }
  catch (error) { const payload = errorPayload(error); return { isError: true, content: [{ type: 'text' as const, text: String(payload.error) }], structuredContent: payload }; }
});
server.registerTool('ai_todos_snapshot', { description: 'Read persistent tasks, inbox captures, projects, OKRs, plans, trusted hook sessions, focus and reminders. Set syncThreads=true to refresh the official existing-session catalog before reading, for binding a host-created conversation. This does not create or execute conversations. Observed AI state is independent of task business state.', inputSchema: z.object({ syncThreads: z.boolean().optional() }), annotations: { readOnlyHint: true, openWorldHint: false }, _meta: { ui: { visibility: ['model', 'app'] } } }, guarded(async (args: { syncThreads?: boolean }) => {
  if (args.syncThreads) await service('codex', { operation: 'sync_threads' });
  return service('state');
}));
server.registerTool('ai_todos_task', { description: 'Read one task and its delivery/acceptance history. Use the returned revision for a subsequent mutation. Never replace a human-reviewed revision with a newer one.', inputSchema: z.object({ id: z.string().uuid() }), annotations: { readOnlyHint: true, openWorldHint: false }, _meta: { ui: { visibility: ['model', 'app'] } } }, guarded((args: { id: string }) => service('task', args)));
server.registerTool('ai_todos_manage', {
  description: 'Create/update/delete task, inbox capture, project, objective, keyResult or plan. create_tasks atomically creates tasks and adds them to planDate. promote converts an inbox capture to a task, optionally adding it to planDate. daily_plan selects the union of tasks for one date; plans must contain every plan ID and revision actually read for that date. Creation/promotion requestId is a UUID generated once and reused on retries. Bind only an official API-synced or hook-observed session ID; transition defining → ready → executing; submit real delivery summary and absolute-path/HTTP(S) evidence; manage persisted focus/settings/reminders. All updates require the revision actually read. Description and acceptance criteria are optional. Stop is never delivery or acceptance. No complete/accept/reject operation is available to AI: people confirm completion or review submitted evidence in the UI. Do not infer acceptance, forge evidence or session IDs. Starting execution records intent and does not start Codex by itself.',
  inputSchema: z.object({ command: commandSchema }), annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }, _meta: { ui: { visibility: ['model', 'app'] } },
}, guarded((args: { command: z.output<typeof commandSchema> }) => service('command', args.command)));
server.registerTool('ai_todos_codex', { description: 'Sync Codex projects and conversations, prepare and bind a task conversation, open an observed session in the desktop app, or generate a definition suggestion. Creating/opening a session does not execute or accept a task.', inputSchema: z.object({ action: codexActionSchema }), annotations: { readOnlyHint: false, openWorldHint: true }, _meta: { ui: { visibility: ['app'] } } }, guarded((args: { action: z.output<typeof codexActionSchema> }) => service('codex', args.action)));
server.registerTool('ai_todos_confirm_session', { description: 'Record the human UI action confirming an unbound, stopped conversation complete at its displayed observation. This is not business task acceptance.', inputSchema: sessionConfirmSchema, annotations: { readOnlyHint: false, openWorldHint: false }, _meta: { ui: { visibility: ['app'] } } }, guarded((args: z.output<typeof sessionConfirmSchema>) => service('session-confirm', args)));
registerAppResource(server, 'ai-todos workspace', uri, { description: 'Persistent local productivity workspace' } as ResourceMetadata, async () => ({ contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: readFileSync(new URL('../dist/app.html', import.meta.url), 'utf8').replaceAll('__AI_TODOS_ORIGIN__', origin), _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: false }, 'openai/ui': { availableDisplayModes: ['inline', 'fullscreen'] } } }] }));
server.registerTool('ai_todos_complete_task', { description: 'Record an explicit human UI action confirming the displayed revision of a stopped task complete. Not available to AI.', inputSchema: taskCompleteSchema, annotations: { readOnlyHint: false, openWorldHint: false }, _meta: { ui: { visibility: ['app'] } } }, guarded((args: z.output<typeof taskCompleteSchema>) => service('task-complete', args)));
const transport = new StdioServerTransport();
const send = transport.send.bind(transport);
// shortcut: SDK 1.32 drops tool icons; remove when registerTool preserves them.
transport.send = message => {
  const tool = 'result' in message ? (message.result as Partial<ListToolsResult>).tools?.find(tool => tool.name === 'ai_todos_open') : undefined;
  if (tool) tool.icons = icons;
  return send(message);
};
await server.connect(transport);
