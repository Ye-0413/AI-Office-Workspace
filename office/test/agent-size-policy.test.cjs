'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Size = require('../lib/size-stability.js');
const Walking = require('../lib/walking-layout.js');
const Scene = require('../lib/scene-model.js');
const session = (id, activity = 'planning', extra = {}) => ({ id, provider: 'codex', status: 'active', activity, ...extra });
const cast = count => Array.from({ length: count }, (_, index) => session('agent-' + String(index).padStart(3, '0'), ['reading', 'planning', 'coding', 'testing'][index % 4]));
function audit(page, scale) {
  assert.equal(page.uniformScale, scale);
  assert.equal(page.targetUniformScale, scale);
  for (const [id, point] of page.seats) {
    const actor = { uniformScale: scale, helper: Boolean(page.visible.find(s => s.id === id)?.parentId) };
    assert.equal(Walking.legalPoint(point, actor), true, id);
    for (const [other, peer] of page.seats) if (id !== other) {
      const peerActor = { uniformScale: scale, helper: Boolean(page.visible.find(s => s.id === other)?.parentId) };
      assert.equal(Scene.actorsOverlap(point, actor, peer, peerActor, page.gap), false, id + '/' + other);
    }
  }
}
test('user size survives dense arrivals, departures, metadata, scene changes and an empty room', () => {
  const policy = Size.create({ requestedScale: 1 });
  for (const count of [1, 12, 100, 4, 1, 0, 1]) {
    policy.observe({ count, uniformScale: .2, targetUniformScale: .3, venue: 'teahouse' });
    assert.equal(policy.maximum(), 1);
  }
  policy.request(.8); policy.observe({ count: 40, uniformScale: .1 }); assert.equal(policy.maximum(), .8);
  policy.request(1.35); policy.observe({ count: 40, uniformScale: .3 }); assert.equal(policy.maximum(), 1.35);
});
test('roots retain full artwork size while direct and nested clones stay at eighty percent', () => {
  const main = session('main'), helper = session('helper', 'coding', { parentId: main.id });
  const nested = session('nested', 'reading', { parentId: helper.id });
  assert.equal(Size.bodyRatio(main), 1);
  assert.equal(Size.bodyRatio(helper), .8);
  assert.equal(Size.bodyRatio(nested), .8);
  for (const scale of [.65, 1, 1.35]) assert.equal(scale * Size.bodyRatio(helper) / (scale * Size.bodyRatio(main)), .8);
});
test('crowds retain chosen size and every source identity is seated or explicitly waiting', () => {
  const input = cast(24), original = JSON.stringify(input);
  const page = Walking.layoutFixedWalking(input, { requestedScale: 1 });
  audit(page, 1); assert.ok(page.visible.length > 0); assert.ok(page.overflowIds.length > 0);
  assert.equal(page.visible.length + page.overflowIds.length, input.length);
  assert.equal(new Set([...page.seats.keys(), ...page.overflowIds]).size, input.length);
  assert.equal(JSON.stringify(input), original);
  assert.ok(page.visible.every(value => input.includes(value)), 'presentation retains original session objects');
});
test('dense additions cannot evict or shrink residents; actual removal frees a fixed-size slot', () => {
  const few = cast(2), first = Walking.layoutFixedWalking(few, { requestedScale: 1 });
  const current = new Map([...first.seats].map(([id, point]) => [id, { x: point.x, y: point.y }]));
  const input = cast(16), next = Walking.layoutFixedWalking(input, { requestedScale: 1, previousSeats: first.seats, currentPositions: current, residentIds: new Set(few.map(s => s.id)) });
  audit(next, 1); for (const value of few) assert.ok(next.seats.has(value.id));
  const remaining = input.filter(s => s.id !== few[0].id), positions = new Map([...next.seats].filter(([id]) => id !== few[0].id));
  const after = Walking.layoutFixedWalking(remaining, { requestedScale: 1, previousSeats: next.seats, currentPositions: positions, residentIds: new Set(positions.keys()) });
  audit(after, 1); assert.equal(after.seats.has(few[0].id), false);
  assert.ok(after.visible.some(s => next.overflowIds.includes(s.id)), 'a waiting real identity can take the released slot');
});
test('manual slider extremes preserve exact size and use a safe entrance instead of clearing the floor', () => {
  for (const scale of [.65, .8, 1, 1.35]) {
    const input = cast(8), page = Walking.layoutFixedWalking(input, { requestedScale: scale });
    audit(page, scale); assert.ok(page.visible.length > 0); assert.equal(page.visible.length + page.overflowIds.length, input.length);
    assert.equal(Walking.legalPoint(page.entryPoint, {uniformScale: scale}), true);
  }
});
test('venue and window-frame resize never request a different character scale', () => {
  for (const venue of ['workshop', 'teahouse', 'observatory']) audit(Walking.layoutFixedWalking(cast(8), { requestedScale: 1, venue }), 1);
  const source = fs.readFileSync(path.join(__dirname, '../renderer/app.js'), 'utf8');
  const refresh = source.slice(source.indexOf('  function refreshScale()'), source.indexOf('  function actorTransform('));
  const frame = { style: {} }, context = { Scene, office: { clientWidth: 800, clientHeight: 450 }, $: () => frame, uniformScale: 1 };
  vm.runInNewContext(refresh + '\nrefreshScale();', context);
  assert.equal(context.uniformScale, 1); assert.match(frame.style.transform, /scale\(0.625\)/);
});
test('a semantic work-zone change selects a distinct reachable station instead of reusing an overlapping side aisle', () => {
  let previous, positions = new Map();
  for (const [activity, zone] of [['reading', 'library'], ['planning', 'board'], ['coding', 'desk'], ['testing', 'bench']]) {
    const page = Walking.layoutFixedWalking([session('main', activity)], {
      requestedScale: 1, previousSeats: previous?.seats, currentPositions: positions,
      residentIds: new Set(positions.keys())
    });
    audit(page, 1);
    const target = page.seats.get('main');
    assert.equal(target.workZone, zone); assert.deepEqual(page.overflowIds, []);
    if (previous) {
      const source = previous.seats.get('main');
      assert.ok(Math.hypot(target.x - source.x, target.y - source.y) > .001,
        activity + ' must not silently retain the shared board/desk side-aisle foot');
      const move = page.transitionProof?.moves.find(item => item.id === 'main' && !item.instant);
      assert.ok(move && move.path.length >= 2, activity + ' needs a proved physical transition');
      assert.ok(Math.abs(move.target.x - target.x) < .001 && Math.abs(move.target.y - target.y) < .001);
    }
    previous = page; positions = new Map([['main', { x: target.x, y: target.y }]]);
  }
});
test('a finite clone split retains its proved resident targets while a fresh transition honors the named source overlap', () => {
  const main = session('main', 'testing'), child = session('child', 'planning', { parentId: main.id });
  const footprints = new Map([main, child].map(s => [s.id, { left: 116, right: 116, top: 121, bottom: 94 }]));
  const first = Walking.layoutFixedWalking([main], { requestedScale: 1, footprints });
  const admitted = Walking.layoutFixedWalking([main, child], {
    requestedScale: 1, footprints, previousSeats: first.seats,
    currentPositions: new Map([['main', first.seats.get('main')]]), residentIds: new Set(['main']),
    openingDockPairs: new Map([['child', 'main']])
  });
  assert.equal(admitted.seats.size, 2);
  const origin = admitted.seats.get('main'), currentPositions = new Map([['main', origin], ['child', origin]]);
  const options = {
    requestedScale: 1, footprints, previousSeats: admitted.seats, currentPositions,
    residentIds: new Set(['main', 'child']), immovableIds: new Set(['main', 'child']),
    openingBusyIds: new Set(['child']), allowedOverlaps: new Set([JSON.stringify(['child', 'main'])])
  };
  const waiting = Walking.layoutFixedWalking([main, child], options);
  audit(waiting, 1); assert.deepEqual(waiting.overflowIds, []);
  assert.equal(waiting.proofMode, 'deferred-resident-stations'); assert.equal(waiting.transitionDeferred, true);
  for (const [id, point] of admitted.seats) assert.deepEqual(waiting.seats.get(id), point);
  const split = waiting.transitionProof.moves.find(move => move.id === child.id && !move.temporary);
  assert.ok(split); assert.deepEqual(split.path[0], { x: origin.x, y: origin.y });
  assert.deepEqual(split.target, { x: admitted.seats.get('child').x, y: admitted.seats.get('child').y });
  assert.equal(waiting.pathsById.size, 0); assert.deepEqual(waiting.holdingPaths, []);
  assert.equal(waiting.coordinatedProof, null); assert.equal(waiting.transferCertificate, null);
  assert.equal(waiting.openingProof, null); assert.equal(waiting.exitProof, null); assert.equal(waiting.returnProof, null);
  assert.ok(waiting.visible.every(value => value === main || value === child));
  let previousSeats = waiting.seats;
  for (let i = 1; i < split.path.length; i++) for (const progress of [.1, .5, .9]) {
    const from = split.path[i - 1], to = split.path[i];
    const foot = { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
    const heartbeat = Walking.layoutFixedWalking([main, child], {
      ...options, previousSeats, currentPositions: new Map([['main', origin], ['child', foot]])
    });
    audit(heartbeat, 1); assert.equal(heartbeat.proofMode, 'deferred-resident-stations');
    const continuation = heartbeat.transitionProof.moves.find(move => move.id === child.id && !move.temporary);
    assert.ok(continuation); assert.deepEqual(continuation.path[0], foot);
    assert.equal(heartbeat.seats.get('child').x, admitted.seats.get('child').x);
    assert.equal(heartbeat.seats.get('child').y, admitted.seats.get('child').y);
    previousSeats = heartbeat.seats;
  }
  assert.throws(() => Walking.layoutFixedWalking([main, child], { ...options, allowedOverlaps: new Set() }), RangeError,
    'a cached arrangement cannot authorize an unnamed physical overlap');
});
test('a blocked fixed-size resident keeps its real work station and resumes a pending activity after the clone unlocks', () => {
  const main = session('main', 'reading'), child = session('child', 'planning', { parentId: main.id });
  const footprints = new Map([main, child].map(s => [s.id, { left: 116, right: 116, top: 121, bottom: 94 }]));
  const admitted = Walking.layoutFixedWalking([main, child], { requestedScale: .65, footprints });
  const currentPositions = new Map([...admitted.seats].map(([id, point]) => [id, { x: point.x, y: point.y }]));
  const coding = session('main', 'coding'), options = {
    requestedScale: .65, footprints, previousSeats: admitted.seats, currentPositions,
    residentIds: new Set(['main', 'child']), immovableIds: new Set(['child'])
  };
  const waiting = Walking.layoutFixedWalking([coding, child], options);
  audit(waiting, .65); assert.deepEqual(waiting.overflowIds, []);
  const retained = waiting.seats.get(main.id), old = admitted.seats.get(main.id);
  assert.equal(retained.x, old.x); assert.equal(retained.y, old.y);
  assert.equal(retained.workZone, 'library'); assert.equal(retained.pendingWorkZone, 'desk');
  assert.equal(waiting.visible.find(value => value.id === main.id), coding, 'current session facts remain intact');
  assert.equal(waiting.transitionProof.moves.length, 0);
  const repeated = Walking.layoutFixedWalking([coding, child], { ...options, previousSeats: waiting.seats });
  assert.equal(repeated.proofMode, 'deferred-resident-stations');
  const resumed = Walking.layoutFixedWalking([coding, child], { ...options, previousSeats: repeated.seats, immovableIds: new Set() });
  audit(resumed, .65); assert.equal(resumed.seats.get(main.id).workZone, 'desk');
  assert.equal(resumed.seats.get(main.id).pendingWorkZone, undefined);
  assert.notEqual(resumed.proofMode, 'deferred-resident-stations');
  assert.ok(resumed.transitionProof.moves.some(move => move.id === main.id && !move.instant));
  const changedFootprints = new Map(footprints); changedFootprints.set('child', { ...footprints.get('child'), right: 117 });
  assert.throws(() => Walking.layoutFixedWalking([coding, child], { ...options, footprints: changedFootprints }), RangeError,
    'changed measured geometry needs a new complete proof');
  const reparented = session('child', 'planning', { parentId: 'another-main' });
  assert.throws(() => Walking.layoutFixedWalking([coding, reparented], options), RangeError,
    'changed observed ancestry cannot inherit a previous family arrangement');
});
test('a genuine work change can reallocate an unchanged helper station that blocks the only proved route', () => {
  const main = session('main', 'reading'), child = session('child', 'planning', { parentId: main.id });
  const footprints = new Map([
    ['main', { left: 116, right: 116, top: 121, bottom: 94 }],
    ['child', { left: 117, right: 116, top: 121, bottom: 93 }]
  ]);
  const previousSeats = new Map([
    ['main', { x: 89.375, y: 40.9, zone: 'bench', workZone: 'bench', uniformScale: 1, targetUniformScale: 1, requestedScale: 1, holdingPoint: { x: 50, y: 78 } }],
    ['child', { x: 29.05, y: 48.2, zone: 'board', workZone: 'board', uniformScale: 1, targetUniformScale: 1, requestedScale: 1, holdingPoint: { x: 50, y: 78 } }]
  ]);
  const currentPositions = new Map([...previousSeats].map(([id, point]) => [id, { x: point.x, y: point.y }]));
  const page = Walking.layoutFixedWalking([main, child], {
    requestedScale: 1, footprints, previousSeats, currentPositions, residentIds: new Set(['main', 'child'])
  });
  audit(page, 1); assert.deepEqual(page.overflowIds, []);
  assert.equal(page.seats.get('main').workZone, 'library'); assert.equal(page.seats.get('child').workZone, 'board');
  for (const id of ['main', 'child']) {
    const target = page.seats.get(id), source = currentPositions.get(id);
    assert.ok(Math.hypot(target.x - source.x, target.y - source.y) > .001, id + ' must take a real new station');
    const move = page.transitionProof.moves.find(item => item.id === id && !item.temporary);
    assert.ok(move && move.path.length >= 2, id + ' must have a proved permanent transition');
    assert.deepEqual(move.path[0], source); assert.deepEqual(move.target, { x: target.x, y: target.y });
  }
});
test('closed helper state and parent links remain intact through a crowded fixed-size layout', () => {
  const main = session('main'), child = session('child', 'idle', { parentId: main.id, status: 'closed', closed: true });
  const input = [main, child, ...cast(12)], original = JSON.stringify(input);
  const page = Walking.layoutFixedWalking(input, { requestedScale: .8 });
  audit(page, .8); assert.equal(JSON.stringify(input), original);
  assert.equal(child.parentId, main.id); assert.equal(child.closed, true);
});
