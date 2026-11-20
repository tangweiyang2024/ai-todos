import { fileURLToPath } from 'node:url';
import { readFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { dataDir, runtimePath, origin } from './paths.ts';
import pkg from '../package.json' with { type: 'json' };
import type { ServiceRuntime } from './types.ts';
import { i18n } from './i18n.ts';
let runtime: ServiceRuntime;
async function connect() {
  try {
    // 使用运行时令牌确认服务身份，不在输出中暴露凭据。
    const candidate = JSON.parse(readFileSync(runtimePath, 'utf8'));
    if (candidate.origin !== origin) throw new Error('Port does not match');
    const response = await fetch(`${origin}/internal/ping`, { headers: { authorization: `Bearer ${candidate.token}` }, signal: AbortSignal.timeout(600) });
    if (response.ok) {
      const capabilities = await response.json();
      const health = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(600) }).then(response => response.json());
      // 只升级能力不足的服务，不能让旧客户端停止能力更高的新服务。
      const comparison = typeof health.version === 'string' ? pkg.version.localeCompare(health.version, undefined, { numeric: true }) : -1;
      const revision = typeof capabilities.wikiUiRevision === 'number' ? capabilities.wikiUiRevision : 0;
      if (health.name === 'ai-todos' && (comparison > 0 || (comparison === 0 && revision < 10))) {
        const stopped = await fetch(`${origin}/internal/stop`, { method: 'POST', headers: { authorization: `Bearer ${candidate.token}` }, signal: AbortSignal.timeout(1000) });
        if (!stopped.ok) throw new Error('旧服务停止失败');
        return false;
      }
      runtime = candidate; return true;
    }
  } catch {}
  return false;
}
export async function ensureService() {
  if (await connect()) return runtime;
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const log = openSync(join(dataDir, 'service.log'), 'a', 0o600);
  const child = spawn(process.execPath, [fileURLToPath(new URL(import.meta.url.endsWith('.ts') ? '../src/server.ts' : '../src/server.js', import.meta.url))], { detached: true, stdio: ['ignore', log, log], env: process.env });
  child.on('error', () => {}); child.unref(); closeSync(log);
  for (let n = 0; n < 40; n++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (await connect()) return runtime;
  }
  const params = { path: join(dataDir, 'service.log'), origin };
  throw Object.assign(new Error(i18n.t('errors.serviceStart', { ...params, lng: 'zh-CN' })), { code: 'errors.serviceStart', params });
}
/** 调用本地服务；服务凭据过期时重新连接一次。 */
export async function service<T = Record<string, unknown>>(path: string, value?: unknown): Promise<T> {
  // 长时间的知识提取与普通请求使用不同的超时。
  if (!runtime) await ensureService();
  const request = () => fetch(`${runtime.origin}/internal/${path}`, {
    method: value === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${runtime.token}`, 'content-type': 'application/json' },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }), signal: AbortSignal.timeout(path === 'wiki' ? 1860000 : path === 'codex' ? 130000 : 10000),
  });
  // 只在凭据明确被拒绝时重试，避免重复提交已执行的操作。
  let response = await request();
  if (response.status === 401) { await ensureService(); response = await request(); }
  const result = await response.json(); if (!response.ok) throw Object.assign(new Error(result.error), result); return result;
}
