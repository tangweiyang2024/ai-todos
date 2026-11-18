import { createServer as httpServer } from 'node:http';
import { createServer as netServer } from 'node:net';
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Store, sessionConfirmSchema } from '../../src/domain.ts';

// 只使用隔离会话，宿主保留旧工具的参数定义来验证兼容性。
const dir = mkdtempSync(join(tmpdir(), 'session-batch-browser-'));
const ids = [randomUUID(), randomUUID(), randomUUID()];
const titles = ['司机体系权益补发（测试）', '支付幂等回归检查（测试）', '卡权益迁移方案（测试）'];
const projects = ['kcard', 'kmall', 'vesta'], states = ['Interrupt', 'Stop', 'UserPromptSubmit'];
const seconds = Math.floor(Date.now() / 1000), at = new Date(seconds * 1000).toISOString();
const store = new Store(join(dir, 'ai-todos.sqlite'));
for (let i = 0; i < ids.length; i++) {
  store.observe({ session_id: ids[i], hook_event_name: states[i], cwd: join(dir, projects[i]), turn_id: `turn-${i}` });
  store.setMeta(`session.summary.${ids[i]}`, { text: '隔离测试会话，不执行真实模型或业务操作。', partial: false, sourceUpdatedAt: at });
}
store.close();
const data = ids.map((id, i) => ({ id, name: titles[i], preview: '隔离测试', cwd: join(dir, projects[i]), ephemeral: false, updatedAt: seconds, status: { type: 'idle' } }));
writeFileSync(join(dir, 'codex'), `#!${process.execPath}\nimport{createInterface}from'node:readline';if(process.argv.includes('proxy'))process.exit(1);createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;let r={};if(m.method==='project/list'||m.method==='mcpServerStatus/list')r={data:[],nextCursor:null};if(m.method==='thread/list')r={data:${JSON.stringify(data)},nextCursor:null};console.log(JSON.stringify({id:m.id,result:r}));});`, { mode: 0o755 });
async function freePort() { const s = netServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p; }
const port = await freePort(), hostPort = await freePort();
const client = new Client({ name: 'batch-browser-fixture', version: '1' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(process.env.AI_TODOS_TEST_MCP || 'plugins/ai-todos/src/mcp.js')], env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, AI_TODOS_DATA_DIR: dir, AI_TODOS_PORT: String(port) }, stderr: 'ignore' }));
const app = (await client.readResource({ uri: 'ui://ai-todos/app.html' })).contents[0].text;
const host = `<!doctype html><meta charset="utf-8"><title>会话完成弹窗 · 隔离验证</title><style>body{margin:0;font:12px system-ui}header{padding:8px 16px;background:#edf6f1;color:#347052}iframe{width:100%;height:calc(100vh - 34px);border:0}</style><header>隔离测试 · 旧 MCP 参数定义 · 真实本地服务与存储</header><iframe src="/app.html"></iframe><script>addEventListener('message',async e=>{const m=e.data;if(!m||m.id===undefined)return;try{let result;if(m.method==='ui/initialize')result={protocolVersion:m.params.protocolVersion,hostInfo:{name:'fixture',version:'1'},hostCapabilities:{serverTools:{}},hostContext:{locale:'zh-CN'}};else if(m.method==='tools/call')result=await fetch('/bridge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(m.params)}).then(r=>r.json());else return;e.source.postMessage({jsonrpc:'2.0',id:m.id,result},'*')}catch(error){e.source.postMessage({jsonrpc:'2.0',id:m.id,error:{code:-32603,message:error.message}},'*')}});</script>`;
const server = httpServer(async (req, res) => {
  try {
    if (req.url === '/bridge') {
      let text = ''; for await (const chunk of req) text += chunk;
      const call = JSON.parse(text);
      appendFileSync(join(dir, 'bridge.jsonl'), JSON.stringify({ name: call.name, args: call.arguments }) + '\n');
      if (call.name === 'ai_todos_confirm_session' && !sessionConfirmSchema.omit({ archive: true }).safeParse(call.arguments).success) throw Error('Unrecognized key: "archive"');
      const confirmation = call.arguments?.action?.confirmation;
      if (call.name === 'ai_todos_wiki' && confirmation?.id === ids[0] && existsSync(join(dir, 'stale-once'))) {
        unlinkSync(join(dir, 'stale-once'));
        const changed = new Store(join(dir, 'ai-todos.sqlite'));
        changed.observe({ session_id: ids[0], hook_event_name: 'PreToolUse', cwd: join(dir, projects[0]), turn_id: 'updated-turn' });
        changed.observe({ session_id: ids[0], hook_event_name: 'Interrupt', cwd: join(dir, projects[0]), turn_id: 'updated-turn' });
        changed.close();
      }
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(await client.callTool(call))); return;
    }
    res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(req.url.startsWith('/app.html') ? app : host);
  } catch (error) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ isError: true, content: [{ type: 'text', text: error.message }] })); }
});
await new Promise(r => server.listen(hostPort, '127.0.0.1', r));
const info = { dir, ids, host: `http://127.0.0.1:${hostPort}`, local: `http://127.0.0.1:${port}`, pid: process.pid };
writeFileSync('/private/tmp/session-batch-browser.json', JSON.stringify(info)); console.log(info);
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  server.close();
  const rt = JSON.parse(readFileSync(join(dir, 'runtime.json'), 'utf8'));
  await fetch(rt.origin + '/internal/stop', { method: 'POST', headers: { authorization: 'Bearer ' + rt.token } });
  await client.close();
}
process.on('SIGTERM', stop); process.on('SIGINT', stop);
