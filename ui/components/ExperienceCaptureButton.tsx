import { useTranslation } from 'react-i18next';
import { History, LoaderCircle, Sparkles } from 'lucide-react';
import type { LiveSession } from '../../src/types.ts';

export type CaptureAction = 'new' | 'history' | 'legacy';
export type CaptureActionHandler = (sessionId: string, action: CaptureAction) => void;

type CaptureSession = Pick<LiveSession, 'experienceRecords' | 'experience' | 'experiencePreparation'>;

/** 旧服务只有一条沉淀，保留其原有入口和准备约束。 */
function LegacyCaptureButton({ session, busy, onClick }: { session: CaptureSession; busy: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const job = session.experiencePreparation;
  const preparing = job?.status === 'preparing';
  const blocked = job?.status === 'failed' && !job.retryAllowed && job.stage !== 'extracting';
  const label = preparing ? 'wiki.captureInBackground' : blocked ? 'wiki.captureCheckNeeded' : job?.status === 'failed' ? job.retryAllowed ? 'wiki.retryCapture' : 'wiki.captureInspect' : job?.status === 'ready' && job.unread ? 'wiki.reviewCapture' : session.experience ? 'wiki.continueCapture' : 'wiki.title';
  return <button type="button" disabled={busy || preparing || blocked} onClick={onClick} title={job?.error}>
    {preparing ? <LoaderCircle size={12} className="experience-spinner" aria-hidden="true" /> : <Sparkles size={12} aria-hidden="true" />}{t(label)}
  </button>;
}

/** 列表与看板共用的新建和历史入口，准备期间仍可查看已有记录。 */
export function ExperienceCaptureButton({ session, busy, onClick }: { session?: CaptureSession | null; busy: boolean; onClick: (action: CaptureAction) => void }) {
  const { t } = useTranslation();
  // 仅旧版服务缺少记录数组，避免把新建参数交给旧的按来源复用接口。
  if (session && !session.experienceRecords) return <LegacyCaptureButton session={session} busy={busy} onClick={() => onClick('legacy')} />;

  // 按来源锁定新增操作，保留历史记录的独立入口。
  const records = session?.experienceRecords ?? [];
  const preparing = records.some(record => record.preparation?.status === 'preparing');
  return <>
    <button type="button" disabled={busy || preparing} onClick={() => onClick('new')}>
      {preparing ? <LoaderCircle size={12} className="experience-spinner" aria-hidden="true" /> : <Sparkles size={12} aria-hidden="true" />}
      {t(preparing ? 'wiki.captureInBackground' : 'wiki.newCapture')}
    </button>
    {records.length > 0 && <button type="button" disabled={busy} onClick={() => onClick('history')}>
      <History size={12} aria-hidden="true" />{t('wiki.captureHistoryCount', { count: records.length })}
    </button>}
  </>;
}
