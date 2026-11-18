# 经验沉淀后台准备与就绪提醒

**Goal:** 首次点击立即返回后台任务，完成后提醒，用户主动进入；保留原有快速继续、人工审核和 Wiki 写入边界。

**Architecture:** 独立 preparation manager 管理内存运行句柄和 SQLite meta 中的状态。准备与打开分离；卡片从现有 snapshot 轮询读取准备状态。就绪提醒的未读标记持久化，用户点进入或稍后才确认处理。保留原 open_capture 接口兼容。

**Tech Stack:** TypeScript、SQLite、React、Radix Dialog、现有 Codex metadata RPC。

## 已确认交互与约束

- 用户选择“卡片已就绪，方便时点击进入”，并要求弹窗提醒。提醒仅在 ai-todos 中展示，不自动切换窗口。
- preparing 显示读取/连接/创建/交接阶段并禁用重复操作；其他卡片不被长期锁住。
- 完成显示就绪弹窗，提供进入/稍后；关闭面板后准备继续，重新打开仍可看到未读提醒。
- 同源并发只运行一次。失败持久化；服务重启将未完成任务标为中断，不伪报成功。已取得的线程 checkpoint 在显式重试时复用。
- 创建结果不确定且没有线程 ID 时不盲目新建。重试不能重复注入已存在的交接数据。
- 不调用 turn/start，不写正式 Wiki，不生成额外人读文档。不修改无关会话分组、自动概要等未提交改动。

## Task 1: 后台准备和持久化

Files: src/experience-preparation.ts、src/codex.ts、src/domain.ts、src/types.ts、test/experience-preparation.test.js。

- [x] 测试先行：用可控 Promise 挂起真实准备边界，断言 start 已返回、任务唯一且 preparing 可被另一 Store 读取；完成后 ready/unread，失败后 error。
- [x] 新建 manager 的 start/acknowledge/stop 方法，投影公开状态，隐藏私有 checkpoint 路径。构造时恢复中断。
- [x] 拆出 prepareExperienceChat，openExperienceChat 继续调用原快速跳转；阶段回调记录线程 checkpoint 和阶段耗时。
- [x] checkpoint 重试查询已有条目，存在交接数据则不重复注入；没有确认创建结果时不自动新建。
- [x] 回归覆盖重启、失败重试、旧确认不能确认新任务、准备期间无打开器和模型调用。

## Task 2: 接口、卡片和就绪弹窗

Files: src/server.ts、src/wiki-action-schema.ts、ui/components/ExperienceProgress.tsx、ui/components/ExperienceCaptureButton.tsx、ui/components/ExperienceReadyNotice.tsx、ui/components/SessionList.tsx、ui/components/ExecutionView.tsx、ui/app.tsx、src/locales/{zh-CN,en}.ts、ui/workspace.css。

- [x] prepare_capture 启动后立即响应；ack_capture 仅确认指定 jobId 的就绪提醒。两个操作均复用浏览器 CSRF 和 MCP UI 信封。
- [x] snapshot 返回卡片准备状态； preparing/failed/ready 按钮独立展示和禁用，不阻塞整个工作台。
- [x] 新入口首次准备不打开 Codex；ready 用户点击时再 open_capture。成功进入或稍后后确认提醒；打开失败保留可重试提醒。
- [x] 就绪弹窗按完成时间排队，不遮盖现有编辑/审核弹窗；面板重开显示未读提醒。
- [x] 准备期间轮询状态不先等待慢宿主同步；服务关闭先中止并等待后台任务落盘。

## Task 3: 验证和本机替换

- [x] 慢 CLI 集成测试：明确挂住原文 RPC，证明浏览器/MCP 启动接口已返回；释放后才 ready，重复请求只创建一次。
- [x] 类型检查、相关测试、全量回归、插件构建和打包入口测试。
- [x] ego-browser 实际点击，验证立即反馈、其他操作可用、就绪弹窗、稍后/再次进入、失败与重开恢复。只用隔离数据，不运行真实模型或写 Wiki。
- [x] 审查本轮修改，备份插件及在线 SQLite 后替换本机；核对服务身份、产物哈希、数据数量和 integrity_check。保留既有工作树，不提交或推送。
