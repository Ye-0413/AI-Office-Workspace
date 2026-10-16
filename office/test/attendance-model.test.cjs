'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAttendance } = require('../lib/attendance-model.js');

const task = (id, extra = {}) => ({ id, sessionId: id, provider: 'codex', status: 'active',
  activity: 'coding', lastEventAt: 1000, activeTools: 0, attention: false, ...extra });
const idle = (id, at, extra = {}) => task(id, { status: 'idle', activity: 'idle', lastEventAt: at, ...extra });

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
  model.update([idle('old', 500)]); time = 2000;
  let result = model.update([idle('old', 2000), idle('new', 2000)]);
  assert.deepEqual(result.entering, ['new']); assert.deepEqual(result.present.map(s => s.id), ['new']);
  time = 3000;
  result = model.update([idle('old', 3000, { events: [{ event: 'session-start', at: 3000 }] })]);
  assert.ok(result.entering.includes('old'));
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
