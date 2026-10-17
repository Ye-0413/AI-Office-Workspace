'use strict';
// Audit permissions are tested from their real source, against routes accepted
// by the real coordinator. No duplicate-point normalization or replacement
// endpoint implementation is installed in this fixture.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Traffic = require('../lib/scene-traffic.js');
const Timing = require('../lib/walk-timing.js');
const auditSource = fs.readFileSync(path.join(__dirname, 'support/walking-native-audit.cjs'), 'utf8');
const start = auditSource.indexOf('  const endpoint = '), end = auditSource.indexOf('  let state = ', start);
assert.ok(start >= 0 && end > start, 'the real shared audit owns the endpoint predicate');
const context = { originalRoute: row => row.route };
vm.createContext(context);
vm.runInContext(auditSource.slice(start, end) + '\nthis.endpoint = endpoint;', context);

const tinyBounds = point => ({ left: point.x * 12.8 - 10, right: point.x * 12.8 + 10, top: point.y * 7.2 - 10, bottom: point.y * 7.2 + 10 });
const world = point => ({ x: point.x * 12.8, y: point.y * 7.2 });
function accepted(phase) {
  const origin = { x: 20, y: 60 }, bend = { x: 20, y: 80 }, station = { x: 70, y: 80 };
  const hint = phase === 'splitting'
    ? [origin, { ...origin }, bend, station, { ...station }]
    : [station, { ...station }, bend, origin, { ...origin }];
  const traffic = Traffic.createCoordinator({ gap: 0, obstacles: [], maxConcurrent: 2, bounds: tinyBounds, legalPoint: () => true, route: () => hint });
  traffic.sync([{ id: 'child', position: hint[0], staged: phase === 'splitting', canYield: false }, { id: 'parent', position: origin, canYield: false }]);
  assert.equal(traffic.request('child', hint.at(-1), { overlapIds: ['parent'] }), true);
  const reservation = traffic.next('child');
  assert.equal(reservation.kind, 'move', 'the unchanged real collision proof accepts this named endpoint');
  assert.deepEqual(reservation.path, hint, 'the actual accepted reservation retains its original duplicate vertices');
  const plan = Timing.planWalk(reservation.path);
  const route = { points: plan.vertices.map(vertex => ({ ...world(vertex.point), offset: vertex.offset })), progress: 0 };
  const child = { id: 'child', ...world(hint[0]), node: { dataset: { clonePhase: phase, [phase === 'splitting' ? 'cloneOrigin' : 'cloneTarget']: 'parent' } }, route };
  const parent = { id: 'parent', ...world(origin) };
  return { child, parent, route, plan, reservation };
}
const permitted = fixture => context.endpoint(fixture.child, fixture.parent);

test('duplicate original source vertices preserve only the named first nonzero split leg', () => {
  const f = accepted('splitting'), first = f.plan.firstNonzeroSegmentIndex;
  assert.equal(first, 1); assert.equal(f.route.points[1].offset, 0);
  f.route.progress = (f.route.points[first].offset + f.route.points[first + 1].offset) / 2;
  assert.equal(permitted(f), true, 'a zero-duration duplicate source is not the complete real source leg');
  f.route.progress = f.route.points[first + 1].offset + .0002;
  assert.equal(permitted(f), false, 'the second real leg cannot inherit the source exemption');
});

test('duplicate original target vertices preserve only the named final nonzero return leg', () => {
  const f = accepted('returning'), last = f.plan.lastNonzeroSegmentIndex;
  assert.equal(last, 2); assert.equal(f.route.points.at(-2).offset, 1);
  f.route.progress = (f.route.points[last].offset + f.route.points[last + 1].offset) / 2;
  assert.equal(permitted(f), true, 'the real last return leg precedes the duplicate terminal frame');
  f.route.progress = f.route.points[last].offset - .0002;
  assert.equal(permitted(f), false, 'a prior leg cannot borrow final absorption permission');
});

test('duplicate endpoint handling cannot authorize a third body or a non-named ancestor', () => {
  for (const phase of ['splitting', 'returning']) {
    const f = accepted(phase), index = phase === 'splitting' ? f.plan.firstNonzeroSegmentIndex : f.plan.lastNonzeroSegmentIndex;
    f.route.progress = (f.route.points[index].offset + f.route.points[index + 1].offset) / 2;
    assert.equal(permitted(f), true);
    for (const id of ['unrelated-body', 'observed-grandparent']) assert.equal(context.endpoint(f.child, { ...f.parent, id }), false, phase + ': ' + id);
    f.child.node.dataset.cloneOrigin = 'different-origin'; f.child.node.dataset.cloneTarget = 'different-target';
    assert.equal(permitted(f), false, 'actual coordinates alone never grant a family permission');
  }
});

test('the original source/target distance and progress tolerances remain unchanged', () => {
  for (const phase of ['splitting', 'returning']) {
    const f = accepted(phase), index = phase === 'splitting' ? f.plan.firstNonzeroSegmentIndex : f.plan.lastNonzeroSegmentIndex;
    const boundary = phase === 'splitting' ? f.route.points[index + 1].offset : f.route.points[index].offset;
    f.route.progress = boundary + (phase === 'splitting' ? .000099 : -.000099);
    assert.equal(permitted(f), true);
    f.route.progress = boundary + (phase === 'splitting' ? .000101 : -.000101);
    assert.equal(permitted(f), false, 'the existing .0001 time tolerance is not expanded');
    f.route.progress = boundary;
    assert.equal(context.endpoint(f.child, { ...f.parent, x: f.parent.x + .7499 }), true);
    assert.equal(context.endpoint(f.child, { ...f.parent, x: f.parent.x + .7501 }), false, 'the original .75 world-pixel endpoint tolerance remains strict');
  }
});

test('a missing route, unavailable progress or entirely zero-length route grants no moving endpoint permission', () => {
  for (const phase of ['splitting', 'returning']) {
    const f = accepted(phase);
    f.child.route = null; assert.equal(permitted(f), false);
    f.child.route = { points: f.route.points, progress: null }; assert.equal(permitted(f), false);
    const point = { ...f.parent };
    f.child.route = { points: [{ ...point, offset: 0 }, { ...point, offset: .5 }, { ...point, offset: 1 }], progress: .5 };
    assert.equal(permitted(f), false, 'an arrived/still geometry has no first or last physical movement leg');
  }
});

test('the existing finite charge, absorption and interrupted-pair evidence remains explicitly named', () => {
  const f = accepted('splitting'); f.child.route = null; Object.assign(f.child, f.parent, { id: 'child' });
  f.child.node.dataset.cloneCharge = 'true'; assert.equal(permitted(f), true);
  assert.equal(context.endpoint(f.child, { ...f.parent, id: 'stranger' }), false);
  f.child.node.dataset.cloneCharge = 'false'; f.child.node.dataset.clonePhase = 'absorbing'; assert.equal(permitted(f), true);
  f.child.node.dataset.clonePhase = 'working'; f.child.node.dataset.endpointOverlap = f.parent.id;
  assert.equal(permitted(f), true); assert.equal(context.endpoint(f.child, { ...f.parent, id: 'stranger' }), false);
});

test('an intentionally delayed walker reserves every future corner until its actual foot passes it', () => {
  const original = [{ x: 10, y: 50 }, { x: 90, y: 50 }, { x: 90, y: 80 }];
  const traffic = Traffic.createCoordinator({ gap: 0, obstacles: [], maxConcurrent: 2, bounds: tinyBounds,
    legalPoint: (point, actor) => actor.id === 'walker' ? point.y === 50 || point.x === 90 : point.y === 65,
    route: (from, to, actor) => actor.id === 'walker' ? original : [from, to] });
  const walker = { id: 'walker', position: original[0], canYield: false }, crossing = { id: 'crossing', position: { x: 60, y: 65 }, canYield: false };
  traffic.sync([walker, crossing]); traffic.request(walker.id, original.at(-1));
  const reservation = traffic.next(walker.id); assert.equal(reservation.kind, 'move');
  const timing = Timing.planWalk(reservation.path), nominalLate = timing.sampleAt(timing.duration * .95);
  assert.ok(nominalLate.point.y > 65, 'the nominal clock is already beyond the crossing');
  walker.position = { x: 45, y: 50 }; traffic.sync([walker, crossing]);
  traffic.request(crossing.id, { x: 97, y: 65 });
  assert.equal(traffic.next(crossing.id).kind, 'wait', 'the real slow body still owns the entire unpassed vertical leg');
  assert.equal(traffic.state().activeMoves.length, 1);
  walker.position = { x: 90, y: 75 }; traffic.sync([walker, crossing]);
  const behind = traffic.next(crossing.id); assert.equal(behind.kind, 'move', 'actual passage releases the completed prefix while the first Animation remains active');
  assert.equal(traffic.state().activeMoves.length, 2);
  assert.equal(traffic.finish(walker.id, reservation.token, original.at(-1)), true);
  assert.equal(traffic.finish(crossing.id, behind.token, behind.target), true);
  assert.equal(traffic.state().queued, 0);
});
