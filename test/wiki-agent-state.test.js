import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/domain.ts';
import { dataDir } from '../src/paths.ts';

test('background threads stay outside snapshots after hooks, sync, and restart', t => {
 const dir=mkdtempSync(join(tmpdir(),'wiki-background-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 let store=new Store(join(dir,'db'));const ordinary=randomUUID(),background=randomUUID(),early=randomUUID();
 store.observe({session_id:ordinary,hook_event_name:'Stop',cwd:dir});
 store.observe({session_id:early,hook_event_name:'Stop',cwd:join(dataDir,'wiki-agent','tasks','test')});
 store.registerBackgroundSession(background,'job-1');
 store.observe({session_id:background,hook_event_name:'Stop',cwd:dir});
 store.syncCodexThreads([{id:background,title:'后台',cwd:dir,preview:'',state:'idle',projectId:null,updatedAt:new Date().toISOString()}],false);
 assert.deepEqual(store.sessions().map(s=>s.id),[ordinary]);store.close();
 store=new Store(join(dir,'db'));t.after(()=>store.close());assert.deepEqual(store.snapshot().sessions.map(s=>s.id),[ordinary]);
 assert.ok(store.isBackgroundSession(background,dir));assert.ok(!store.isBackgroundSession(ordinary,dir));
 const legacy=randomUUID();store.db.prepare('INSERT INTO sessions VALUES(?,?)').run(legacy,JSON.stringify({id:legacy,observedState:'idle'}));assert.ok(store.sessions().some(s=>s.id===legacy));
});
