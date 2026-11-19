import { spawn } from 'node:child_process';
import { writeFileSync, renameSync } from 'node:fs';
import type { Store } from './domain.ts';
import type { ExperienceChat } from './experience-chat.ts';
import type { WikiModelSelection } from './wiki-models.ts';

export interface InitialExtraction {
  status: 'dispatching' | 'running' | 'completed' | 'failed';
  modelSelection: WikiModelSelection; updatedAt: string;
}
interface RunOptions { signal?: AbortSignal; disabledMcpServers?: string[] }

/** 用原生 CLI 执行首轮只读提取；派发结果不确定时拒绝重发，保留原会话供人工核对。 */
export async function runExperienceExtraction(store: Store, chat: ExperienceChat, selection: WikiModelSelection, options: RunOptions) {
  // 首轮派发先落盘；失败和中断也不能被重试隐式转换成另一条用户消息。
  const key = `experience.initial.${chat.threadId}`;
  const previous = store.meta<InitialExtraction | null>(key, null);
  if (previous?.status === 'completed') return;
  if (previous) throw new Error('首轮已提交或结果待核对，请进入原会话查看，不会重复发送。');
  if (options.disabledMcpServers?.some(name => !/^[A-Za-z0-9_-]+$/.test(name))) throw new Error('MCP 名称不支持安全的 CLI 配置覆盖，未提交首轮提取。');
  options.signal?.throwIfAborted();
  const update = (status: InitialExtraction['status']) => store.setMeta(key, { status, modelSelection: selection, updatedAt: store.at() });
  update('dispatching');

  // 首轮只使用原生只读工具；禁用外部 MCP、应用、插件和 hook，避免在人工审核前产生写入。
  const args = ['exec', '--sandbox', 'read-only', '--cd', chat.vaultRoot,
    'resume', '--json', '--skip-git-repo-check', '--model', selection.model,
    ...['hooks', 'apps', 'plugins', 'multi_agent', 'multi_agent_v2', 'computer_use', 'browser_use', 'image_generation'].flatMap(name => ['--disable', name]),
    ...(selection.reasoningEffort ? ['-c', `model_reasoning_effort=${JSON.stringify(selection.reasoningEffort)}`] : []),
    ...(options.disabledMcpServers ?? []).flatMap(name => ['-c', `mcp_servers.${name}.enabled=false`]),
    chat.threadId, '-'];
  const prompt = `请读取并遵循 ${JSON.stringify(chat.contextPath)}，执行首轮经验提取。先核对 Wiki 当前维护规范，再分批读取完整原文，说明会话做了什么，逐项给出有依据的经验和未验证事项。完成后在本会话展示结果并等待我审核。此轮不得写入任何文件、正式 Wiki、raw、索引、日志、manifest 或人读文档，也不得调用外部写入工具；进度由 ai-todos 记录，无需更新进度文件。不要因只读限制停在请求写入权限。后续用户审核批准后才在普通会话继续 ingest。`;
  const child = spawn('codex', args, { cwd: chat.vaultRoot, stdio: ['pipe', 'pipe', 'pipe'] });

  // 等待真实完成事件和进程退出；只投影生命周期，不接管原生工具循环或存储完整模型输出。
  try {
    await new Promise<void>((resolve, reject) => {
      let buffer = '', stderr = '', matched = false, started = false, completed = false, answer = false, failure: Error | undefined;
      let force: ReturnType<typeof setTimeout> | undefined;
      const terminate = () => { force ??= setTimeout(() => child.kill('SIGKILL'), 2000); force.unref(); };
      const stop = (message: string) => { failure ??= new Error(message); child.kill('SIGTERM'); terminate(); };
      const abort = () => stop('后台提取已中断，请进入原会话核对进度。');
      const deadline = setTimeout(() => stop('后台提取超过 30 分钟，请进入原会话核对，不会重复发送。'), 30 * 60 * 1000);
      child.once('exit', () => { if (force) clearTimeout(force); });
      // 取消后仍等待进程关闭，避免数据库已关闭而回调继续写入。
      child.once('error', () => { failure ??= new Error('无法启动 Codex 后台提取，请检查 CLI 是否可用。'); });
      options.signal?.addEventListener('abort', abort, { once: true });
      child.stdin.on('error', () => stop('Codex 提取输入通道已关闭，请进入原会话核对。'));
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8192); });
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        buffer += chunk;
        if (buffer.length > 2_000_000) { stop('Codex 单条事件过大，请进入原会话核对。'); terminate(); return; }
        let end: number;
        while ((end = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          try {
            const event = JSON.parse(line);
            if (event.type === 'thread.started') {
              if (event.thread_id !== chat.threadId) { stop('Codex 返回的会话不匹配，已停止。'); terminate(); return; }
              matched = true;
            }
            if (event.type === 'turn.started' && matched) { started = true; update('running'); store.setMeta(`experience.started.${chat.threadId}`, true); }
            if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text?.trim()) answer = true;
            if (event.type === 'turn.completed') completed = matched && started;
            if (event.type === 'turn.failed') { stop('Codex 首轮提取失败，请进入原会话查看具体原因。'); terminate(); }
          } catch { stop('Codex 返回了无法识别的事件，请进入原会话核对。'); terminate(); }
        }
      });
      child.once('close', code => {
        clearTimeout(deadline); if (force) clearTimeout(force);
        options.signal?.removeEventListener('abort', abort);
        if (failure) reject(failure);
        else if (code !== 0 || !completed || !answer) {
          // 只输出可定位的错误类别，避免把 CLI 日志中的个人路径、URL 或凭据回显到卡片。
          const reason = /config\.toml|invalid transport/.test(stderr) ? 'Codex 配置加载失败' : /no rollout found/.test(stderr) ? 'Codex 找不到已准备的会话记录' : /Unknown feature/.test(stderr) ? 'Codex CLI 不支持当前功能配置' : 'Codex 未返回完整的提取结果';
          reject(new Error(`${reason}，请进入原会话核对。`));
        }
        else resolve();
      });
      if (options.signal?.aborted) { abort(); terminate(); }
      else child.stdin.end(prompt);
      options.signal?.addEventListener('abort', terminate, { once: true });
      child.once('close', () => options.signal?.removeEventListener('abort', terminate));
    });
    options.signal?.throwIfAborted();

    // 完成只代表候选已在原生会话展示，不代表入库；进度写入采用原子替换。
    const temporary = `${chat.progressPath}.initial.tmp`;
    writeFileSync(temporary, JSON.stringify({ version: 1, sourceId: chat.sourceId, threadId: chat.threadId, stage: 'reviewing', summary: '首轮提取已结束，请进入会话审核结果；尚未写入 Wiki。', updatedAt: store.at() }), { mode: 0o600 });
    renameSync(temporary, chat.progressPath);
    update('completed');
  } catch (error) { update('failed'); throw error; }
}
