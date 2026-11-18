import { randomUUID } from 'node:crypto';
import type { Store } from './domain.ts';
import type { ExperienceChat } from './experience-chat.ts';

export type PreparationStage = 'reading' | 'connecting' | 'creating' | 'seeding' | 'ready';
export interface ExperiencePreparation {
  id: string; sourceId: string; status: 'preparing' | 'ready' | 'failed'; stage: PreparationStage;
  createdAt: string; updatedAt: string; unread: boolean; retryAllowed: boolean;
  timings: Partial<Record<PreparationStage, number>>; error?: string; checkpoint?: ExperienceChat;
}
export type ExperiencePreparationView = Omit<ExperiencePreparation, 'checkpoint'>;
export interface PreparationOptions {
  signal?: AbortSignal; resume?: ExperienceChat;
  onStage?: (stage: PreparationStage, checkpoint?: ExperienceChat) => void;
}

/** 只返回卡片所需的状态，不把原文路径和私有交接资料暴露到快照。 */
export function preparationView(job: ExperiencePreparation): ExperiencePreparationView {
  const { checkpoint: _checkpoint, ...view } = job;
  return view;
}

/** 管理不依赖面板存活的后台准备；成功后只发出就绪状态，不打开窗口或启动模型。 */
export class ExperiencePreparations {
  private running = new Map<string, { pending: Promise<void>; controller: AbortController }>();
  private stopping = false;
  private store: Store;
  private prepare: (sourceId: string, options: PreparationOptions) => Promise<ExperienceChat>;
  /** 恢复上次服务中断的任务；不重新调度准备，也不消除未读提醒。 */
  constructor(store: Store, prepare: (sourceId: string, options: PreparationOptions) => Promise<ExperienceChat>) {
    this.store = store;
    this.prepare = prepare;

    // 上次服务中断不能继续显示运行中；已落盘的关联可以恢复为就绪。
    for (const previous of store.experiencePreparations()) {
      if (previous.status !== 'preparing') continue;
      const chat = store.meta<ExperienceChat | null>(`experience.chat.${previous.sourceId}`, null);
      const retryAllowed = previous.stage !== 'creating' || !!previous.checkpoint;
      store.setMeta(`experience.preparation.${previous.sourceId}`, { ...previous, status: chat ? 'ready' : 'failed', stage: chat ? 'ready' : previous.stage, updatedAt: store.at(), unread: !!chat, retryAllowed,
        ...(chat ? {} : { error: retryAllowed ? '服务重启，准备已中断，可重试继续。' : '会话创建结果尚未确认，请先核对 Codex 会话，避免重复创建。' }) });
    }
  }

  /** 接受或复用指定来源的准备任务，立即返回；显式重试保留已知线程 checkpoint。 */
  start(sourceId: string): { job: ExperiencePreparationView } {
    // 只接受可信业务来源；同源运行、就绪结果和不确定创建结果不能被重复提交覆盖。
    if (this.stopping) throw new Error('服务正在关闭，请稍后重试');
    if (!this.store.sessions().some(session => session.id === sourceId)) throw new Error('会话不存在，请先同步会话列表');
    const key = `experience.preparation.${sourceId}`;
    const previous = this.store.meta<ExperiencePreparation | null>(key, null);
    if (previous && (this.running.has(sourceId) || previous.status === 'ready')) return { job: preparationView(previous) };
    if (previous && !previous.retryAllowed) throw new Error(previous.error || '会话创建结果待核对');

    // 先落盘再排队执行，慢 RPC 及面板关闭不会阻塞启动响应或丢掉进度。
    const at = this.store.at();
    let job: ExperiencePreparation = { id: randomUUID(), sourceId, status: 'preparing', stage: previous?.checkpoint ? 'connecting' : 'reading', createdAt: at, updatedAt: at, unread: false, retryAllowed: true, timings: {}, ...(previous?.checkpoint ? { checkpoint: previous.checkpoint } : {}) };
    this.store.setMeta(key, job);
    const controller = new AbortController();
    const transition = (stage: PreparationStage, checkpoint?: ExperienceChat) => {
      const now = this.store.at();
      job = { ...job, stage, updatedAt: now, timings: { ...job.timings, [job.stage]: (job.timings[job.stage] || 0) + Math.max(0, Date.parse(now) - Date.parse(job.updatedAt)) }, ...(checkpoint ? { checkpoint } : {}) };
      this.store.setMeta(key, job);
    };
    const pending = Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return this.prepare(sourceId, { signal: controller.signal, resume: job.checkpoint, onStage: transition });
    }).then(chat => {
      controller.signal.throwIfAborted();
      this.store.registerExperienceChat(chat);
      transition('ready');
      job = { ...job, status: 'ready', unread: true };
      this.store.setMeta(key, job);
    }).catch(error => {
      const retryAllowed = job.stage !== 'creating' || !!job.checkpoint || error?.code === 'errors.codexRequest';
      job = { ...job, status: 'failed', updatedAt: this.store.at(), unread: false, retryAllowed,
        error: retryAllowed ? (error instanceof Error ? error.message : String(error)).slice(0, 1000) : '会话创建结果尚未确认，请先核对 Codex 会话，避免重复创建。' };
      this.store.setMeta(key, job);
    }).finally(() => this.running.delete(sourceId));
    this.running.set(sourceId, { pending, controller });
    return { job: preparationView(job) };
  }

  /** 仅确认用户实际看到的就绪提醒；过期任务 ID 不能消除新任务的未读状态。 */
  acknowledge(sourceId: string, jobId: string) {
    // 仅接受同一份已就绪任务，拒绝过期弹窗对后续任务的确认。
    const key = `experience.preparation.${sourceId}`, job = this.store.meta<ExperiencePreparation | null>(key, null);
    if (!job || job.id !== jobId || job.status !== 'ready') throw Object.assign(new Error('准备任务已变化，请刷新后重试'), { status: 409 });

    // 持久化已读状态，刷新或重新打开面板后不重复打扰。
    const updated = { ...job, unread: false };
    this.store.setMeta(key, updated);
    return { job: preparationView(updated) };
  }

  /** 关闭服务时取消并等待后台准备落盘，避免数据库关闭后仍收到回调。 */
  async stop() {
    this.stopping = true;
    for (const { controller } of this.running.values()) controller.abort();
    await Promise.allSettled([...this.running.values()].map(run => run.pending));
  }
}
