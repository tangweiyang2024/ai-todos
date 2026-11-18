import { useTranslation } from 'react-i18next';
import { LoaderCircle, Sparkles } from 'lucide-react';
import type { ExperienceProgress as Progress } from '../../src/experience-chat.ts';
import type { ExperiencePreparationView } from '../../src/experience-preparation.ts';

/** 在原卡片显示沉淀会话的观察和回报；不推断百分比或 Wiki 写入成功。 */
export function ExperienceProgress({ value, preparation }: { value?: Progress; preparation?: ExperiencePreparationView }) {
  const { t } = useTranslation();
  // 会话创建前显示后台准备状态，失败时保留具体原因和重试入口。
  if (preparation && preparation.status !== 'ready') return <div className={`experience-progress is-${preparation.status}`} role="status">
    <span className="experience-progress__status">{preparation.status === 'preparing' && <LoaderCircle size={12} className="experience-spinner" aria-hidden="true" />}{t(preparation.status === 'preparing' ? 'wiki.captureInBackground' : 'wiki.capturePreparationFailed')}</span>
    <span className="experience-progress__stage">{t(`wiki.capturePreparationStage.${preparation.stage}`)}</span>
    <span className="experience-progress__summary">{preparation.error || t('wiki.captureBackgroundHint')}</span>
  </div>;

  // 准备完成后沿用原生会话观察和主动回报，不把“就绪”当作入库完成。
  if (!value) return null;
  return <div className={`experience-progress is-${value.status}`} title={`${t('wiki.captureProgressHint')} · ${new Date(value.updatedAt).toLocaleString()}`}>
    <span className="experience-progress__status"><Sparkles size={12} aria-hidden="true" />{t(`wiki.captureStatus.${value.status}`)}</span>
    {value.stage && !['ready', 'completed', 'no_knowledge', 'failed'].includes(value.stage) && <span className="experience-progress__stage">{t(`wiki.captureStage.${value.stage}`)}</span>}
    {value.summary && <span className="experience-progress__summary">{value.summary}</span>}
  </div>;
}
