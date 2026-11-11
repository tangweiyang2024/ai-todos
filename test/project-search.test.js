import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProjects } from '../ui/project-search.ts';

test('project search matches partial names case-insensitively and ignores surrounding spaces', () => {
  const projects = [{ id: '1', title: 'kcard' }, { id: '2', title: 'Market-App' }, { id: '3', title: '鸿鹄权益' }];
  assert.deepEqual(filterProjects(projects, '  CARD ').map(p => p.id), ['1']);
  assert.deepEqual(filterProjects(projects, 'app').map(p => p.id), ['2']);
  assert.deepEqual(filterProjects(projects, '权益').map(p => p.id), ['3']);
  assert.deepEqual(filterProjects(projects, '').map(p => p.id), ['1', '2', '3']);
  assert.deepEqual(filterProjects(projects, 'missing'), []);
});
