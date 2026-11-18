# 原生 Codex 经验沉淀执行器实施计划

> **For agentic workers:** 使用 executing-plans 在本会话执行。用户已批准现有研究方案并要求开始重构；保留工作区既有修改，不创建提交或额外审核门禁。

**Goal:** 用持久的 Codex 原生工具循环替换经验提取的模型分段、合并与筛选编排，保留人工审核和精确写入保护。

**Architecture:** ai-todos 保存不可变私有来源快照，向独立 Codex 线程提供有界的只读动态工具。Codex 自主读取、整理并输出结构化结果；本地任务持久化线程、进度和恢复信息。Wiki 对照复用受保护的现有提案构造器，但使用独立原生执行器并保持模型固定。

**Tech Stack:** Node 24、TypeScript、SQLite、Codex app-server 0.167.0、React。

## Global Constraints

- 原会话不追加指令；正式 Wiki 仅最终人工批准后可写。
- 后台会话从普通会话列表/看板过滤，并阻止再次提取。
- 禁用 shell、写文件、网络、MCP、插件和 hooks；只暴露本任务快照的只读工具。
- 保留模型选择、候选历史、逐项确认/排除/意见、Markdown 和 diff。
- 不复用旧执行器的模型分段断点；同模型同快照恢复原生线程。
- 只读数据分页是资料访问，不再按页启动模型或自行合并总结。
- 任务总预算与无活动超时分离；错误记录阶段、线程、最近活动。

## Task 1: 来源快照与后台身份

Files: src/wiki-agent-source.ts、src/wiki-agent-state.ts、src/domain.ts、test/wiki-agent-source.test.js、test/wiki-agent-state.test.js。

- [x] 先写测试：完整重组超长来源、篡改快照拒绝、未知页拒绝、覆盖不足拒绝；后台线程重启后仍隐藏。
- [x] 实现按摘要存储的私有快照和来源工具；所有条目保留 turn/item/字段位置。
- [x] 持久化线程关联和任务执行版本，旧任务不混用。
- [x] 运行上述测试并核对普通会话保持可见。

## Task 2: 专用原生执行器

Files: src/wiki-agent.ts、test/wiki-agent.test.js。

- [x] 先写协议测试：工具循环、最终 JSON、取消 interrupt、活动超时、失败、模型不匹配、线程恢复。
- [x] 实现独立 app-server RPC、动态只读工具、事件进度和有界错误诊断。
- [x] 真实 installed Codex 验证动态工具、thread/resume、compact、interrupt；不写个人 Wiki。
- [x] 明确成功状态和完整覆盖检查后才保存候选。

## Task 3: 替换正式入口与进度

Files: src/codex.ts、src/server.ts、src/wiki-experience.ts、ui/components/WikiExperience.tsx、src/locales/*.ts。

- [x] 原生提取替换 runChunkAnalysis 调用；旧文件仅供历史兼容和回归，不再用于入口。
- [x] 对照使用原生执行器，继续由既有构造器校验文件基线和双份笔记。
- [x] 持久化任务线程、最近活动、读取覆盖、执行阶段；展示可折叠任务详情。
- [x] 更新端到端替身覆盖原生工具访问，保留人工审核/写入门禁测试。

## Task 4: 验证和安装

- [x] Node 24 下 typecheck、完整 check、打包入口集成检查（最终结果记录于 wiki-native-agent.md）。
- [x] STE 和支付问题真实会话隔离验证，检查经验质量、出处、后台过滤和个人 Wiki 零写入。
- [x] 浏览器验证手动启动、进度、取消/恢复、逐项确认和 diff；正式 Wiki 不批准。
- [x] 确认无生产分析任务，SQLite backup/integrity_check 后逐文件更新插件缓存并重启验证。
- [x] 文档记录实际通过项目和限制，不把原生压缩宣传成无损。
