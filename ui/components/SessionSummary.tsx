import { useTranslation } from 'react-i18next';
import type { LiveSession } from '../../src/types.ts';

/** 在卡片上显示一句会话目标，旧格式概要可重新生成。 */
export function SessionSummary({ session, onGenerate }: { session: LiveSession; onGenerate?: (id: string) => void }) {
  const { t } = useTranslation();
  const summary = session.summary;

  // 旧格式概要等待刷新，避免在卡片中继续显示过程概述。
  if (summary?.format !== 'goal') {
    const canGenerate = onGenerate && session.catalogUpdatedAt && !['running', 'queued'].includes(session.state);
    return <div className="session-summary__hint">
      {t(session.summaryStatus === 'failed' ? 'session.summaryFailed' : 'session.summaryPending')}
      {canGenerate && <> <button type="button" className="session-summary__generate" onClick={() => onGenerate(session.id)}>{t('session.summaryGenerate')}</button></>}
    </div>;
  }

  // 保留来源不完整或已更新的提示，方便判断这句话是否需要刷新。
  const outdated = summary.sourceUpdatedAt !== session.catalogUpdatedAt;
  return <div className="session-summary">
    <p className="session-summary__text">{summary.text}</p>
    {(summary.partial || outdated) && <small className="session-summary__hint">{t(summary.partial ? 'session.summaryPartial' : 'session.summaryOutdated')}</small>}
  </div>;
}
