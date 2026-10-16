'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAttendance } = require('../lib/attendance-model.js');
const { normalizeEvent } = require('../lib/provider-events.cjs');
const { createSessionStore } = require('../lib/session-store.cjs');

const task = (id, extra = {}) => ({ id, sessionId: id, provider: 'codex', status: 'active',
  activity: 'coding', lastEventAt: 1000, activeTools: 0, attention: false, ...extra });
const idle = (id, at, extra = {}) => task(id, { status: 'idle', activity: 'idle', lastEventAt: at, ...extra });
function hookIdle(id, at, provider = 'codex', raw = { hook_event_name: 'SessionStart', session_id: id }) {
  const event = normalizeEvent(provider, raw, { receivedAt: at, source: 'hook' });
  assert.ok(event); const store = createSessionStore({ now: () => at });
  assert.equal(store.ingest(event), true); return store.snapshot()[0];
}

test('initial idle history stays outside while live work enters, without changing session truth', () => {
  const model = createAttendance({ now: () => 10000 });
  const old = Object.freeze(idle('resting', 1000));
  const active = Object.freeze(task('busy'));
  const result = model.update([old, active]);
  assert.deepEqual(result.present, [active]); assert.deepEqual(result.entering, ['busy']);
  assert.deepEqual(result.retired, ['resting']); assert.deepEqual(result.leaving, []);
  assert.equal(old.closed, undefined); assert.equal(old.status, 'idle');
});
test('confirmed idle receives twenty seconds grace then emits exactly one visual departure', () => {
  let time = 1000; const model = createAttendance({ now: () => time });
  model.update([task('a')]); time = 2000;
  const stopped = idle('a', time); assert.equal(model.update([stopped]).present.length, 1);
  time = 21999; assert.deepEqual(model.update([stopped]).leaving, []);
  time = 22000; let result = model.update([stopped]);
  assert.deepEqual(result.leaving, ['a']); assert.deepEqual(result.retired, ['a']); assert.deepEqual(result.present, []);
  time = 50000; result = model.update([stopped]);
  assert.deepEqual(result.leaving, []); assert.deepEqual(result.entering, []); assert.deepEqual(result.retired, ['a']);
});
test('new activity with the same external identity interrupts retirement and cannot be re-entered by duplicate snapshots', () => {
  let time = 1000; const model = createAttendance({ idleMs: 20, now: () => time });
  model.update([task('same-id')]); time = 1001; model.update([idle('same-id', time)]);
  time = 1021; assert.deepEqual(model.update([idle('same-id', 1001)]).leaving, ['same-id']);
  const resumed = task('same-id', { lastEventAt: 1022, title: 'Same stable name' }); time = 1022;
  let result = model.update([resumed]); assert.deepEqual(result.entering, ['same-id']); assert.equal(result.present[0], resumed);
  result = model.update([resumed]); assert.deepEqual(result.entering, []); assert.deepEqual(result.leaving, []);
});
test('stale and disconnected never start an idle departure or resurrect a previously idle retiree', () => {
  let time = 1000; const model = createAttendance({ idleMs: 20, now: () => time });
  model.update([task('live'), idle('already-idle', 500)]);
  time = 100000;
  const result = model.update([task('live', { status: 'stale', activity: 'unknown', disconnected: true }),
    idle('already-idle', 500, { status: 'stale', activity: 'unknown', disconnected: true })]);
  assert.deepEqual(result.present.map(s => s.id), ['live']); assert.deepEqual(result.leaving, []);
  assert.deepEqual(result.entering, []); assert.deepEqual(result.retired, ['already-idle']);
});
test('waiting user and active tools protect attendance even when an inconsistent status says idle', () => {
  let time = 1000; const model = createAttendance({ idleMs: 20, now: () => time });
  model.update([task('waiting'), task('tool')]); time = 100000;
  const result = model.update([idle('waiting', 1000, { attention: true }), idle('tool', 1000, { activeTools: 1 })]);
  assert.equal(result.present.length, 2); assert.deepEqual(result.leaving, []);
});
test('active helpers protect an idle parent across project rooms, and grace starts when collaboration really stops', () => {
  let time = 1000; const model = createAttendance({ idleMs: 20, now: () => time });
  const parent = idle('parent', 500, { projectPath: '/A' });
  const child = task('child', { parentId: 'parent', projectPath: '/B' });
  assert.equal(model.update([parent, child]).present.length, 2);
  time = 5000; assert.deepEqual(model.update([parent, child]).leaving, []);
  const closed = task('child', { parentId: 'parent', status: 'closed', closed: true, lastEventAt: time });
  let result = model.update([parent, closed]); assert.deepEqual(result.leaving, ['child']);
  assert.deepEqual(result.present.map(s => s.id), ['parent']);
  time = 5019; assert.deepEqual(model.update([parent, closed]).leaving, []);
  time = 5020; result = model.update([parent, closed]); assert.deepEqual(result.leaving, ['parent']);
});
test('uncertain child cannot prove its parent finished, and helper ancestry handles cycles safely', () => {
  let time = 1000; const model = createAttendance({ idleMs: 20, now: () => time });
  const sessions = [idle('root', 500), task('child', { parentId: 'root', status: 'stale', activity: 'unknown', disconnected: true }),
    task('cycle-a', { parentId: 'cycle-b' }), task('cycle-b', { parentId: 'cycle-a' })];
  model.update(sessions); time = 100000;
  assert.equal(model.update(sessions).present.length, 4);
});
test('closed sessions depart immediately, children remain governed by their own observed state', () => {
  let time = 1000; const model = createAttendance({ now: () => time });
  model.update([task('parent'), task('child', { parentId: 'parent' })]); time += 1;
  const result = model.update([task('parent', { status: 'closed', closed: true, lastEventAt: time }), task('child', { parentId: 'parent' })]);
  assert.deepEqual(result.leaving, ['parent']); assert.deepEqual(result.present.map(s => s.id), ['child']);
  assert.deepEqual(model.update([task('parent', { status: 'closed', closed: true }), task('child', { parentId: 'parent' })]).leaving, []);
});
test('fresh idle SessionStart can arrive later; another idle timestamp alone cannot wake a retired actor', () => {
  let time = 1000; const model = createAttendance({ idleMs: 20, now: () => time });
  model.update([idle('codex:old', 500)]); time = 2000;
  let result = model.update([idle('codex:old', 2000), idle('new', 2000)]);
  assert.deepEqual(result.entering, ['new']); assert.deepEqual(result.present.map(s => s.id), ['new']);
  time = 3000;
  result = model.update([hookIdle('old', time)]);
  assert.ok(result.entering.includes('codex:old'));
});
test('a real fresh SessionStart survives the first idle snapshot at now or just before startup without inventing work', () => {
  for (const offset of [0, -1]) {
    let time = 100000; const model = createAttendance({ now: () => time });
    const session = hookIdle('startup-' + Math.abs(offset), time + offset), truth = structuredClone(session);
    let result = model.update([session]);
    assert.deepEqual(result.entering, [session.id]); assert.deepEqual(result.retired, []);
    assert.equal(result.present[0], session); assert.equal(session.status, 'idle'); assert.equal(session.activity, 'idle'); assert.equal(session.activeTools, 0);
    assert.deepEqual(session, truth, 'attendance preserves observed identity, timestamps, evidence and state');
    assert.deepEqual(model.update([session]).entering, [], 'a repeated snapshot cannot replay the entrance');
    time += 19999; assert.equal(model.update([session]).present.length, 1);
    time += 1; result = model.update([session]); assert.deepEqual(result.leaving, [session.id]); assert.deepEqual(result.present, []);
    time += 1; result = model.update([session]); assert.deepEqual(result.entering, []); assert.deepEqual(result.leaving, []); assert.deepEqual(result.retired, [session.id]);
  }
});
test('fresh startup arrival uses the existing idle grace window and rejects old or future hook evidence', () => {
  const time = 100000;
  for (const [idleMs, offset, enters] of [[20000, -19999, true], [20000, -20000, false], [20000, -20001, false], [20000, 1, false], [20, -19, true], [20, -20, false]]) {
    const model = createAttendance({ idleMs, now: () => time }), session = hookIdle('window-' + idleMs + '-' + offset, time + offset);
    assert.equal(model.update([session]).present.length, enters ? 1 : 0, JSON.stringify({ idleMs, offset }));
  }
});
test('normalized Cursor, Hermes and Kiro hook starts retain their actual identities and explicit idle evidence', () => {
  const time = 100000;
  for (const [provider, raw] of [
    ['cursor', { hook_event_name: 'sessionStart', conversation_id: 'cursor-start' }],
    ['hermes', { hook_event_name: 'on_session_start', session_id: 'hermes-start' }],
    ['kiro-cli', { hook_event_name: 'agentSpawn', session_id: 'kiro-start' }]
  ]) {
    const model = createAttendance({ now: () => time }), session = hookIdle(provider, time - 1, provider, raw);
    assert.equal(session.provider, provider); assert.equal(session.events.at(-1).evidence.source, 'hook');
    assert.equal(session.events.at(-1).evidence.confidence, 'explicit'); assert.equal(model.update([session]).present[0], session);
    assert.equal(session.status, 'idle'); assert.equal(session.activity, 'idle');
  }
});
test('ordinary idle metadata, restored rollouts and incomplete SessionStart evidence remain outside on startup', () => {
  const time = 100000, native = hookIdle('rejected-start', time);
  const variants = [
    idle('plain-idle', time),
    idle('metadata-only', time, { events: [{ event: 'metadata', at: time, evidence: { source: 'hook', confidence: 'explicit' } }] }),
    { ...native, events: [{ ...native.events[0], evidence: { source: 'codex-jsonl', confidence: 'rollout-derived', restored: true } }] },
    { ...native, evidence: { source: 'codex-jsonl', restored: true, snapshot: 'ended-turn' } },
    { ...native, events: [{ ...native.events[0], evidence: { source: 'hook', confidence: 'explicit', restored: true } }] },
    { ...native, events: [{ ...native.events[0], evidence: { source: 'hook', confidence: 'explicit', snapshot: 'restored-wait' } }] },
    { ...native, events: [{ ...native.events[0], evidence: { source: 'upstream-derived', confidence: 'explicit' } }] },
    { ...native, events: [{ ...native.events[0], evidence: { source: 'hook', confidence: 'unknown' } }] },
    { ...native, events: [{ ...native.events[0], evidence: {} }] },
    { ...native, events: [{ ...native.events[0], at: undefined }] },
    { ...native, lastEventAt: time + 1 },
    { ...native, events: [{ ...native.events[0] }, { event: 'metadata', at: time, evidence: { source: 'hook', confidence: 'explicit' } }] }
  ];
  for (const session of variants) {
    const model = createAttendance({ now: () => time }), result = model.update([session]);
    assert.deepEqual(result.present, []); assert.deepEqual(result.entering, []); assert.deepEqual(result.retired, [session.id]);
  }
});
test('a retired idle identity requires a fresh explicit hook boundary to return, not a newer historical or metadata timestamp', () => {
  let time = 100000; const native = hookIdle('retired-start', time), model = createAttendance({ now: () => time });
  model.update([idle(native.id, time - 30000)]);
  for (const evidence of [{ source: 'codex-jsonl', confidence: 'rollout-derived', restored: true }, { source: 'hook', confidence: 'unknown' }]) {
    time += 1;
    const session = hookIdle('retired-start', time); session.events[0].evidence = evidence;
    assert.deepEqual(model.update([session]).present, []);
  }
  time += 1;
  assert.deepEqual(model.update([idle(native.id, time, { events: [{ event: 'metadata', at: time, evidence: { source: 'hook', confidence: 'explicit' } }] })]).present, []);
  time += 1; const fresh = hookIdle('retired-start', time), result = model.update([fresh]);
  assert.deepEqual(result.entering, [fresh.id]); assert.equal(result.present[0], fresh); assert.equal(fresh.status, 'idle');
});
test('a later completed-rollout correction still retires earlier open history instead of reviving it as a fresh arrival', () => {
  let time = 100000; const store = createSessionStore({ now: () => time }), model = createAttendance({ now: () => time });
  const sessionId = 'ended-history';
  assert.equal(store.ingest({ provider: 'codex', sessionId, event: 'turn-start', activity: 'planning', at: 1000, turnId: 'old-turn', turnStartedAt: 1000, eventId: 'old-start', evidence: { source: 'codex-jsonl', rawEvent: 'rollout:sustained-snapshot', restored: true } }), true);
  assert.equal(model.update(store.snapshot()).present.length, 1);
  time += 10;
  assert.equal(store.ingest({ provider: 'codex', sessionId, event: 'metadata', activity: 'idle', at: 3000, turnId: 'new-ended-turn', turnStartedAt: 2000, turnEndedAt: 3000, supersedesTurnId: 'old-turn', eventId: 'ended-correction', evidence: { source: 'codex-jsonl', rawEvent: 'rollout:ended-turn-snapshot', restored: true, snapshot: 'ended-turn' } }), true);
  const snapshot = store.snapshot(), result = model.update(snapshot);
  assert.equal(snapshot[0].status, 'idle'); assert.deepEqual(result.present, []); assert.deepEqual(result.leaving, [snapshot[0].id]);
  assert.deepEqual(model.update(snapshot).entering, []);
});
test('a newly active helper brings a retired idle parent back, while names remain owned by the supplied ID mapping', () => {
  let time = 1000; const model = createAttendance({ now: () => time });
  const parent = idle('stable-parent', 500, { title: 'Existing label' }); model.update([parent]);
  time = 2000; const result = model.update([parent, task('helper', { parentId: 'stable-parent', lastEventAt: time })]);
  assert.ok(result.entering.includes('stable-parent')); assert.equal(result.present.find(s => s.id === 'stable-parent'), parent);
  assert.equal(result.present.find(s => s.id === 'stable-parent').title, 'Existing label');
});
test('removed rows emit one visual departure and retired attendance memory is bounded', () => {
  let time = 1000; const model = createAttendance({ maxEntries: 4, now: () => time });
  model.update([task('first')]);
  assert.deepEqual(model.update([]).leaving, ['first']); assert.deepEqual(model.update([]).leaving, []);
  for (let i = 0; i < 40; i++) { time += 1; model.update([task(`new-${i}`, { lastEventAt: time })]); assert.ok(model.size() <= 4); }
  assert.equal(model.state('first'), null);
  const state = model.state('new-39'); state.phase = 'tampered'; assert.equal(model.state('new-39').phase, 'present');
  model.clear(); assert.equal(model.size(), 0); assert.deepEqual(model.update([idle('history', 100)]).present, []);
});
