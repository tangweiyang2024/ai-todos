import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { SelectField } from './FormControls.tsx';
import { selectionForWikiModel } from '../wiki-model-selection.ts';
import type { WikiModel, WikiModelSelection } from '../../src/wiki-models.ts';

type Preference = { revision: number; selection: WikiModelSelection | null };
/** 保存独立的沉淀默认模型；目录失效或并发保存时明确显示错误，不修改 Codex 全局设置。 */
export function CaptureModelSettings({ call, onSaved }: { call: (path: string, data?: unknown) => Promise<any>; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const [models, setModels] = useState<WikiModel[]>([]);
  const [preference, setPreference] = useState<Preference>({ revision: 0, selection: null });
  const [selection, setSelection] = useState<WikiModelSelection | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    call('wiki/models', {}).then(result => {
      if (active) { setModels(result.models); setPreference(result.capturePreference); setSelection(result.capturePreference.selection); }
    }).catch(reason => { if (active) setError(String(reason.message || reason)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [call]);
  const selected = models.find(item => item.model === selection?.model);
  const valid = !!selected && (selected.supportedReasoningEfforts.length ? selected.supportedReasoningEfforts.some(item => item.reasoningEffort === selection?.reasoningEffort) : selection?.reasoningEffort === null);

  // 保存期间锁定当前选择；服务端校验真实目录和设置版本后才显示已保存。
  const save = async () => {
    if (!selection || !valid) return;
    setBusy(true); setError(''); setSaved(false);
    try {
      const result = await call('wiki/set_capture_model', { revision: preference.revision, modelSelection: selection });
      setPreference(result.capturePreference); setSaved(true); await onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const reload = async () => {
    setBusy(true); setError(''); setSaved(false);
    try {
      const result = await call('wiki/models', {});
      setModels(result.models); setPreference(result.capturePreference); setSelection(result.capturePreference.selection);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  return <section className="card capture-model-settings">
    <h2><Sparkles size={17} aria-hidden="true" />{t('wiki.captureModelTitle')}</h2>
    <p className="note">{t('wiki.captureModelHint')}</p>
    <SelectField label={t('wiki.analysisModel')} value={selected?.model ?? ''} disabled={busy || !models.length} groups={[{ options: [{ value: '', label: t('wiki.chooseModel') }, ...models.map(item => ({ value: item.model, label: item.displayName }))] }]} onValueChange={value => {
      const model = models.find(item => item.model === value);
      setSelection(model ? selectionForWikiModel(model, selection) : null); setSaved(false);
    }} />
    <SelectField label={t('wiki.reasoningEffort')} value={selection?.reasoningEffort ?? ''} disabled={busy || !selected?.supportedReasoningEfforts.length} groups={[{ options: selected?.supportedReasoningEfforts.length ? selected.supportedReasoningEfforts.map(item => ({ value: item.reasoningEffort, label: item.reasoningEffort })) : [{ value: '', label: t('wiki.noReasoningEffort') }] }]} onValueChange={value => { setSelection(current => current ? { ...current, reasoningEffort: value || null } : null); setSaved(false); }} />
    <div className="row"><button type="button" disabled={busy || !valid} onClick={save}>{busy ? t('common.saving') : t('common.save')}</button><button type="button" className="quiet" disabled={busy} onClick={reload}>{t('wiki.refreshModels')}</button></div>
    {error && <p role="alert" className="note">{error}</p>}
    {!busy && selection && !valid && <p role="alert">{t('wiki.selectedModelUnavailable')}</p>}
    {saved && <p role="status" className="note">{t('wiki.captureModelSaved')}</p>}
  </section>;
}
