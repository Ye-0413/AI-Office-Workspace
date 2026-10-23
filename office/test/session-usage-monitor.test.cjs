'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSessionUsageStore } = require('../lib/session-usage-store.cjs');
const { createSessionUsageMonitor, LIMITS } = require('../lib/session-usage-monitor.cjs');
const { createSessionStore } = require('../lib/session-store.cjs');

const at = '2026-10-22T15:59:59Z';
const row = (type, payload, timestamp = at) => ({ type, payload, timestamp });
const meta = id => row('session_meta', { id, timestamp: at });
const usage = (input, cached, output, timestamp = at) => row('event_msg', { type: 'token_count', info: { total_token_usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: output } } }, timestamp);
const claude = (id, tokens, extra = {}) => ({ type: 'assistant', sessionId: 'claude-session', timestamp: at, message: { id, role: 'assistant', model: 'fixture-model', content: [{ text: 'PRIVATE_TRANSCRIPT_MARKER' }], usage: { input_tokens: tokens, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }, ...extra });
function fixture(t) {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-token-monitor-')), dataDir = path.join(homeDir, 'app');
  const stores = [], monitors = [];
  const file = (provider, name, rows) => {
    const dir = provider === 'codex' ? path.join(homeDir, '.codex', 'sessions', '2026', '10', '22') : path.join(homeDir, '.claude', 'projects', 'project');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, name + '.jsonl'); fs.writeFileSync(file, rows.map(r => JSON.stringify(r)).join('\n') + '\n'); return file;
  };
  const create = wrapper => {
    const store = createSessionUsageStore({ dataDir }); stores.push(store);
    assert.equal(store.status().available, true);
    const monitor = createSessionUsageMonitor({ store: wrapper ? wrapper(store) : store, homeDir }); monitors.push(monitor);
    return { store, monitor };
  };
  t.after(() => { monitors.forEach(m => m.stop()); stores.forEach(s => s.close()); fs.rmSync(homeDir, { recursive: true, force: true }); });
  return { homeDir, dataDir, file, create };
}
test('historical imports preserve disjoint tokens and Hong Kong dates without creating live activity', t => {
  const f = fixture(t);
  f.file('codex', 'rollout-test', [meta('thread'), row('turn_context', { model: 'fixture-codex' }), usage(100, 30, 10), usage(150, 50, 15, '2026-10-22T16:00:01Z')]);
  f.file('claude', 'claude-session', [claude('m1', 20)]);
  const live = createSessionStore(), { store, monitor } = f.create(); monitor.scan();
  assert.deepEqual(live.snapshot(), []);
  const result = store.query(); assert.equal(result.ok, true);
  assert.deepEqual(result.totals, { requests: 3, inputTokens: 120, outputTokens: 15, cacheReadTokens: 50, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 185 });
  assert.equal(store.query({ from: '2026-10-22', to: '2026-10-22', provider: 'codex' }).totals.totalTokens, 110);
  assert.equal(store.query({ from: '2026-10-23', to: '2026-10-23' }).totals.totalTokens, 55);
  assert.equal(store.query({ provider: 'claude-code' }).totals.totalTokens, 20);
  assert.equal(store.query({ provider: 'gemini-cli' }).totals.requests, 0);
  assert.equal(result.models.length, 2);
  assert.equal(fs.statSync(path.join(f.dataDir, 'usage-history', 'tokens.sqlite3')).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(f.dataDir, 'usage-history')).mode & 0o777, 0o700);
  for (const suffix of ['', '-wal']) {
    const bytes = fs.readFileSync(path.join(f.dataDir, 'usage-history', 'tokens.sqlite3') + suffix).toString('utf8');
    assert.doesNotMatch(bytes, /PRIVATE_TRANSCRIPT_MARKER|\.codex\/sessions|\.claude\/projects/);
  }
});
test('partial JSONL tails are read once complete; checkpoints survive restart and rescan', t => {
  const f = fixture(t), file = f.file('codex', 'rollout-test', [meta('thread'), usage(100, 30, 10)]);
  let { store, monitor } = f.create(); monitor.scan();
  const addition = JSON.stringify(usage(150, 50, 15, '2026-10-22T16:00:01Z'));
  fs.appendFileSync(file, addition.slice(0, 70)); monitor.scan();
  assert.equal(store.query().totals.totalTokens, 110);
  monitor.stop(); store.close(); ({ store, monitor } = f.create()); monitor.scan();
  fs.appendFileSync(file, addition.slice(70) + '\n'); monitor.scan(); monitor.scan();
  assert.equal(store.query().totals.totalTokens, 165); assert.equal(store.query().totals.requests, 2);
  const snapshot = store.query().totals;
  monitor.stop(); store.close(); ({ store, monitor } = f.create()); monitor.scan();
  assert.deepEqual(store.query().totals, snapshot);
});
test('same-size in-place rewrites and copied files cannot silently skip new native messages or duplicate old ones', t => {
  const f = fixture(t), file = f.file('claude', 'claude-session', [claude('m1', 10)]), { store, monitor } = f.create();
  monitor.scan(); const previous = fs.statSync(file);
  const next = JSON.stringify(claude('m2', 20)) + '\n';
  assert.equal(Buffer.byteLength(next), previous.size);
  fs.writeFileSync(file, next); fs.utimesSync(file, previous.atime, previous.mtime);
  monitor.scan();
  assert.equal(store.query().totals.totalTokens, 30); assert.equal(monitor.status().rewrites, 1);
  fs.copyFileSync(file, path.join(path.dirname(file), 'copy.jsonl'));
  for (let i = 0; i < 4; i++) monitor.scan();
  assert.equal(store.query().totals.totalTokens, 30);
  fs.writeFileSync(file, JSON.stringify(claude('m1', 10)) + '\n'); monitor.scan();
  assert.equal(store.query().totals.totalTokens, 30);
});
test('request snapshots upsert maximum usage and preserve helper identity and filters', t => {
  const f = fixture(t), file = f.file('claude', 'claude-session', [claude('m1', 10)]);
  const subdir = path.join(path.dirname(file), 'parent-native', 'subagents'); fs.mkdirSync(subdir, { recursive: true });
  fs.writeFileSync(path.join(subdir, 'agent-child.jsonl'), JSON.stringify(claude('m1', 5, { sessionId: 'parent-native' })) + '\n');
  const { store, monitor } = f.create(); monitor.scan();
  fs.appendFileSync(file, JSON.stringify(claude('m1', 30)) + '\n'); monitor.scan();
  assert.equal(store.query().totals.requests, 2); assert.equal(store.query().totals.totalTokens, 35);
  assert.equal(store.query({ role: 'root' }).totals.totalTokens, 30);
  assert.equal(store.query({ role: 'helper' }).totals.totalTokens, 5);
});
test('failed imports retry from the uncommitted cursor and refresh requests coalesce', async t => {
  const f = fixture(t); f.file('codex', 'rollout-test', [meta('thread'), usage(100, 30, 10)]);
  let fail = true;
  const { store, monitor } = f.create(s => ({ ...s, commit(...args) { if (fail) { fail = false; return false; } return s.commit(...args); } }));
  monitor.scan(); assert.equal(store.query().totals.requests, 0); assert.match(monitor.status().error, /incomplete/);
  const first = monitor.refresh(), second = monitor.refresh(); assert.equal(first, second); await first;
  assert.equal(store.query().totals.requests, 1); assert.equal(monitor.status().error, undefined);
});
test('large transcript lines, malformed rows and symbolic links remain bounded and do not become token data', t => {
  const f = fixture(t), file = f.file('codex', 'rollout-test', [meta('thread')]);
  fs.appendFileSync(file, JSON.stringify({ type: 'response_item', payload: { text: 'x'.repeat(LIMITS.perFile + 2000) } }) + '\nnot json\n' + JSON.stringify(usage(100, 30, 10)) + '\n');
  fs.symlinkSync(file, path.join(path.dirname(file), 'linked.jsonl'));
  const { store, monitor } = f.create();
  for (let i = 0; i < 6; i++) { const before = monitor.status().bytesRead; monitor.scan(); assert.ok(monitor.status().bytesRead - before <= LIMITS.bytes); }
  assert.equal(store.query().totals.requests, 1); assert.ok(monitor.status().oversizedLines > 0); assert.ok(monitor.status().malformedLines > 0);
});
test('token query validates filters and unsafe database destinations fail closed', t => {
  const f = fixture(t), { store } = f.create();
  assert.throws(() => store.query({ from: '2026-02-30' }), /date/);
  assert.throws(() => store.query({ role: 'fake' }), /role/);
  assert.throws(() => store.query({ provider: "codex';DROP" }), /provider/);
  const outside = path.join(f.homeDir, 'outside'); fs.mkdirSync(outside);
  const unsafeDir = path.join(f.homeDir, 'unsafe'); fs.mkdirSync(unsafeDir); fs.symlinkSync(outside, path.join(unsafeDir, 'usage-history'));
  const unsafe = createSessionUsageStore({ dataDir: unsafeDir }); t.after(() => unsafe.close());
  assert.equal(unsafe.status().available, false); assert.deepEqual(fs.readdirSync(outside), []);
});
test('continuation baselines commit with their preceding file and deferred pages retry without double billing', t => {
  const f=fixture(t),thread='11111111-1111-4111-8111-111111111111',page='22222222-2222-4222-8222-222222222222';
  f.file('codex',`rollout-2026-10-22T11-00-00-${thread}_${page}`,[meta(thread),usage(150,50,15)]);
  const {store,monitor}=f.create();monitor.scan();
  assert.equal(store.query().totals.requests,0);assert.match(monitor.status().error,/BASELINE_PENDING/);
  f.file('codex',`rollout-2026-10-22T10-00-00-${thread}`,[meta(thread),usage(100,30,10)]);
  for(let i=0;i<5;i++)monitor.scan();
  assert.equal(store.query().totals.totalTokens,165);assert.equal(store.query().totals.requests,2);
  assert.deepEqual(store.baseline(thread,'2026-10-22T11:00:00.000Z'),{input:100,read:30,write:0,output:10,reasoning:0});
  monitor.stop();store.close();const next=f.create();for(let i=0;i<3;i++)next.monitor.scan();
  assert.equal(next.store.query().totals.totalTokens,165);
});
test('homepage natural-day and Monday week totals update after imports and at Hong Kong midnight',t=>{
  const f=fixture(t),{store}=f.create();
  const record=(key,at,tokens)=>({key,provider:'codex',sessionId:'thread',model:'fixture',at:Date.parse(at),inputTokens:tokens,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,reasoningTokens:0});
  store.commit('source',{},[record('sun','2026-10-18T15:00:00Z',10),record('mon','2026-10-18T16:00:00Z',20),record('thu','2026-10-22T15:59:59Z',30)]);
  const thu=store.summary(Date.parse('2026-10-22T15:59:59Z'));assert.equal(thu.date,'2026-10-22');assert.equal(thu.weekFrom,'2026-10-19');assert.equal(thu.weekTo,'2026-10-25');assert.equal(thu.dailyTokens,30);assert.equal(thu.weeklyTokens,50);
  store.commit('source',{},[record('fri','2026-10-22T16:00:00Z',40)]);
  assert.equal(store.summary(Date.parse('2026-10-22T16:00:00Z')).dailyTokens,40);assert.equal(store.summary(Date.parse('2026-10-22T16:00:00Z')).weeklyTokens,90);
  const next=store.summary(Date.parse('2026-10-25T16:00:00Z'));assert.equal(next.weekFrom,'2026-10-26');assert.equal(next.dailyTokens,0);assert.equal(next.weeklyTokens,0);
});
test('later cumulative pages wait for their actual large predecessor, even when discovery encounters them first',t=>{
  const f=fixture(t),thread='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333';
  // Create C first to avoid relying on directory insertion order.
  f.file('codex',`rollout-2026-10-22T12-00-00-${thread}_${c}`,[meta(thread),usage(250,0,0)]);
  f.file('codex',`rollout-2026-10-22T10-00-00-${thread}`,[meta(thread),usage(100,0,0)]);
  f.file('codex',`rollout-2026-10-22T11-00-00-${thread}_${b}`,[meta(thread),{type:'response_item',payload:{text:'x'.repeat(LIMITS.perFile+2000)}},usage(200,0,0)]);
  const {store,monitor}=f.create();
  for(let i=0;i<12;i++){monitor.scan();assert.ok(store.query().totals.totalTokens<=250,'an unfinished intervening page must not inflate totals');}
  assert.equal(store.query().totals.totalTokens,250);assert.equal(store.query().totals.requests,3);assert.equal(monitor.status().error,undefined);
});
