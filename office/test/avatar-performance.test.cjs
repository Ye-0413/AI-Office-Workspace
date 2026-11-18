'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../lib/avatar-performance-model.js');
const fixture = (activity = 'coding', patch = {}) => ({ id: 'codex:actor/complete-id', sessionId: 'actor/complete-id', provider: 'codex', activity, status: 'active', activeTools: 1, attention: false, events: [], ...patch });

test('observed activities map to eleven authored joint performances, never completion or sleep', () => {
  const kinds = new Set();
  for (const activity of Object.keys(Model.KINDS)) {
    const plan = Model.plan(fixture(activity));
    assert.equal(plan.active, true, activity);
    assert.equal(plan.animate, true, activity);
    assert.ok(plan.key.includes('codex:actor/complete-id'), 'the complete identity is retained');
    assert.doesNotMatch(plan.kind, /success|happy|sleep|complete|pass|retry/);
    kinds.add(plan.kind);
  }
  assert.equal(kinds.size, 11, 'every supported activity has its own choreography');
  for (const activity of ['idle', 'unknown', 'done', 'finished', '', null]) assert.equal(Model.plan(fixture(activity)).active, false, String(activity));
});

test('safety and lifecycle suppress performances before historical tool cues or parallel work', () => {
  const previousSuccess = { event: 'tool-end', eventId: 'old', outcome: 'success', at: 1000 };
  assert.equal(Model.plan(fixture('coding', { attention: true, activeTools: 9, events: [previousSuccess] })).kind, 'hand');
  assert.equal(Model.plan(fixture('error', { attention: true, activeTools: 9, events: [previousSuccess] })).kind, 'puzzled');
  assert.equal(Model.plan(fixture('waiting-user', { activeTools: 9 })).kind, 'hand');
  assert.equal(Model.plan(fixture('waiting-tool', { activeTools: 9 })).kind, 'listening');
  for (const patch of [{ closed: true }, { status: 'closed' }, { status: 'stale' }, { disconnected: true }]) {
    const plan = Model.plan(fixture('error', { attention: true, ...patch }));
    assert.equal(plan.active, false);
    assert.equal(plan.animate, false);
  }
  for (const option of ['walking', 'reaction', 'departing', 'stale', 'hidden']) {
    const plan = Model.plan(fixture('testing'), { [option]: true });
    assert.equal(plan.active, false, option);
    assert.equal(plan.reason, option);
  }
});

test('quiet preferences retain the observed tableau and stop all choreography', () => {
  for (const activity of Object.keys(Model.KINDS)) {
    const normal = Model.plan(fixture(activity));
    for (const preference of ['lowPower', 'reducedMotion']) {
      const quiet = Model.plan(fixture(activity), { [preference]: true });
      assert.equal(quiet.active, true);
      assert.equal(quiet.animate, false);
      assert.equal(quiet.key, normal.key);
      assert.equal(quiet.kind, normal.kind);
    }
  }
});

test('metadata, heartbeats, title edits and ordinary snapshots cannot restart a performance', () => {
  const value = fixture('reading');
  const original = Model.plan(value, { now: 1000 });
  for (let index = 0; index < 200; index += 1) {
    assert.deepEqual(Model.plan({ ...value, title: 'Updated title ' + index, summary: 'new metadata', lastEventAt: index * 2000, toolName: 'another read', events: [{ event: 'metadata', at: index * 2000 }] }, { now: index * 2000 }), original);
  }
  const variants = new Set(Array.from({ length: 50 }, (_, index) => Model.plan(fixture('reading', { id: 'codex:actor/' + index })).variant));
  assert.equal(variants.size, 3);
  assert.notEqual(Model.plan(fixture('reading', { id: 'provider:prefix/a' })).key, Model.plan(fixture('reading', { id: 'provider:prefix/b' })).key);
});

test('all 88 programs are reachable in real activities and rotate only on supplied visible work time', () => {
  const all = new Set();
  for (const activity of Object.keys(Model.KINDS)) {
    const value = fixture(activity), first = Model.plan(value);
    const expected = Model.PROGRAMS[first.kind];
    assert.equal(expected.length, 8, activity + ' has eight authored programs');
    assert.ok(first.programMs >= 18000 && first.programMs <= 24000);
    const seen = new Set();
    for (let index = 0; index < expected.length; index += 1) {
      const plan = Model.plan(value, { visibleElapsed: first.programMs * index });
      assert.equal(plan.kind, first.kind, 'rotation cannot turn one observed activity into another');
      assert.equal(plan.reason, first.reason);
      assert.notEqual(plan.program, Model.plan(value, { visibleElapsed: first.programMs * (index + 1) }).program);
      assert.doesNotMatch(plan.program, /(?:^|-)(?:success|pass|complete|retry|sleep)(?:-|$)/);
      seen.add(plan.program); all.add(plan.program);
    }
    assert.deepEqual([...seen].sort(), [...expected].sort());
    assert.equal(Model.plan(value, { visibleElapsed: first.programMs - 1 }).program, first.program);
    assert.equal(Model.plan(value, { now: 1e12 }).program, first.program, 'wall time alone does not rotate programs');
  }
  assert.equal(all.size, 88);
});

test('a newer lease exclusively owns one canonical full identity and an old renderer cannot change its clock', () => {
  const clocks = Model.createClockRegistry();
  const old = clocks.open(fixture('planning', { provider: 'Claude Code' }));
  old.sample('notebook', { now: 0 });
  assert.equal(old.sample('notebook', { now: 7000 }), 7000);
  const current = clocks.open(fixture('planning', { provider: 'claude-code' }));
  assert.equal(current.sample('notebook', { now: 100000 }), 7000, 'a new lease has no wall-time catch-up');
  old.sample('notebook', { now: 2000000 });
  old.release();
  assert.equal(current.sample('notebook', { now: 100005 }), 7005,
    'stale updates and release cannot claim or pause the new owner');
  assert.equal(clocks.size, 1, 'provider aliases share one complete identity');
  const other = clocks.open(fixture('planning', { provider: 'cursor' }));
  assert.equal(other.sample('notebook', { now: 300000 }), 0, 'a different provider remains a different identity');
  current.release(); other.release();
});

test('shared clocks pause quiet and lifecycle intervals, reject clock reversal and retain only supported kinds', () => {
  const clock = Model.createClockRegistry().open(fixture());
  clock.sample('keyboard', { now: 10 });
  assert.equal(clock.sample('keyboard', { now: 110, visible: false }), 100);
  assert.equal(clock.sample('keyboard', { now: 10000, visible: false }), 100);
  assert.equal(clock.sample('keyboard', { now: 20000 }), 100);
  assert.equal(clock.sample('keyboard', { now: 20005 }), 105);
  assert.equal(clock.sample('keyboard', { now: 20000 }), 105);
  assert.equal(clock.sample('none', { now: 20010 }), 0);
  assert.equal(clock.sample('keyboard', { now: 1e9 }), 110);
  clock.sample('keyboard', { visible: true });
  assert.equal(clock.sample('keyboard', { now: 2e9 }), 110, 'missing timestamps cannot create catch-up');
  clock.release();
  assert.equal(clock.sample('keyboard', { now: 3e9 }), 110, 'release ends timing ownership');
});

test('clock history uses inactive LRU eviction while every visible lease remains protected', () => {
  const clocks = Model.createClockRegistry({ limit: 3 });
  const saved = clocks.open(fixture('planning', { id: 'saved' }));
  saved.sample('notebook', { now: 0 }); saved.sample('notebook', { now: 100 }); saved.release();
  const protectedClock = clocks.open(fixture('planning', { id: 'protected' }));
  protectedClock.sample('notebook', { now: 0 }); protectedClock.sample('notebook', { now: 222 });
  for (let index = 0; index < 12; index += 1) {
    const temporary = clocks.open(fixture('planning', { id: 'old-' + index }));
    temporary.sample('notebook', { now: 0 }); temporary.sample('notebook', { now: 50 }); temporary.release();
    assert.ok(clocks.size <= 3);
  }
  const reopened = clocks.open(fixture('planning', { id: 'saved' }));
  assert.equal(reopened.elapsed('notebook'), 0, 'the least recent inactive identity is forgotten');
  assert.equal(protectedClock.sample('notebook', { now: 223 }), 223, 'visible owners are not evicted by history churn');
  clocks.clear();
  assert.equal(clocks.size, 0);
  protectedClock.sample('notebook', { now: 999999 });
  assert.equal(clocks.size, 0, 'clearing history invalidates old handles');
  reopened.release(); protectedClock.release();
});
