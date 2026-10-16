'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createActivityStats, LIMITS } = require('../lib/activity-stats.cjs');

function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-activity-stats-'));
  let time = Date.parse('2026-10-16T07:00:00.000Z');
  const values = [];
  function create(dir = dataDir) { const stats = createActivityStats({ dataDir: dir, now: () => time }); values.push(stats); return stats; }
  t.after(() => { for (const stats of values) stats.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  return { dataDir, dir: path.join(dataDir, 'activity-stats'), create, now: () => time, set(at) { time = Date.parse(at); },
    event(extra = {}) { return { provider: 'codex', sessionId: 'PRIVATE-SESSION', event: 'turn-start', at: time,
      title: 'PRIVATE TASK', projectPath: '/PRIVATE/PROJECT', evidence: { source: 'hook' }, ...extra }; } };
}
test('accepted real activity counts unique full actors across providers, turns and helper upgrades', t => {
  const f = fixture(t), stats = f.create();
  assert.equal(stats.record(f.event()), true);
  assert.equal(stats.record(f.event({ event: 'tool-start', turnId: 'later', toolCallId: 'one' })), false);
  assert.equal(stats.record(f.event({ provider: 'cursor' })), true);
  assert.equal(stats.record(f.event({ subagentId: 'child', parentId: 'codex:PRIVATE-SESSION' })), true);
  assert.equal(stats.record(f.event({ parentId: 'root', event: 'activity' })), true);
  assert.equal(stats.record(f.event({ event: 'turn-end' })), false, 'helper knowledge only upgrades');
  assert.deepEqual(stats.snapshot(), { date: '2026-10-16', timeZone: 'Asia/Hong_Kong', total: 3, roots: 1, helpers: 2, scope: 'observed' });
  const collision = f.event({ sessionId: 'x:y', subagentId: 'z' }), distinct = f.event({ sessionId: 'x', subagentId: 'y:z' });
  assert.equal(stats.record(collision), true); assert.equal(stats.record(distinct), true);
});
test('session discovery and ordinary metadata never fabricate an active daily count', t => {
  const f = fixture(t), stats = f.create();
  for (const event of ['session-start', 'session-end', 'subagent-end', 'metadata', 'error', 'unknown']) assert.equal(stats.record(f.event({ event })), false);
  for (const event of [null, {}, f.event({ at: 'invalid' }), f.event({ at: undefined }), f.event({ sessionId: '' })]) assert.equal(stats.record(event), false);
  assert.equal(stats.snapshot().total, 0);
  for (const [i, event] of ['subagent-start', 'tool-start', 'tool-end', 'activity', 'waiting-user', 'turn-end', 'interrupted'].entries()) {
    assert.equal(stats.record(f.event({ sessionId: String(i), event })), true);
  }
  assert.equal(stats.snapshot().total, 7);
});
test('Hong Kong midnight uses actual original event dates and repeated roots count once each day', t => {
  const f = fixture(t), stats = f.create(); f.set('2026-10-16T15:59:59.000Z');
  const yesterday = f.event(); stats.record(yesterday); assert.equal(stats.snapshot().date, '2026-10-16');
  f.set('2026-10-16T16:00:00.000Z');
  assert.equal(stats.snapshot().date, '2026-10-17'); assert.equal(stats.snapshot().total, 0);
  assert.equal(stats.record(yesterday), false); assert.equal(stats.snapshot().total, 0);
  assert.equal(stats.record(f.event({ at: new Date(f.now()).toISOString() })), true); assert.equal(stats.snapshot().total, 1);
  assert.equal(stats.record(f.event({ sessionId: 'future', at: f.now() + 86400000 })), false);
});
test('buffered atomic private files contain hashes only and restore counts after restart', t => {
  const f = fixture(t), first = f.create();
  first.record(f.event()); first.record(f.event({ subagentId: 'PRIVATE-CHILD' })); first.record(f.event({ provider: 'cursor' }));
  assert.equal(fs.existsSync(f.dir), false, 'events are coalesced before disk IO');
  assert.equal(first.close(), true);
  const file = path.join(f.dir, '2026-10-16.json'), raw = fs.readFileSync(file, 'utf8');
  assert.equal(raw.includes('PRIVATE'), false); assert.equal(raw.includes('codex'), false);
  assert.ok(Buffer.byteLength(raw) < LIMITS.bytes); assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const saved = JSON.parse(raw); assert.equal(Object.keys(saved.actors).length, 3);
  assert.ok(Object.keys(saved.actors).every(key => /^[a-f0-9]{64}$/.test(key)));
  assert.deepEqual(fs.readdirSync(f.dir), ['2026-10-16.json']);
  const restarted = f.create(); assert.equal(restarted.snapshot().total, 3); assert.equal(restarted.snapshot().helpers, 1);
  assert.equal(restarted.record(f.event()), false);
  assert.equal(restarted.record(f.event({ parentId: 'known-parent' })), true);
  assert.equal(restarted.snapshot().helpers, 2); assert.equal(restarted.snapshot().total, 3);
});
test('trusted accepted ended-turn metadata counts its terminal day, never attachment time', t => {
  const f = fixture(t), stats = f.create();
  const end = Date.parse('2026-10-15T15:59:00.000Z');
  const event = f.event({ event: 'metadata', at: end, turnStartedAt: end - 10000, turnEndedAt: end,
    evidence: { source: 'codex-jsonl', rawEvent: 'rollout:ended-turn-snapshot', restored: true, snapshot: 'ended-turn' } });
  assert.equal(stats.record(event), true); assert.equal(stats.snapshot().total, 0); stats.flush();
  assert.equal(fs.existsSync(path.join(f.dir, '2026-10-15.json')), true);
  assert.equal(stats.record({ ...event, at: f.now(), sessionId: 'wrong-time' }), false);
  assert.equal(stats.record({ ...event, sessionId: 'wrong-source', evidence: { ...event.evidence, source: 'hook' } }), false);
  assert.equal(stats.snapshot().total, 0);
});
test('retention is fourteen Hong Kong dates and old observations cannot repopulate expired days', t => {
  const f = fixture(t), stats = f.create();
  fs.mkdirSync(f.dir); fs.writeFileSync(path.join(f.dir, '2026-01-01.json'), '{}');
  for (let i = 0; i < 14; i += 1) assert.equal(stats.record(f.event({ at: f.now() - i * 86400000 })), true);
  assert.equal(stats.record(f.event({ at: f.now() - 14 * 86400000 })), false);
  f.set('2026-10-17T07:00:00.000Z'); stats.record(f.event()); assert.equal(stats.flush(), true);
  assert.equal(fs.readdirSync(f.dir).length, 14); assert.equal(fs.existsSync(path.join(f.dir, '2026-01-01.json')), false);
  assert.equal(fs.existsSync(path.join(f.dir, '2026-10-03.json')), false);
  const restarted = f.create(); assert.equal(restarted.snapshot().total, 1);
});
test('daily capacity is bounded and reported honestly without dropping existing identities', t => {
  const f = fixture(t), stats = f.create();
  for (let i = 0; i < LIMITS.actors; i += 1) assert.equal(stats.record(f.event({ sessionId: `actor-${i}` })), true);
  assert.equal(stats.record(f.event({ sessionId: 'over-limit' })), false);
  assert.equal(stats.snapshot().total, LIMITS.actors); assert.match(stats.snapshot().error, /limit/);
  assert.equal(stats.record(f.event({ sessionId: 'actor-0', parentId: 'root' })), true);
  assert.equal(stats.snapshot().helpers, 1); assert.equal(stats.flush(), true);
  assert.ok(fs.statSync(path.join(f.dir, '2026-10-16.json')).size < LIMITS.bytes);
  f.set('2026-10-16T16:00:00.000Z');
  assert.equal(stats.snapshot().total, 0); assert.equal(stats.snapshot().error, undefined, 'the previous day cap does not contaminate a new Hong Kong day');
});
test('startup expires old owned aggregate files asynchronously even without new activity', async t => {
  const f = fixture(t); fs.mkdirSync(f.dir); const expired = path.join(f.dir, '2026-01-01.json'); fs.writeFileSync(expired, '{}');
  const stats = f.create(); assert.equal(stats.snapshot().total, 0);
  assert.equal(fs.existsSync(expired), true);
  await new Promise(resolve => setTimeout(resolve, LIMITS.flushMs + 40));
  assert.equal(fs.existsSync(expired), false); assert.equal(stats.snapshot().total, 0);
});
test('symlink files and directories are refused, write failures preserve targets and remain visible', t => {
  const f = fixture(t), stats = f.create(); stats.record(f.event()); stats.flush();
  const file = path.join(f.dir, '2026-10-16.json'), target = path.join(f.dataDir, 'private-target');
  fs.writeFileSync(target, 'PRESERVE'); fs.unlinkSync(file); fs.symlinkSync(target, file);
  stats.record(f.event({ sessionId: 'second' })); assert.equal(stats.flush(), false);
  assert.match(stats.snapshot().error, /save failed/); assert.equal(fs.readFileSync(target, 'utf8'), 'PRESERVE');
  fs.unlinkSync(file); assert.equal(stats.flush(), true); assert.equal(stats.snapshot().error, undefined);
  const linked = path.join(f.dataDir, 'linked'); fs.symlinkSync(f.dir, linked, 'dir');
  const blocked = f.create(linked); assert.match(blocked.snapshot().error, /load failed/);
  blocked.record(f.event()); assert.equal(blocked.flush(), false); assert.match(blocked.snapshot().error, /save failed/);
});
test('corrupt or oversized retained data is surfaced and preserved instead of silently overwritten', t => {
  const f = fixture(t); fs.mkdirSync(f.dir);
  const file = path.join(f.dir, '2026-10-16.json'); fs.writeFileSync(file, 'x'.repeat(LIMITS.bytes + 1));
  const stats = f.create(); assert.match(stats.snapshot().error, /load failed/);
  stats.record(f.event()); assert.equal(stats.flush(), false); assert.equal(fs.statSync(file).size, LIMITS.bytes + 1);
  assert.equal(stats.snapshot().total, 1); assert.match(stats.snapshot().error, /save failed/);
});
