'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Model = require('../lib/avatar-performance-model.js');
const fixture = (activity = 'coding', patch = {}) => ({ id: 'codex:actor/complete-id', sessionId: 'actor/complete-id', provider: 'codex', activity, status: 'active', activeTools: 1, attention: false, events: [], ...patch });

test('observed activities map to eleven authored joint performances, never completion or sleep', () => {
  const kinds = new Set();
  for (const activity of Object.keys(Model.KINDS)) {
    const plan = Model.plan(fixture(activity));
    assert.equal(plan.active, true, activity);
    assert.equal(plan.animate, true, activity);
    assert.equal(plan.asset, Model.ASSET);
    assert.ok(plan.key.includes('codex:actor/complete-id'), 'the complete identity is retained');
    assert.doesNotMatch(plan.kind + plan.asset, /success|happy|sleep|complete|pass|retry/);
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
    assert.equal(plan.asset, null);
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
      assert.equal(plan.asset, first.asset);
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

function rendererFixture(options = {}) {
  let writes = 0;
  const document = { createElement: () => node(), createElementNS: () => node() };
  function node() {
    const children = new Map();
    const classes = new Set();
    return { ownerDocument: document, dataset: new Proxy({}, { set(target, key, value) { writes += 1; target[key] = value; return true; } }),
      classList: { toggle(key, enabled) { writes += 1; enabled ? classes.add(key) : classes.delete(key); }, remove(key) { writes += 1; classes.delete(key); }, contains: key => classes.has(key) },
      style: { setProperty() { writes += 1; } }, setAttribute() { writes += 1; }, append(child) { writes += 1; this.child = child; }, remove() { this.removed = true; },
      querySelector(selector) { if (!children.has(selector)) children.set(selector, node()); return children.get(selector); },
      set innerHTML(value) { writes += 1; this.markup = value; }, get innerHTML() { return this.markup; } };
  }
  const context = vm.createContext({ OfficeAvatarPerformanceModel: Model });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../renderer/avatar-performance.js'), 'utf8'), context);
  const actorNode = node(), body = node();
  const renderer = context.OfficeAvatarPerformance.create({ actorNode, body, ...options });
  return { renderer, actorNode, body, writes: () => writes };
}

test('renderer keeps timelines and the articulated rig stable over identical native snapshots', () => {
  const { renderer, actorNode, body, writes } = rendererFixture();
  const value = fixture('coding');
  const plan = renderer.update(value, { now: 0 });
  assert.equal(plan.kind, 'keyboard');
  assert.equal(body.classList.contains('has-avatar-performance'), true);
  const previousWrites = writes();
  for (let index = 0; index < 100; index += 1) renderer.update({ ...value, title: String(index), lastEventAt: index * 100 }, { now: index * 100 });
  assert.equal(writes(), previousWrites, 'no attribute, prop, phase or style write may reset CSS timelines');
  assert.equal(actorNode.dataset.performance, 'keyboard');
  renderer.update(value, { walking: true });
  assert.equal(body.classList.contains('has-avatar-performance'), false);
  assert.equal(body.child.hidden, true);
  renderer.update(value, { lowPower: true });
  assert.equal(body.child.dataset.animate, 'false');
  assert.equal(body.classList.contains('has-avatar-performance'), true);
  renderer.destroy();
  renderer.destroy();
  assert.equal(body.classList.contains('has-avatar-performance'), false);
  assert.equal(body.child.removed, true);
  assert.equal(actorNode.dataset.performance, undefined);
});

test('local visible-time rotation pauses through hidden, walking and quiet periods without per-actor timers', () => {
  const { renderer, actorNode } = rendererFixture();
  const value = fixture('planning');
  const first = renderer.update(value, { now: 0 });
  renderer.update(value, { now: first.programMs - 2 });
  renderer.update(value, { now: first.programMs - 1, hidden: true });
  assert.equal(renderer.update(value, { now: 3600000 }).program, first.program, 'hidden hour is not visible activity');
  const second = renderer.update(value, { now: 3600002 });
  assert.notEqual(second.program, first.program);
  assert.equal(actorNode.dataset.performanceProgram, second.program);
  renderer.update(value, { now: 3600003, walking: true });
  assert.equal(renderer.update(value, { now: 7200000 }).program, second.program, 'walking time belongs to navigation');
  renderer.update(value, { now: 7200001, lowPower: true });
  renderer.update(value, { now: 1e8, lowPower: true });
  assert.equal(renderer.update(value, { now: 2e8 }).program, second.program, 'low power stops the program clock');
  const coding = renderer.update(fixture('coding'), { now: 2e8 + 1 });
  assert.equal(coding.program, Model.plan(fixture('coding')).program, 'a genuinely changed activity starts its own clock');
  const source = fs.readFileSync(path.join(__dirname, '../renderer/avatar-performance.js'), 'utf8');
  assert.doesNotMatch(source, /\b(?:setTimeout|setInterval|requestAnimationFrame)\s*\(/);
});

test('short planning bouts accumulate across coding while both kind clocks remain independent', () => {
  const { renderer } = rendererFixture();
  const planning = fixture('planning'), coding = fixture('coding');
  const first = renderer.update(planning, { now: 0 });
  const firstCode = Model.plan(coding);
  const planningBout = Math.ceil(first.programMs / 4);
  let now = 0, returned;
  for (let bout = 0; bout < 4; bout += 1) {
    now += planningBout;
    assert.equal(renderer.update(coding, { now }).program, firstCode.program, 'brief coding starts/resumes its own unexpired program');
    now += 1200;
    returned = renderer.update(planning, { now });
    assert.equal(returned.program, Model.plan(planning, { visibleElapsed: planningBout * (bout + 1) }).program,
      'planning resumes its visible total rather than resetting or counting the coding interval');
  }
  assert.notEqual(returned.program, first.program, 'four individually short thinking bouts still produce a fresh planning action');
  const savedPlanningProgram = returned.program;
  assert.equal(renderer.update(coding, { now }).program, firstCode.program);
  now += firstCode.programMs - 4800 + 1;
  assert.notEqual(renderer.update(coding, { now }).program, firstCode.program, 'the separate coding clock reaches its own threshold');
  assert.equal(renderer.update(planning, { now }).program, savedPlanningProgram, 'a longer coding bout does not advance planning');
});

test('a different full identity clears all kind clocks rather than inheriting the previous actor history', () => {
  const { renderer } = rendererFixture();
  const planning = fixture('planning');
  const first = renderer.update(planning, { now: 0 });
  assert.notEqual(renderer.update(planning, { now: first.programMs + 1 }).program, first.program);
  const other = fixture('planning', { id: 'codex:another-complete-id' });
  assert.equal(renderer.update(other, { now: first.programMs + 2 }).program, Model.plan(other).program);
  assert.equal(renderer.update(planning, { now: first.programMs + 3 }).program, first.program, 'switching back is a new identity, not an unbounded identity cache');
});

test('rendered props are original code and reference the isolated source once without copying its SVG', () => {
  const { body } = rendererFixture();
  const svg = body.child.child;
  assert.equal((svg.markup.match(/<image /g) || []).length, 1);
  assert.ok((svg.markup.match(/<use /g) || []).length >= 9, 'limbs, eyes and the body articulate independently from one source');
  assert.match(svg.markup, /href="\.\.\/assets\/avatars\/clawd-static-base\.svg"/);
  assert.doesNotMatch(svg.markup, /#DE886D|body-color-group|master-group|<script|data:/);
});


test('shared visible clocks resume after page destruction without counting the time spent in another room', () => {
  const clockRegistry = Model.createClockRegistry({ limit: 8 });
  const value = fixture('planning');
  const firstPage = rendererFixture({ clockRegistry });
  const initial = firstPage.renderer.update(value, { now: 0 });
  firstPage.renderer.update(value, { now: initial.programMs - 1 });
  firstPage.renderer.destroy();
  const returnPage = rendererFixture({ clockRegistry });
  assert.equal(returnPage.renderer.update(value, { now: 3600000 }).program, initial.program,
    'an hour away is paused, and the previous visible total survives clearActors');
  const next = returnPage.renderer.update(value, { now: 3600002 });
  assert.notEqual(next.program, initial.program, 'two more visible milliseconds advance the resumed work program');
  const coding = fixture('coding');
  const codingFirst = returnPage.renderer.update(coding, { now: 3600003 });
  returnPage.renderer.update(coding, { now: 3601003 });
  returnPage.renderer.destroy();
  const anotherPage = rendererFixture({ clockRegistry });
  assert.equal(anotherPage.renderer.update(value, { now: 7200000 }).program, next.program);
  assert.equal(anotherPage.renderer.update(coding, { now: 7200001 }).program, codingFirst.program,
    'each of the eleven work kinds retains its own accumulated total');
  anotherPage.renderer.destroy();
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

test('new authored programs move independent body joints and share precise held-object grip trajectories', () => {
  const css = fs.readFileSync(path.join(__dirname, '../renderer/avatar-performance.css'), 'utf8');
  const expanded = css.slice(css.indexOf('/* 0.8:'));
  const blocks = expanded.split(/\n\/\* ([a-z-]+): /).slice(1);
  const fingerprints = new Set();
  assert.equal(blocks.length / 2, 57);
  for (let index = 0; index < blocks.length; index += 2) {
    const name = blocks[index], block = blocks[index + 1];
    const tracks = [...block.matchAll(/@keyframes ([^{]+)\{([^\n]+)\}/g)];
    const bodyTracks = tracks.filter(match => /-[uler]$/.test(match[1]));
    assert.equal(bodyTracks.length, 4, name + ' explicitly authors upper body, eyes and both hands');
    assert.ok(bodyTracks.filter(match => new Set([...match[2].matchAll(/transform:([^}]+)/g)].map(value => value[1])).size > 1).length >= 3,
      name + ' has at least three genuinely changing character joints');
    const fingerprint = bodyTracks.map(match => match[2]).join('/');
    assert.equal(fingerprints.has(fingerprint), false, name + ' cannot merely rename another entire body program');
    fingerprints.add(fingerprint);
    for (const side of ['left', 'right']) {
      if (!block.includes('.ap-held-' + side)) continue;
      const joint = side === 'left' ? 'l' : 'r';
      assert.match(block, new RegExp('\\.ap-arm-' + side + '[^\n]*,\\.avatar-performance[^\n]*\\.ap-held-' + side + '[^\n]*animation-name:ap-' + name + '-' + joint),
        name + ' held object and cropped hand use the same animation');
    }
  }
  assert.doesNotMatch(expanded, /(?:^|[;{])(?:width|height|left|top|margin|padding):/m, 'playback uses only transform/opacity');
});
