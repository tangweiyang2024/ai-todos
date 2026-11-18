import { Store } from '../src/domain.ts';
import { dbPath } from '../src/paths.ts';
let input = '';
for await (const chunk of process.stdin) { input += chunk; if (input.length > 1000000) process.exit(0); }
try {
  const event = JSON.parse(input);
  if (event.agent_id || event.subagent_id) process.exit(0);
  const store = new Store(dbPath);
  try {
    const session = store.observe(event);
    let output = {};
    if (event.hook_event_name === 'SessionStart' || event.hook_event_name === 'UserPromptSubmit') {
      // 沉淀会话只恢复交接说明，不触发业务任务绑定或待办创建。
      const experience = store.experienceChatForThread(session.id);
      if (experience) {
        output = { hookSpecificOutput: { hookEventName: event.hook_event_name, additionalContext: `这是原会话 ${experience.sourceId} 的经验沉淀聊天。任务说明位于 ${experience.contextPath}。仅按用户当前指令推进，在沉淀聊天内确认经验和正式 Wiki 写入；不要新建或绑定业务待办。进度文件：${experience.progressPath}。Stop 仅表示一轮结束。` } };
      } else {
        const task = store.all('task').find(task => task.sessionId === session.id && task.state !== 'cancelled');
        const context = task
          ? `已关联原任务 taskId=${task.id}。使用 ai-todos 技能，先调用 ai_todos_task 读取当前任务与验收标准，复用已有绑定；仅按用户请求推进。`
          : '可用 ai_todos_snapshot 查询后绑定原任务。';
        output = { hookSpecificOutput: { hookEventName: event.hook_event_name, additionalContext: `ai-todos 可信 Codex sessionId=${session.id}。${context}Stop 仅结束一轮，真实交付需证据，人验收需明确确认。` } };
      }
    }
    process.stdout.write(JSON.stringify(output));
  } finally { store.close(); }
} catch (error) { process.stderr.write(`ai-todos hook: ${error instanceof Error ? error.message : String(error)}\n`); }
