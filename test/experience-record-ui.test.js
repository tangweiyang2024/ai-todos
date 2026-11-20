import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import zhCN from '../src/locales/zh-CN.ts';

const require = createRequire(import.meta.url);
const { I18nextProvider } = require('react-i18next');
const i18n = createInstance();
await i18n.init({ lng: 'zh-CN', resources: { 'zh-CN': { translation: zhCN } }, keySeparator: false });
function loadComponent(file, name) {
  const bundle = buildSync({ entryPoints: [file], bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external', jsx: 'automatic' }).outputFiles[0].text;
  const module = { exports: {} };
  new Function('module', 'require', bundle)(module, require);
  return module.exports[name];
}
const ExperienceCaptureButton = loadComponent('ui/components/ExperienceCaptureButton.tsx', 'ExperienceCaptureButton');

function buttons(records) {
  const component = createElement(ExperienceCaptureButton, { busy: false, session: { experienceRecords: records }, onClick() {} });
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n }, component));
}

test('card always offers a new capture and shows the number of existing records only when nonzero', () => {
  assert.match(buttons([]), /发起新沉淀/);
  assert.doesNotMatch(buttons([]), /查看沉淀记录/);
  for (const count of [1, 3]) {
    const markup = buttons(Array.from({ length: count }, (_, i) => ({ id: String(i) })));
    assert.match(markup, /发起新沉淀/);
    assert.ok(markup.includes(`查看沉淀记录（${count}）`));
  }
});

test('background extraction locks only the new capture action while history stays accessible', () => {
  const markup = buttons([{ id: 'current', preparation: { status: 'preparing' } }]);
  assert.match(markup, /<button[^>]*disabled[^>]*>.*?后台提取中<\/button>/);
  assert.match(markup, /<button(?:(?!disabled)[^>])*>[^]*?查看沉淀记录（1）<\/button>/);
});

test('the oldest unread finished run is selected even when its source has a newer capture', async () => {
  const { nextCaptureNotice } = await import('../ui/capture-notice.ts');
  const job = (id, updatedAt, unread) => ({ id, status: 'ready', modelSelection: { model: 'fixture' }, updatedAt, unread });
  const first = { id: 'first', preparation: job('first-job', '2026-11-18', true) };
  const latest = { id: 'latest', preparation: job('latest-job', '2026-11-20', true) };
  const source = { id: 'source', experiencePreparation: latest.preparation, experienceRecords: [latest, first] };
  const legacy = { id: 'legacy', experiencePreparation: job('legacy-job', '2026-11-19', true) };
  const next = () => nextCaptureNotice([legacy, source]);
  assert.equal(next().record.id, 'first');
  first.preparation.unread = false;
  assert.equal(next().preparation.id, 'legacy-job');
  legacy.experiencePreparation.unread = false;
  assert.equal(next().record.id, 'latest');
  latest.preparation.unread = false;
  assert.equal(next(), undefined);
});

test('both views show the scope and focus for a single capture before opening its conversation directly', () => {
  const at = '2026-11-19T09:00:00.000Z';
  const record = { id: 'past', createdAt: at, sourceCapturedAt: at, focus: '权限生效条件', experience: { threadId: 'chat', status: 'waiting', summary: '审核候选', updatedAt: at } };
  const session = { id: 'source', title: 'Test source', state: 'running', observedState: 'running', observedAt: at, source: 'codex-hook', event: 'PreToolUse', cwd: '/tmp', experienceRecords: [record], experience: record.experience };
  for (const [file, name] of [['SessionList', 'SessionList'], ['ExecutionView', 'BoardView']]) {
    const view = loadComponent(`ui/components/${file}.tsx`, name);
    const component = createElement(view, { busy: false, tasks: [], allTasks: [], sessions: [session], grouped: false, projects: [], onExperience() {} });
    const markup = renderToStaticMarkup(createElement(I18nextProvider, { i18n }, component));
    assert.ok(markup.includes('查看沉淀记录（1）'), name);
    assert.ok(markup.includes('权限生效条件'), name);
    assert.ok(markup.includes('提取范围：截至'), name);
    assert.ok(markup.includes('审核候选'), name);
  }
});

test('a no-knowledge completion describes the selected record even when a newer one has candidates', async () => {
  const { nextCaptureNotice } = await import('../ui/capture-notice.ts');
  const job = { status: 'ready', modelSelection: { model: 'fixture' }, updatedAt: '2026-11-19', unread: true };
  const source = { experience: { status: 'waiting' }, experienceRecords: [
    { id: 'newer', experience: { status: 'waiting' }, preparation: { ...job, updatedAt: '2026-11-20' } },
    { id: 'older', experience: { status: 'no_knowledge' }, preparation: job },
  ] };
  assert.equal(i18n.t(nextCaptureNotice([source]).descriptionKey), '本次无可沉淀经验');
  job.unread = false;
  assert.match(i18n.t(nextCaptureNotice([source]).descriptionKey), /进入即可审核/);
});
