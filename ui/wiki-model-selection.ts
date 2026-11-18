import type { WikiModel, WikiModelSelection } from '../src/wiki-models.ts';

/** 切换模型时只保留它支持的推理强度，否则采用目录返回的默认值。 */
export function selectionForWikiModel(model: WikiModel, previous: WikiModelSelection | null): WikiModelSelection {
  const efforts = model.supportedReasoningEfforts.map(item => item.reasoningEffort);
  const preferred = previous?.reasoningEffort;
  return { model: model.model, reasoningEffort: preferred && efforts.includes(preferred) ? preferred : model.defaultReasoningEffort && efforts.includes(model.defaultReasoningEffort) ? model.defaultReasoningEffort : efforts[0] ?? null };
}
