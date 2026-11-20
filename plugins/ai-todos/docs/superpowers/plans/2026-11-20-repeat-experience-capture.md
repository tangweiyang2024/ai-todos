# 多次经验沉淀实施计划

目标是让同一业务会话能独立发起、查看和恢复多次沉淀。继续使用现有 SQLite、Codex 原生提取和 React 卡片组件。每个显式提交有独立 recordId，来源会话和沉淀聊天各自保留原标识。

- [x] 存储和准备。在 src/domain.ts、src/experience-preparation.ts、src/types.ts 支持稳定记录、兼容单条旧数据和按次恢复。用 test/experience-preparation.test.js 验证同源多次、双击、旧记录和重试。
- [x] 提示词和 Codex 入口。在 src/experience-chat.ts、src/codex.ts 固定每次快照、可选主题和上一份快照位置，使用经确认的提取标准；查看按记录跳转。运行提示词契约和不可变来源测试。
- [x] 界面。列表和看板复用发起及历史入口，分别处理零条、一条和多条记录。新建表单的一个提交使用相同的请求标识，历史跳转和提醒指定记录。
- [x] 集成。在 src/server.ts 和 src/wiki-action-schema.ts 保留原调用，扩展 prepare_capture、open_capture、ack_capture，并允许按标识重试。使用隔离的后端和浏览器测试创建、重开与查看，再运行全量检查、类型检查和构建。
