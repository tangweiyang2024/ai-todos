import { useTranslation } from 'react-i18next';
import { LoaderCircle, Sparkles } from 'lucide-react';
import type { LiveSession } from '../../src/types.ts';

/** 展示沉淀入口的后台准备、重试和进入状态，只锁定正在准备的当前来源。 */
export function ExperienceCaptureButton({ session, busy, onClick }: { session?: Pick<LiveSession, 'experience' | 'experiencePreparation'> | null; busy: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const job = session?.experiencePreparation;
  const preparing = job?.status === 'preparing';
  const blocked = job?.status === 'failed' && !job.retryAllowed && job.stage !== 'extracting';
  const label = preparing ? 'wiki.captureInBackground' : blocked ? 'wiki.captureCheckNeeded' : job?.status === 'failed' ? job.retryAllowed ? 'wiki.retryCapture' : 'wiki.captureInspect' : job?.status === 'ready' && job.unread ? 'wiki.reviewCapture' : session?.experience ? 'wiki.continueCapture' : 'wiki.title';
  return <button type="button" disabled={busy || preparing || blocked} onClick={onClick} title={job?.error}>
    {preparing ? <LoaderCircle size={12} className="experience-spinner" aria-hidden="true" /> : <Sparkles size={12} aria-hidden="true" />}{t(label)}
  </button>;
}
