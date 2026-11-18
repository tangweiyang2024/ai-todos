import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildSync } from 'esbuild';

// 只替换 React 渲染环境，在内存运行真实组件及事件，不调用用户服务。
const source = buildSync({ entryPoints: ['ui/components/SessionBatchDialog.tsx'], bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', write: false,
  external: ['react', 'react/jsx-runtime', 'react-i18next', '@radix-ui/react-dialog', 'lucide-react'],
}).outputFiles[0].text;
function harness(props) {
  const values = []; let index = 0;
  const useState = initial => { const slot = index++; if (!(slot in values)) values[slot] = typeof initial === 'function' ? initial() : initial; return [values[slot], next => { values[slot] = typeof next === 'function' ? next(values[slot]) : next; }]; };
  const useRef = initial => { const slot = index++; return values[slot] ??= { current: initial }; };
  const jsx = (type, props) => ({ type, props });
  const modules = { react: { useState, useRef }, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-i18next': { useTranslation: () => ({ t: key => key }) },
    '@radix-ui/react-dialog': new Proxy({}, { get: (_, key) => key }), 'lucide-react': new Proxy({}, { get: (_, key) => key }) };
  const context = { module: { exports: {} }, exports: {}, require: name => modules[name] || assert.fail(`Unexpected dependency: ${name}`), process, console, Buffer };
  context.exports = context.module.exports; vm.runInNewContext(source, context);
  const render = () => { index = 0; return context.module.exports.SessionBatchDialog(props); };
  const find = (node, match) => {
    if (!node) return;
    if (Array.isArray(node)) { for (const child of node) { const result = find(child, match); if (result) return result; } }
    else if (typeof node === 'object') { if (match(node)) return node; return find(node.props?.children, match); }
  };
  return {
    submit: () => find(render(), node => node.props?.className === 'session-batch__confirm').props.onClick(),
    refresh: () => find(render(), node => node.type === 'button' && node.props.children?.includes?.('batch.refreshState')).props.onClick(),
    text: () => JSON.stringify(render()),
  };
}
const sessions = ['a', 'b'].map(id => ({ id, title: id, state: 'interrupted', cwd: '/test', turnId: 'shown-turn' }));

test('partial completion followed by a successful retry reports the whole dialog success count and retains the failure reason', async () => {
  let failed = false; const finished = [], confirmed = [];
  const ui = harness({ sessions, onClose: () => {}, onFinished: count => finished.push(count), onRefresh: async () => sessions,
    onConfirm: async session => { confirmed.push(session.id); if (session.id === 'b' && !failed) { failed = true; throw Error('显示版本已变化，请刷新'); } return true; },
  });
  await ui.submit(); assert.deepEqual(finished, []); assert.ok(ui.text().includes('显示版本已变化，请刷新'));
  await ui.submit(); assert.deepEqual(confirmed, ['a', 'b', 'b']); assert.deepEqual(finished, [2]);
});

test('refreshing never auto-submits the new version and excludes sessions completed by someone else from its success count', async () => {
  let retry = false; const finished = [], confirmed = [];
  const ui = harness({ sessions, onClose: () => {}, onFinished: count => finished.push(count),
    onRefresh: async () => [{ ...sessions[0], archiveConfirmed: true, confirmedAt: '2026-11-18T00:00:00.000Z' }, { ...sessions[1], turnId: 'refreshed-turn' }],
    onConfirm: async session => { confirmed.push([session.id, session.turnId]); if (!retry) throw Error('会话已变化'); return true; },
  });
  await ui.submit(); await ui.refresh(); assert.deepEqual(confirmed, [['a', 'shown-turn'], ['b', 'shown-turn']]);
  retry = true; await ui.submit(); assert.deepEqual(confirmed.at(-1), ['b', 'refreshed-turn']); assert.deepEqual(finished, [1]);
});
