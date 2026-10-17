'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../renderer/app.js'), 'utf8');
function production(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert.notEqual(start, -1);
  const tail = source.slice(start + 1).search(/\n  (?:async )?function /);
  return source.slice(start, tail < 0 ? source.length : start + 1 + tail);
}
function harness() {
  const actors = new Map(), snapshot = { sessions: [] };
  const context = { actors, snapshot, attendance: { present: [] }, settings: {}, actorFootprints: new Map(), CLOCK_RESERVED: [], seats: new Map(), uniformScale: .4, currentPage: {},
    pinnedDockIds: () => new Set(), closingDockPairs: () => new Map(), openingDockPairs: () => new Map(),
    currentPosition: a => a.position, canYieldAtStation: () => false, endpointParent: () => null,
    Scene: require('../lib/scene-model.js'), Clones: { isActive: s => s.status === 'active' && s.activity !== 'idle' } };
  vm.createContext(context); vm.runInContext(production('hasBodyActivity') + production('sceneOptions'), context);
  function actor(id, patch = {}) {
    const value = { id, entryPending: false, holdingFamily: true, position: { x: 40, y: 84 }, ...patch };
    actors.set(id, value); return value;
  }
  return { context, snapshot, actor, read: incoming => context.sceneOptions(incoming) };
}
test('the actual settled held parent is fixed while first interception and owned holding walks remain executable', () => {
  const h = harness(), fixed = h.actor('held'), before = JSON.stringify(fixed);
  h.actor('first-late-child', { holdingFamily: false, departing: true, navigation: { kind: 'exit' } });
  h.actor('walking-to-dock', { navigation: { kind: 'holding' }, motion: {} });
  h.actor('reserved-holding', { navigation: { kind: 'holding' }, routeReservation: {} });
  h.actor('fitting-holding', { resumeNavigation: { kind: 'holding' } });
  h.actor('outside', { entryPending: true });
  const result = h.read([]);
  assert.deepEqual([...result.fixedHoldingIds], ['held']);
  assert.equal(JSON.stringify(fixed), before, 'classification never moves or changes the real parent');
  result.fixedHoldingIds.clear(); assert.deepEqual([...h.read([]).fixedHoldingIds], ['held'], 'each proof receives an independent set');
  const retirement = h.context.sceneOptions([], new Set(['held']));
  assert.equal(retirement.finiteExitIds.has('held'), true, 'an ended family can still own its separate proved physical exit');
});
test('same-snapshot fresh activity releases a held anchor before reconciliation but uncertainty retains its real foot', () => {
  const h = harness(); h.actor('parent');
  for (const session of [{ id: 'parent', status: 'active', activity: 'coding' }, { id: 'parent', status: 'waiting', activity: 'unknown' }]) {
    h.snapshot.sessions = [session]; h.context.attendance.present = [session];
    assert.equal(h.read([session]).fixedHoldingIds.has('parent'), false, 'actual resumed work will revoke holding in the same reconciliation');
  }
  for (const patch of [{ status: 'stale', activity: 'unknown' }, { status: 'active', activity: 'coding', disconnected: true }, { status: 'closed', activity: 'coding' }, { status: 'idle', activity: 'idle' }]) {
    const row = { id: 'parent', ...patch }; h.snapshot.sessions = [row]; h.context.attendance.present = [row];
    assert.equal(h.read([row]).fixedHoldingIds.has('parent'), true, 'missing fresh evidence cannot manufacture an ordinary station walk');
  }
});

test('a cached active retirement row in the full layout cannot fabricate current work and release the held foot', () => {
  const h = harness(); h.actor('parent');
  const cached = { id: 'parent', status: 'active', activity: 'coding' };
  assert.equal(h.read([cached]).fixedHoldingIds.has('parent'), true, 'render includes the missing parent last-session row for its physical body');
  h.snapshot.sessions = [cached];
  assert.equal(h.read([cached]).fixedHoldingIds.has('parent'), true, 'a real row outside current attendance does not enter the reconciliation recovery branch');
  h.context.attendance.present = [cached];
  assert.equal(h.read([cached]).fixedHoldingIds.has('parent'), false, 'only actual present fresh work will resume the same held identity');
});
