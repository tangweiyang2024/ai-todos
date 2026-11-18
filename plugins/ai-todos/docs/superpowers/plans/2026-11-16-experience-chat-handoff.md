# 经验沉淀移交 Codex 会话实施计划

> 使用 writing-plans 和 executing-plans 落实用户已确认的简化方案。用户要求自主开发验证，现有分支已有改动，保留并在原分支继续，不另加审批。

**Goal:** 点击原会话的“沉淀经验”直接打开独立 Codex 会话；ai-todos 仅准备资料/提示词、复用会话和显示进度。

**Architecture:** 新入口不调用内置提炼或 ingest planner。通过已有 Codex 协议创建持久会话、预填指向本地 task.md 的提示词；不自动发送轮次。任务说明包含可信的原文快照、Wiki 路径、本地 ingest 技能及批准约束。复用现有 hook/宿主观察，配合由沉淀会话自行更新的轻量进度文件，把状态显示在原卡片。

**Tech Stack:** Node 24、SQLite meta、Codex app-server、React。

## 约束

- 正式 Wiki 的人工确认移到沉淀会话，由提示词要求先展示方案/diff、等待明确批准；不声称普通会话具有旧网页票据的强制写入门禁。
- 点击入口只创建/打开和预填，不开始模型推理，不自动写 Wiki。
- 一个原会话复用一份沉淀会话；并发点击去重，重启后继续复用。
- 原会话与沉淀会话分别记录；后者不再次进入普通看板或成为递归来源。
- Stop/SessionEnd 不代表已入库。只有会话明确回报的完成状态才显示“会话报告已入库”。
- 旧候选、审核意见和历史入口保留，不主动重跑旧任务。

## Task 1: 上下文与进度

Files: src/experience-chat.ts、test/experience-chat.test.js。

- [x] 写失败测试：原文快照完整且不可变；task.md 包含原文引用、完整 ingest、人工批准、进度文件；原文不能作为执行指令。
- [x] 实现私有资料和提示词准备，进度严格校验身份/时间/大小/状态，拒绝符号链接及无效状态。
- [x] 写失败测试并实现运行状态投影：Stop 仅本轮结束；后续活动清除旧完成投影；明确回报与原生状态分别呈现。

## Task 2: 创建与跳转

Files: src/codex.ts、src/domain.ts、src/types.ts、src/wiki-action-schema.ts、src/server.ts、test/experience-chat-open.test.js。

- [x] 复用可信会话读取和原生会话创建，增加应用入口 wiki/open_capture。
- [x] 持久 source→capture 关联；并发去重、失败归档、后续跳转不重复注入提示词。
- [x] 源卡片投影沉淀进度，后台宿主同步继续采集状态但不导入普通列表。
- [x] 测试打开 URL、提示词、重启/并发复用、不调用 turn/start、不改原聊天、不写 Wiki、运行/等待/Stop 状态。

## Task 3: 卡片与历史

Files: ui/app.tsx、ui/components/ExperienceProgress.tsx、SessionList.tsx、ExecutionView.tsx、src/locales/*.ts、ui/workspace.css。

- [x] 卡片按钮直接打开沉淀聊天；已有关联时显示“继续沉淀”。
- [x] 列表/看板/任务卡展示简洁进度、阶段和最近活动；保留历史候选的既有链接。
- [x] 浏览器验证新入口不打开旧审核弹窗，进度跟随状态变化，跳转请求携带正确提示词。

## Task 4: 验证安装

- [x] typecheck、回归与打包入口测试、独立审查。
- [x] 真实 Codex 只验证创建/复用/提示词，不发送实际 ingest，不写正式 Wiki。
- [x] 备份数据与插件后替换；确认实际产物、已有候选与新入口。
- [x] 文档清楚说明插件职责、原生会话确认和进度可信边界。
