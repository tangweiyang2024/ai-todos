import { randomUUID } from 'node:crypto';
import type { Store, StoredExperienceRecord } from './domain.ts';
import type { ExperienceChat } from './experience-chat.ts';
import type { WikiModelSelection } from './wiki-models.ts';
import type { InitialExtraction } from './experience-native-run.ts';

export type PreparationStage = 'reading' | 'connecting' | 'creating' | 'seeding' | 'extracting' | 'ready';
export interface ExperienceSourceSnapshot {
  sourcePath: string;
  sourceHash: string;
  sourceCapturedAt: string;
}
export interface ExperiencePreparation {
  id: string; sourceId: string; status: 'preparing' | 'ready' | 'failed'; stage: PreparationStage;
  createdAt: string; updatedAt: string; unread: boolean; retryAllowed: boolean;
  timings: Partial<Record<PreparationStage, number>>; error?: string; checkpoint?: ExperienceChat;
  modelSelection?: WikiModelSelection;
  recordId?: string;
  focus?: string;
  previousSourcePath?: string;
  sourceSnapshot?: ExperienceSourceSnapshot;
}
export type ExperiencePreparationView = Omit<ExperiencePreparation, 'checkpoint' | 'sourceSnapshot' | 'previousSourcePath'>;
export interface PreparationOptions {
  signal?: AbortSignal; resume?: ExperienceChat;
  modelSelection?: WikiModelSelection;
  recordId?: string;
  focus?: string;
  previousSourcePath?: string;
  sourceSnapshot?: ExperienceSourceSnapshot;
  onSourceSnapshot?: (snapshot: ExperienceSourceSnapshot) => void;
  onStage?: (stage: PreparationStage, checkpoint?: ExperienceChat) => void;
}
interface CaptureRequest { recordId: string; focus?: string }
type CaptureAction = { kind: 'legacy'; recordId?: undefined } | ({ kind: 'create' } & CaptureRequest) | { kind: 'retry'; recordId: string };

/** 只返回卡片所需的状态，不把原文路径和私有交接资料暴露到快照。 */
export function preparationView(job: ExperiencePreparation): ExperiencePreparationView {
  const { checkpoint: _checkpoint, sourceSnapshot: _snapshot, previousSourcePath: _previous, ...view } = job;
  return view;
}

function conflict(message: string) {
  return Object.assign(new Error(message), { status: 409 });
}

/** 管理不依赖面板存活的准备和原生首轮提取，完成后提醒用户审核，不自动打开窗口。 */
export class ExperiencePreparations {
  private running = new Map<string, { pending: Promise<void>; controller: AbortController }>();
  private stopping = false;
  private store: Store;
  private prepare: (sourceId: string, options: PreparationOptions) => Promise<ExperienceChat>;
  private extract?: (chat: ExperienceChat, options: PreparationOptions) => Promise<void | 'reused'>;

  /** 恢复上次服务中断的任务；不重新调度准备，也不消除已有未读提醒。 */
  constructor(store: Store, prepare: (sourceId: string, options: PreparationOptions) => Promise<ExperienceChat>, extract?: (chat: ExperienceChat, options: PreparationOptions) => Promise<void | 'reused'>) {
    // 准备线程和执行首轮由宿主提供，恢复时只读取其已保存的执行结果。
    this.store = store;
    this.prepare = prepare;
    this.extract = extract;

    // 每条记录独立恢复，其他记录的就绪线程不能证明这次提取完成。
    for (const record of store.experienceRecords()) {
      const job = record.preparation;
      if (!job) continue;
      let chat = record.chat;
      // 曾进入提取或就绪阶段的断点已完成建聊，可补回旧数据缺少的关联供核对。
      if (!chat && job.checkpoint?.sourceId === record.sourceId && (job.stage === 'extracting' || job.stage === 'ready')) {
        chat = job.checkpoint;
        store.registerExperienceChat(chat, job.recordId);
      }
      if (job.status === 'preparing') this.recover(job, chat);
    }
  }

  private recover(job: ExperiencePreparation, chat?: ExperienceChat) {
    // 旧版仅准备聊天的任务以正式关联为完成；自动提取任务需要本线程的完成证据。
    const initial = chat && this.store.meta<InitialExtraction | null>(`experience.initial.${chat.threadId}`, null);
    const needsExtraction = !!job.modelSelection || job.stage === 'extracting';
    const ready = needsExtraction ? initial?.status === 'completed' : !!chat;
    const retryAllowed = !initial && (job.stage !== 'creating' || !!job.checkpoint);

    // 未确认的创建或首轮派发不能重发；保留该次快照、断点和模型供重试或核对。
    if (ready) {
      this.store.saveExperiencePreparation({ ...job, status: 'ready', stage: 'ready', updatedAt: this.store.at(), unread: true });
    } else {
      const error = retryAllowed ? '服务重启，准备已中断，可重试继续。'
        : initial ? '服务重启，首轮执行结果待核对；请进入原会话查看，不会重复发送。'
          : '会话创建结果尚未确认，请先核对 Codex 会话，避免重复创建。';
      this.store.saveExperiencePreparation({ ...job, status: 'failed', updatedAt: this.store.at(), unread: false, retryAllowed, error });
    }
  }

  /** 显式提交按稳定记录 ID 去重；未传 ID 的旧入口沿用单条任务语义。 */
  start(sourceId: string, modelSelection?: WikiModelSelection, request?: CaptureRequest) {
    return this.accept(sourceId, request ? { kind: 'create', ...request } : { kind: 'legacy' }, modelSelection);
  }

  /** 只重试所选记录；重复请求复用已启动的重试，保留该记录的快照和模型。 */
  retry(sourceId: string, recordId: string) {
    return this.accept(sourceId, { kind: 'retry', recordId });
  }

  private accept(sourceId: string, action: CaptureAction, selection?: WikiModelSelection) {
    // 限定业务来源，禁止把已隐藏的沉淀聊天递归用作来源。
    if (this.stopping) throw new Error('服务正在关闭，请稍后重试');
    if (!this.store.sessions().some(session => session.id === sourceId)) throw new Error('会话不存在，请先同步会话列表');

    // 在一个写事务内判重、检查同源运行任务并保存新任务，重试响应丢失也不重复执行。
    const accepted = this.store.transaction(() => {
      const records = this.store.experienceRecords(sourceId);
      const active = records.find(record => record.preparation?.status === 'preparing');
      const { recordId } = action;
      const target = recordId ? records.find(record => record.id === recordId) : active ?? records[0];
      const previous = target?.preparation;
      if (action.kind === 'retry' && !previous) throw conflict('未找到可重试的沉淀任务，请刷新后重试');
      if (action.kind === 'create' && target?.legacy) throw conflict('发起标识与旧记录冲突，请重新发起');
      if (action.kind === 'create' && target && !previous) throw conflict('该标识已关联沉淀聊天，请查看历史记录');
      if (target && previous && this.shouldReuse(action, target, previous)) return { job: previous, run: false };
      if (active) throw conflict('此来源正在准备另一条沉淀记录，请稍后再试');
      if (previous && !previous.retryAllowed) throw conflict(previous.error || '会话创建结果待核对');

      // 首次创建可对照上一份快照；重试始终保留原有范围、主题与模型。
      const latest = records[0];
      const previousSourcePath = target ? previous?.previousSourcePath : latest?.preparation?.sourceSnapshot?.sourcePath ?? latest?.chat?.sourcePath;
      let modelSelection = previous?.modelSelection ?? selection;
      if (!modelSelection && target?.legacy && action.kind === 'retry' && this.extract) {
        modelSelection = this.store.meta<{ selection?: WikiModelSelection }>('experience.modelPreference', {}).selection;
        if (!modelSelection) throw conflict('请先在设置中保存沉淀默认模型');
      }

      // 新的 job ID 只标识本次尝试；稳定的记录 ID 和发起时间不会随重试变化。
      const at = this.store.at();
      const job: ExperiencePreparation = {
        id: randomUUID(), sourceId, recordId: target?.legacy ? undefined : recordId ?? target?.id,
        status: 'preparing', stage: previous?.checkpoint ? 'connecting' : 'reading', createdAt: previous?.createdAt ?? at,
        updatedAt: at, unread: false, retryAllowed: true, timings: {}, modelSelection,
        focus: action.kind === 'create' ? action.focus?.trim() || undefined : previous?.focus,
        previousSourcePath, checkpoint: previous?.checkpoint, sourceSnapshot: previous?.sourceSnapshot,
      };
      this.store.saveExperiencePreparation(job);
      return { job, run: true };
    });

    // 事务提交后才允许执行外部操作，响应无需等待 Codex RPC。
    if (accepted.run) this.schedule(accepted.job);
    return { job: preparationView(accepted.job) };
  }

  private shouldReuse(action: CaptureAction, record: StoredExperienceRecord, previous: ExperiencePreparation) {
    // 重复创建只读回先前结果，正在执行的尝试也不重复入队。
    if (action.kind === 'create' || previous.status === 'preparing') return true;
    if (action.kind === 'legacy' && !record.legacy) return true;
    if (previous.status !== 'ready') return false;

    // 老数据可能只准备过聊天，还没有启动过首轮提取。
    const needsInitial = action.kind === 'legacy' && this.extract && record.chat && !previous.modelSelection && !this.store.experienceChatHasStarted(record.chat.threadId);
    return !needsInitial;
  }

  private schedule(initialJob: ExperiencePreparation) {
    // 每次尝试单独持有取消信号，关闭服务时等待真实任务结束。
    const controller = new AbortController();
    const pending = Promise.resolve().then(() => this.run(initialJob, controller.signal)).finally(() => this.running.delete(initialJob.id));
    this.running.set(initialJob.id, { pending, controller });
  }

  private async run(job: ExperiencePreparation, signal: AbortSignal) {
    // 在每个外部操作边界落盘，同一记录的重试可直接取回已读快照和已建线程。
    const transition = (stage: PreparationStage, checkpoint?: ExperienceChat) => {
      const now = this.store.at();
      const elapsed = Math.max(0, Date.parse(now) - Date.parse(job.updatedAt));
      job = this.store.saveExperiencePreparation({
        ...job, stage, updatedAt: now, timings: { ...job.timings, [job.stage]: (job.timings[job.stage] || 0) + elapsed },
        ...(checkpoint ? { checkpoint } : {}),
      });
    };
    const options: PreparationOptions = {
      signal, resume: job.checkpoint, recordId: job.recordId, focus: job.focus, modelSelection: job.modelSelection,
      previousSourcePath: job.previousSourcePath, sourceSnapshot: job.sourceSnapshot, onStage: transition,
      onSourceSnapshot: sourceSnapshot => { job = this.store.saveExperiencePreparation({ ...job, sourceSnapshot }); },
    };

    // 聊天准备与首轮执行共享同一记录；只在首轮完成后发出就绪提醒。
    try {
      signal.throwIfAborted();
      const chat = await this.prepare(job.sourceId, options);
      signal.throwIfAborted();
      this.store.registerExperienceChat(chat, job.recordId);
      let reused = false;
      if (this.extract) {
        transition('extracting', chat);
        reused = await this.extract(chat, options) === 'reused';
        signal.throwIfAborted();
      }
      transition('ready');
      this.store.saveExperiencePreparation({ ...job, status: 'ready', unread: !reused });
    } catch (error) {
      // 已派发或结果不确定时保留核对入口；已知创建失败和未派发的断点可安全重试。
      const dispatched = job.checkpoint && this.store.meta<InitialExtraction | null>(`experience.initial.${job.checkpoint.threadId}`, null);
      const rejected = error && typeof error === 'object' && 'code' in error && error.code === 'errors.codexRequest';
      const retryAllowed = !dispatched && (job.stage !== 'creating' || !!job.checkpoint || !!rejected);
      const message = dispatched || retryAllowed ? (error instanceof Error ? error.message : String(error)).slice(0, 1000)
        : '会话创建结果尚未确认，请先核对 Codex 会话，避免重复创建。';
      this.store.saveExperiencePreparation({ ...job, status: 'failed', updatedAt: this.store.at(), unread: false, retryAllowed, error: message });
    }
  }

  /** 仅确认用户实际看到的就绪提醒；重试前的过期任务 ID 不能消除新提醒。 */
  acknowledge(sourceId: string, jobId: string) {
    return this.store.transaction(() => {
      // 在来源下查找确切的尝试；较新记录不会遮住较早记录的提醒。
      const job = this.store.experienceRecords(sourceId).find(record => record.preparation?.id === jobId)?.preparation;
      if (!job || job.status !== 'ready') throw conflict('准备任务已变化，请刷新后重试');

      // 持久化已读状态，刷新或重新打开面板后不重复打扰。
      const updated = this.store.saveExperiencePreparation({ ...job, unread: false });
      return { job: preparationView(updated) };
    });
  }

  /** 关闭服务时取消并等待后台准备落盘，避免数据库关闭后仍收到回调。 */
  async stop() {
    this.stopping = true;
    for (const { controller } of this.running.values()) controller.abort();
    await Promise.allSettled([...this.running.values()].map(run => run.pending));
  }
}
