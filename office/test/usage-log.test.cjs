'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createUsageLog } = require('../lib/usage-log.cjs');
const { createSessionStore } = require('../lib/session-store.cjs');
const { actorKey } = require('../lib/provider-events.cjs');
function fixture(t, options = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-usage-'));
  let time = Date.parse('2026-10-16T07:00:00Z'), seq = 0;
  const logs = [], now = () => time;
  const create = () => { const log = createUsageLog({ dataDir, now, ...options }); logs.push(log); return log; };
  const event = (extra = {}) => ({ provider: 'codex', sessionId: 'session', event: 'turn-start', turnId: 'turn', eventId: `e${++seq}`, at: time, activity: 'planning', evidence: { source: 'hook', kind: 'native' }, ...extra });
  t.after(() => { for (const log of logs) log.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  return { dataDir, dir: path.join(dataDir, 'usage-history'), file: path.join(dataDir, 'usage-history', 'usage.sqlite3'), create, now, event, set: value => { time = typeof value === 'number' ? value : Date.parse(value); }, tick: ms => { time += ms; }, snapshot: (e, extra = {}) => ({ id: actorKey(e.provider, e.sessionId, e.subagentId), provider: e.provider, lastEventAt: e.at, status: 'active', activity: e.activity, projectName: 'office', ...(e.parentId ? { parentId: e.parentId } : {}), ...extra }) };
}
function connect(f, log) {
  const store = createSessionStore({ now: f.now, staleMs: 180000 });
  store.onAccepted(event => log.record(event, store.snapshot()));
  return { store, ingest(extra) { const event = f.event(extra); assert.equal(store.ingest(event), true); return event; } };
}
test('accepted metadata is durable, atomically summarized and duplicate-resistant across restart', t => {
  const f = fixture(t), log = f.create(), e = f.event();
  assert.equal(log.status().available, true);
  assert.equal(log.record(e, [f.snapshot(e)]), true);
  f.tick(500); const end = f.event({ event: 'turn-end', at: f.now() - 100 });
  assert.equal(log.record(end, [f.snapshot(end, { status: 'idle', activity: 'idle' })]), true);
  assert.equal(log.query().totals.activeMs, 400);
  assert.equal(log.close(), true); f.tick(60000);
  const second = f.create(); assert.equal(second.record(e, [f.snapshot(e)]), false);
  const result = second.query();
  assert.equal(result.ok, true); assert.equal(result.scope, 'observed'); assert.equal(result.timeZone, 'Asia/Hong_Kong');
  assert.deepEqual(result.totals, { agents: 1, roots: 1, helpers: 0, events: 2, turns: 1, toolCalls: 0, failures: 0, activeMs: 400, waitingMs: 0 });
  assert.equal(second.events({ id: 'codex:session' }).total, 2);
  assert.equal(second.query().items[0].activityMs.planning, 400);
});
test('short turn duration uses its real terminal timestamp and never the later heartbeat', t => {
  const f = fixture(t), log = f.create(), { store, ingest } = connect(f, log);
  ingest({ event: 'turn-start' }); f.tick(70);
  ingest({ event: 'activity', activity: 'coding', at: f.now() - 20 }); f.tick(50);
  ingest({ event: 'turn-end', activity: 'idle', at: f.now() - 10 });
  f.tick(10000); log.reconcile(store.snapshot());
  const item = log.query().items[0];
  assert.equal(item.activeMs, 90); assert.deepEqual(item.activityMs, { planning: 50, coding: 40 });
});
test('parallel tools meter one actor, wait-for-tool and wait-for-user have separate activity buckets', t => {
  const f = fixture(t), log = f.create(), { store, ingest } = connect(f, log);
  ingest({}); f.tick(1000);
  ingest({ event: 'tool-start', toolCallId: 'a', toolName: 'exec', activity: 'running' }); f.tick(1000);
  ingest({ event: 'tool-start', toolCallId: 'b', toolName: 'read', activity: 'reading' }); f.tick(1000);
  ingest({ event: 'turn-end', activity: 'planning' }); f.tick(1000);
  ingest({ event: 'tool-end', toolCallId: 'a', outcome: 'success' }); f.tick(1000);
  ingest({ event: 'tool-end', toolCallId: 'b', outcome: 'success' }); f.tick(1000);
  log.reconcile(store.snapshot());
  const first = log.query().items[0];
  assert.equal(first.activeMs, 3000); assert.equal(first.waitingMs, 2000); assert.equal(first.toolCalls, 2); assert.equal(first.turns, 1);
  ingest({ event: 'turn-start', turnId: 'second' }); f.tick(1000);
  ingest({ event: 'waiting-user', turnId: 'second', toolCallId: 'ask', toolName: 'request_user_input', activity: 'waiting-user' }); f.tick(2000);
  ingest({ event: 'tool-end', turnId: 'second', toolCallId: 'ask', outcome: 'success' }); f.tick(1000);
  ingest({ event: 'interrupted', turnId: 'second' });
  const second = log.query().items[0];
  assert.equal(second.activeMs, 5000); assert.equal(second.waitingMs, 4000); assert.equal(second.activityMs['waiting-user'], 2000); assert.equal(second.activityMs['waiting-tool'], 2000);
});
test('Hong Kong midnight splits duration while event filtering preserves the original event date', t => {
  const f = fixture(t), log = f.create(); f.set('2026-10-16T15:59:59Z');
  const start = f.event(); log.record(start, [f.snapshot(start)]); f.tick(2000);
  const end = f.event({ event: 'turn-end' }); log.record(end, [f.snapshot(end, { status: 'idle', activity: 'idle' })]);
  const before = log.query({ from: '2026-10-16', to: '2026-10-16' }), after = log.query({ from: '2026-10-17', to: '2026-10-17' });
  assert.equal(before.totals.activeMs, 1000); assert.equal(after.totals.activeMs, 1000);
  assert.equal(before.totals.events, 1); assert.equal(after.totals.events, 1);
  assert.equal(log.events({ id: 'codex:session', from: '2026-10-17' }).items[0].at, end.at);
});
test('shutdown flushes observed time but restart and old rollout attachment never backfill offline work', t => {
  const f = fixture(t), log = f.create(), e = f.event(); log.record(e, [f.snapshot(e)]); f.tick(1000); log.close();
  f.tick(86400000); const next = f.create(); assert.equal(next.query().totals.activeMs, 1000);
  next.reconcile([]); assert.equal(next.query().totals.activeMs, 1000);
  const old = f.event({ sessionId: 'replayed', at: f.now() - 86400000, evidence: { source: 'codex-jsonl', restored: true }, turnStartedAt: f.now() - 90000000 });
  next.record(old, [f.snapshot(old)]); f.tick(5000); next.reconcile([f.snapshot(old)]);
  assert.equal(next.query().totals.activeMs, 1000);
});
test('stale cap and missing snapshots end accumulation without inventing completion', t => {
  const f = fixture(t, { staleMs: 1000 }), log = f.create(), e = f.event(); log.record(e, [f.snapshot(e)]);
  f.tick(3000); log.reconcile([f.snapshot(e, { status: 'stale', activity: 'unknown' })]);
  assert.equal(log.query().totals.activeMs, 1000); assert.equal(log.query().items[0].status, 'stale');
  f.tick(1000); log.reconcile([]); f.tick(5000); log.close();
  const next = f.create(); assert.equal(next.query().totals.activeMs, 1000);
  assert.equal(next.events({ id: 'codex:session' }).items.some(e => e.event === 'turn-end'), false);
});
test('system clock rollback and future evidence cannot create overlapping or inflated intervals', t => {
  const f = fixture(t), log = f.create(), e = f.event(), initial = f.now(); log.record(e, [f.snapshot(e)]);
  f.tick(1000); log.reconcile([f.snapshot(e)]); f.set(initial - 1000); log.reconcile([f.snapshot(e)]);
  f.set(initial + 2000); log.reconcile([f.snapshot(e)]); assert.equal(log.query().totals.activeMs, 2000);
  const future = f.event({ sessionId: 'future', at: f.now() + DAY });
  log.record(future, [f.snapshot(e), f.snapshot(future)]); f.tick(1000); log.reconcile([f.snapshot(e), f.snapshot(future)]);
  assert.equal(log.query().items.find(i => i.id === 'codex:future').activeMs, 0);
});
const DAY = 86400000;
test('late parent evidence upgrades family classification without duplicating actor usage', t => {
  const f = fixture(t), log = f.create(), e = f.event(); log.record(e, [f.snapshot(e)]);
  f.tick(1000); const meta = f.event({ event: 'metadata', parentId: 'codex:parent' }); log.record(meta, [f.snapshot(meta)]);
  const helper = f.event({ subagentId: 'nested' }); log.record(helper, [f.snapshot(meta), f.snapshot(helper)]);
  assert.equal(log.query({ role: 'root' }).total, 0);
  assert.equal(log.query({ role: 'helper' }).total, 2);
  assert.equal(log.query().items.find(i => i.id === 'codex:session').parentId, 'codex:parent');
});
test('stable canonical fingerprint ignores sensitive and unordered input fields', t => {
  const f = fixture(t), log = f.create();
  const e = f.event({ eventId: undefined, prompt: 'SECRET PROMPT', title: 'SECRET TITLE', summary: 'SECRET SUMMARY', input: 'SECRET INPUT', output: 'SECRET OUTPUT', projectPath: '/SECRET/PATH' });
  assert.equal(log.record(e, [f.snapshot(e)]), true);
  assert.equal(log.record({ summary: 'CHANGED SECRET', ...e, evidence: { kind: 'native', source: 'hook', prompt: 'SECRET EVIDENCE' } }, [f.snapshot(e)]), false);
  log.close(); const next = f.create(); assert.equal(next.record({ ...e, title: 'different' }, [f.snapshot(e)]), false); next.close();
  for (const name of fs.readdirSync(f.dir)) assert.equal(fs.readFileSync(path.join(f.dir, name)).includes(Buffer.from('SECRET')), false);
});
test('date/provider/family filters, pagination and event ordering are stable and bounded', t => {
  const f = fixture(t), log = f.create();
  for (let i = 0; i < 6; i++) { f.tick(1000); const e = f.event({ provider: i % 2 ? 'cursor' : 'codex', sessionId: String(i), ...(i === 4 ? { parentId: 'codex:0' } : {}) }); log.record(e, [f.snapshot(e)]); }
  assert.equal(log.query({ provider: 'codex' }).total, 3); assert.equal(log.query({ provider: 'codex', role: 'helper' }).total, 1);
  const all = log.query().items.map(i => i.id), page = log.query({ offset: 2, limit: 2 }); assert.equal(page.total, 6); assert.deepEqual(page.items.map(i => i.id), all.slice(2, 4));
  assert.equal(log.query({ from: '2026-10-17' }).total, 0);
  const e = f.event({ sessionId: '5', provider: 'cursor', event: 'tool-start', toolCallId: 'tool', outcome: 'failure' }); log.record(e, [f.snapshot(e)]);
  assert.equal(log.query({ provider: 'cursor' }).totals.failures, 1);
  const events = log.events({ id: 'cursor:5', limit: 1 }); assert.equal(events.total, 2); assert.equal(events.items[0].event, 'tool-start');
  for (const bad of [{ limit: 201 }, { offset: -1 }, { role: 'bad' }, { from: '2026-02-30' }, { from: '2026-10-18', to: '2026-10-17' }, { provider: 'bad provider' }]) assert.throws(() => log.query(bad), TypeError);
  assert.throws(() => log.events({}), TypeError);
});
test('private directory and every SQLite file have restrictive permissions; symlink destinations are refused', t => {
  const f = fixture(t), log = f.create(), e = f.event(); log.record(e, [f.snapshot(e)]);
  assert.equal(fs.statSync(f.dir).mode & 0o777, 0o700);
  for (const name of fs.readdirSync(f.dir)) assert.equal(fs.statSync(path.join(f.dir, name)).mode & 0o777, 0o600);
  log.close(); const outside = path.join(f.dataDir, 'outside'); fs.writeFileSync(outside, 'DO NOT CHANGE'); fs.unlinkSync(f.file); fs.symlinkSync(outside, f.file);
  const unsafe = f.create(); assert.equal(unsafe.status().available, false); assert.equal(unsafe.record(e, [f.snapshot(e)]), false); assert.equal(fs.readFileSync(outside, 'utf8'), 'DO NOT CHANGE');
});
test('directory and sidecar symlinks are refused and write errors stay visible without crashing observers', t => {
  const f = fixture(t), log = f.create(), e = f.event(); log.record(e, [f.snapshot(e)]); log.close();
  const target = path.join(f.dataDir, 'outside'); fs.mkdirSync(target); fs.renameSync(f.dir, f.dir + '-saved'); fs.symlinkSync(target, f.dir);
  const badDir = f.create(); assert.equal(badDir.status().available, false); assert.equal(badDir.query().ok, false); fs.unlinkSync(f.dir); fs.renameSync(f.dir + '-saved', f.dir);
  const sidecar = path.join(f.dataDir, 'sidecar'); fs.writeFileSync(sidecar, 'PRIVATE'); fs.symlinkSync(sidecar, f.file + '-wal');
  const badSidecar = f.create(); assert.equal(badSidecar.status().available, false); assert.equal(fs.readFileSync(sidecar, 'utf8'), 'PRIVATE'); fs.unlinkSync(f.file + '-wal');
  const live = f.create(); const moved = f.dir + '-moved'; fs.renameSync(f.dir, moved); fs.mkdirSync(f.dir);
  assert.doesNotThrow(() => live.record(f.event(), [])); assert.equal(live.status().available, false); assert.match(live.status().error, /failed/); assert.equal(live.query().ok, false);
  live.close(); fs.rmSync(f.dir, { recursive: true }); fs.renameSync(moved, f.dir);
});
test('corrupt database remains untouched and a failed atomic transaction leaves no half event', t => {
  const f = fixture(t); fs.mkdirSync(f.dir, { mode: 0o700 }); fs.writeFileSync(f.file, 'not a SQLite database', { mode: 0o600 });
  const bad = f.create(); assert.equal(bad.status().available, false); assert.equal(bad.query().ok, false); assert.equal(fs.readFileSync(f.file, 'utf8'), 'not a SQLite database');
  fs.unlinkSync(f.file); const log = f.create(), db = new DatabaseSync(f.file); db.exec("CREATE TRIGGER fail_summary BEFORE INSERT ON actor_days BEGIN SELECT RAISE(ABORT,'write failure'); END");
  const e = f.event(); assert.equal(log.record(e, [f.snapshot(e)]), false); assert.equal(log.status().events, 0); assert.equal(log.status().agents, 0); assert.equal(log.status().available, false);
  db.exec('DROP TRIGGER fail_summary'); db.close(); assert.equal(log.record(e, [f.snapshot(e)]), true); assert.equal(log.status().available, true); assert.equal(log.status().events, 1);
});
test('older accepted evidence and rereads never downgrade the latest archived reducer state', t => {
  const f = fixture(t), log = f.create(), e = f.event(); log.record(e, [f.snapshot(e)]); f.tick(1000);
  const end = f.event({ event: 'turn-end' }); log.record(end, [f.snapshot(end, { status: 'idle', activity: 'idle' })]);
  const old = f.event({ event: 'metadata', at: e.at - 1000, turnId: 'ancient', parentId: 'codex:root' });
  log.record(old, [f.snapshot(old)]); log.reconcile([f.snapshot(old)]);
  const item = log.query().items[0];
  assert.equal(item.lastSeenAt, end.at); assert.equal(item.status, 'idle'); assert.equal(item.activity, 'idle'); assert.equal(item.parentId, 'codex:root');
  assert.equal(item.turns, 1);
  f.tick(1000); log.reconcile([f.snapshot(old)]); assert.equal(log.query().totals.activeMs, 1000);
});
test('discovery and metadata are archived without fabricating work turns or tool calls', t => {
  const f = fixture(t), log = f.create();
  for (const type of ['session-start', 'metadata', 'session-end']) { const e = f.event({ event: type, turnId: 'mentioned-only', toolCallId: 'mentioned-only' }); log.record(e, [f.snapshot(e, { status: 'idle', activity: 'idle' })]); }
  const item = log.query().items[0]; assert.equal(item.events, 3); assert.equal(item.turns, 0); assert.equal(item.toolCalls, 0); assert.equal(item.activeMs, 0);
});
test('querying and paginated exports do not integrate or otherwise mutate observed duration', t => {
  const f = fixture(t), log = f.create(), e = f.event(); log.record(e, [f.snapshot(e)]); f.tick(1000); log.reconcile([f.snapshot(e)]); f.tick(10000);
  for (let i = 0; i < 4; i++) { assert.equal(log.query().totals.activeMs, 1000); assert.equal(log.events({ id: 'codex:session' }).total, 1); }
  log.reconcile([f.snapshot(e)]); assert.equal(log.query().totals.activeMs, 11000);
});
test('crash loses only uncheckpointed duration; committed events and deduplication survive', t => {
  const { spawnSync } = require('node:child_process');
  const f = fixture(t), entry = path.resolve(__dirname, '../lib/usage-log.cjs'), at = f.now();
  const code = `const {createUsageLog}=require(${JSON.stringify(entry)});let time=${at};const log=createUsageLog({dataDir:${JSON.stringify(f.dataDir)},now:()=>time});const event={provider:'codex',sessionId:'crash',event:'turn-start',eventId:'saved',turnId:'t',at:time,activity:'coding'};const sessions=[{id:'codex:crash',lastEventAt:time,status:'active',activity:'coding'}];if(!log.record(event,sessions))process.exit(2);time+=5000;log.reconcile(sessions);time+=3000;process.exit(0);`;
  const run = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8' }); assert.equal(run.status, 0, run.stderr);
  f.tick(86400000); const restored = f.create(); assert.equal(restored.query().totals.activeMs, 5000); assert.equal(restored.status().events, 1);
  assert.equal(restored.record({ provider: 'codex', sessionId: 'crash', event: 'turn-start', eventId: 'saved', turnId: 't', at, activity: 'coding' }, []), false);
  assert.equal(restored.query().totals.activeMs, 5000);
});
test('a replaced database inode is rejected instead of silently writing an unlinked archive', t => {
  const f = fixture(t), log = f.create(), e = f.event(); log.record(e, [f.snapshot(e)]);
  fs.renameSync(f.file, f.file + '.old'); fs.writeFileSync(f.file, 'replacement', { mode: 0o600 });
  assert.equal(log.record(f.event(), [f.snapshot(e)]), false); assert.equal(log.status().available, false); assert.equal(fs.readFileSync(f.file, 'utf8'), 'replacement');
});
test('a delayed terminal event corrects duration already credited by the most recent heartbeat', t => {
  const f = fixture(t), log = f.create(), e = f.event(), initial = f.now(); log.record(e, [f.snapshot(e)]);
  f.tick(1000); log.reconcile([f.snapshot(e)]); assert.equal(log.query().totals.activeMs, 1000);
  f.tick(500); const end = f.event({ event: 'turn-end', at: initial + 500 });
  log.record(end, [f.snapshot(end, { status: 'idle', activity: 'idle' })]);
  assert.equal(log.query().totals.activeMs, 500); assert.equal(log.query().items[0].activityMs.planning, 500);
});
test('observer clock failures are explicit and do not escape callbacks or fabricate intervals', t => {
  const f = fixture(t); let failed = false;
  const log = createUsageLog({ dataDir: f.dataDir, now: () => { if (failed) throw new Error('clock unavailable'); return f.now(); } });
  t.after(() => log.close()); const e = f.event(); log.record(e, [f.snapshot(e)]); failed = true;
  assert.doesNotThrow(() => log.record(f.event(), [f.snapshot(e)])); assert.equal(log.status().available, false); assert.match(log.status().error, /clock failed/);
  assert.doesNotThrow(() => log.reconcile([f.snapshot(e)])); assert.doesNotThrow(() => log.close());
});
test('native protocols may reuse the same call ID in separate turns without losing tool or failure counts', t => {
  const f = fixture(t), log = f.create(), { store, ingest } = connect(f, log);
  for (const turnId of ['first', 'second']) {
    ingest({ event: 'turn-start', turnId }); f.tick(10);
    ingest({ event: 'tool-start', turnId, toolCallId: 'reusable', toolName: 'exec', activity: 'running', outcome: 'failure' }); f.tick(10);
    ingest({ event: 'activity', turnId, toolCallId: 'reusable', activity: 'error', outcome: 'failure' }); f.tick(10);
    ingest({ event: 'tool-end', turnId, toolCallId: 'reusable', outcome: 'failure' }); f.tick(10);
    ingest({ event: 'turn-end', turnId }); f.tick(10);
  }
  log.reconcile(store.snapshot()); const item = log.query().items[0];
  assert.equal(item.turns, 2); assert.equal(item.toolCalls, 2); assert.equal(item.failures, 2);
});
test('ID-less turn generations persist for result correlation and rotate at the next real turn start', t => {
  const f = fixture(t), first = f.create();
  const start = f.event({ event: 'turn-start', turnId: undefined }); first.record(start, [f.snapshot(start)]);
  const tool = f.event({ event: 'tool-start', turnId: undefined, toolCallId: 'same', outcome: 'failure' }); first.record(tool, [f.snapshot(tool)]); first.close();
  const next = f.create(); const result = f.event({ event: 'tool-end', turnId: undefined, toolCallId: 'same', outcome: 'failure' }); next.record(result, [f.snapshot(result)]);
  const second = f.event({ event: 'turn-start', turnId: undefined }); next.record(second, [f.snapshot(second)]);
  const wait = f.event({ event: 'waiting-user', turnId: undefined, toolCallId: 'same' }); next.record(wait, [f.snapshot(wait, { status: 'waiting', activity: 'waiting-user' })]);
  const result2 = f.event({ event: 'tool-end', turnId: undefined, toolCallId: 'same', outcome: 'failure' }); next.record(result2, [f.snapshot(result2)]);
  const item = next.query().items[0]; assert.equal(item.turns, 2); assert.equal(item.toolCalls, 2); assert.equal(item.failures, 2);
});
test('metadata and closed lifecycle records do not invent failed calls; uncorrelated errors remain separate facts', t => {
  const f = fixture(t), log = f.create();
  for (const type of ['metadata', 'session-start', 'session-end', 'subagent-end']) { const e = f.event({ event: type, outcome: 'failure', toolCallId: 'metadata-only' }); log.record(e, [f.snapshot(e, { status: 'closed', activity: 'idle' })]); }
  assert.equal(log.query().totals.toolCalls, 0); assert.equal(log.query().totals.failures, 0);
  for (let i = 0; i < 2; i++) { const e = f.event({ event: 'error', toolCallId: undefined, outcome: 'failure' }); log.record(e, [f.snapshot(e)]); }
  assert.equal(log.query().totals.failures, 2);
});


// Assert the actual accepted callback's result outside SessionStore, whose
// listener isolation intentionally catches observer errors.
function observedUsage(f, log, storeOptions = {}) {
  const store = createSessionStore({ now: f.now, staleMs: 180000, ...storeOptions }), writes = [];
  store.onAccepted(event => writes.push(log.record(event, store.snapshot())));
  return { store, writes, ingest(extra) {
    const event = f.event({ evidence: { source: 'codex-jsonl', kind: 'native' }, ...extra });
    const before = writes.length;
    assert.equal(store.ingest(event), true, `accepted ${event.sessionId}:${event.event}`);
    assert.equal(writes.length, before + 1, 'one archive transaction per accepted fact');
    assert.equal(writes.at(-1), true, 'the accepted fact reached SQLite');
    return event;
  } };
}
for (const waiting of [false, true]) {
  for (const trigger of ['reconcile', 'current event', 'delayed unrelated event']) {
    test(`${waiting ? 'waiting' : 'active'} stale cap is independent of ${trigger} and survives restart`, t => {
      const f = fixture(t), log = f.create(), { store, writes, ingest } = observedUsage(f, log), base = f.now();
      ingest({ sessionId: 'A' });
      ingest({ sessionId: 'B' });
      if (waiting) ingest({ sessionId: 'B', event: 'waiting-user', toolCallId: 'question', toolName: 'request_user_input', activity: 'waiting-user' });
      const id = 'codex:B', before = () => log.query().items.find(item => item.id === id);
      f.set(base + 179900);
      assert.equal(log.reconcile(store.snapshot()), true);
      assert.equal(before()[waiting ? 'waitingMs' : 'activeMs'], 179900);
      f.set(base + 180100);
      let incoming;
      if (trigger === 'reconcile') assert.equal(log.reconcile(store.snapshot()), true);
      else {
        incoming = ingest({ sessionId: 'A', event: 'tool-start', toolCallId: 'test', toolName: 'exec_command', activity: 'testing', at: base + (trigger === 'current event' ? 180100 : 179500) });
        const a = store.snapshot().find(row => row.id === 'codex:A');
        assert.equal(a.status, 'active'); assert.equal(a.activity, 'testing'); assert.equal(a.activeTools, 1);
        assert.equal(a.lastEventAt, incoming.at);
        const count = writes.length;
        assert.equal(store.ingest(incoming), false);
        assert.equal(writes.length, count, 'duplicate evidence does not emit a new archive fact');
        assert.equal(log.record(incoming, store.snapshot()), false);
      }
      const b = store.snapshot().find(row => row.id === id);
      assert.equal(b.status, 'stale'); assert.equal(b.activity, 'unknown'); assert.equal(b.lastEventAt, base);
      const expected = { activeMs: waiting ? 0 : 180000, waitingMs: waiting ? 180000 : 0, events: waiting ? 2 : 1, turns: 1, toolCalls: waiting ? 1 : 0, failures: 0 };
      const check = archive => {
        const item = archive.query().items.find(row => row.id === id);
        for (const [key, value] of Object.entries(expected)) assert.equal(item[key], value, `${id} ${key}`);
        assert.deepEqual(item.activityMs, { [waiting ? 'waiting-user' : 'planning']: 180000 });
        assert.equal(item.status, 'stale'); assert.equal(item.activity, 'unknown'); assert.equal(item.lastSeenAt, base);
        assert.equal(archive.events({ id }).items.some(event => ['turn-end', 'interrupted', 'session-end', 'subagent-end', 'error'].includes(event.event)), false);
      };
      check(log);
      f.tick(5000); assert.equal(log.reconcile(store.snapshot()), true); check(log);
      assert.equal(log.close(), true); f.tick(60000);
      const restored = f.create(); check(restored);
      assert.equal(restored.reconcile(store.snapshot()), true); check(restored);
    });
  }
}
test('an unrelated delayed event preserves both Hong Kong dates of a stale interval', t => {
  const f = fixture(t); f.set('2026-10-16T15:58:00Z');
  const log = f.create(), { store, ingest } = observedUsage(f, log), base = f.now();
  ingest({ sessionId: 'A' }); ingest({ sessionId: 'B' });
  f.set(base + 179900); assert.equal(log.reconcile(store.snapshot()), true);
  f.set(base + 180100);
  ingest({ sessionId: 'A', event: 'tool-start', toolCallId: 'test', toolName: 'exec_command', activity: 'testing', at: base + 179500 });
  const check = archive => {
    for (const [day, ms] of [['2026-10-16', 120000], ['2026-10-17', 60000]]) {
      const item = archive.query({ from: day, to: day }).items.find(row => row.id === 'codex:B');
      assert.equal(item.activeMs, ms); assert.deepEqual(item.activityMs, { planning: ms });
      assert.equal(item.waitingMs, 0); assert.equal(item.events, day === '2026-10-16' ? 1 : 0);
    }
  };
  check(log); assert.equal(log.close(), true); check(f.create());
});
test('a real delayed own terminal still corrects its credited work without treating it as stale', t => {
  const f = fixture(t), log = f.create(), { store, ingest } = observedUsage(f, log), base = f.now();
  ingest({}); f.tick(1000); assert.equal(log.reconcile(store.snapshot()), true);
  assert.equal(log.query().totals.activeMs, 1000);
  f.tick(500); ingest({ event: 'turn-end', activity: 'idle', at: base + 500 });
  const current = store.snapshot()[0]; assert.equal(current.status, 'idle'); assert.equal(current.turnCompletedAt, base + 500);
  const item = log.query().items[0];
  assert.equal(item.activeMs, 500); assert.equal(item.waitingMs, 0); assert.deepEqual(item.activityMs, { planning: 500 });
  assert.equal(item.events, 2); assert.equal(item.turns, 1); assert.equal(item.failures, 0);
});
test('a delayed child terminal still corrects its own work and the correlated parent wait', t => {
  const f = fixture(t), log = f.create(), { store, ingest } = observedUsage(f, log), base = f.now();
  ingest({ sessionId: 'family', turnId: 'parent-turn' });
  ingest({ sessionId: 'family', subagentId: 'child', parentId: 'codex:family', turnId: 'child-turn', event: 'subagent-start', activity: 'coding' });
  f.tick(100); ingest({ sessionId: 'family', turnId: 'parent-turn', event: 'turn-end', activity: 'planning' });
  assert.equal(store.snapshot().find(row => row.id === 'codex:family').activity, 'waiting-tool');
  f.set(base + 1000); assert.equal(log.reconcile(store.snapshot()), true);
  assert.equal(log.query().items.find(row => row.id === 'codex:family').waitingMs, 900);
  f.set(base + 1500);
  ingest({ sessionId: 'family', subagentId: 'child', parentId: 'codex:family', turnId: 'child-turn', event: 'subagent-end', activity: 'idle', at: base + 500 });
  const parent = store.snapshot().find(row => row.id === 'codex:family'), child = store.snapshot().find(row => row.id === 'codex:family:child');
  assert.equal(parent.status, 'idle'); assert.equal(parent.turnCompletedAt, base + 500); assert.equal(child.closed, true);
  const items = log.query().items, p = items.find(row => row.id === parent.id), c = items.find(row => row.id === child.id);
  assert.equal(p.activeMs, 100); assert.equal(p.waitingMs, 400); assert.deepEqual(p.activityMs, { planning: 100, 'waiting-tool': 400 });
  assert.equal(c.activeMs, 500); assert.equal(c.waitingMs, 0); assert.deepEqual(c.activityMs, { coding: 500 });
  assert.equal(c.parentId, parent.id); assert.equal(p.events, 2); assert.equal(c.events, 2);
  assert.equal(log.events({ id: parent.id }).items.filter(event => event.event === 'turn-end').length, 1, 'child settlement does not invent another parent event');
  assert.equal(log.query().totals.failures, 0);
  f.tick(5000); assert.equal(log.reconcile(store.snapshot()), true);
  assert.equal(log.query().totals.activeMs, 600); assert.equal(log.query().totals.waitingMs, 400);
});

for (const terminal of ['turn-end', 'interrupted']) {
  test(`a very late accepted own ${terminal} keeps its explicit boundary even when its snapshot is stale`, t => {
    const f = fixture(t), log = f.create(), { store, ingest } = observedUsage(f, log), base = f.now();
    ingest({}); f.set(base + 179900); assert.equal(log.reconcile(store.snapshot()), true);
    assert.equal(log.query().totals.activeMs, 179900);
    f.set(base + 181000); ingest({ event: terminal, activity: 'idle', at: base + 500 });
    assert.equal(store.snapshot()[0].status, 'stale');
    const item = log.query().items[0];
    assert.equal(item.activeMs, 500); assert.equal(item.waitingMs, 0); assert.deepEqual(item.activityMs, { planning: 500 });
    assert.equal(item.events, 2); assert.equal(item.failures, 0);
  });
}
test('a very late child terminal preserves the explicit settlement of its now-stale parent', t => {
  const f = fixture(t), log = f.create(), { store, ingest } = observedUsage(f, log), base = f.now();
  ingest({ sessionId: 'family', turnId: 'parent-turn' });
  ingest({ sessionId: 'family', subagentId: 'child', parentId: 'codex:family', turnId: 'child-turn', event: 'subagent-start', activity: 'coding' });
  f.tick(100); ingest({ sessionId: 'family', turnId: 'parent-turn', event: 'turn-end', activity: 'planning' });
  f.set(base + 179900); assert.equal(log.reconcile(store.snapshot()), true);
  assert.equal(log.query().items.find(row => row.id === 'codex:family').waitingMs, 179800);
  f.set(base + 181000);
  ingest({ sessionId: 'family', subagentId: 'child', parentId: 'codex:family', turnId: 'child-turn', event: 'subagent-end', activity: 'idle', at: base + 500 });
  const parent = store.snapshot().find(row => row.id === 'codex:family');
  assert.equal(parent.status, 'stale'); assert.equal(parent.turnCompletedAt, base + 500);
  const items = log.query().items, p = items.find(row => row.id === parent.id), c = items.find(row => row.id === 'codex:family:child');
  assert.equal(p.activeMs, 100); assert.equal(p.waitingMs, 400); assert.deepEqual(p.activityMs, { planning: 100, 'waiting-tool': 400 });
  assert.equal(c.activeMs, 500); assert.equal(c.waitingMs, 0); assert.deepEqual(c.activityMs, { coding: 500 });
  assert.equal(p.events, 2); assert.equal(c.events, 2); assert.equal(c.parentId, p.id);
});

test('a delayed new actor preserves an unresolved actor and its own stale-capped work under the history target', t => {
  const f = fixture(t), log = f.create(), { store, writes, ingest } = observedUsage(f, log, { maxSessions: 2 }), base = f.now();
  ingest({ sessionId: 'B' }); f.tick(1); ingest({ sessionId: 'A' });
  f.set(base + 179900); assert.equal(log.reconcile(store.snapshot()), true);
  assert.equal(log.query().items.find(row => row.id === 'codex:B').activeMs, 179900);
  f.set(base + 180100);
  const incoming = ingest({ sessionId: 'C', at: base + 179500 });
  assert.deepEqual(store.snapshot().map(row => row.id).sort(), ['codex:A', 'codex:B', 'codex:C'], 'live retention keeps all unresolved identities beyond the history target');
  const before = writes.length;
  assert.equal(store.ingest(incoming), false); assert.equal(writes.length, before);
  const check = archive => {
    const b = archive.query().items.find(row => row.id === 'codex:B');
    assert.equal(b.activeMs, 180000); assert.equal(b.waitingMs, 0); assert.deepEqual(b.activityMs, { planning: 180000 });
    assert.equal(b.events, 1); assert.equal(b.turns, 1); assert.equal(b.toolCalls, 0); assert.equal(b.failures, 0);
    assert.equal(b.lastSeenAt, base);
    assert.deepEqual(archive.events({ id: b.id }).items.map(event => event.event), ['turn-start'], 'prune invents no terminal fact');
  };
  check(log); f.tick(5000); assert.equal(log.reconcile(store.snapshot()), true); check(log);
  assert.equal(log.close(), true); f.tick(60000); check(f.create());
});

for (const waiting of [false, true]) {
  test(`an active child's delayed call cannot backdate its ${waiting ? 'waiting' : 'planning'} parent's clock-derived stale transition`, t => {
    const f = fixture(t), log = f.create(), { store, ingest } = observedUsage(f, log), base = f.now();
    ingest({ sessionId: 'family', turnId: 'parent-turn' });
    if (waiting) ingest({ sessionId: 'family', turnId: 'parent-turn', event: 'waiting-user', toolCallId: 'question', toolName: 'request_user_input', activity: 'waiting-user' });
    ingest({ sessionId: 'family', subagentId: 'child', parentId: 'codex:family', turnId: 'child-turn', event: 'subagent-start', activity: 'coding' });
    f.set(base + 179900); assert.equal(log.reconcile(store.snapshot()), true);
    assert.equal(log.query().items.find(row => row.id === 'codex:family')[waiting ? 'waitingMs' : 'activeMs'], 179900);
    f.set(base + 180100);
    ingest({ sessionId: 'family', subagentId: 'child', parentId: 'codex:family', turnId: 'child-turn', event: 'tool-start', toolCallId: 'test', toolName: 'exec_command', activity: 'testing', at: base + 179500 });
    const parent = store.snapshot().find(row => row.id === 'codex:family'), child = store.snapshot().find(row => row.id === 'codex:family:child');
    assert.equal(parent.activity, 'waiting-tool'); assert.equal(parent.turnCompletedAt, undefined); assert.equal(parent.closed, false);
    assert.equal(child.activity, 'testing'); assert.equal(child.activeTools, 1);
    const check = archive => {
      const p = archive.query().items.find(row => row.id === parent.id);
      assert.equal(p.activeMs, waiting ? 0 : 180000); assert.equal(p.waitingMs, waiting ? 180000 : 0);
      assert.deepEqual(p.activityMs, { [waiting ? 'waiting-user' : 'planning']: 180000 });
      assert.equal(p.events, waiting ? 2 : 1); assert.equal(p.toolCalls, waiting ? 1 : 0); assert.equal(p.turns, 1); assert.equal(p.failures, 0);
      assert.equal(archive.events({ id: parent.id }).items.some(event => ['turn-end', 'interrupted', 'session-end', 'subagent-end'].includes(event.event)), false);
    };
    check(log); f.tick(5000); assert.equal(log.reconcile(store.snapshot()), true); check(log);
    assert.equal(log.close(), true); check(f.create());
  });
}

test('a delayed child end cannot settle its parent before the parents later pending Stop timestamp', t => {
  const f = fixture(t), log = f.create(), { store, ingest } = observedUsage(f, log), base = f.now();
  ingest({ sessionId: 'family', turnId: 'parent-turn' });
  ingest({ sessionId: 'family', subagentId: 'child', parentId: 'codex:family', turnId: 'child-turn', event: 'subagent-start', activity: 'coding' });
  f.set(base + 1070); ingest({ sessionId: 'family', turnId: 'parent-turn', event: 'turn-end', activity: 'planning' });
  assert.equal(store.snapshot().find(row => row.id === 'codex:family').activity, 'waiting-tool');
  f.set(base + 1200); assert.equal(log.reconcile(store.snapshot()), true);
  assert.equal(log.query().items.find(row => row.id === 'codex:family').waitingMs, 130);
  f.set(base + 1500);
  ingest({ sessionId: 'family', subagentId: 'child', parentId: 'codex:family', turnId: 'child-turn', event: 'subagent-end', activity: 'idle', at: base + 1000 });
  const parent = store.snapshot().find(row => row.id === 'codex:family');
  assert.equal(parent.status, 'idle'); assert.equal(parent.turnCompletedAt, base + 1070);
  const items = log.query().items, p = items.find(row => row.id === parent.id), c = items.find(row => row.id === 'codex:family:child');
  assert.equal(p.activeMs, 1070); assert.equal(p.waitingMs, 0); assert.deepEqual(p.activityMs, { planning: 1070, 'waiting-tool': 0 });
  assert.equal(c.activeMs, 1000); assert.equal(c.waitingMs, 0); assert.equal(p.events, 2); assert.equal(c.events, 2);
  assert.equal(log.query().totals.failures, 0);
});

test('a very late child end settles an interrupted parent through explicit store evidence even when stale masks idle', t => {
  const f = fixture(t), log = f.create(), { store, ingest } = observedUsage(f, log), base = f.now();
  ingest({ sessionId: 'family', turnId: 'parent-turn' });
  ingest({ sessionId: 'family', subagentId: 'child', parentId: 'codex:family', turnId: 'child-turn', event: 'subagent-start', activity: 'coding' });
  f.tick(100); ingest({ sessionId: 'family', turnId: 'parent-turn', event: 'interrupted' });
  f.set(base + 179900); assert.equal(log.reconcile(store.snapshot()), true);
  f.set(base + 181000); ingest({ sessionId: 'family', subagentId: 'child', turnId: 'child-turn', event: 'subagent-end', at: base + 500 });
  const parent = store.snapshot().find(row => row.id === 'codex:family');
  assert.equal(parent.status, 'stale'); assert.equal(parent.activity, 'unknown'); assert.equal(parent.turnCompletedAt, undefined);
  assert.deepEqual(parent.settlementBoundary, { event: 'interrupted', at: base + 500 });
  const p = log.query().items.find(row => row.id === parent.id);
  assert.equal(p.activeMs, 100); assert.equal(p.waitingMs, 400); assert.deepEqual(p.activityMs, { planning: 100, 'waiting-tool': 400 });
  assert.equal(p.events, 2); assert.equal(p.failures, 0);
});
test('new causal settlement corrects a previously checkpointed stale parent and child once despite unchanged presentation', t => {
  const f = fixture(t), log = f.create(), { store, ingest } = observedUsage(f, log), base = f.now();
  ingest({ sessionId: 'family', turnId: 'parent-turn' });
  ingest({ sessionId: 'family', subagentId: 'child', parentId: 'codex:family', turnId: 'child-turn', event: 'subagent-start', activity: 'coding' });
  f.tick(100); ingest({ sessionId: 'family', turnId: 'parent-turn', event: 'turn-end' });
  f.set(base + 180200); assert.equal(log.reconcile(store.snapshot()), true);
  const stale = store.snapshot().find(row => row.id === 'codex:family');
  assert.equal(stale.status, 'stale'); assert.equal(stale.activity, 'unknown');
  assert.equal(log.query().items.find(row => row.id === stale.id).waitingMs, 180000);
  f.set(base + 180500); const end = ingest({ sessionId: 'family', subagentId: 'child', turnId: 'child-turn', event: 'subagent-end', at: base + 500 });
  const parent = store.snapshot().find(row => row.id === stale.id);
  assert.equal(parent.status, stale.status); assert.equal(parent.activity, stale.activity);
  assert.deepEqual(parent.settlementBoundary, { event: 'turn-end', at: base + 500 });
  const check = archive => {
    const items = archive.query().items, p = items.find(row => row.id === parent.id), c = items.find(row => row.id === 'codex:family:child');
    assert.equal(p.activeMs, 100); assert.equal(p.waitingMs, 400); assert.deepEqual(p.activityMs, { planning: 100, 'waiting-tool': 400 });
    assert.equal(c.activeMs, 500); assert.equal(c.waitingMs, 0); assert.deepEqual(c.activityMs, { coding: 500 });
    assert.equal(Object.hasOwn(p, 'settlementBoundary'), false, 'transient correction evidence is not a new archive field');
  };
  check(log); assert.equal(store.ingest(end), false); assert.equal(log.record(end, store.snapshot()), false);
  ingest({ sessionId: 'family', subagentId: 'child', turnId: 'child-turn', event: 'metadata', at: base + 500 });
  f.tick(5000); assert.equal(log.reconcile(store.snapshot()), true); check(log);
  assert.equal(log.close(), true); check(f.create());
});
test('a new own terminal corrects its original credited bucket after stale was already checkpointed', t => {
  const f = fixture(t), log = f.create(), { store, ingest } = observedUsage(f, log), base = f.now();
  ingest({}); f.set(base + 180100); assert.equal(log.reconcile(store.snapshot()), true);
  assert.equal(log.query().totals.activeMs, 180000); assert.equal(store.snapshot()[0].status, 'stale');
  f.set(base + 181000); ingest({ event: 'turn-end', at: base + 500 });
  assert.equal(store.snapshot()[0].status, 'stale');
  assert.deepEqual(store.snapshot()[0].settlementBoundary, { event: 'turn-end', at: base + 500 });
  assert.equal(log.query().totals.activeMs, 500); assert.deepEqual(log.query().items[0].activityMs, { planning: 500 });
  f.tick(1000); log.reconcile(store.snapshot()); assert.equal(log.query().totals.activeMs, 500);
});
test('a retained old settlement marker cannot authorize a later derived parent state or be changed through an old snapshot', t => {
  const f = fixture(t), log = f.create(), store = createSessionStore({ now: f.now, staleMs: 180000 }), writes = [];
  let retained;
  store.onAccepted(event => { const rows = store.snapshot(); writes.push(log.record(event, rows)); retained = rows.find(row => row.id === 'codex:family') || retained; });
  const ingest = extra => { const event = f.event({ evidence: { source: 'codex-jsonl', kind: 'native' }, ...extra }); assert.equal(store.ingest(event), true); assert.equal(writes.at(-1), true); return event; };
  const base = f.now(); ingest({ sessionId: 'family' }); f.tick(500); ingest({ sessionId: 'family', event: 'turn-end' });
  assert.deepEqual(retained.settlementBoundary, { event: 'turn-end', at: base + 500 });
  // Mutating an earlier snapshot must not mutate the log's previous marker or
  // the store. The later real snapshot still carries the same original value.
  retained.settlementBoundary.at = base + 100;
  f.set(base + 600); ingest({ sessionId: 'family', subagentId: 'child', parentId: 'codex:family', turnId: 'child-turn', event: 'subagent-start', activity: 'coding' });
  f.set(base + 179900); const checkpoint = store.snapshot(); assert.equal(log.reconcile(checkpoint), true);
  assert.equal(log.query().items.find(row => row.id === 'codex:family').activeMs, 179800);
  checkpoint.find(row => row.id === 'codex:family').settlementBoundary.at = base + 100;
  f.set(base + 180600); ingest({ sessionId: 'family', subagentId: 'child', turnId: 'child-turn', event: 'tool-start', toolCallId: 'test', activity: 'testing', at: base + 180000 });
  const parent = store.snapshot().find(row => row.id === 'codex:family');
  assert.equal(parent.activity, 'waiting-tool'); assert.deepEqual(parent.settlementBoundary, { event: 'turn-end', at: base + 500 });
  const p = log.query().items.find(row => row.id === parent.id);
  assert.equal(p.activeMs, 180400); assert.equal(p.waitingMs, 0); assert.deepEqual(p.activityMs, { planning: 500, idle: 179900 });
});
test('a real new parent turn clears settlement evidence and retains its own complete stale cap', t => {
  const f = fixture(t), log = f.create(), { store, ingest } = observedUsage(f, log), base = f.now();
  ingest({ sessionId: 'family', turnId: 'old' }); f.tick(500); ingest({ sessionId: 'family', turnId: 'old', event: 'turn-end' });
  assert.ok(store.snapshot()[0].settlementBoundary);
  f.set(base + 1100); ingest({ sessionId: 'family', turnId: 'new' });
  ingest({ sessionId: 'family', subagentId: 'child', parentId: 'codex:family', turnId: 'child-turn', event: 'subagent-start', activity: 'coding' });
  assert.equal(store.snapshot().find(row => row.id === 'codex:family').settlementBoundary, undefined);
  f.set(base + 181000); assert.equal(log.reconcile(store.snapshot()), true);
  f.set(base + 181200); ingest({ sessionId: 'family', subagentId: 'child', turnId: 'child-turn', event: 'tool-start', toolCallId: 'test', activity: 'testing', at: base + 180600 });
  const p = log.query().items.find(row => row.id === 'codex:family');
  assert.equal(p.activeMs, 180500); assert.equal(p.waitingMs, 0); assert.equal(p.turns, 2); assert.equal(p.events, 3);
  assert.deepEqual(p.activityMs, { planning: 180500 });
});

test('invalid settlement marker shapes never authorize retrospective parent subtraction', t => {
  const array = []; array.event = 'turn-end'; array.at = 500;
  for (const invalid of [null, {event:'metadata',at:500}, {event:'turn-end',at:NaN}, {event:'turn-end',at:Infinity}, {event:'turn-end',at:-1}, {event:'turn-end',at:'2026-10-16T07:00:00Z'}, array]) {
    const f = fixture(t, { staleMs: 1000 }), log = f.create(), base = f.now();
    const parent = f.event({ sessionId: 'family' }), child = f.event({ sessionId: 'family', subagentId: 'child', parentId: 'codex:family' });
    const p = f.snapshot(parent), c = f.snapshot(child);
    assert.equal(log.record(parent, [p]), true); assert.equal(log.record(child, [p,c]), true);
    f.tick(1000); assert.equal(log.reconcile([p,c]), true);
    f.tick(500); const end = f.event({ sessionId: 'family', subagentId: 'child', parentId: 'codex:family', event: 'subagent-end', at: base + 500 });
    assert.equal(log.record(end, [{...p,status:'stale',activity:'unknown',settlementBoundary:invalid},f.snapshot(end,{status:'closed',activity:'idle'})]), true);
    const item = log.query().items.find(row => row.id === 'codex:family');
    assert.equal(item.activeMs, 1000); assert.deepEqual(item.activityMs, { planning: 1000 }); assert.equal(item.events, 1);
  }
});

for (const rawEvent of ['event_msg:token_count', 'session_meta']) {
  test(`passive own ${rawEvent} metadata cannot backdate its clock-derived stale cap`, t => {
    const f = fixture(t), log = f.create(), { store, ingest } = observedUsage(f, log), base = f.now();
    ingest({}); f.set(base + 179900); assert.equal(log.reconcile(store.snapshot()), true);
    f.set(base + 180100); ingest({ event: 'metadata', at: base + 179500, title: 'synthetic title', evidence: { source: 'codex-jsonl', rawEvent } });
    const session = store.snapshot()[0];
    assert.equal(session.status, 'stale'); assert.equal(session.lastEventAt, base); assert.equal(session.settlementBoundary, undefined);
    const item = log.query().items[0];
    assert.equal(item.activeMs, 180000); assert.equal(item.waitingMs, 0); assert.deepEqual(item.activityMs, { planning: 180000 });
    assert.equal(item.events, 2); assert.equal(item.turns, 1); assert.equal(item.toolCalls, 0); assert.equal(item.failures, 0);
    f.tick(5000); log.reconcile(store.snapshot()); assert.equal(log.query().totals.activeMs, 180000);
    assert.equal(log.close(), true); assert.equal(f.create().query().totals.activeMs, 180000);
  });
}
test('real model-progress metadata still refreshes observed work without fabricating a new turn', t => {
  const f = fixture(t), log = f.create(), { store, ingest } = observedUsage(f, log), base = f.now();
  ingest({}); f.set(base + 1000); assert.equal(log.reconcile(store.snapshot()), true);
  f.set(base + 1500); ingest({ event: 'metadata', at: base + 1200, evidence: { source: 'codex-jsonl', rawEvent: 'event_msg:agent_reasoning' } });
  assert.equal(store.snapshot()[0].lastEventAt, base + 1200); assert.equal(store.snapshot()[0].activity, 'planning');
  f.set(base + 2000); assert.equal(log.reconcile(store.snapshot()), true);
  const item = log.query().items[0]; assert.equal(item.activeMs, 2000); assert.equal(item.events, 2); assert.equal(item.turns, 1); assert.equal(item.toolCalls, 0);
});
test('real ElicitationResult metadata retains its actual waiting-to-work boundary', t => {
  const f = fixture(t), log = f.create(), { store, ingest } = observedUsage(f, log), base = f.now();
  ingest({}); f.tick(100);
  ingest({ event: 'waiting-user', toolCallId: 'question', activity: 'waiting-user', evidence: { source: 'codex-jsonl', rawEvent: 'Elicitation' } });
  f.set(base + 1000); assert.equal(log.reconcile(store.snapshot()), true);
  f.set(base + 1500); ingest({ event: 'metadata', toolCallId: 'question', at: base + 500, evidence: { source: 'codex-jsonl', rawEvent: 'ElicitationResult' } });
  const s = store.snapshot()[0]; assert.equal(s.status, 'active'); assert.equal(s.activity, 'planning'); assert.equal(s.activeTools, 0);
  const item = log.query().items[0]; assert.equal(item.activeMs, 100); assert.equal(item.waitingMs, 400); assert.equal(item.events, 3); assert.equal(item.turns, 1); assert.equal(item.toolCalls, 1);
  f.tick(100); log.reconcile(store.snapshot()); assert.equal(log.query().totals.activeMs, 200);
});
test('own delayed tool completion respects its later pending Stop settlement timestamp', t => {
  const f = fixture(t), log = f.create(), { store, ingest } = observedUsage(f, log), base = f.now();
  ingest({}); ingest({ event: 'tool-start', toolCallId: 'test', toolName: 'exec_command', activity: 'testing' });
  f.set(base + 1070); ingest({ event: 'turn-end' });
  f.set(base + 1200); assert.equal(log.reconcile(store.snapshot()), true); assert.equal(log.query().totals.waitingMs, 130);
  f.set(base + 1500); ingest({ event: 'tool-end', toolCallId: 'test', at: base + 1000, outcome: 'success' });
  assert.deepEqual(store.snapshot()[0].settlementBoundary, { event: 'turn-end', at: base + 1070 });
  const item = log.query().items[0]; assert.equal(item.activeMs, 1070); assert.equal(item.waitingMs, 0); assert.deepEqual(item.activityMs, { testing: 1070, 'waiting-tool': 0 });
  assert.equal(item.turns, 1); assert.equal(item.toolCalls, 1); assert.equal(item.events, 4); assert.equal(item.failures, 0);
});

test('own pending Stop settles a continuously waiting bucket at1070 rather than its delayed tool result at1000', t => {
  const f = fixture(t), log = f.create(), { store, ingest } = observedUsage(f, log), base = f.now();
  ingest({ activity: 'waiting-tool' }); ingest({ event: 'tool-start', toolCallId: 'test', activity: 'waiting-tool' });
  f.set(base + 1070); ingest({ event: 'turn-end', activity: 'planning' });
  f.set(base + 1200); assert.equal(log.reconcile(store.snapshot()), true); assert.equal(log.query().totals.waitingMs, 1200);
  f.set(base + 1500); ingest({ event: 'tool-end', toolCallId: 'test', at: base + 1000, outcome: 'success' });
  assert.deepEqual(store.snapshot()[0].settlementBoundary, { event: 'turn-end', at: base + 1070 });
  const item = log.query().items[0]; assert.equal(item.activeMs, 0); assert.equal(item.waitingMs, 1070); assert.deepEqual(item.activityMs, { 'waiting-tool': 1070 });
  assert.equal(item.turns, 1); assert.equal(item.toolCalls, 1); assert.equal(item.events, 4); assert.equal(item.failures, 0);
});
test('passive own metadata cannot backdate a fresh child heartbeat-derived waiting-tool presentation', t => {
  const f = fixture(t), log = f.create(), { store, ingest } = observedUsage(f, log), base = f.now();
  ingest({ sessionId: 'family', turnId: 'parent-turn' });
  ingest({ sessionId: 'family', subagentId: 'child', parentId: 'codex:family', turnId: 'child-turn', event: 'subagent-start', activity: 'coding' });
  f.set(base + 179000); ingest({ sessionId: 'family', subagentId: 'child', turnId: 'child-turn', event: 'activity', activity: 'coding' });
  f.set(base + 179900); assert.equal(log.reconcile(store.snapshot()), true);
  f.set(base + 180100); ingest({ sessionId: 'family', turnId: 'parent-turn', event: 'metadata', at: base + 179500, evidence: { source: 'codex-jsonl', rawEvent: 'event_msg:token_count' } });
  const parent = store.snapshot().find(row => row.id === 'codex:family');
  assert.equal(parent.status, 'active'); assert.equal(parent.activity, 'waiting-tool'); assert.equal(parent.lastEventAt, base); assert.equal(parent.settlementBoundary, undefined);
  const item = log.query().items.find(row => row.id === parent.id);
  assert.equal(item.activeMs, 180000); assert.equal(item.waitingMs, 0); assert.deepEqual(item.activityMs, { planning: 180000 });
});
test('ElicitationResult with no heartbeat advance still owns its real wait-to-work change', t => {
  const f = fixture(t), log = f.create(), { store, ingest } = observedUsage(f, log), base = f.now();
  ingest({}); f.tick(100);
  ingest({ event: 'waiting-user', toolCallId: 'question', activity: 'waiting-user', evidence: { source: 'codex-jsonl', rawEvent: 'Elicitation' } });
  f.set(base + 1000); ingest({ event: 'tool-start', toolCallId: 'background', activity: 'reading' });
  assert.equal(store.snapshot()[0].status, 'waiting');
  f.set(base + 1200); assert.equal(log.reconcile(store.snapshot()), true);
  f.set(base + 1500); ingest({ event: 'metadata', toolCallId: 'question', at: base + 500, evidence: { source: 'codex-jsonl', rawEvent: 'ElicitationResult' } });
  const s = store.snapshot()[0]; assert.equal(s.lastEventAt, base + 1000); assert.equal(s.status, 'active'); assert.equal(s.activity, 'reading'); assert.equal(s.activeTools, 1);
  const item = log.query().items[0]; assert.equal(item.activeMs, 100); assert.equal(item.waitingMs, 400); assert.equal(item.toolCalls, 2); assert.equal(item.failures, 0);
});
