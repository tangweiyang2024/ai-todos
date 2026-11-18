import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { dataDir } from './paths.ts';

/** 后台 Agent 的私有工作根目录，也用于识别尚未注册 ID 的初始通知。 */
export const wikiAgentRoot = join(dataDir, 'wiki-agent', 'tasks');

/** 判断线程是否位于后台任务目录；相似路径前缀不能误隐藏用户会话。 */
export function isWikiAgentCwd(cwd?: string) {
  if (!cwd) return false;
  const path = relative(wikiAgentRoot, resolve(cwd));
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

/** 持久化原生执行轨迹，不记录推理正文、凭据或工具原文。 */
export interface WikiAgentState {
  threadId?: string;
  turnId?: string;
  startedAt: string;
  lastActivityAt: string;
  lastEvent: string;
  toolCalls: number;
  compactions: number;
  attempt: number;
}
