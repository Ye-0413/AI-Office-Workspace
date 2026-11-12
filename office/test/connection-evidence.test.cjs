'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { staleLock, clearStaleLock, openLock } = require('../lib/stale-lock.cjs');
const { recordDrop, createDropReader } = require('../lib/collector-drops.cjs');
const { createConnectionLedger } = require('../lib/connection-ledger.cjs');
const Status = require('../lib/connection-status.js');
const I18n = require('../lib/i18n-model.js');
const { createObserverBridge } = require('../lib/observer-bridge.cjs');
const { createSessionStore } = require('../lib/session-store.cjs');

const observer = path.join(__dirname, '..', 'hooks', 'observe.cjs');
function temp(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'mini-office-evidence-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
const until = async (check, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (check()) return true; await new Promise(r => setTimeout(r, 25)); } return false; };

test('a lock whose PID is dead is recovered; a live or own lock is kept', t => {
  const root = temp(t), file = path.join(root, '.lock'), flags = fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY;
  fs.writeFileSync(file, JSON.stringify({ pid: 999999 }), { mode: 0o600 });
  assert.ok(staleLock(file, { isAlive: () => false }));
  assert.equal(staleLock(file, { isAlive: () => true }), null, 'a live holder keeps its lock');
  const fd = openLock(file, flags, 0o600, { isAlive: () => false }); fs.closeSync(fd);
  fs.writeFileSync(file, JSON.stringify({ pid: process.pid }));
  assert.equal(clearStaleLock(file, { isAlive: () => false }), false, 'this process never steals its own lock');
  fs.writeFileSync(file, '');
  assert.equal(clearStaleLock(file), false, 'a fresh pid-less lock is kept');
  assert.equal(clearStaleLock(file, { now: () => Date.now() + 11 * 60 * 1000 }), true, 'an old pid-less lock is recovered');
  fs.symlinkSync(path.join(root, 'elsewhere'), file);
  assert.equal(staleLock(file, { isAlive: () => false }), null, 'a symlink is never treated as a lock');
});

test('bridge Connect recovers its config lock left by a dead process', async t => {
  const root = temp(t), homeDir = path.join(root, 'home'); fs.mkdirSync(path.join(homeDir, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(homeDir, '.codex', '.mini-office-observer.lock'), JSON.stringify({ pid: 2 ** 22 + 12345 }), { mode: 0o600 });
  const bridge = createObserverBridge({ homeDir, env: { PATH: '' }, dataDir: path.join(root, 'data'), appRoot: path.join(__dirname, '..'), electronPath: process.execPath });
  const result = await bridge.connect('codex');
  assert.equal(result.status, 'ok', result.message);
});

test('drop log holds reason codes only and reports new counts after seeding', t => {
  const root = temp(t), reader = createDropReader({ eventsDir: root });
  assert.ok(recordDrop(root, 'codex', 'timeout'));
  assert.deepEqual(reader.poll(), {}, 'history seeds the window without re-logging');
  recordDrop(root, 'codex', 'invalid-json'); recordDrop(root, 'codex', 'ignored'); recordDrop(root, 'cursor', 'not a reason "with text"');
  assert.deepEqual(reader.poll(), { codex: { 'invalid-json': 1, ignored: 1 }, cursor: { other: 1 } });
  assert.deepEqual(reader.recent(), { codex: 2, cursor: 1 }, 'ignored host events are not counted as lost');
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'collector-drops.log'), 'utf8'), /with text/);
  assert.equal(recordDrop(root, '../escape', 'timeout'), false);
});

test('the real hook script records why it dropped an event', t => {
  const root = temp(t), dataDir = path.join(root, 'data');
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', MINI_OFFICE_DATA_DIR: dataDir };
  fs.mkdirSync(path.join(dataDir, 'events'), { recursive: true, mode: 0o700 }); fs.chmodSync(dataDir, 0o700);
  const run = input => spawnSync(process.execPath, [observer, '--provider', 'codex', '--event', 'Stop', '--mini-office-observer-v1'], { env, input, encoding: 'utf8' });
  assert.equal(run('{not json').stdout.trim(), '{}');
  assert.equal(run('[]').stdout.trim(), '{}');
  const lines = fs.readFileSync(path.join(dataDir, 'events', 'collector-drops.log'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(lines.map(line => line.reason), ['invalid-json', 'invalid-event']);
  assert.ok(lines.every(line => Object.keys(line).sort().join() === 'at,provider,reason'));
});

test('ledger persists first and last event times and the last passed test across restarts', t => {
  const root = temp(t), file = path.join(root, 'connection-evidence.json');
  let ledger = createConnectionLedger({ file, setTimer: () => null, clearTimer: () => {} });
  ledger.recordEvent('codex', 1000); ledger.recordEvent('codex', 3000); ledger.recordEvent('codex', 2000); ledger.recordTest('codex', 4000);
  ledger.flush();
  ledger = createConnectionLedger({ file });
  assert.deepEqual(ledger.get('codex'), { firstEventAt: 1000, lastEventAt: 3000, testPassedAt: 4000 });
  assert.deepEqual(ledger.get('cursor'), {});
  assert.equal((fs.statSync(file).mode & 0o777), 0o600);
});

test('status follows evidence: configured, first event received, observing, and stale', () => {
  const ago = () => '3 分钟前收到事件';
  assert.equal(Status.describe({}).status, '尚未接入');
  assert.equal(Status.describe({ installed: true, watching: true }).status, '已配置 · 等待工具产生事件', 'watching alone is not evidence');
  assert.equal(Status.describe({ installed: true, observedAt: 5 }, { timeAgo: ago }).state, 'received');
  assert.equal(Status.describe({ installed: true, observedAt: 5 }, { timeAgo: ago }).status, '已收到首个事件 · 3 分钟前收到事件');
  assert.equal(Status.describe({ installed: true, lastEventAt: 9, drops: 2 }, { timeAgo: ago }).status, '正在观察 · 3 分钟前收到事件 · 24 小时内漏记 2 个事件');
  const stale = Status.describe({ installed: true, stale: true, staleReason: 'missing' }, { provider: 'hermes' });
  assert.equal(stale.status, '观察路径已失效 · 需要修复');
  assert.deepEqual(stale.actions.map(action => action.id), ['repair', 'remove']);
  assert.deepEqual(Status.describe({ installed: true }, { provider: 'codex' }).actions.map(action => action.id), ['test', 'remove']);
  for (const value of ['已收到首个事件 · 3 分钟前收到事件', '观察指向另一份应用 · 需要修复', '24 小时内漏记 2 个事件', '发送测试事件', '修复'])
    assert.notEqual(I18n.translate('en', value), value, value);
});

test('Send test event proves the pipe without creating a session, companion or usage record', async t => {
  const root = temp(t), homeDir = path.join(root, 'home'); fs.mkdirSync(homeDir);
  const dataDir = path.join(root, 'data'), store = createSessionStore(), received = [];
  const ledger = createConnectionLedger({ file: path.join(dataDir, 'connection-evidence.json') });
  const bridge = createObserverBridge({ homeDir, env: { PATH: process.env.PATH }, dataDir, appRoot: path.join(__dirname, '..'), electronPath: process.execPath, ledger,
    onEvent: event => { received.push(event); store.ingest(event); } });
  bridge.start(); t.after(() => bridge.stop());
  const result = await bridge.testEvent('codex');
  assert.equal(result.status, 'ok', result.message);
  assert.deepEqual(received, []);
  assert.deepEqual(store.snapshot(), []);
  assert.ok(ledger.get('codex').testPassedAt);
  assert.equal(ledger.get('codex').lastEventAt, undefined, 'a test is not a real event');
  const row = bridge.getConnections().find(item => item.provider === 'codex');
  assert.equal(Status.state(row), 'not-connected');
  assert.ok(await until(() => fs.existsSync(path.join(dataDir, 'events', 'codex.jsonl'))));
});

test('a test event that never arrives times out with a repair hint', async t => {
  const root = temp(t), homeDir = path.join(root, 'home'); fs.mkdirSync(homeDir);
  const bridge = createObserverBridge({ homeDir, env: { PATH: '' }, dataDir: path.join(root, 'data'), appRoot: path.join(__dirname, '..'), electronPath: process.execPath,
    spawn: () => ({ on() {}, stdin: { on() {}, end() {} } }) });
  bridge.start(); t.after(() => bridge.stop());
  const result = await bridge.testEvent('codex', { timeoutMs: 100 });
  assert.equal(result.status, 'error'); assert.match(result.message, /修复/);
});
