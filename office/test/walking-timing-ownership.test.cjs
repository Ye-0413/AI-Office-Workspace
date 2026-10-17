'use strict';
// Run the production app functions against a controllable Animation boundary.
// The independent sampler below interprets the emitted WAAPI descriptors; it
// never reconstructs planWalk or substitutes a passing timing implementation.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Scene = require('../lib/scene-model.js');
const Traffic = require('../lib/scene-traffic.js');
const source = fs.readFileSync(path.join(__dirname, '../renderer/app.js'), 'utf8');

function productionFunction(name, optional = false) {
  const pattern = new RegExp('^  (?:async )?function ' + name + '\\(', 'm');
  const match = pattern.exec(source);
  if (!match) { assert.ok(optional, 'production function exists: ' + name); return ''; }
  const tail = source.slice(match.index + match[0].length);
  const next = /^  (?:async )?function [A-Za-z_$][\w$]*\(/m.exec(tail);
  assert.ok(next, 'production function has a following declaration: ' + name);
  return source.slice(match.index, match.index + match[0].length + next.index);
}
const transformPoint = transform => {
  const match = /translate3d\(([-\d.e+]+)px,\s*([-\d.e+]+)px,/i.exec(transform);
  assert.ok(match, 'the real actor transform exposes its world-pixel foot');
  return { x: Number(match[1]), y: Number(match[2]) };
};
function matrix(transform) {
  const match = /^matrix\(([^)]+)\)$/.exec(transform);
  if (match) {
    const values = match[1].split(',').map(Number);
    return { m11: values[0], m12: values[1], m41: values[4], m42: values[5] };
  }
  const point = transformPoint(transform);
  return { m11: 1, m12: 0, m41: point.x, m42: point.y };
}
function fixture(options = {}) {
  let now = 100, nextTimer = 0;
  const animations = [], arrivals = [], poses = [], locomotion = [], timers = new Map(), cancelledTraffic = [];
  const style = { opacity: '1', transform: 'translate3d(256px,432px,0) scale(1)', removeProperty(key) { delete this[key]; } };
  const node = { dataset: {}, style, presented: null, animate(frames, settings) {
    let resolve, reject;
    const finished = new Promise((a, b) => { resolve = a; reject = b; });
    const animation = {
      frames: Array.from(frames, frame => ({ ...frame })), options: { ...settings }, currentTime: 0,
      finished, cancelled: false,
      effect: { target: node, getKeyframes: () => animation.frames },
      finish() { if (!this.cancelled) node.presented = this.frames.at(-1).transform; resolve(); },
      reject() { reject(new Error('cancelled Animation')); },
      cancel() { this.cancelled = true; if (node.activeAnimation === this) { node.activeAnimation = null; node.presented = null; } },
    };
    node.activeAnimation = animation; node.presented = animation.frames[0].transform;
    animations.push(animation); return animation;
  } };
  const actor = {
    id: 'codex:synthetic-timing', serial: 1, helper: false, entryPending: false,
    node, carry: { dataset: {} }, state: {}, bubble: { dataset: {} }, arrival: { animate: (...args) => arrivals.push(args) },
    position: { x: 20, y: 60 }, target: { x: 70, y: 60, zone: 'desk' },
    spec: { stale: false, label: 'coding' }, session: { id: 'codex:synthetic-timing', activity: 'coding' },
    delays: new Set(), cloneEffects: new Set(), clonePhase: '', motion: null,
    performance: { locomotion(...args) { locomotion.push({ args, serial: actor.serial, motion: actor.motion }); } }, ...options.actor,
  };
  const actors = new Map([[actor.id, actor]]);
  const context = {
    Scene, actors, uniformScale: 1, destroyed: false, fitting: false,
    settings: { lowPower: false, reducedMotion: false, ...options.settings },
    mediaReduce: { matches: false }, document: { hidden: Boolean(options.hidden) },
    performance: { now: () => now }, language: 'en', Director: { plan: () => ({ label: 'writing code' }) },
    setPose: (value, pose) => poses.push({ value, pose }), text: (value, label) => { value.textContent = label; },
    lifecycleCaption: () => '', transitCaption: () => {}, ensureMotionTicker: () => {},
    cloneBusy: () => false, cloneAncestor: () => null, endpointParent: () => null,
    clonePhase: (value, phase) => { value.clonePhase = phase; value.node.dataset.clonePhase = phase; },
    trafficWaiters: new Map(), traffic: { cancel: (...args) => cancelledTraffic.push(args) },
    queueTraffic: () => {}, needsOpeningRefresh: () => false, queueLayoutRefresh: () => {},
    fadeBody: () => assert.fail('opaque physical-walk cancellation must not invent an opacity owner'),
    navigationTimer: 0, pinnedDockIds: () => new Set(), settle: () => assert.fail('metadata must not start a second route'),
    showError: error => { throw error; },
    setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    getComputedStyle: value => ({ transform: value.presented || value.style.transform, opacity: value.style.opacity }),
    DOMMatrixReadOnly: function (value) { return matrix(value); },
  };
  const timingPath = path.join(__dirname, '../lib/walk-timing.js');
  if (fs.existsSync(timingPath)) context.WalkTiming = require(timingPath);
  vm.createContext(context);
  const names = ['reduced', 'quietSprites', 'actorTransform', 'currentPosition', 'cancelAction', 'queueNavigation', 'requestStation', 'animateWalk', 'finishAtStation'];
  vm.runInContext(names.map(name => productionFunction(name)).join('\n') + '\n' + productionFunction('syncWalkingGait', true), context);
  return {
    actor, node, context, animations, arrivals, poses, locomotion, timers, cancelledTraffic,
    walk: (points, serial = actor.serial, instant = false) => context.animateWalk(actor, points, serial, false, instant),
    cancel: () => context.cancelAction(actor),
    actual: (x, y) => { node.presented = `matrix(1,0,0,1,${x},${y})`; },
    advance: ms => { now += ms; },
  };
}
const route = [{ x: 20, y: 60 }, { x: 70, y: 60 }];

test('real metadata reconciliation retains the same physical Animation and its advancing clock', async () => {
  const h = fixture(), pending = h.walk(route), original = h.actor.motion;
  h.actor.navigation = { kind: 'station', target: route.at(-1) };
  for (let index = 0; index < 12; index += 1) {
    original.currentTime = 50 + index * 67; h.advance(67);
    h.actor.session = { ...h.actor.session, title: 'synthetic metadata ' + index, lastEventAt: index + 1 };
    h.context.finishAtStation(h.actor);
    h.context.requestStation(h.actor, { ...route.at(-1) });
    assert.equal(h.actor.motion, original);
    assert.equal(original.currentTime, 50 + index * 67);
  }
  assert.equal(h.animations.length, 1); assert.equal(h.poses.length, 1); assert.equal(h.timers.size, 0);
  original.finish(); assert.equal(await pending, true);
});

test('a genuine interruption commits the computed foot before cancel and the next route starts at that foot', async () => {
  const h = fixture(), oldPending = h.walk(route), old = h.actor.motion;
  const actual = { x: 337.1234, y: 477.9876 }; h.actual(actual.x, actual.y);
  const serial = h.cancel();
  assert.ok(old.cancelled); assert.equal(h.actor.motion, null);
  assert.ok(Math.abs(h.actor.position.x * 12.8 - actual.x) < 1e-9);
  assert.ok(Math.abs(h.actor.position.y * 7.2 - actual.y) < 1e-9);
  const released = h.cancelledTraffic.at(-1)[1];
  assert.ok(Math.abs(released.x * 12.8 - actual.x) < 1e-9, 'Traffic receives the actual rendered foot, not old origin or target');
  const start = { ...h.actor.position }, nextPending = h.walk([start, { x: 40, y: 78 }], serial), next = h.actor.motion;
  const first = transformPoint(next.frames[0].transform);
  assert.ok(Math.hypot(first.x - actual.x, first.y - actual.y) <= .0071, 'only the existing .01px transform serialization rounding is permitted');
  const before = h.node.style.transform;
  old.finish(); assert.equal(await oldPending, false);
  assert.equal(h.actor.motion, next); assert.equal(h.node.style.transform, before);
  assert.equal(h.node.dataset.walking, 'true'); assert.equal(next.cancelled, false);
  next.finish(); assert.equal(await nextPending, true);
});

test('an already queued obsolete completion cannot commit its target or clear a newer same-serial Animation lease', async () => {
  const h = fixture(), oldPending = h.walk(route), old = h.actor.motion;
  const nextPath = [{ x: 25, y: 60 }, { x: 25, y: 78 }];
  const nextPending = h.walk(nextPath), next = h.actor.motion;
  const inline = h.node.style.transform, position = { ...h.actor.position };
  old.finish();
  assert.equal(await oldPending, false, 'the Animation identity, as well as serial, owns final writes');
  assert.equal(h.actor.motion, next); assert.equal(h.node.style.transform, inline);
  assert.deepEqual(h.actor.position, position); assert.equal(h.node.dataset.walking, 'true');
  next.finish(); assert.equal(await nextPending, true);
});

test('low power quiets decorative sprites while preserving the real physical route', async () => {
  const h = fixture({ settings: { lowPower: true } }), pending = h.walk(route);
  assert.equal(h.context.quietSprites(), true);
  assert.equal(h.animations.length, 1, 'lowPower must not be added to the physical instant predicate');
  assert.equal(h.actor.node.dataset.walking, 'true');
  assert.deepEqual(h.actor.position, { x: 20, y: 60 });
  h.actor.motion.finish(); assert.equal(await pending, true); assert.equal(h.arrivals.length, 0);
});

test('the real shared gait sample follows its exact Animation clock, then cancellation samples before revoking serial', async () => {
  const h = fixture(), pending = h.walk(route), motion = h.actor.motion, owner = h.actor.walkTiming;
  assert.equal(owner.motion, motion); assert.equal(owner.serial, h.actor.serial);
  assert.equal(h.locomotion[0].args[0].owner, motion);
  assert.equal(h.locomotion[0].args[0].distanceWorld, 0);
  assert.equal(h.locomotion[0].args[0].speedWorld, 0);
  motion.currentTime = owner.plan.duration * .37;
  h.context.syncWalkingGait(h.actor);
  const expected = owner.plan.sampleAt(motion.currentTime), observed = h.locomotion.at(-1).args[0];
  assert.equal(observed.distanceWorld, expected.pathDistance); assert.equal(observed.speedWorld, expected.worldSpeed);
  const oldSerial = h.actor.serial, before = h.locomotion.length;
  h.actual(411.122, 432); h.cancel();
  assert.equal(h.locomotion[before].serial, oldSerial, 'last sample is taken while the real old serial still owns its clock');
  assert.equal(h.locomotion[before].args[0].owner, motion);
  assert.equal(h.locomotion[before + 1].args[0], null);
  assert.equal(h.locomotion[before + 1].args[1], motion, 'release is explicitly scoped to the cancelled physical Animation');
  assert.equal(h.actor.walkTiming, null); assert.equal(h.actor.motion, null);
  const count = h.locomotion.length; h.context.syncWalkingGait(h.actor);
  assert.equal(h.locomotion.length, count, 'a retired owner cannot produce future shared-ticker samples');
  motion.finish(); assert.equal(await pending, false);
});

test('a successful actual endpoint releases exactly its gait lease after the final zero-speed distance sample', async () => {
  const h = fixture(), pending = h.walk(route), motion = h.actor.motion, owner = h.actor.walkTiming;
  motion.currentTime = owner.plan.duration;
  const before = h.locomotion.length; motion.finish(); assert.equal(await pending, true);
  const final = h.locomotion[before].args[0], release = h.locomotion[before + 1];
  assert.equal(final.owner, motion); assert.equal(final.distanceWorld, owner.plan.worldLength); assert.equal(final.speedWorld, 0);
  assert.equal(release.args[0], null); assert.equal(release.args[1], motion);
  assert.equal(h.locomotion.length, before + 2); assert.equal(h.actor.walkTiming, null); assert.equal(h.actor.motion, null);
});

test('a stale gait clock with a different Animation or serial cannot send samples to the current articulated body', async () => {
  const h = fixture(), pending = h.walk(route), motion = h.actor.motion, owner = h.actor.walkTiming;
  const before = h.locomotion.length;
  h.actor.walkTiming = { ...owner, motion: {} }; h.context.syncWalkingGait(h.actor);
  h.actor.walkTiming = { ...owner, serial: owner.serial - 1 }; h.context.syncWalkingGait(h.actor);
  assert.equal(h.locomotion.length, before, 'neither identity mismatch grants a pose-write lease');
  h.actor.walkTiming = owner; motion.finish(); assert.equal(await pending, true);
});

test('zero route, explicit Traffic instant, reduced motion and hidden retain their existing immediate endpoint semantics', async () => {
  for (const mode of ['zero', 'traffic-instant', 'reduced', 'media-reduced', 'hidden']) {
    const h = fixture({ settings: { reducedMotion: mode === 'reduced' }, hidden: mode === 'hidden' });
    h.context.mediaReduce.matches = mode === 'media-reduced';
    const points = mode === 'zero' ? [{ x: 20, y: 60 }, { x: 20, y: 60 }] : route;
    assert.equal(await h.walk(points, h.actor.serial, mode === 'traffic-instant'), true, mode);
    assert.equal(h.animations.length, 0, mode); assert.equal(h.actor.motion, null, mode);
    assert.deepEqual({ ...h.actor.position }, points.at(-1), mode);
    assert.equal(h.node.dataset.traffic, 'arrived', mode); assert.equal(h.node.style.transition, undefined, mode);
  }
});

// This reads the actual WAAPI contract, including per-keyframe easing. Cubic
// Bezier inversion is independent of the walk planner's polynomial formulas.
function eased(fraction, easing = 'linear') {
  if (easing === 'linear') return fraction;
  const match = /^cubic-bezier\(([^)]+)\)$/.exec(easing);
  assert.ok(match, 'physical path timing must be a monotone supported easing: ' + easing);
  const [x1, y1, x2, y2] = match[1].split(',').map(Number);
  const cubic = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let lo = 0, hi = 1;
  for (let iteration = 0; iteration < 56; iteration += 1) { const mid = (lo + hi) / 2; if (cubic(mid, x1, x2) < fraction) lo = mid; else hi = mid; }
  return cubic((lo + hi) / 2, y1, y2);
}
function descriptors(animation) {
  assert.equal(animation.options.easing, 'linear', 'only individual original legs may remap time');
  const frames = animation.frames.map(frame => ({ ...transformPoint(frame.transform), offset: frame.offset, easing: frame.easing || 'linear' }));
  const duration = Number(animation.options.duration);
  assert.ok(Number.isFinite(duration) && duration >= 360);
  function foot(progress) {
    if (progress <= 0) return frames[0]; if (progress >= 1) return frames.at(-1);
    let index = 0;
    while (index < frames.length - 2 && progress >= frames[index + 1].offset) index += 1;
    const a = frames[index], b = frames[index + 1], width = b.offset - a.offset;
    const t = width > 0 ? eased((progress - a.offset) / width, a.easing) : 1;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  function velocity(progress, delta = 1e-6) {
    const lo = Math.max(0, progress - delta), hi = Math.min(1, progress + delta), a = foot(lo), b = foot(hi);
    return { x: (b.x - a.x) / ((hi - lo) * duration / 1000), y: (b.y - a.y) / ((hi - lo) * duration / 1000) };
  }
  return { frames, duration, foot, velocity, speed: progress => { const v = velocity(progress); return Math.hypot(v.x, v.y); } };
}

test('the emitted physical walk gently starts, brakes and reaches every original corner without excess speed', async () => {
  const points = [{ x: 20, y: 60 }, { x: 60, y: 60 }, { x: 60, y: 80 }];
  const h = fixture(), pending = h.walk(points), d = descriptors(h.actor.motion);
  assert.equal(d.frames.length, points.length, 'timing does not subdivide or shortcut the reserved geometric legs');
  d.frames.forEach((frame, index) => assert.deepEqual([frame.x, frame.y], [points[index].x * 12.8, points[index].y * 7.2]));
  assert.equal(d.frames[0].offset, 0); assert.equal(d.frames.at(-1).offset, 1);
  assert.ok(d.speed(.00001) < 1, 'the old constant-speed first frame must fail this gentle-start gate');
  assert.ok(d.speed(.99999) < 1, 'arrival must brake before the work-pose handoff');
  const corner = d.frames[1].offset;
  assert.ok(d.speed(corner - .00001) < 1 && d.speed(corner + .00001) < 1, 'a genuine turn joins at zero vector speed');
  for (let index = 1; index < 1000; index += 1) {
    const t = index / 1000, p = d.foot(t);
    assert.ok(d.speed(t) <= 320.02, 'physical body speed exceeds 320 worldpx/s');
    assert.ok(t <= corner ? Math.abs(p.y - 432) < 1e-8 && p.x >= 256 && p.x <= 768 : Math.abs(p.x - 768) < 1e-8 && p.y >= 432 && p.y <= 576, 'easing may never cut across the Traffic corner');
  }
  h.actor.motion.finish(); assert.equal(await pending, true);
});

test('a redundant same-direction original vertex keeps continuous nonzero speed instead of adding a fake stop', async () => {
  const h = fixture(), pending = h.walk([{ x: 10, y: 78 }, { x: 40, y: 78 }, { x: 70, y: 78 }]);
  const d = descriptors(h.actor.motion), at = d.frames[1].offset, before = d.velocity(at - .00001), after = d.velocity(at + .00001);
  assert.ok(Math.hypot(before.x, before.y) > 200, 'ordinary collinear graph vertices are not new destinations');
  assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < 1);
  h.actor.motion.finish(); assert.equal(await pending, true);
});

test('long physical routes do not use the old six-second truncation to violate the speed bound', async () => {
  const h = fixture(), pending = h.walk([{ x: 5, y: 85 }, { x: 95, y: 85 }, { x: 5, y: 85 }]);
  const d = descriptors(h.actor.motion);
  assert.ok(d.duration > 7200, '2304 worldpx cannot fit six seconds while respecting the peak speed');
  for (let i = 1; i < 1000; i += 1) assert.ok(d.speed(i / 1000) <= 320.02);
  h.actor.motion.finish(); assert.equal(await pending, true);
});

test('real Traffic accepts duplicate hint endpoints only under its original named-parent collision proof', () => {
  const start = { x: 20, y: 60 }, bend = { x: 20, y: 80 }, target = { x: 70, y: 80 };
  const hint = [start, { ...start }, bend, target, { ...target }];
  for (const permission of ['named-parent', 'none', 'third-body']) {
    const traffic = Traffic.createCoordinator({ gap: 0, obstacles: [], legalPoint: () => true,
      bounds: (p) => ({ left: p.x * 12.8 - 10, right: p.x * 12.8 + 10, top: p.y * 7.2 - 10, bottom: p.y * 7.2 + 10 }),
      route: () => hint });
    const actors = [{ id: 'child', position: start, staged: true, canYield: false }, { id: 'parent', position: start, canYield: false }];
    if (permission === 'third-body') actors.push({ id: 'stranger', position: start, canYield: false });
    traffic.sync(actors); traffic.request('child', target, { overlapIds: permission === 'none' ? [] : ['parent'] });
    const result = traffic.nextAny();
    assert.equal(result.kind, permission === 'named-parent' ? 'move' : 'wait', permission);
    if (result.kind === 'move') assert.deepEqual(result.path, hint, 'Traffic does not silently delete original endpoint vertices');
  }
});
