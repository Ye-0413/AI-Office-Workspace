'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createUsageApi } = require('../lib/usage-api.cjs');

function fixture(t, patch = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-usage-export-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const calls = [];
  const items = Array.from({ length: 405 }, (_, i) => ({ id: 'codex:actor-' + i, provider: 'codex',
    projectName: i === 0 ? '=WEBSERVICE("private")' : '工作室', activeMs: 12000, waitingMs: 3000,
    firstSeenAt: Date.parse('2026-10-16T16:00:00Z'), lastSeenAt: Date.parse('2026-10-16T16:01:00Z') }));
  const log = {
    status: () => ({ available: true, path: path.join(dir, 'usage.sqlite3') }),
    query: filters => { calls.push(filters); return { ok: true, total: items.length, items: items.slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 50)) }; },
    events: filters => { calls.push(filters); return { ok: true, total: 0, items: [] }; },
    ...patch.log,
  };
  const api = createUsageApi({ log, now: () => Date.parse('2026-10-16T16:00:00Z'),
    chooseExport: async () => ({ filePath: path.join(dir, 'export.csv') }), openFolder: async () => '', ...patch, log });
  return { api, dir, calls, log };
}

test('usage IPC filters reject invalid calendars, pagination, identities and SQL-shaped input', t => {
  const { api, calls } = fixture(t);
  for (const filters of [null, [], {from:'2026-02-30'}, {to:'2026-01-01',from:'2026-01-02'},
    {provider:"codex';DROP TABLE events"}, {role:'admin'}, {offset:-1}, {limit:201}, {limit:NaN}, {offset:1.2}]) {
    assert.throws(() => api.history(filters), /Invalid usage/);
  }
  assert.throws(() => api.events({ id: 'x\n' }), /Invalid usage/);
  assert.throws(() => api.events({}), /Invalid usage/);
  assert.equal(calls.length, 0);
  api.history({ from:'2024-02-29', role:'helper', provider:'claude-code', offset:2, limit:20, sql:'ignored' });
  assert.deepEqual(calls[0], {from:'2024-02-29',provider:'claude-code',role:'helper',offset:2,limit:20});
  const longId='codex:'+encodeURIComponent('影'.repeat(256));
  api.events({id:longId}); assert.equal(calls[1].id,longId,'canonical Unicode identities retain timeline access');
});

test('CSV export includes every filtered page, uses Hong Kong dates and neutralizes formulas', async t => {
  const { api, dir, calls } = fixture(t);
  const result = await api.export({ provider:'codex',role:'helper',from:'2026-10-17',offset:400,limit:1 });
  assert.equal(result.exported, true); assert.equal(result.rows, 405);
  assert.deepEqual(calls.map(x => x.offset), [0, 200, 400]);
  assert.ok(calls.every(x => x.provider === 'codex' && x.role === 'helper' && x.from === '2026-10-17'));
  const csv = fs.readFileSync(path.join(dir,'export.csv'),'utf8');
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /2026-10-17 00:00:00 \+08:00/);
  assert.ok(csv.includes('"\'=WEBSERVICE(""private"")"'));
  assert.ok(csv.includes('"codex:actor-404"'));
  assert.match(csv, /"12","3"/);
  assert.equal(fs.statSync(result.path).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(dir), ['export.csv']);
});

test('canceling export creates no file and a failed page preserves the existing destination', async t => {
  const canceled = fixture(t, { chooseExport: async () => ({canceled:true}) });
  assert.deepEqual(await canceled.api.export({}), {canceled:true});
  assert.deepEqual(fs.readdirSync(canceled.dir), []);
  const failed = fixture(t, { log: { query: () => { throw new Error('disk read failure'); } } });
  const file = path.join(failed.dir,'export.csv'); fs.writeFileSync(file,'previous report');
  await assert.rejects(failed.api.export({}), /disk read failure/);
  assert.equal(fs.readFileSync(file,'utf8'),'previous report');
  assert.deepEqual(fs.readdirSync(failed.dir), ['export.csv']);
});

test('CSV export refuses symlink destinations and concurrent native save dialogs', async t => {
  const {api,dir} = fixture(t);
  const target = path.join(dir,'private'); fs.writeFileSync(target,'untouched');
  fs.symlinkSync(target,path.join(dir,'export.csv'));
  await assert.rejects(api.export({}), /Unsafe usage export destination/);
  assert.equal(fs.readFileSync(target,'utf8'),'untouched');
  let finish, choices = 0;
  const busy = fixture(t,{chooseExport:() => ++choices === 1 ? new Promise(resolve => {finish=resolve;}) : Promise.resolve({canceled:true})});
  const first = busy.api.export({});
  await assert.rejects(busy.api.export({}), /already open/);
  finish({canceled:true}); await first;
  assert.deepEqual(await busy.api.export({}), {canceled:true});
});

test('opening the log folder uses only the internal data path and surfaces failures', async t => {
  let opened;
  const {api,dir} = fixture(t,{openFolder:async value => {opened=value;return '';}});
  assert.deepEqual(await api.openFolder(),{opened:true}); assert.equal(opened,dir);
  const failed = fixture(t,{openFolder:async () => 'denied'});
  await assert.rejects(failed.api.openFolder(), /Could not open/);
  const unavailable = fixture(t,{log:{status:()=>({available:false,error:'unavailable'})}});
  await assert.rejects(unavailable.api.export({}), /unavailable/);
  await assert.rejects(unavailable.api.openFolder(), /unavailable/);
});
