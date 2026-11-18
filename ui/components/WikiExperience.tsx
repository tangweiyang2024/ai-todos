import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, Pencil, Sparkles } from 'lucide-react';
import { EditorDialog } from './TaskEditor.tsx';
import { SelectControl } from './FormControls.tsx';
import { selectWikiRecord } from '../wiki-link.ts';
import { selectionForWikiModel } from '../wiki-model-selection.ts';
import type { WikiModel, WikiModelSelection } from '../../src/wiki-models.ts';
import type { ExperienceRecord, ExperienceData, WikiPreview, WikiAnalysisJob } from '../../src/wiki-experience.ts';

type Call = (path: string, data: unknown) => Promise<unknown>;
interface Props { sessionId: string; initialRecordId?: string; initialRevision?: number; embedded: boolean; browserOrigin: string; call: Call; onClose: () => void }

// 审核内容默认以排版后的 Markdown 展示，编辑时保留原始文本。
function ReviewSection({ label, value, editable, onChange, document = false }: { label: string; value: string; editable: boolean; onChange: (value: string) => void; document?: boolean }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  // 文档预览仅排版正文；YAML 元数据仍完整保留在编辑内容和最终差异中。
  const rendered = document ? value.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '') : value;
  return <details className={`wiki-card ${document ? 'wiki-card--document' : ''}`} open={!document}>
    <summary className="wiki-card__header"><h3>{label}</h3></summary>
    {editable && <button type="button" className="wiki-edit" onClick={() => setEditing(!editing)}><Pencil size={14} />{t(editing ? 'wiki.doneEditing' : 'wiki.edit')}</button>}
    {editing && editable ? <textarea className="wiki-card__textarea" aria-label={label} rows={document ? 14 : 4} value={value} onChange={event => onChange(event.target.value)} /> : <div className="wiki-markdown">{rendered.trim() ? <Markdown remarkPlugins={[remarkGfm]} components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />, img: ({ alt }) => <span>{alt || ''}</span> }}>{rendered}</Markdown> : <span className="wiki-empty-value">{t('wiki.emptyValue')}</span>}</div>}
  </details>;
}

// 显示相同的首尾上下文和完整的中间变更，避免隐藏修改。
function diff(before: string | null, after: string) {
  const original = (before ?? '').split('\n');
  const updated = after.split('\n');
  let start = 0;
  let end = 0;
  while (start < original.length && start < updated.length && original[start] === updated[start]) start++;
  while (end < original.length - start && end < updated.length - start && original[original.length - 1 - end] === updated[updated.length - 1 - end]) end++;
  return [
    ...original.slice(Math.max(0, start - 3), start).map(line => `  ${line}`),
    ...original.slice(start, original.length - end).map(line => `- ${line}`),
    ...updated.slice(start, updated.length - end).map(line => `+ ${line}`),
    ...updated.slice(updated.length - end, updated.length - end + 3).map(line => `  ${line}`),
  ].join('\n');
}

/** 展示本机会话候选，供用户编辑、预览和确认写入。 */
export function WikiExperience({ sessionId, initialRecordId, initialRevision, embedded, browserOrigin, call, onClose }: Props) {
  const { t } = useTranslation();
  const [records, setRecords] = useState<ExperienceRecord[]>([]);
  const [record, setRecord] = useState<ExperienceRecord | null>(null);
  const recordRef = useRef<ExperienceRecord | null>(null);
  recordRef.current = record;
  const [data, setData] = useState<ExperienceData | null>(null);
  const [ticket, setTicket] = useState('');
  const [preview, setPreview] = useState<WikiPreview | null>(null);
  const [localReviewUrl, setLocalReviewUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [comparisonRunning, setComparisonRunning] = useState(false);
  const [job, setJob] = useState<WikiAnalysisJob | null>(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [connectionOutdated, setConnectionOutdated] = useState(false);
  const connectionOutdatedRef = useRef(false);
  const [models, setModels] = useState<WikiModel[]>([]);
  const [modelSelection, setModelSelection] = useState<WikiModelSelection | null>(null);
  const [modelError, setModelError] = useState('');

  // 读取已有审核记录；首次打开时由用户点击入口触发提取。
  const load = async () => {
    const result = await call('wiki/list', { sessionId }) as { records: ExperienceRecord[]; connectionOutdated?: boolean };
    connectionOutdatedRef.current = !!result.connectionOutdated;
    setConnectionOutdated(!!result.connectionOutdated);
    setRecords(result.records);
    return result.records;
  };
  useEffect(() => {
    let active = true;
    void load().then(async items => {
      // 先识别稳定的旧操作，再决定是否调用新增接口，避免向旧连接发送不支持的请求。
      const [progress, catalog] = connectionOutdatedRef.current ? [{ job: null }, null] : await Promise.all([
        call('wiki/progress', { sessionId }) as Promise<{ job: WikiAnalysisJob | null }>,
        (call('wiki/models', {}) as Promise<{ models: WikiModel[]; preference: WikiModelSelection | null }>).catch(reason => {
          if (active) setModelError(String(reason.message || reason));
          return null;
        }),
      ]);
      if (!active) return;
      const selected = selectWikiRecord(items, initialRecordId, initialRevision);
      setRecord(selected ?? null);
      setData(selected?.data ?? null);
      setJob(progress.job);
      if (catalog) {
        setModels(catalog.models);
        setModelSelection(progress.job && progress.job.status !== 'completed' ? progress.job.modelSelection ?? catalog.preference : catalog.preference);
      }
      setLoaded(true);
    }).catch(reason => {
      if (active) { setError(reason?.message === 'wiki.recordMissing' ? t('wiki.recordMissing') : reason?.message === 'wiki.recordChanged' ? t('wiki.recordChanged') : String(reason.message || reason)); setLoaded(true); }
    });
    return () => { active = false; };
  }, [sessionId, initialRecordId, initialRevision]);

  // 后台任务独立于弹窗；只读取状态，完成后再加载持久化候选。
  useEffect(() => {
    if (job?.status !== 'running') return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await call('wiki/progress', { sessionId }) as { job: WikiAnalysisJob | null };
        if (!active) return;
        if (result.job?.status === 'completed') {
          const items = await load();
          if (active && !initialRecordId && !recordRef.current) { const found = items.find(item => item.id === result.job?.recordId); if (found) choose(found); }
        }
        // 先加载并选中完成的候选，再切换任务状态，避免 effect 清理中断结果展示。
        if (active) setJob(result.job);
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : String(reason)); }
      if (active) timer = setTimeout(poll, 2000);
    };
    timer = setTimeout(poll, 1000);
    return () => { active = false; clearTimeout(timer); };
  }, [sessionId, initialRecordId, job?.id, job?.status]);

  // 服务端提取不依赖弹窗生命周期；其他操作串行执行并展示错误。
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };

  // 切换记录或修改内容时丢弃旧预览及其审核票据。
  const choose = (item: ExperienceRecord) => {
    setRecord(item);
    setData(item.data);
    setPreview(null);
    setTicket('');
    setLocalReviewUrl('');
    setError('');
  };
  const dirty = !!record && !!data && JSON.stringify(data) !== JSON.stringify(record.data);
  const set = (key: keyof ExperienceData, value: string) => {
    setData(current => current ? { ...current, [key]: value } : current);
    setPreview(null);
    setTicket('');
  };

  // 保存、预览和决策都使用实际读取的版本，批准只提交服务端票据。
  const make = async () => {
    await run(async () => {
      if (!modelSelection) throw new Error(t('wiki.chooseModel'));
      const result = await call('wiki/start', { sessionId, modelSelection }) as { job: WikiAnalysisJob };
      setJob(result.job);
      // 新任务已有独立历史，不继续展示旧候选，也不丢弃尚未保存的编辑。
      setRecord(null); setData(null); setPreview(null); setTicket(''); setLocalReviewUrl('');
    });
  };
  const reloadModels = () => run(async () => {
    const catalog = await call('wiki/models', {}) as { models: WikiModel[]; preference: WikiModelSelection | null };
    setModels(catalog.models); setModelError('');
  });
  const cancelAnalysis = () => run(async () => { await call('wiki/cancel', { sessionId }); });
  const save = () => run(async () => {
    const result = await call('wiki/update', { id: record!.id, revision: record!.revision, data }) as { record: ExperienceRecord };
    await load();
    choose(result.record);
  });
  const showPreview = () => run(async () => {
    const result = await call('wiki/preview', { id: record!.id, revision: record!.revision }) as { preview: WikiPreview; ticket: string };
    setPreview(result.preview);
    setTicket(result.ticket);
  });
  const compare = () => run(async () => {
    setComparisonRunning(true);
    try {
      const result = await call('wiki/compare', { id: record!.id, revision: record!.revision, ...(!record!.modelSelection && modelSelection ? { modelSelection } : {}) }) as { record: ExperienceRecord };
      await load();
      choose(result.record);
    } finally { setComparisonRunning(false); }
  });
  const reject = () => run(async () => {
    const result = await call('wiki/reject', { id: record!.id, revision: record!.revision, note: data!.reviewNote }) as { record: ExperienceRecord };
    await load();
    choose(result.record);
  });
  const openReview = () => run(async () => {
    // 嵌入式应用不持有写入权限；最终批准转到绑定浏览器会话的本地页面。
    const result = await call('wiki/open_review', { id: record!.id, revision: record!.revision }) as { url: string };
    setLocalReviewUrl(result.url);
  });
  const approve = () => run(async () => {
    const result = await call('wiki/approve', { ticket }) as { record: ExperienceRecord };
    await load();
    choose(result.record);
  });
  const flow = data?.workflow;
  const canCompare = !!flow && flow.stage === 'review' && flow.items.every(item => item.decision !== 'pending') && flow.items.some(item => item.decision === 'confirmed');
  const selectedModel = models.find(model => model.model === modelSelection?.model);
  const modelLocked = busy || job?.status === 'running';
  const validModelSelection = !!selectedModel && (selectedModel.supportedReasoningEfforts.length ? selectedModel.supportedReasoningEfforts.some(effort => effort.reasoningEffort === modelSelection?.reasoningEffort) : modelSelection?.reasoningEffort === null);
  const modelLabel = (selection: WikiModelSelection) => `${models.find(model => model.model === selection.model)?.displayName ?? selection.model}${selection.reasoningEffort ? ` · ${selection.reasoningEffort}` : ''}`;

  return <EditorDialog title={t('wiki.title')} description={t('wiki.description')} busy={false} error={error} onClose={onClose}>
    <div className="task-editor__body wiki-experience">
      {!loaded ? <p role="status">{t('wiki.loading')}</p> : <>
        <div className="wiki-toolbar">
          <div className="wiki-toolbar__intro"><span className="wiki-toolbar__icon"><Sparkles size={18} /></span><div><strong>{t('wiki.workspaceTitle')}</strong><p>{t('wiki.localHint')}</p></div></div>
          {comparisonRunning ? <button type="button" onClick={() => { void call('wiki/cancel', { sessionId }).catch(reason => setError(reason instanceof Error ? reason.message : String(reason))); }}>{t('wiki.cancelComparison')}</button> : job?.status === 'running' ? <button type="button" disabled={busy} onClick={cancelAnalysis}>{t('wiki.cancelAnalysis')}</button> : <button type="button" className="wiki-extract" disabled={busy || dirty || connectionOutdated || !validModelSelection} onClick={make}><Sparkles size={15} />{job?.status === 'failed' ? t('wiki.retryAnalysis') : t('wiki.extract')}</button>}
        </div>
        {!connectionOutdated && <div className="wiki-model-picker">
          <div className="wiki-model-picker__fields">
            <label><span>{t('wiki.analysisModel')}</span><SelectControl ariaLabel={t('wiki.analysisModel')} value={selectedModel?.model ?? ''} disabled={modelLocked || !models.length} groups={[{ options: [{ value: '', label: t('wiki.chooseModel') }, ...models.map(model => ({ value: model.model, label: model.displayName }))] }]} onValueChange={value => {
              const model = models.find(item => item.model === value);
              setModelSelection(model ? selectionForWikiModel(model, modelSelection) : null);
            }} /></label>
            <label><span>{t('wiki.reasoningEffort')}</span><SelectControl ariaLabel={t('wiki.reasoningEffort')} value={modelSelection?.reasoningEffort ?? ''} disabled={modelLocked || !selectedModel?.supportedReasoningEfforts.length} groups={[{ options: selectedModel?.supportedReasoningEfforts.length ? selectedModel.supportedReasoningEfforts.map(effort => ({ value: effort.reasoningEffort, label: effort.reasoningEffort })) : [{ value: '', label: t(selectedModel ? 'wiki.noReasoningEffort' : 'wiki.chooseModelFirst') }] }]} onValueChange={value => setModelSelection(current => current ? { ...current, reasoningEffort: value || null } : null)} /></label>
            <button type="button" disabled={modelLocked} onClick={reloadModels}>{t('wiki.refreshModels')}</button>
          </div>
          <p>{t('wiki.modelChoiceHint')}</p>
          {modelError && <p role="alert">{t('wiki.modelListFailed', { message: modelError })}</p>}
          {modelSelection && !validModelSelection && <p role="alert">{t('wiki.selectedModelUnavailable')}</p>}
          {job?.status === 'running' && job.modelSelection && <p>{t('wiki.runningModel', { model: modelLabel(job.modelSelection) })}</p>}
        </div>}
        <p className="wiki-scope-hint">{t('wiki.stagedHint')}</p>
        {connectionOutdated && <p className="wiki-scope-hint" role="status">{t('wiki.connectionOutdated')} <a href={`${browserOrigin}/#experience=${sessionId}`} target="_blank" rel="noreferrer">{t('wiki.continueInBrowser')}</a></p>}
        <p className="wiki-scope-hint">{t('wiki.scopeHint')}</p>
        {job?.status === 'running' && <p className="wiki-scope-hint" role="status">{job.phase === 'agent' ? t('wiki.agentProgress', { completed: job.completed, total: job.total }) : job.phase === 'chunks' ? t('wiki.chunkProgress', { completed: job.completed, total: job.total }) : job.phase === 'curate' ? t('wiki.curateProgress') : job.phase === 'verify' ? t('wiki.verifyProgress') : t(job.phase === 'merge' ? 'wiki.mergeProgress' : 'wiki.progress')}</p>}
        {job?.status === 'failed' && <p className="wiki-scope-hint" role="alert">{t(job.engine === 'native-codex-v1' ? 'wiki.agentFailed' : 'wiki.legacyAnalysisFailed', { message: job.error, completed: job.completed, total: job.total })}</p>}
        {job?.status === 'completed' && record && job.recordId !== record.id && <p className="wiki-scope-hint" role="status">{t('wiki.analysisCompleteHistory')}</p>}
        {job?.status === 'completed' && record && job.recordId === record.id && <p className="wiki-scope-hint" role="status">{t(job.engine === 'native-codex-v1' ? 'wiki.agentCoverageNotice' : 'wiki.coverageNotice', { total: job.total })}</p>}
        {job?.agent && <details className="wiki-sources wiki-agent-details">
          <summary>{t('wiki.agentDetails')}</summary>
          <p>{t('wiki.agentIsolationHint')}</p>
          {job.agent.threadId && <p>{t('wiki.agentThread')} <code>{job.agent.threadId}</code></p>}
          <p>{t('wiki.agentActivity', { time: new Date(job.agent.lastActivityAt).toLocaleString(), calls: job.agent.toolCalls, compactions: job.agent.compactions, attempt: job.agent.attempt })}</p>
          <p>{t('wiki.agentSnapshot')} <code>{job.snapshotHash?.slice(0, 16)}</code></p>
        </details>}
        {busy && <p className="note" role="status">{t('wiki.processing')}</p>}
        {records.length > 0 && <div className="wiki-history"><span>{t('wiki.history')}</span>
          <SelectControl ariaLabel={t('wiki.history')} value={record?.id ?? ''} disabled={busy} groups={[{ options: records.map(item => ({ value: item.id, label: `${new Date(item.createdAt).toLocaleString()} · ${t(`wiki.status.${item.status}`)}` })) }]} onValueChange={value => {
            const found = records.find(item => item.id === value);
            if (found) choose(found);
          }} />
        </div>}
        {!record && job?.status !== 'running' && <p className="muted">{t('wiki.empty')}</p>}
        {record && data && <>
          <div className="wiki-record-meta"><span className={`wiki-status wiki-status--${record.status}`}>{t(`wiki.status.${record.status}`)}</span><span>r{record.revision}</span>{(!flow || flow.stage === 'compared') && !data.changes.length && <span>{t('wiki.noChanges')}</span>}</div>
          <p className="wiki-model-used">{t('wiki.recordModel', { model: record.modelSelection ? modelLabel(record.modelSelection) : t('wiki.modelNotRecorded') })}{record.comparisonModelSelection && <><br />{t('wiki.comparisonModel', { model: modelLabel(record.comparisonModelSelection) })}</>}</p>
          {!flow && <p className="wiki-scope-hint">{t('wiki.legacyNotice')}</p>}
          {flow && <>
            <div className="wiki-steps"><span className="is-active">1 · {t('wiki.sessionStep')}</span><span className={flow.stage === 'compared' ? 'is-active' : ''}>2 · {t('wiki.compareStep')}</span><span className={preview ? 'is-active' : ''}>3 · {t('wiki.writeStep')}</span></div>
            {!preview && <>
              <ReviewSection label={t('wiki.sessionStep')} value={flow.sessionSummary} editable={false} onChange={() => {}} />
              <div className="wiki-section-heading"><Sparkles size={17} /><h3>{t('wiki.experienceItems')}</h3><span>{flow.items.length}</span></div>
              {!flow.items.length && <p className="wiki-scope-hint">{t('wiki.noExperiences')}</p>}
              {flow.stage === 'review' && flow.items.length > 0 && <p className="wiki-scope-hint">{t('wiki.saveDecisionsHint')}</p>}
              {flow.items.map((item, index) => <details className="wiki-card wiki-item" key={`${record.id}-${index}`} open={item.decision === 'pending'}>
                <summary className="wiki-card__header"><h3>{index + 1}. {item.title}</h3><span className={`wiki-item__state is-${item.decision}`}>{t(`wiki.decision.${item.decision}`)}</span></summary>
                {([['conclusion', 'wiki.summary'], ['scope', 'wiki.scope'], ['evidence', 'wiki.evidence'], ['unverified', 'wiki.unverified']] as const).map(([key, label]) => <details className="wiki-item__part" key={key} open={key === 'conclusion'}><summary>{t(label)}</summary><div className="wiki-markdown"><Markdown remarkPlugins={[remarkGfm]} components={{ img: ({ alt }) => <span>{alt || ''}</span> }}>{item[key] || t('wiki.emptyValue')}</Markdown></div></details>)}
                <label className="wiki-item__note">{t('wiki.itemNote')}<textarea value={item.note} disabled={busy || record.status !== 'pending' || flow.stage !== 'review'} onChange={event => { const value = event.target.value; setData(current => current?.workflow ? { ...current, workflow: { ...current.workflow, items: current.workflow.items.map((entry, n) => n === index ? { ...entry, note: value } : entry) } } : current); }} /></label>
                {flow.stage === 'review' && record.status === 'pending' && <div className="wiki-item__actions">{(['confirmed', 'excluded'] as const).map(decision => <button key={decision} type="button" aria-pressed={item.decision === decision} disabled={busy} onClick={() => setData(current => current?.workflow ? { ...current, workflow: { ...current.workflow, items: current.workflow.items.map((entry, n) => n === index ? { ...entry, decision } : entry) } } : current)}>{t(`wiki.action.${decision}`)}</button>)}</div>}
              </details>)}
            </>}
          </>}
          {(!flow || flow.stage === 'compared') && data.sources.length > 0 && <details className="wiki-sources"><summary><BookOpen size={15} />{t('wiki.sources')} <span>{data.sources.length}</span></summary><ul>{data.sources.map(source => <li key={source.path}>{source.path}</li>)}</ul></details>}
          {!preview ? <>
            {(!flow || flow.stage === 'compared') && <>{([['summary', 'wiki.summary'], ['scope', 'wiki.scope'], ['evidence', 'wiki.evidence'], ['unverified', 'wiki.unverified'], ['relation', 'wiki.relation'], ['reviewNote', 'wiki.reviewNote']] as const).map(([key, label]) =>
              <ReviewSection key={`${record.id}-${key}`} label={t(label)} value={data[key]} onChange={value => set(key, value)} editable={!busy && record.status === 'pending'} />)}
            <div className="wiki-section-heading"><BookOpen size={17} /><h3>{t('wiki.proposedHeading')}</h3><span>{data.changes.length}</span></div>
            {data.changes.map((item, index) => <ReviewSection key={`${record.id}-${item.path}`} label={item.path.startsWith('@vault/') ? t('wiki.vaultPath', { path: item.path.slice(7) }) : t('wiki.agentPath', { path: item.path })} document value={item.content} editable={!busy && record.status === 'pending' && item.path !== 'log.md' && item.path !== 'index.md' && item.path !== '@vault/20领域/50-业务域/客服知识库/_INDEX.md'} onChange={value => {
              setData(current => current ? { ...current, changes: current.changes.map((entry, n) => n === index ? { ...entry, content: value } : entry) } : current);
              setPreview(null);
              setTicket('');
            }} />)}</>}
          </> : <>
            <p className="note">{t('wiki.previewHint')}</p>
            {embedded && <p className="note">{t('wiki.localApprovalHint')}</p>}
            {localReviewUrl && <p className="note" role="status">{t('wiki.localApprovalOpened')} <code>{localReviewUrl}</code></p>}
            {preview.files.map(file => <details className="wiki-diff" key={file.path} open><summary>{file.path.startsWith('@vault/') ? t('wiki.vaultPath', { path: file.path.slice(7) }) : t('wiki.agentPath', { path: file.path })}</summary><pre>{diff(file.before, file.after)}</pre></details>)}
          </>}
        </>}
      </>}
    </div>
    {record && data && <footer className="task-editor__actions">
      {preview ? <>
        <button disabled={busy} onClick={() => { setPreview(null); setTicket(''); }}>{t('wiki.back')}</button>
        <button className="primary" disabled={busy} onClick={embedded ? openReview : approve}>{t(embedded ? 'wiki.openApproval' : 'wiki.approve')}</button>
      </> : record.status === 'pending' && <>
        <button className="danger" disabled={busy || dirty} onClick={reject}>{t('wiki.reject')}</button>
        <button disabled={busy || !dirty} onClick={save}>{t('wiki.save')}</button>
        {flow?.stage === 'review' ? <button className="primary" disabled={busy || dirty || !canCompare || (!record.modelSelection && !validModelSelection)} onClick={compare}>{t('wiki.startCompare')}</button> : <button className="primary" disabled={busy || dirty || !data.changes.length} onClick={showPreview}>{t('wiki.preview')}</button>}
      </>}
    </footer>}
  </EditorDialog>;
}
