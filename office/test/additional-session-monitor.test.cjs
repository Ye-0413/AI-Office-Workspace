'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createAdditionalSessionMonitor, LIMITS } = require('../lib/additional-session-monitor.cjs');

const AT = Date.parse('2026-10-23T10:00:00Z');
const iso = value => new Date(value).toISOString();
const piHeader = (id = 'pi-session', extra = {}) => ({ type: 'session', id, timestamp: iso(AT - 20000), cwd: '/PRIVATE/PROJECT', ...extra });
const piMessage = (id, role, extra = {}, time = AT - 10000) => ({ type: 'message', id, timestamp: iso(time), message: { role, content: [{ type: 'text', text: 'PRIVATE TRANSCRIPT' }], ...extra } });
const piUsage = (id, tokens = 10, time = AT - 10000) => piMessage(id, 'assistant', { model: 'pi-model', usage: { input: tokens, output: 3, cacheRead: 4, cacheWrite: 5 } }, time);
const gemini = (id, time = AT - 10000, extra = {}) => ({ id, type: 'gemini', model: 'gemini-model', timestamp: iso(time), content: 'PRIVATE RESPONSE', tokens: { input: 100, output: 20, cached: 30, thoughts: 5 }, ...extra });
function fakeStore() {
  const cursors = new Map(), records = new Map();
  const clone = value => JSON.parse(JSON.stringify(value));
  return { cursors, records, fail: false,
    cursor(key) { return cursors.has(key) ? clone(cursors.get(key)) : null; },
    commit(key, checkpoint, values) {
      if (this.fail) return false;
      for (const value of values) {
        const previous = records.get(value.key), next = { ...value, ...(previous ? { sessionId: previous.sessionId, at: previous.at } : {}) };
        if (previous) for (const field of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens']) next[field] = Math.max(previous[field], next[field]);
        records.set(next.key, next);
      }
      cursors.set(key, clone(checkpoint)); return true;
    },
  };
}
function fixture(t, env = {}) {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-additional-')), monitors = [], store = fakeStore(), events = [];
  let time = AT;
  const roots = { pi: '.pi/agent/sessions/project', omp: '.omp/agent/sessions/project', gemini: '.gemini/tmp/project/chats', kimi: '.kimi/sessions/project/session/agents/main' };
  function file(provider, name, rows, json = false) {
    const target = path.join(homeDir, roots[provider], name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, json ? JSON.stringify(rows) : rows.map(row => JSON.stringify(row)).join('\n') + '\n');
    return target;
  }
  function monitor(extra = {}) {
    const result = createAdditionalSessionMonitor({ store, homeDir, env, now: () => time, onEvent: e => events.push(e), ...extra });
    monitors.push(result); return result;
  }
  function sqlite(v2 = false) {
    const target = path.join(homeDir, '.local/share/opencode/opencode.db'); fs.mkdirSync(path.dirname(target), { recursive: true });
    const db = new DatabaseSync(target);
    db.exec('PRAGMA journal_mode=WAL; CREATE TABLE session(id TEXT PRIMARY KEY,parent_id TEXT); CREATE TABLE message(id TEXT PRIMARY KEY,session_id TEXT,data TEXT);');
    if (v2) db.exec('CREATE TABLE session_v2(id TEXT PRIMARY KEY,parent_id TEXT); CREATE TABLE session_message(id TEXT PRIMARY KEY,session_id TEXT,type TEXT,data TEXT);');
    t.after(() => db.close()); return { db, target };
  }
  t.after(() => { monitors.forEach(m => m.stop()); fs.rmSync(homeDir, { recursive: true, force: true }); });
  return { homeDir, roots, store, events, file, monitor, sqlite, tick(ms = 1000) { time += ms; return time; } };
}

test('historical Gemini/Pi/OMP/Kimi usage imports independently without publishing old activity or private content', t => {
  const f = fixture(t);
  f.file('gemini', 'session-one.json', { sessionId: 'gemini-session', messages: [{ id: 'u', type: 'user', timestamp: iso(AT - 12000), content: 'PRIVATE PROMPT' }, gemini('g1')] }, true);
  f.file('pi', 'one.jsonl', [piHeader(), piUsage('pi-one')]);
  f.file('omp', 'one.jsonl', [piHeader('omp-session'), piUsage('omp-one', 20)]);
  f.file('kimi', 'wire.jsonl', [{ type: 'llm.request', model: 'actual-kimi-model', time: AT - 12000 },
    { type: 'agent.message.appended', time: AT - 10000, message: { message: { role: 'assistant', content: 'PRIVATE' }, meta: { messageId: 'k1', model: { model: 'agent-loop' }, usage: { inputOther: 7, output: 8, inputCacheRead: 9, inputCacheCreation: 10 } } } }]);
  const m = f.monitor(); m.scan();
  assert.equal(f.store.records.size, 4); assert.deepEqual(f.events, []);
  const g = [...f.store.records.values()].find(row => row.provider === 'gemini-cli');
  assert.deepEqual([g.inputTokens, g.outputTokens, g.cacheReadTokens, g.reasoningTokens], [70, 25, 30, 5]);
  const k = [...f.store.records.values()].find(row => row.provider === 'kimi-cli'); assert.equal(k.model, 'actual-kimi-model'); assert.equal(k.sessionId, 'session');
  assert.ok(!JSON.stringify([...f.store.cursors.values(), ...f.store.records.values()]).includes('PRIVATE'));
  assert.deepEqual(m.status().activityProviders, ['gemini-cli', 'pi', 'omp']);
  assert.equal(m.status().sources.find(s => s.provider === 'kimi-cli').activity, false);
  assert.ok(m.status().completedScans >= 1); assert.equal(m.status().scanInProgress, false);
  for (let i = 0; i < 3; i++) m.scan();
  assert.equal(m.status().sources.find(s => s.provider === 'pi').files, 1, 'source file count does not grow on repeated reads');
});

test('Pi append and partial tails survive restart and copied logs retain one native usage charge', t => {
  const f = fixture(t), file = f.file('pi', 'one.jsonl', [piHeader(), piUsage('m1')]);
  let m = f.monitor(); m.scan();
  const addition = JSON.stringify(piUsage('m2', 30));
  fs.appendFileSync(file, addition.slice(0, 70)); m.scan(); assert.equal(f.store.records.size, 1);
  m.stop(); m = f.monitor(); m.scan(); fs.appendFileSync(file, addition.slice(70) + '\n'); m.scan();
  assert.equal(f.store.records.size, 2);
  fs.copyFileSync(file, path.join(path.dirname(file), 'copy.jsonl'));
  for (let i = 0; i < 4; i++) m.scan(); assert.equal(f.store.records.size, 2); assert.deepEqual(f.events, []);
});

test('fresh Pi tool calls/results preserve call identity, explicit outcomes, and terminal stop without token-based success', t => {
  const f = fixture(t), file = f.file('pi', 'one.jsonl', [piHeader(), piMessage('old-user', 'user')]);
  const m = f.monitor(); m.scan();
  const time = f.tick();
  fs.appendFileSync(file, JSON.stringify(piMessage('call-message', 'assistant', { content: [{ type: 'toolCall', id: 'native-call', name: 'read', arguments: { path: 'PRIVATE PATH' } }], stopReason: 'toolUse' }, time)) + '\n');
  m.scan(); assert.equal(f.events.length, 1); assert.equal(f.events[0].event, 'tool-start'); assert.equal(f.events[0].toolCallId, 'native-call'); assert.equal(f.events[0].activity, 'reading');
  fs.appendFileSync(file, JSON.stringify(piMessage('unrelated', 'toolResult', { toolCallId: 'unknown', isError: false }, f.tick())) + '\n'); m.scan(); assert.equal(f.events.length, 1);
  fs.appendFileSync(file, JSON.stringify(piMessage('result', 'toolResult', { toolCallId: 'native-call', toolName: 'read_file', isError: false }, f.tick())) + '\n'); m.scan();
  assert.equal(f.events[1].event, 'tool-end'); assert.equal(f.events[1].outcome, 'success');
  fs.appendFileSync(file, JSON.stringify(piUsage('usage-only', 25, f.tick())) + '\n'); m.scan(); assert.equal(f.events.length, 2, 'usage does not manufacture completion');
  fs.appendFileSync(file, JSON.stringify(piMessage('final', 'assistant', { stopReason: 'stop' }, f.tick())) + '\n'); m.scan();
  assert.equal(f.events[2].event, 'turn-end'); assert.equal(f.events[2].evidence.source, 'session-jsonl'); assert.ok(!JSON.stringify(f.events).includes('PRIVATE'));
  m.scan(); assert.equal(f.events.length, 3);
});

test('fresh user boundaries start a new Pi turn while historical terminal/results never create a live actor', t => {
  const f = fixture(t), file = f.file('omp', 'one.jsonl', [piHeader('omp-session'), piMessage('historic-user', 'user'), piMessage('historic-end', 'assistant', { stopReason: 'stop' })]);
  const m = f.monitor(); m.scan(); assert.deepEqual(f.events, []);
  fs.appendFileSync(file, JSON.stringify(piMessage('dangling-result', 'toolResult', { toolCallId: 'old', isError: false }, f.tick())) + '\n'); m.scan(); assert.deepEqual(f.events, []);
  fs.appendFileSync(file, JSON.stringify(piMessage('new-user', 'user', {}, f.tick())) + '\n'); m.scan();
  assert.equal(f.events.length, 1); assert.equal(f.events[0].turnId, 'new-user'); assert.equal(f.events[0].provider, 'omp');
});

test('Gemini JSON rewrites upsert one request and explicit tool status updates alone resolve correlated work', t => {
  const f = fixture(t), file = f.file('gemini', 'session-one.json', { sessionId: 'g-session', messages: [] }, true), m = f.monitor(); m.scan();
  const time = f.tick(), user = { id: 'u', type: 'user', timestamp: iso(time), content: 'PRIVATE PROMPT' };
  const call = { id: 'call', name: 'read_file', args: { file: 'PRIVATE' }, status: 'executing' }, message = gemini('g1', time, { toolCalls: [call] });
  fs.writeFileSync(file, JSON.stringify({ sessionId: 'g-session', messages: [user, message] })); m.scan();
  assert.deepEqual(f.events.map(e => e.event), ['turn-start', 'tool-start']);
  call.status = 'error'; call.endTime = iso(f.tick()); message.tokens.output = 40;
  fs.writeFileSync(file, JSON.stringify({ sessionId: 'g-session', messages: [user, message] })); m.scan();
  assert.equal(f.events.at(-1).event, 'tool-end'); assert.equal(f.events.at(-1).outcome, 'failure');
  assert.equal(f.store.records.size, 1); assert.equal([...f.store.records.values()][0].outputTokens, 45);
  assert.ok(!f.events.some(e => e.event === 'turn-end'), 'native usage/token presence cannot settle the turn');
  message.finishReason = 'STOP'; message.timestamp = iso(f.tick());
  fs.writeFileSync(file, JSON.stringify({ sessionId: 'g-session', messages: [user, message] })); m.scan(); assert.equal(f.events.at(-1).event, 'turn-end');
});

test('Gemini native JSONL metadata/checkpoint updates and JSON shadow files preserve native identity', t => {
  const f = fixture(t);
  const file = f.file('gemini', 'session-one.jsonl', [{ sessionId: 'g-session' }, gemini('g1')]);
  f.file('gemini', 'session-one.json', { sessionId: 'wrong-shadow', messages: [gemini('shadow')] }, true);
  const m = f.monitor(); m.scan(); assert.equal(f.store.records.size, 1);
  fs.appendFileSync(file, JSON.stringify({ $set: { sessionId: 'g-session', messages: [gemini('g1', AT - 10000, { tokens: { input: 150, output: 20, cached: 30 } }), gemini('g2')] } }) + '\n');
  m.scan(); assert.equal(f.store.records.size, 2); assert.ok([...f.store.records.values()].every(r => r.sessionId === 'g-session'));
  fs.appendFileSync(file, JSON.stringify({ $rewindTo: 'g1' }) + '\n'); m.scan(); assert.equal(f.store.records.size, 2, 'rewinding conversation cannot refund already incurred token usage');
});

test('Pi tool-result projections are excluded and nested native child sessions retain parent identity', t => {
  const f = fixture(t), parent = f.file('pi', 'parent.jsonl', [piHeader('parent'), piUsage('parent-usage')]);
  const child = path.join(parent.slice(0, -6), 'run-a/run-0/session.jsonl'); fs.mkdirSync(path.dirname(child), { recursive: true });
  fs.writeFileSync(child, [piHeader('child', { parentSession: parent }), piUsage('child-usage', 20)].map(JSON.stringify).join('\n') + '\n');
  fs.appendFileSync(parent, JSON.stringify(piMessage('projected', 'toolResult', { toolCallId: 'subagent', usage: { input: 999, output: 999 }, details: { sessionFile: child } })) + '\n');
  const m = f.monitor(); for (let i = 0; i < 3; i++) m.scan();
  assert.equal(f.store.records.size, 2); assert.equal([...f.store.records.values()].find(r => r.sessionId === 'child').parentSessionId, 'parent');
});

test('failed token transactions publish nothing and leave cursor unchanged for a complete retry', t => {
  const f = fixture(t), file = f.file('pi', 'one.jsonl', [piHeader()]), m = f.monitor(); m.scan();
  fs.appendFileSync(file, [piMessage('new-user', 'user', {}, f.tick()), piUsage('m1', 10, f.tick())].map(JSON.stringify).join('\n') + '\n');
  const before = JSON.stringify([...f.store.cursors]); f.store.fail = true; m.scan();
  assert.equal(JSON.stringify([...f.store.cursors]), before); assert.equal(f.store.records.size, 0); assert.deepEqual(f.events, []); assert.match(m.status().error, /IMPORT_TRANSACTION/);
  f.store.fail = false; m.scan(); assert.equal(f.store.records.size, 1); assert.equal(f.events.length, 1);
});

test('bounded malformed/oversized JSONL reading resumes at later valid records and rejects source symlink files', t => {
  const f = fixture(t), file = f.file('pi', 'one.jsonl', [piHeader()]);
  fs.appendFileSync(file, 'not-json\n' + JSON.stringify({ type: 'message', message: { content: 'x'.repeat(LIMITS.chunk + 5000) } }) + '\n' + JSON.stringify(piUsage('valid')) + '\n');
  fs.symlinkSync(file, path.join(path.dirname(file), 'alias.jsonl'));
  const m = f.monitor(); for (let i = 0; i < 8; i++) { const before = m.status().bytesRead; m.scan(); assert.ok(m.status().bytesRead - before <= LIMITS.bytes); }
  assert.equal(f.store.records.size, 1); assert.ok(m.status().malformedLines > 0); assert.ok(m.status().oversizedLines > 0);
});

test('oversized or incomplete native JSON is visible and is not checkpointed as successful', t => {
  const f = fixture(t), file = f.file('gemini', 'session-one.json', { sessionId: 'g' }, true), m = f.monitor();
  fs.writeFileSync(file, '{"sessionId":'); m.scan(); assert.match(m.status().error, /INCOMPLETE_JSON/); assert.equal(f.store.cursors.size, 0);
  fs.writeFileSync(file, 'x'.repeat(LIMITS.json + 1)); m.scan(); assert.match(m.status().error, /JSON_TOO_LARGE/); assert.equal(f.store.cursors.size, 0);
});

test('OpenCode read-only V1 imports completed usage, follows WAL updates, and never publishes token rows as activity', t => {
  const f = fixture(t), { db } = f.sqlite();
  db.prepare('INSERT INTO session VALUES(?,?)').run('s', null);
  const value = completed => ({ role: 'assistant', modelID: 'open-model', tokens: { input: 10, output: 20, reasoning: 5, cache: { read: 3, write: 4 } }, time: { created: AT - 10000, ...(completed ? { completed: AT - 9000 } : {}) } });
  db.prepare('INSERT INTO message VALUES(?,?,?)').run('m1', 's', JSON.stringify(value(false)));
  const m = f.monitor(); m.scan(); assert.equal(f.store.records.size, 0);
  db.prepare('UPDATE message SET data=? WHERE id=?').run(JSON.stringify(value(true)), 'm1');
  m.scan(); assert.equal(f.store.records.size, 1);
  const record = [...f.store.records.values()][0]; assert.equal(record.provider, 'opencode'); assert.equal(record.outputTokens, 25); assert.equal(record.reasoningTokens, 5);
  assert.deepEqual(f.events, []); assert.equal(m.status().sources.find(s => s.provider === 'opencode').activity, false);
});

test('OpenCode V2 takes precedence over frozen V1, supports terminal compaction usage and native parent IDs', t => {
  const f = fixture(t), { db } = f.sqlite(true);
  db.prepare('INSERT INTO session VALUES(?,?)').run('frozen', null);
  const value = { role: 'assistant', modelID: 'old', tokens: { input: 999 }, time: { created: AT - 10000, completed: AT - 9000 } };
  db.prepare('INSERT INTO message VALUES(?,?,?)').run('old', 'frozen', JSON.stringify(value));
  db.prepare('INSERT INTO session_v2 VALUES(?,?)').run('child', 'parent');
  const data = { status: 'completed', model: { id: 'new-model' }, tokens: { input: 15, output: 10, cache: { read: 3 } }, time: { created: AT - 10000 } };
  db.prepare('INSERT INTO session_message VALUES(?,?,?,?)').run('new', 'child', 'compaction', JSON.stringify(data));
  const m = f.monitor(); m.scan(); assert.equal(f.store.records.size, 1);
  const record = [...f.store.records.values()][0]; assert.equal(record.inputTokens, 15); assert.equal(record.model, 'new-model'); assert.equal(record.parentSessionId, 'parent');
});

test('Kimi copied fork receipts use global native provider/message identity and retain first session attribution', t => {
  const f = fixture(t);
  const receipt = provider => ({ type: 'agent.message.appended', time: AT - 10000, message: { message: { role: 'assistant', content: 'PRIVATE' },
    meta: { messageId: 'request1', model: { provider, model: 'vendor/model' }, usage: { inputOther: 10, output: 20, inputCacheRead: 30, inputCacheCreation: 40 } } } });
  f.file('kimi', 'wire.jsonl', [receipt('custom')]);
  const m = f.monitor(); m.scan();
  const original = [...f.store.records.values()][0]; assert.equal(original.sessionId, 'session');
  const fork = path.join(f.homeDir, '.kimi/sessions/project/fork/agents/main/wire.jsonl');
  fs.mkdirSync(path.dirname(fork), { recursive: true }); fs.writeFileSync(fork, JSON.stringify(receipt('custom')) + '\n');
  for (let i = 0; i < 3; i++) m.scan();
  assert.equal(f.store.records.size, 1); assert.equal([...f.store.records.values()][0].sessionId, 'session');
  const one = [...f.store.records.values()][0]; assert.equal(one.inputTokens + one.outputTokens + one.cacheReadTokens + one.cacheWriteTokens, 100);
  fs.appendFileSync(fork, JSON.stringify(receipt('other-provider')) + '\n'); m.scan();
  assert.equal(f.store.records.size, 2, 'different native provider namespaces do not collapse unrelated committed requests');
});

test('OpenCode oversized early rows cannot block later valid usage and persist an explicit incomplete warning across restart', t => {
  const f = fixture(t), { db } = f.sqlite(); db.prepare('INSERT INTO session VALUES(?,?)').run('s', null);
  db.prepare('INSERT INTO message VALUES(?,?,?)').run('m1', 's', JSON.stringify({ role: 'user', content: 'x'.repeat(LIMITS.json + 100) }));
  db.prepare('INSERT INTO message VALUES(?,?,?)').run('m2', 's', JSON.stringify({ role: 'assistant', modelID: 'valid', tokens: { input: 10, output: 20 }, time: { created: AT - 10000, completed: AT - 9000 } }));
  let m = f.monitor(); m.scan();
  assert.equal(f.store.records.size, 1); assert.equal([...f.store.records.values()][0].inputTokens + [...f.store.records.values()][0].outputTokens, 30);
  assert.match(m.status().sources.find(s => s.provider === 'opencode').error, /SQLITE_MESSAGE_TOO_LARGE/);
  assert.equal(m.status().scanInProgress, true);
  const checkpoint = [...f.store.cursors.values()][0]; assert.equal(checkpoint.finished, false); assert.equal(checkpoint.state.deferredRows.length, 1);
  m.stop(); m = f.monitor(); m.scan();
  assert.match(m.status().sources.find(s => s.provider === 'opencode').error, /SQLITE_MESSAGE_TOO_LARGE/); assert.equal(f.store.records.size, 1);
  db.prepare('UPDATE message SET data=? WHERE id=?').run(JSON.stringify({ role: 'user', content: 'fixed' }), 'm1'); m.scan();
  assert.equal(m.status().sources.find(s => s.provider === 'opencode').error, '');
  assert.equal([...f.store.cursors.values()][0].finished, true);
});

test('provider discovery failure is isolated and cannot prevent unrelated native usage imports', t => {
  const f = fixture(t), invalid = path.join(f.homeDir, '.gemini/tmp'); fs.mkdirSync(path.dirname(invalid), { recursive: true }); fs.writeFileSync(invalid, 'not a directory');
  f.file('pi', 'valid.jsonl', [piHeader(), piUsage('valid')]);
  const m = f.monitor(); m.scan();
  assert.equal(f.store.records.size, 1); assert.equal(m.status().sources.find(s => s.provider === 'gemini-cli').error, 'UNSAFE_SOURCE');
  assert.equal(m.status().sources.find(s => s.provider === 'pi').error, ''); assert.equal(m.status().sources.find(s => s.provider === 'pi').available, true);
});

test('invalid timestamps cannot create token rows or live activity', t => {
  const f = fixture(t);
  f.file('gemini', 'session-invalid.json', { sessionId: 'g', messages: [gemini('invalid', AT, { timestamp: '2026-02-30T10:00:00Z' })] }, true);
  f.file('pi', 'invalid.jsonl', [piHeader(), { ...piUsage('invalid'), timestamp: 'invalid', message: { role: 'assistant', usage: { input: 10 } } }]);
  const m = f.monitor(); m.scan(); assert.equal(f.store.records.size, 0); assert.deepEqual(f.events, []);
});

test('delayed discovery after a long-running observer imports usage without activating stale post-start history', t => {
  const f = fixture(t), m = f.monitor();
  f.tick(LIMITS.liveFresh + 10000);
  f.file('pi', 'delayed.jsonl', [piHeader(), piMessage('user-after-start', 'user', {}, AT + 1000), piUsage('delayed-usage', 10, AT + 2000)]);
  m.scan(); assert.equal(f.store.records.size, 1); assert.deepEqual(f.events, []);
});
