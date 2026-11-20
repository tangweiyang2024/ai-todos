import type { ExperienceRecordView, LiveSession } from '../src/types.ts';
import type { ExperiencePreparationView } from '../src/experience-preparation.ts';

interface CaptureNotice {
  session: LiveSession;
  preparation: ExperiencePreparationView;
  record?: ExperienceRecordView;
}

/** 从所有来源取最早的未读完成提醒，保留对应记录和准备任务的标识。 */
export function nextCaptureNotice(sessions: LiveSession[]) {
  // 记录数组包含全部准备任务；旧快照仅有来源级任务。
  const notices: CaptureNotice[] = [];
  for (const session of sessions) {
    if (session.experienceRecords) {
      for (const record of session.experienceRecords) {
        if (record.preparation) notices.push({ session, record, preparation: record.preparation });
      }
    } else if (session.experiencePreparation) {
      notices.push({ session, preparation: session.experiencePreparation });
    }
  }

  // 只提示经默认模型完成的首轮，按完成时间依次处理。
  const next = notices.filter(({ preparation }) => preparation.status === 'ready' && preparation.modelSelection && preparation.unread)
    .sort((a, b) => a.preparation.updatedAt.localeCompare(b.preparation.updatedAt))[0];
  if (!next) return;

  // 每条提醒采用自身提取结果；旧服务仅有来源级进度。
  const status = next.record ? next.record.experience?.status : next.session.experience?.status;
  const descriptionKey = status === 'no_knowledge' ? 'wiki.captureStatus.no_knowledge' : 'wiki.captureReadyDescription';
  return { ...next, descriptionKey } as const;
}
