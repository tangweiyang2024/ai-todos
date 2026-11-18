# Agent 会话知识沉淀：handoff 与开源实现源码核查

核查日期：2026-11-13。范围：一手提示词、过滤、去重及存储实现；未安装或运行这些项目，下面的机制证据不等于提取效果实测。

问题样本：用户为中文开发者比较三个 STE 技能，以减少 GPT 回复冗长。ai-todos 产生九条候选，多条是“检查 curl 响应正文”“确认默认分支”“安装器报告与实际加载分开”等过程性信息。需要判断如何保留真实选型差异、条件和可用实践，避免工具流水被升格为长期知识。

## 结论

最直接可借鉴的是 **Claudeception 的知识价值门槛 + claude-mem 的观察/进度分层与显式跳过 + Mem0 的具体事实保留和来源归属**。三者均不能直接证明“接入后质量就会好”。

- Claudeception 最贴近“经验提炼”，明确反对为普通操作创建知识，但其门槛主要靠模型遵守技能指令。
- claude-mem 能提供候选观察和阶段上下文，不能把所有 observations 直接当成通过人审的 Wiki 知识。
- Mem0 是较宽的个人/Agent 记忆系统；当前代码倾向完整提取，适合借鉴具体信息和归属保护，不适合照搬其提取数量策略。

## 1. Claudeception：先判断是否值得沉淀

源码快照：[`blader/Claudeception@62dbb91d`](https://github.com/blader/Claudeception/tree/62dbb91d1183a866b5cf40079265c825b2695843)。实际读取 [SKILL.md](https://github.com/blader/Claudeception/blob/62dbb91d1183a866b5cf40079265c825b2695843/SKILL.md)。

### 选择与跳过

[L29–62](https://github.com/blader/Claudeception/blob/62dbb91d1183a866b5cf40079265c825b2695843/SKILL.md#L29-L62) 不把“发生过”当成入库标准：

> Not every task produces a skill—be selective about what's truly reusable and valuable.

四项质量要求原文：

> Reusable / Non-trivial / Specific / Verified

其中 `Non-trivial` 进一步要求知识来自发现，而非仅查文档；`Specific` 要求能说清具体触发条件和解决方法；`Verified` 询问方案是否真正工作过。

[L271–277](https://github.com/blader/Claudeception/blob/62dbb91d1183a866b5cf40079265c825b2695843/SKILL.md#L271-L277) 明列反模式：

> Over-extraction: Not every task deserves a skill. Mundane solutions don't need preservation.
>
> Documentation duplication: Don't recreate official docs; link to them and add what's missing.

因此截图中的“curl 没拿到正文，要检查正文”不能仅凭有原文支持就过关。若没有特殊环境、真实根因、有效修复或新发现，应留在过程摘要，不生成经验卡。

### 产物结构与反思

[L158–195](https://github.com/blader/Claudeception/blob/62dbb91d1183a866b5cf40079265c825b2695843/SKILL.md#L158-L195) 使用 `Problem → Context / Trigger Conditions → Solution → Verification → Example → Notes → References`。相比只有结论/范围/依据，它强迫写出下次怎么识别、怎么做、怎么验证。

[L225–255](https://github.com/blader/Claudeception/blob/62dbb91d1183a866b5cf40079265c825b2695843/SKILL.md#L225-L255) 的回顾模式先识别、排序，再抽取最高价值候选，通常 1–3 项；同时提示相关发现合并，优先更新已有技能。反思问题包括：

> If I faced this exact problem again, what would I wish I knew?

“通常 1–3 项”是避免过度提炼的方向，不应变成必须输出至少一条的配额。

### 去重与持久化

[L66–103](https://github.com/blader/Claudeception/blob/62dbb91d1183a866b5cf40079265c825b2695843/SKILL.md#L66-L103) 先按关键词、错误原文、文件/函数/配置键检索已有技能；同触发同修复则更新，同触发不同根因可新建并互链，部分重叠则补变体。产物保存为项目或用户级 `SKILL.md`，附版本及相关脚本。

边界：这些是技能指令，未在本次发现独立的程序化“non-trivial/verified”语义判定器。不能把 checklist 当作可证明的质量保证。ai-todos 应把筛选决定和原因结构化保存，并用真实样本验收。

## 2. claude-mem：观察不是进度流水，也不是最终 Wiki

源码快照：[`thedotmack/claude-mem@0c488b54`](https://github.com/thedotmack/claude-mem/tree/0c488b54e761d7f6f4091b3a6e1958712f13b19d)。重点读取 `plugin/modes/code.json`、`src/sdk/prompts.ts`、SQLite 去重实现。

### 提取与跳过标准

[code.json L108–115](https://github.com/thedotmack/claude-mem/blob/0c488b54e761d7f6f4091b3a6e1958712f13b19d/plugin/modes/code.json#L108-L115) 要求：

> Record what was LEARNED/BUILT/FIXED/DEPLOYED/CONFIGURED, not what you (the observer) are doing.

`recording_focus` 关注持久技术信号，既包括系统能力变化，也包括日志、队列、数据库和代码路径中的具体调查发现；不是凡工具失败都丢弃。

同文件 `skip_guidance` 明确跳过：

- 同一事实、决策或修复状态的重复确认，包括多轮 review、重试和轮询。
- 空状态检查。
- 无错误的软件包安装。
- 没有后续发现的简单文件列表。
- 没找到结果的文件研究。

跳过时返回结构化 `<skip_summary reason="noise" />`。这比“没有价值就返回空数组”更适合审计：可以区别正常无产出与模型/读取失败。

这些规则确实进入当前提示词构造：[`observerInstructions` L89–103](https://github.com/thedotmack/claude-mem/blob/0c488b54e761d7f6f4091b3a6e1958712f13b19d/src/sdk/prompts.ts#L89-L103) 拼入 `recording_focus` 和 `skip_guidance`，不是只存在于 README。

### 结构与层次

[`observationSkeleton` L43–77](https://github.com/thedotmack/claude-mem/blob/0c488b54e761d7f6f4091b3a6e1958712f13b19d/src/sdk/prompts.ts#L43-L77) 保留 `type/title/subtitle/facts/narrative/concepts/files_read/files_modified`。

`facts` 明确要求可独立理解、保留文件名、函数名和值；`narrative` 说明“做了什么、如何工作、为何重要”；`concepts` 则区分 `how-it-works`、`problem-solution`、`gotcha`、`trade-off` 等。决策类型明确包含 rationale。

[`buildSummaryPrompt` L477–509](https://github.com/thedotmack/claude-mem/blob/0c488b54e761d7f6f4091b3a6e1958712f13b19d/src/sdk/prompts.ts#L477-L509) 单独输出 `request/investigated/learned/completed/next_steps/notes` 的进度摘要，并禁止把 observation 当成 summary。这直接支持 ai-todos 分开保存“会话做了什么”和“可长期复用的经验”。

### 去重、证据与持久化

[`nearDuplicate.ts L1–16, L52–89`](https://github.com/thedotmack/claude-mem/blob/0c488b54e761d7f6f4091b3a6e1958712f13b19d/src/services/dedup/nearDuplicate.ts#L1-L89) 将去重分为标题规范化相同和近似候选；近似使用 IDF cosine 与稀有差异词 veto，不能仅因共享主题词就合并。

[`recordTier1Candidates` L270–315](https://github.com/thedotmack/claude-mem/blob/0c488b54e761d7f6f4091b3a6e1958712f13b19d/src/services/sqlite/dedup-store.ts#L270-L315) 对近期同项目观察生成候选，持久化到 `observation_dedup_candidates`，`status='pending'`，不直接 merge；比较范围受 `maxScan` 限制。应借鉴“近似只建议、最终决策明确”，不能据此宣称查过全库。

[`observations/store.ts`](https://github.com/thedotmack/claude-mem/blob/0c488b54e761d7f6f4091b3a6e1958712f13b19d/src/services/sqlite/observations/store.ts) 还提供会话/标题/叙述内容 hash，以及 type/subtitle/facts/concepts 的 details hash，避免同标题但实质不同的内容被错误视为同一条。

[`codex-observation-batch.ts L1–26`](https://github.com/thedotmack/claude-mem/blob/0c488b54e761d7f6f4091b3a6e1958712f13b19d/src/services/worker/codex-observation-batch.ts#L1-L26) 保留 `pendingId/timestamp/promptNumber/agentId/agentType/toolUseId`，将 provenance 与工具输入输出一起交给观察器。不能只剩一句抽象结论而丢失出处。

边界：近期活动、功能变更及调查观察对会话恢复有价值，却未必都有独立建 Wiki 页的价值。还需要第二层面向长期知识的编辑筛选和人工审核。

## 3. Mem0：具体信息与归属保护值得借鉴，提取策略不能照搬

源码快照：[`mem0ai/mem0@f1791daa`](https://github.com/mem0ai/mem0/tree/f1791daa86d469249c9b002f62644d58a1eb96a0)。实际读取 `mem0/memory/main.py` 和 `mem0/configs/prompts.py`，并核对主分支读取内容与固定 commit 内容相同。

### 先确认真实执行路径

[`main.py L916–969`](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/mem0/memory/main.py#L916-L969) 的当前普通推理路径是 **V3 phased batch pipeline**：读同会话最近消息、检索现有记忆，再使用 `ADDITIVE_EXTRACTION_PROMPT` 一次生成新增记忆。文件中仍保留旧 `DEFAULT_UPDATE_MEMORY_PROMPT` 的 ADD/UPDATE/DELETE/NONE 文本，不代表这就是当前主路径。

### 事实与关系

[`prompts.py L468–516`](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/mem0/configs/prompts.py#L468-L516) 区分新消息、最近抽取、已有记忆；已有记忆仅用于去重和关联，不能被当成本轮新发现。助手推荐应写成推荐，而不是误归属为用户已执行的行为。

[`prompts.py L628–691`](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/mem0/configs/prompts.py#L628-L691) 明确要求：

> NEVER sacrifice a proper noun, title, date, or specific detail to meet a word count.
>
> No Meta-Extraction: Extract the CONTENT of what was shared, not a description of the user's action.

对于本案，不能将三个具名项目的适用差异压成“按语言和用途选型”，否则最需要回忆和检索的信息恰好被删掉。应保留项目、具体行为、适用任务和限制。

### 去重和持久化

[`main.py L1010–1099`](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/mem0/memory/main.py#L1010-L1099) 对新文本做 hash 去重，检查本批和当前检索结果；插入成功才记录成功 ADD 与 history。hash 相同只解决字面重复，不等于语义重复；检索 top 10 也不是全库证明。

### 不应照搬的部分

[`prompts.py L555–582`](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/mem0/configs/prompts.py#L555-L582) 的原则包含：

> When in doubt, extract. A slightly redundant memory is far less costly than a missing one.

它面向广义个人记忆，强调完整召回；对“宁缺毋滥、人工审核后进 Wiki”的目标，应采用更高精度的长期知识标准。其 `ADDITIVE_EXTRACTION_PROMPT` 可供保护具体事实与来源归属参考，不能作为完整 Wiki ingest 或质量保证。

## 对 ai-todos 的落地建议

1. **输入先有任务主线。** 每段都带用户目标与主题范围；工具数据用于支撑主线，不因某个错误更显眼就改写提取主题。
2. **建立两层产物。** 保留较宽的会话/观察记录供恢复；经验候选经过独立编辑筛选，允许零条，保存每条淘汰原因。
3. **按知识类型填具体信息。** 排障：症状、根因、修复、结果；选型：约束、候选、具体差异、决策及取舍；业务规则：条件、判断、例外及证据。避免强迫所有内容套“问题修复”模板。
4. **反事实价值检查。** 问“下次遇到相同问题，这条能让我少查什么、少踩什么坑、做出什么更好的决定？”仅回答“认真检查结果、先确认状态”而无具体内容则淘汰。
5. **原文支持与知识价值分别判断。** 有原文不等于有价值；有价值不等于已运行验证。选型可基于已读规则形成有明确证据范围的比较，不能宣称实测更短。
6. **先合并再排序。** 同一主题的启停、场景、约束可融合成一条可独立使用的经验；过程失败只在确有特殊根因或稳定解法时另立知识。
7. **用真实样本检验，不仅测试流程状态。** 将本次 STE 会话作为负面/正面成对评估：拒绝泛泛 curl 建议，保留三个具名项目的场景差异、模板可能增加长度的取舍、明确未同题实测；禁止凭空补充效果或基准数据。

这套建议只定义提取质量要求，不替代用户对每条经验的确认，也不改变正式 Wiki 的最终批准门禁。

## 4. 本机 handoff：保留工作主线，避免重抄现成产物

实际读取 `/Users/didi/.agents/skills/handoff/SKILL.md`、`claude-handoff/SKILL.md`、`paseo-handoff/SKILL.md`。这里只研究内容规则，没有执行交接或启动对应工具。

`handoff` 要求让一个没有上下文的 Agent 能继续工作，并明确：

> Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

`paseo-handoff` 的模板包括 Task、Context、Relevant files、Current state、What was tried（失败原因）、Decisions（理由）、Acceptance criteria、Constraints。这些字段能避免把“结论”压缩到丢失触发条件和选择理由。

适合借鉴的是“目标—尝试—结果—理由—约束”的工作主线，以及引用原产物。handoff 的待办、分支、下一步是为了接着干活，不应自动升级为长期 Wiki 知识。当前 `handoff` 的上游原始路径未成功定位，结论仅引用本机实际文件，不冒称核查了其上游版本。

## 5. claude-code-memory-setup：日志与长期知识分成两阶段

这也是现有 Wiki 记录过的项目。本次重新读取了当前源码，而不是沿用旧笔记里的效果评价。

固定版本 [`4cd2e6bd`](https://github.com/lucasrosati/claude-code-memory-setup/tree/4cd2e6bd4319fcb2e8d24c2407a864516e7c133a)，重点为 [commands/save.md](https://github.com/lucasrosati/claude-code-memory-setup/blob/4cd2e6bd4319fcb2e8d24c2407a864516e7c133a/commands/save.md#L20-L80)。

- Phase 1 保存会话日志：做过什么、决定、待办、恢复状态、文件变化。
- Phase 2 单独筛选：有替代方案和理由的决策、可复用发现、长期项目事实、约定变化，以及旧知识纠正。
- 明确排除进度、完成事项、没有结论的调查、无泛化价值的实现细节和未变化的已有知识。
- 没有候选时报告 `Memory: nothing to consolidate this session`，不因为日志有内容就创建永久笔记。
- [commands/memorize.md](https://github.com/lucasrosati/claude-code-memory-setup/blob/4cd2e6bd4319fcb2e8d24c2407a864516e7c133a/commands/memorize.md) 仍复用同一门槛；主动要求“记住”也不自动降低标准。

其 [scripts/session_autosave.py](https://github.com/lucasrosati/claude-code-memory-setup/blob/4cd2e6bd4319fcb2e8d24c2407a864516e7c133a/scripts/session_autosave.py) 明确是零模型调用的机械日志安全网，不能拿它代表知识提取质量。其目录规则不能覆盖用户自己的 `raw/` 和 `wiki/chats/code/` 规范。

## 6. Compound Engineering：不记录会损失什么

固定版本 [`41216b7e`](https://github.com/EveryInc/compound-engineering-plugin/tree/41216b7ec84816397f7d3d621bad2373f2fca974)。实际读取 [ce-compound/SKILL.md](https://github.com/EveryInc/compound-engineering-plugin/blob/41216b7ec84816397f7d3d621bad2373f2fca974/skills/ce-compound/SKILL.md#L28-L38)、[research.md](https://github.com/EveryInc/compound-engineering-plugin/blob/41216b7ec84816397f7d3d621bad2373f2fca974/skills/ce-compound/references/research.md)、[form.md](https://github.com/EveryInc/compound-engineering-plugin/blob/41216b7ec84816397f7d3d621bad2373f2fca974/skills/ce-compound/references/form.md)。

其核心反事实问题是：不记录这个教训，一个从当前代码、测试和文档开始的工程师，是否仍会重复犯错或重做大量调查？完成任务、投入时间和改动量都不构成合格理由。不满足时明确不写；已有记录失真时更新旧记录。

`research.md` 还把内容分为两轨，避免全套排障模板套到所有知识：

- Bug：症状、失败尝试、有效方案、原因、预防。
- Knowledge：背景、具体指导、理由、适用条件、示例。

`form.md` 优先选择能够防止重犯的最小形式，例如已有检查或标准已表达知识时，不再抄一份学习记录。对本功能，只借鉴不重复和保存不可从产物直接恢复的理由；不自动替用户改代码标准、测试或其他项目文件。

## 7. 当前实现的确切缺口与本次修改

核对 `src/codex.ts` 的 chunk/merge/verify 提示词，以及 `src/wiki-analysis.ts` 的完整分段和归并路径：旧实现逐段列出经验、分层合并，然后只判断“原文是否支持”。没有独立的整场任务价值筛选；单片段甚至不经过合并。原文支持的 curl 常识因而可以一路成为待审项。

本次增加最终 `curate` 阶段：分段和合并保留具体事实，最后基于整场摘要、候选及有预算限制的原始用户/助手对话节选筛选长期知识。该阶段适用于单段和断点恢复；随后仍执行原文支持检查。策略版本进入快照摘要，避免复用旧提取策略的断点。

质量提示明确列出保留/排除标准，要求保留对象名、机制、参数、选型差异和理由，同主题合并、允许零条；不以关键词黑名单机械删除故障经验。`curate` 仍依赖当前模型的语义判断，不等于程序证明“有干货”。本次回归测试验证阶段不会绕过；真实模型质量对照另见 `docs/wiki-extraction-quality-evaluation.md`。
