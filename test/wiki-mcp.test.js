import { nativeReadLoopSource } from './fixtures/native-read-loop.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Store } from '../src/domain.ts';

// 申请未占用端口，避免触碰用户运行中的 ai-todos 服务。
async function freePort() {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port; await new Promise(resolve => server.close(resolve)); return value;
}

test('embedded review cannot approve and opens only the selected current candidate', async t => {
  // 准备隔离 Wiki、会话和模拟 Codex，不读取或写入真实用户内容。
  const dir = mkdtempSync(join(tmpdir(), 'wiki-mcp-'));
  const root = join(dir, 'wiki'); mkdirSync(root); mkdirSync(join(root, 'entities'));
  writeFileSync(join(root, 'index.md'), '# Index\n'); writeFileSync(join(root, 'log.md'), '# Log\n');
  writeFileSync(join(root, 'entities/test.md'), '# Test\n');
  const sessionId = randomUUID(); const store = new Store(join(dir, 'ai-todos.sqlite'));
  store.observe({ session_id: sessionId, hook_event_name: 'Stop', cwd: dir, turn_id: 'test-turn' }); store.close();
  writeFileSync(join(dir, 'codex'), `#!${process.execPath}\nimport { createInterface } from 'node:readline';
if(process.argv.includes('proxy'))process.exit(1);
${nativeReadLoopSource('model-thread')}

let count=0;createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(nativeReply(m))return;if(m.id===undefined)return;let r={};
if(m.method==='thread/read')r={thread:{id:m.params.threadId}};
if(m.method==='thread/items/list')r={data:[{turnId:'t',item:{type:'agentMessage',id:'i',text:'证据'}}],nextCursor:null};
if(m.method==='mcpServerStatus/list')r={data:[],nextCursor:null};if(m.method==='thread/start')r={thread:{id:'model-thread'},model:m.params.model,reasoningEffort:m.params.config?.model_reasoning_effort};
if(m.method==='turn/start'){count++;const value=m.params.outputSchema.properties.supported?{supported:true,explanation:'支持'}:m.params.outputSchema.properties.sessionSummary?{sessionSummary:'会话做了什么',items:[{title:'经验一',conclusion:'结论',scope:'范围',evidence:'t/i',unverified:''}]}:count===1?{paths:['entities/test.md'],humanPaths:[]}:{summary:'经验',scope:'范围',evidence:'t/i',unverified:'',relation:'相关',changes:[{path:'entities/test.md',content:'# Test\\n新经验\\n'}],newNotes:[]};nativeStart(m,value);return}console.log(JSON.stringify({id:m.id,result:r}))});`, { mode: 0o755 });
  // 用隔离的替身记录本地打开请求，不启动真实浏览器。
  writeFileSync(join(dir, 'open'), `#!${process.execPath}\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(join(dir, 'opened.txt'))}, process.argv[2]);\n`, { mode: 0o755 });
  const port = await freePort();
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, AI_TODOS_DATA_DIR: dir, AI_TODOS_PORT: String(port), AI_TODOS_WIKI_ROOT: root, AI_TODOS_VAULT_ROOT: dir };
  const client = new Client({ name: 'wiki-ui-check', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('src/mcp.ts')], env, stderr: 'pipe' });
  t.after(async () => {
    await client.close();
    try { const runtime = JSON.parse(readFileSync(join(dir, 'runtime.json'), 'utf8')); await fetch(`${runtime.origin}/internal/stop`, { method: 'POST', headers: { authorization: `Bearer ${runtime.token}` } }); } catch {}
    await new Promise(resolve => setTimeout(resolve, 100)); rmSync(dir, { recursive: true, force: true });
  });
  await client.connect(transport);

  // 工具仅对应用可见；生成候选不得提前修改 Wiki。
  const tools = await client.listTools(); const tool = tools.tools.find(item => item.name === 'ai_todos_wiki');
  assert.ok(tool, 'embedded Wiki bridge must exist'); assert.deepEqual(tool._meta.ui.visibility, ['app']);
  assert.equal(tool.inputSchema.properties.action.properties?.operation?.type, 'string', 'the transport must not freeze operation names in the MCP host');
  const uiId = randomUUID();
  const call = async (operation, input = {}, uiSessionId = uiId) => client.callTool({ name: 'ai_todos_wiki', arguments: { uiSessionId, action: { operation, ...input } } });
  const initial = await call('list', { sessionId }); assert.ok(!initial.isError); assert.deepEqual(initial.structuredContent.records, []);
  assert.equal(initial.structuredContent.connectionOutdated, false);
  const rt = JSON.parse(readFileSync(join(dir, 'runtime.json'), 'utf8'));
  const legacyList = await fetch(rt.origin + '/internal/wiki', { method: 'POST', headers: { authorization: `Bearer ${rt.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ uiSessionId: uiId, action: { operation: 'list', sessionId } }) });
  assert.equal((await legacyList.json()).connectionOutdated, true);
  const generated = await call('generate', { sessionId, modelSelection: {model:'test-model',reasoningEffort:'low'} }); assert.ok(!generated.isError, generated.content?.[0]?.text);
  let record = generated.structuredContent.record; assert.equal(readFileSync(join(root, 'entities/test.md'), 'utf8'), '# Test\n');
  const edited = await call('update', { id: record.id, revision: record.revision, data: { ...record.data, reviewNote: '我的审核意见', workflow: { ...record.data.workflow, items: record.data.workflow.items.map(item => ({ ...item, decision: 'confirmed' })) } } }); assert.ok(!edited.isError); record = edited.structuredContent.record;
  const compared = await call('compare', { id: record.id, revision: record.revision }); assert.ok(!compared.isError, compared.content?.[0]?.text); record = compared.structuredContent.record;
  const reviewed = await call('preview', { id: record.id, revision: record.revision }); assert.ok(!reviewed.isError); assert.equal(reviewed.structuredContent.preview.files.length, 2);

  // 嵌入式预览票据不能直接作为浏览器批准票据使用。
  const origin = `http://127.0.0.1:${port}`;
  const page = await fetch(origin); const cookie = page.headers.get('set-cookie').split(';')[0];
  const browserState = await (await fetch(`${origin}/api/state`, { headers: { cookie } })).json();
  const response = await fetch(`${origin}/api/wiki/approve`, { method: 'POST', headers: { cookie, origin, 'x-csrf-token': browserState.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ ticket: reviewed.structuredContent.ticket }) });
  assert.notEqual(response.status, 200);
  assert.equal(readFileSync(join(root, 'entities/test.md'), 'utf8'), '# Test\n');

  // MCP 界面不得直接批准写入；最终批准只能从受保护的本地浏览器界面执行。
  const denied = await call('approve', { ticket: reviewed.structuredContent.ticket });
  assert.equal(denied.isError, true);
  assert.equal(readFileSync(join(root, 'entities/test.md'), 'utf8'), '# Test\n');
  const wrongRevision = await call('open_review', { id: record.id, revision: record.revision + 1 });
  assert.equal(wrongRevision.isError, true);
  const opened = await call('open_review', { id: record.id, revision: record.revision });
  assert.ok(!opened.isError, opened.content?.[0]?.text);
  assert.equal(readFileSync(join(dir, 'opened.txt'), 'utf8'), opened.structuredContent.url);
  assert.match(opened.structuredContent.url, new RegExp(`#experience=${sessionId}&record=${record.id}&revision=${record.revision}$`));
  assert.equal(readFileSync(join(root, 'entities/test.md'), 'utf8'), '# Test\n');
});
