import type { WikiAgentState } from './wiki-agent-state.ts';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync, renameSync, unlinkSync, statSync, linkSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { AnalysisResult } from './wiki-analysis.ts';
import { sameWikiModel, wikiModelSelectionSchema } from './wiki-models.ts';
import type { WikiModelSelection } from './wiki-models.ts';

const changeSchema = z.object({
  path: z.string().min(1).max(1000),
  content: z.string().max(500000),
  baseHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();
const dataSchema = z.object({
  summary: z.string().max(20000), scope: z.string().max(20000),
  evidence: z.string().max(20000), unverified: z.string().max(20000),
  relation: z.string().max(20000), reviewNote: z.string().max(20000),
  changes: z.array(changeSchema).max(20),
  sources: z.array(z.object({ path: z.string().min(1).max(1000), hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).max(20).default([]),
  workflow: z.object({
    sessionSummary: z.string().max(20000),
    items: z.array(z.object({ title: z.string().min(1).max(1000), conclusion: z.string().max(20000), scope: z.string().max(20000), evidence: z.string().max(20000), unverified: z.string().max(20000), decision: z.enum(['pending', 'confirmed', 'excluded']), note: z.string().max(20000) }).strict()).max(30),
    stage: z.enum(['review', 'compared']),
  }).strict().optional(),
}).strict();
export type ExperienceData = z.infer<typeof dataSchema>;
export interface ExperienceRecord {
  id: string; sessionId: string; revision: number;
  status: 'pending' | 'rejected' | 'written'; createdAt: string; updatedAt: string; data: ExperienceData;
  modelSelection?: WikiModelSelection; comparisonModelSelection?: WikiModelSelection;
  analysisJobId?: string; agent?: WikiAgentState; comparisonAgent?: WikiAgentState;
}
export interface WikiPreview {
  id: string; revision: number;
  files: { path: string; before: string | null; after: string; hash: string }[];
  sources: { path: string; hash: string }[];
}
export interface WikiAnalysisJob { id: string; sessionId: string; status: 'running' | 'failed' | 'completed'; phase: 'reading' | 'agent' | 'chunks' | 'merge' | 'curate' | 'verify' | 'completed'; snapshotHash: string | null; total: number; completed: number; error: string; recordId: string | null; modelSelection?: WikiModelSelection; engine?: string; agent?: WikiAgentState }
const hash = (content: string | null) => createHash('sha256').update(content === null ? 'missing' : `file:${content}`).digest('hex');

/** 管理本地候选和审核记录；只有 approve 会修改 Wiki，异常时保留恢复日志。 */
export class WikiExperience {
  db: DatabaseSync;
  root: string;
  vaultRoot?: string;

  constructor(dbPath: string, root: string, vaultRoot?: string) {
    this.root = resolve(root);
    this.vaultRoot = vaultRoot ? resolve(vaultRoot) : undefined;
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS wiki_experiences (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS wiki_experiences_session ON wiki_experiences(session_id);
      CREATE TABLE IF NOT EXISTS wiki_experience_events (id TEXT PRIMARY KEY, experience_id TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS wiki_experience_journal (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS wiki_analysis_jobs (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS wiki_analysis_jobs_session ON wiki_analysis_jobs(session_id);
      CREATE TABLE IF NOT EXISTS wiki_analysis_chunks (job_id TEXT NOT NULL, chunk_index INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(job_id, chunk_index));
      CREATE TABLE IF NOT EXISTS wiki_model_preference (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS wiki_experience_one_writer ON wiki_experience_journal ((1));`);
  }

  /** 关闭本模块持有的 SQLite 连接。 */
  close() { this.db.close(); }

  /** 返回用户最近一次启动分析时的选择，供本地浏览器和嵌入式界面共用。 */
  modelPreference(): WikiModelSelection | null {
    const row = this.db.prepare('SELECT body FROM wiki_model_preference WHERE id=1').get();
    return row ? wikiModelSelectionSchema.parse(JSON.parse(row.body as string)) : null;
  }

  /** 获取会话最近一次分析任务；不包含会话原文。 */
  latestAnalysis(sessionId: string): WikiAnalysisJob | null {
    const row = this.db.prepare('SELECT body FROM wiki_analysis_jobs WHERE session_id=? ORDER BY rowid DESC LIMIT 1').get(sessionId);
    return row ? JSON.parse(row.body as string) : null;
  }
  private analysis(id: string): WikiAnalysisJob {
    const row = this.db.prepare('SELECT body FROM wiki_analysis_jobs WHERE id=?').get(id);
    if (!row) throw new Error('分析任务不存在');
    return JSON.parse(row.body as string);
  }
  private saveAnalysis(job: WikiAnalysisJob) {
    this.db.prepare('INSERT INTO wiki_analysis_jobs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(job.id, job.sessionId, JSON.stringify(job));
    return job;
  }
  /** 创建或恢复未完成任务；已完成的分析使用新任务。 */
  startAnalysis(sessionId: string, modelSelection?: WikiModelSelection, engine?: string): WikiAnalysisJob {
    // 只复用同一模型配置的未完成任务，换模型时保留旧任务并建立独立断点。
    z.string().uuid().parse(sessionId);
    if (modelSelection) modelSelection = wikiModelSelectionSchema.parse(modelSelection);
    const old = this.latestAnalysis(sessionId);
    const job: WikiAnalysisJob = old && old.engine === engine && old.status !== 'completed' && sameWikiModel(old.modelSelection, modelSelection) ? { ...old, status: 'running', phase: 'reading', error: '' } : { id: randomUUID(), sessionId, status: 'running', phase: 'reading', snapshotHash: null, total: 0, completed: 0, error: '', recordId: null, ...(engine ? { engine } : {}), ...(modelSelection ? { modelSelection } : {}) };

    // 记住用户实际启动的选择，不改动 Codex 全局配置或旧候选的模型信息。
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (modelSelection) this.db.prepare('INSERT INTO wiki_model_preference VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(JSON.stringify(modelSelection));
      this.saveAnalysis(job);
      this.db.exec('COMMIT');
      return job;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  /** 快照或分段数量改变时丢弃旧断点，避免混用不同会话内容。 */
  beginAnalysis(id: string, snapshotHash: string, total: number) {
    const job = this.analysis(id);
    if (job.snapshotHash !== snapshotHash || job.total !== total) {
      this.db.prepare('DELETE FROM wiki_analysis_chunks WHERE job_id=?').run(id);
      job.completed = 0;
    }
    job.snapshotHash = snapshotHash; job.total = total; job.phase = 'chunks';
    return this.saveAnalysis(job);
  }
  /** 绑定原生任务快照；来源变化时清除线程恢复信息，保留旧线程的后台身份。 */
  beginNativeAnalysis(id: string, snapshotHash: string, total: number): WikiAgentState | undefined {
    const job = this.analysis(id);
    if (job.snapshotHash !== snapshotHash) delete job.agent;
    job.snapshotHash = snapshotHash;
    job.total = total;
    job.completed = 0;
    job.phase = 'agent';
    this.saveAnalysis(job);
    return job.agent;
  }
  /** 读取可复用的分段结果；不保存原始会话正文。 */
  analysisChunk(id: string, index: number): AnalysisResult | undefined {
    const row = this.db.prepare('SELECT body FROM wiki_analysis_chunks WHERE job_id=? AND chunk_index=?').get(id, index);
    return row ? JSON.parse(row.body as string) : undefined;
  }
  /** 持久化分段结果，支持服务重启后继续。 */
  saveAnalysisChunk(id: string, index: number, result: AnalysisResult) {
    this.db.prepare('INSERT INTO wiki_analysis_chunks VALUES(?,?,?) ON CONFLICT(job_id,chunk_index) DO UPDATE SET body=excluded.body').run(id, index, JSON.stringify(result));
  }
  /** 记录可见进度或失败原因，失败段不能视为已完成。 */
  updateAnalysis(id: string, patch: Partial<Pick<WikiAnalysisJob, 'status' | 'phase' | 'completed' | 'total' | 'error' | 'agent'>>) {
    return this.saveAnalysis({ ...this.analysis(id), ...patch });
  }
  /** 原子保存最终候选和任务状态，避免重试生成重复记录。 */
  completeAnalysis(id: string, raw: unknown): ExperienceRecord {
    const job = this.analysis(id);
    if (job.status === 'completed' && job.recordId) return this.get(job.recordId);
    const now = new Date().toISOString();
    const record: ExperienceRecord = { id: randomUUID(), sessionId: job.sessionId, revision: 1, status: 'pending', createdAt: now, updatedAt: now, data: this.parse(raw), analysisJobId: job.id, ...(job.agent ? { agent: job.agent } : {}), ...(job.modelSelection ? { modelSelection: job.modelSelection } : {}) };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO wiki_experiences VALUES(?,?,?)').run(record.id, record.sessionId, JSON.stringify(record));
      this.db.prepare('INSERT INTO wiki_experience_events VALUES(?,?,?)').run(randomUUID(), record.id, JSON.stringify({ event: 'created', at: now, revision: record.revision, data: record.data }));
      this.saveAnalysis({ ...job, status: 'completed', phase: 'completed', recordId: record.id, error: '' });
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return record;
  }

  private parse(raw: unknown) {
    // 校验候选结构和相对路径，禁止重复目标与目录穿越。
    const data = dataSchema.parse(raw);
    const seen = new Set<string>();
    for (const item of data.changes) {
      const invalid = isAbsolute(item.path) || item.path.includes('\\') ||
        item.path.split('/').some(part => !part || part === '.' || part === '..') ||
        !item.path.endsWith('.md') || seen.has(item.path);
      if (invalid || (item.path.startsWith('@vault/') && !this.allowedVaultPath(item.path))) throw new Error('无效或重复的 Wiki 路径');
      seen.add(item.path);
    }
    for (const source of data.sources) {
      if (isAbsolute(source.path) || source.path.includes('\\') || source.path.split('/').some(part => !part || part === '.' || part === '..') || !source.path.endsWith('.md') || (source.path.startsWith('@vault/') && !this.allowedVaultPath(source.path))) throw new Error('无效的来源路径');
    }
    return data;
  }

  private allowedVaultPath(path: string) {
    const roots = ['@vault/20领域/tools/', '@vault/10项目/', '@vault/20领域/50-业务域/客服知识库/'];
    return !!this.vaultRoot && roots.some(root => path.startsWith(root));
  }

  private file(path: string) {
    // 只允许 Wiki 和指定的 Vault 分类目录，并拒绝任何已有的符号链接。
    const isVault = path.startsWith('@vault/');
    if (isVault && !this.allowedVaultPath(path)) throw new Error('无效的人读版路径');
    const base = isVault ? this.vaultRoot! : this.root;
    const target = resolve(base, isVault ? path.slice('@vault/'.length) : path);
    const rel = relative(base, target);
    if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) throw new Error('无效 Wiki 路径');
    let current = base;
    if (lstatSync(current).isSymbolicLink()) throw new Error('根目录不能是符号链接');
    for (const part of rel.split(sep)) {
      current = join(current, part);
      try { if (lstatSync(current).isSymbolicLink()) throw new Error('路径包含符号链接'); }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    }
    if (!existsSync(dirname(target))) throw new Error('目标目录不存在');
    return target;
  }

  /** 返回一个候选的当前版本；不存在时抛出错误。 */
  get(id: string): ExperienceRecord {
    const row = this.db.prepare('SELECT body FROM wiki_experiences WHERE id=?').get(id);
    if (!row) throw new Error('候选不存在');
    return JSON.parse(row.body as string);
  }

  /** 按创建顺序倒序返回指定会话的候选和审核状态。 */
  list(sessionId: string): ExperienceRecord[] {
    return this.db.prepare('SELECT body FROM wiki_experiences WHERE session_id=? ORDER BY rowid DESC')
      .all(sessionId).map(row => JSON.parse(row.body as string));
  }

  private save(record: ExperienceRecord, event: string, expectedRevision?: number) {
    // 候选快照和操作记录在同一事务提交，避免审核意见丢失。
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (expectedRevision !== undefined) this.checked(record.id, expectedRevision);
      this.db.prepare('INSERT INTO wiki_experiences(id,session_id,body) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body')
        .run(record.id, record.sessionId, JSON.stringify(record));
      this.db.prepare('INSERT INTO wiki_experience_events VALUES(?,?,?)')
        .run(randomUUID(), record.id, JSON.stringify({ event, at: record.updatedAt, revision: record.revision, data: record.data }));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return record;
  }

  /** 新建候选并保存分析结果，不修改 Wiki。 */
  create(sessionId: string, raw: unknown) {
    z.string().uuid().parse(sessionId);
    const now = new Date().toISOString();
    const record: ExperienceRecord = { id: randomUUID(), sessionId, revision: 1, status: 'pending', createdAt: now, updatedAt: now, data: this.parse(raw) };
    return this.save(record, 'created');
  }

  private checked(id: string, revision: number) {
    const record = this.get(id);
    if (record.revision !== revision || record.status !== 'pending') throw new Error('候选版本或状态已变化，请重新审核');
    return record;
  }

  /** 保存用户编辑；目标路径和提取时的基线不可替换。 */
  update(id: string, revision: number, raw: unknown) {
    // 修改前锁定候选版本和来源，避免把旧审核应用到新内容。
    const record = this.checked(id, revision);
    const data = this.parse(raw);
    if (record.data.workflow) {
      const before = record.data.workflow;
      const after = data.workflow;
      if (!after || before.sessionSummary !== after.sessionSummary || before.stage !== after.stage || before.items.length !== after.items.length) throw new Error('不能修改分析结构，请重新提取');
      for (let i = 0; i < before.items.length; i++) {
        const oldItem = before.items[i], newItem = after.items[i];
        if (JSON.stringify([oldItem.title, oldItem.conclusion, oldItem.scope, oldItem.evidence, oldItem.unverified]) !== JSON.stringify([newItem.title, newItem.conclusion, newItem.scope, newItem.evidence, newItem.unverified])) throw new Error('经验内容不可直接修改，请在审核意见中补充');
      }
      if (before.stage === 'compared' && JSON.stringify(before.items) !== JSON.stringify(after.items)) throw new Error('对照后不能修改逐项确认，请重新提取');
    } else if (data.workflow) throw new Error('不能改变候选类型');
    const sources = (changes: ExperienceData['changes']) => JSON.stringify(changes.map(({ path, baseHash }) => ({ path, baseHash })));
    if (sources(data.changes) !== sources(record.data.changes) || JSON.stringify(data.sources) !== JSON.stringify(record.data.sources)) throw new Error('不能修改来源或目标路径，请重新提取');

    // 同步记录完整的审核意见与新版本。
    record.data = data;
    record.revision++;
    record.updatedAt = new Date().toISOString();
    return this.save(record, 'updated', revision);
  }

  /** 在逐项审核完成后保存对照结果；并发修改会使本次结果失效。 */
  saveComparison(id: string, revision: number, comparison: ExperienceData, modelSelection?: WikiModelSelection, agent?: WikiAgentState) {
    const record = this.checked(id, revision);
    const workflow = record.data.workflow;
    if (!workflow || workflow.stage !== 'review' || workflow.items.some(item => item.decision === 'pending') || !workflow.items.some(item => item.decision === 'confirmed')) throw new Error('请先逐项确认，并至少保留一项经验');
    record.data = this.parse({ ...comparison, reviewNote: record.data.reviewNote, workflow: { ...workflow, stage: 'compared' } });
    if (modelSelection) record.comparisonModelSelection = wikiModelSelectionSchema.parse(modelSelection);
    if (agent) record.comparisonAgent = agent;
    record.revision++;
    record.updatedAt = new Date().toISOString();
    return this.save(record, 'compared', revision);
  }

  /** 拒绝当前候选并保留用户意见，不修改 Wiki。 */
  reject(id: string, revision: number, note: string) {
    const record = this.checked(id, revision);
    record.data.reviewNote = z.string().max(20000).parse(note);
    record.status = 'rejected';
    record.revision++;
    record.updatedAt = new Date().toISOString();
    return this.save(record, 'rejected', revision);
  }

  private checkSources(sources: ExperienceData['sources']) {
    // 查重和冲突判断依赖的索引及页面也必须与分析时一致。
    for (const source of sources) {
      const target = this.file(source.path);
      const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
      if (hash(current) !== source.hash) throw new Error('参与 Wiki 对照的页面已变化，请重新提取');
    }
  }

  /** 为指定版本生成全部文件的审阅快照；基线变化时拒绝预览。 */
  prepare(id: string, revision: number): WikiPreview {
    // 检查候选版本，空结果没有写入操作。
    const record = this.checked(id, revision);
    if (record.data.workflow && record.data.workflow.stage !== 'compared') throw new Error('请先完成经验确认和 Wiki 对照');
    if (!record.data.changes.length) throw new Error('没有需要写入的内容');
    this.checkSources(record.data.sources);

    // 审阅内容包含完整前后文和基线摘要，日志只允许追加。
    const files = record.data.changes.map(item => {
      const target = this.file(item.path);
      const before = existsSync(target) ? readFileSync(target, 'utf8') : null;
      if (item.path.startsWith('@vault/') && before !== null && item.path !== '@vault/20领域/50-业务域/客服知识库/_INDEX.md' && !record.data.sources.some(source => source.path === item.path && source.hash === hash(before) && item.baseHash === source.hash)) throw new Error('人读版目标已存在且未经对照，请重新提取');
      if (item.path === '@vault/20领域/50-业务域/客服知识库/_INDEX.md' && before !== null && !item.content.startsWith(before)) throw new Error('客服索引只能追加');
      if (item.path === 'log.md' && before !== null && !item.content.startsWith(before)) throw new Error('日志只能追加');
      if (item.baseHash && item.baseHash !== hash(before)) throw new Error('Wiki 页面自分析后已变化，请重新提取');
      return { path: item.path, before, after: item.content, hash: hash(before) };
    });
    return { id, revision, files, sources: record.data.sources };
  }

  private writeFile(target: string, content: string | null, expected?: string | null, onApplied?: () => void) {
    if (content === null) {
      const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
      if (expected !== undefined && current !== expected) throw new Error('Wiki 页面已变化，请人工恢复');
      if (current !== null) unlinkSync(target);
      return;
    }
    // 同目录临时文件加重命名，避免将单个页面写成不完整内容。
    const mode = existsSync(target) ? statSync(target).mode & 0o777 : 0o600;
    const temp = join(dirname(target), `.ai-todos-${randomUUID()}.tmp`);
    try {
      writeFileSync(temp, content, { flag: 'wx', mode });
      // 临时文件准备完毕后再比较一次，缩小外部编辑与替换之间的窗口。
      if (expected !== undefined) {
        const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
        if (current !== expected) throw new Error('Wiki 页面已变化，请重新预览');
      }
      // 新页面用排他链接创建，不覆盖检查后由外部新建的同名文件。
      if (expected === null) linkSync(temp, target);
      else renameSync(temp, target);
      onApplied?.();
    } finally { if (existsSync(temp)) unlinkSync(temp); }
  }

  /** 回滚本进程确定写入的页面；意外中断时保留不确定内容供人工恢复。 */
  recover(applied?: Set<string>) {
    const journals = this.db.prepare('SELECT id, body FROM wiki_experience_journal').all();
    for (const row of journals) {
      // 不干扰仍在运行的写入进程，也不跨 Wiki 根目录恢复。
      const journal = JSON.parse(row.body as string) as { root: string; vaultRoot?: string; pid?: number; files: WikiPreview['files'] };
      if (journal.pid && journal.pid !== process.pid) {
        let running = true;
        try { process.kill(journal.pid, 0); }
        catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ESRCH') running = false; }
        if (running) throw new Error('其他进程的 Wiki 写入正在进行中');
      }
      if (journal.root !== this.root || (journal.vaultRoot ?? null) !== (this.vaultRoot ?? null)) throw new Error('存在其他 Wiki 或 Vault 路径的未完成写入，请检查本地记录');

      // 意外中断时无法证明哪些页面由本事务写入，不能凭内容猜测并覆盖外部编辑。
      const files = journal.files.filter(file => !applied || applied.has(file.path)).map(file => {
        const target = this.file(file.path);
        const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
        if (current !== file.before && current !== file.after) throw new Error('上次写入中断，Wiki 页面已被外部修改，需要人工恢复');
        if (!applied && current !== file.before) throw new Error('上次写入中断，页面归属无法确认，需要人工恢复');
        return { ...file, target, current };
      });
      for (const file of files.reverse()) {
        if (file.current === file.after && file.current !== file.before) this.writeFile(file.target, file.before, file.current);
      }
      this.db.prepare('DELETE FROM wiki_experience_journal WHERE id=?').run(row.id as string);
    }
  }

  /** 应用用户预览过的完整变更；版本或页面变化时不写入。 */
  approve(preview: WikiPreview) {
    // 先恢复旧事务，再检查候选版本、预览内容和每个页面基线。
    this.recover();
    const record = this.checked(preview.id, preview.revision);
    this.checkSources(record.data.sources);
    if (JSON.stringify(preview.sources) !== JSON.stringify(record.data.sources)) throw new Error('审核来源已变化');
    const reviewed = preview.files.map(({ path, after }) => ({ path, content: after }));
    const proposed = record.data.changes.map(({ path, content }) => ({ path, content }));
    if (JSON.stringify(reviewed) !== JSON.stringify(proposed)) throw new Error('审核内容已变化');
    const targets = preview.files.map(file => {
      const target = this.file(file.path);
      const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
      if (hash(current) !== file.hash || current !== file.before) throw new Error('Wiki 页面已变化，请重新预览');
      return { ...file, target };
    });

    // 在写文件前持久化恢复日志，并限制同一数据库只有一个写入者。
    this.db.prepare('INSERT INTO wiki_experience_journal VALUES(?,?)')
      .run(record.id, JSON.stringify({ root: this.root, vaultRoot: this.vaultRoot, pid: process.pid, files: preview.files }));
    const applied = new Set<string>();
    try {
      // 写入期间持有数据库锁，防止其他进程修改已审核的候选。
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.checked(record.id, preview.revision);
        this.checkSources(record.data.sources);
        for (const file of targets) {
          const target = this.file(file.path);
          const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
          if (current !== file.before) throw new Error('Wiki 页面已变化，请重新预览');
          this.writeFile(target, file.after, file.before, () => applied.add(file.path));
        }

        // 再核对分析依赖；已修改的依赖应等于本次审核过的最终内容。
        for (const source of record.data.sources) {
          const target = this.file(source.path);
          const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
          const changed = preview.files.find(file => file.path === source.path);
          const expected = changed ? hash(changed.after) : source.hash;
          if (hash(current) !== expected) throw new Error('参与 Wiki 对照的页面已变化，请重新提取');
        }

        // 审核结果和日志删除同事务提交，重启时能识别未完成的写入。
        record.status = 'written';
        record.revision++;
        record.updatedAt = new Date().toISOString();
        this.db.prepare('UPDATE wiki_experiences SET body=? WHERE id=?').run(JSON.stringify(record), record.id);
        this.db.prepare('INSERT INTO wiki_experience_events VALUES(?,?,?)')
          .run(randomUUID(), record.id, JSON.stringify({ event: 'approved', at: record.updatedAt, revision: record.revision, data: record.data, files: preview.files.map(file => file.path) }));
        this.db.prepare('DELETE FROM wiki_experience_journal WHERE id=?').run(record.id);
        this.db.exec('COMMIT');
      } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    } catch (error) {
      // 失败后尽力回滚；若页面已被外部修改，保留日志并明确提示人工处理。
      try { this.recover(applied); }
      catch (recovery) { throw new Error(`${error instanceof Error ? error.message : String(error)}；${recovery instanceof Error ? recovery.message : String(recovery)}`); }
      throw error;
    }
    return record;
  }
}
