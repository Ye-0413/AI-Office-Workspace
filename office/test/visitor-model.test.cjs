'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createVisitor, createShuffleBag, STOPS, EASTER_EGGS } = require('../lib/visitor-model.js');
const Scene = require('../lib/scene-model.js');
const fs = require('node:fs');
const path = require('node:path');

function fixture(options = {}) {
  let time = 1000;
  const model = createVisitor({ now: () => time, random: () => 0.5, ...options });
  return { model, tick(ms = 0, input = {}) { time += ms; return model.update(input); },
    time(value) { time = value; }, enter() { return model.update({ ready: true }); } };
}

test('empty launch waits for a real initial snapshot and eight visible idle seconds', () => {
  const { model, tick, enter } = fixture();
  assert.equal(tick(100000).phase, 'absent');
  assert.equal(enter().phase, 'absent');
  assert.equal(tick(7999).phase, 'absent');
  const arrival = tick(1);
  assert.equal(arrival.phase, 'arriving'); assert.equal(arrival.moving, true);
  assert.ok(arrival.stop); assert.equal(arrival.stopSerial, 1);
  assert.equal(model.state().generation, arrival.generation);
});

test('all real work and departing occupants reset arrival grace; demo never gets a visitor', () => {
  const { model, tick, enter } = fixture(); enter(); tick(7000);
  assert.equal(tick(1, { busy: true }).phase, 'absent');
  assert.equal(tick(100000, { busy: false }).phase, 'absent');
  assert.equal(tick(7999).phase, 'absent');
  assert.equal(tick(1).phase, 'arriving');
  const demo = createVisitor({ arrivalDelayMs: 0 });
  assert.equal(demo.update({ ready: true, mode: 'demo' }).phase, 'absent');
  assert.equal(demo.update({ mode: 'live' }).phase, 'arriving');
  assert.equal(model.update({ busy: true }).reason, 'work');
});

test('one acknowledged route begins dwell; repeated snapshots cannot create overlapping stops', () => {
  const { model, tick, enter } = fixture({ arrivalDelayMs: 0, dwellMinMs: 100, dwellMaxMs: 100 });
  const first = enter();
  assert.equal(tick(10000).stopSerial, first.stopSerial);
  assert.equal(model.arrived(first.stopSerial + 1, first.generation).phase, 'arriving');
  assert.equal(model.arrived(first.stopSerial, first.generation).phase, 'visiting');
  assert.equal(tick(99).stopSerial, first.stopSerial);
  const next = tick(1);
  assert.equal(next.stopSerial, first.stopSerial + 1); assert.equal(next.moving, true);
  assert.notEqual(next.stop.zone, first.stop.zone);
  assert.equal(model.arrived(first.stopSerial, first.generation).moving, true);
  assert.equal(model.arrived(next.stopSerial, next.generation).moving, false);
});

test('new work revokes in-flight callbacks once and keeps the departure stable', () => {
  const { model, tick, enter } = fixture({ arrivalDelayMs: 0 });
  const first = enter(); const leaving = tick(1, { busy: true });
  assert.equal(leaving.phase, 'leaving'); assert.ok(leaving.generation > first.generation);
  assert.equal(leaving.stop, null);
  assert.equal(model.arrived(first.stopSerial, first.generation).phase, 'leaving');
  assert.equal(tick(1000).generation, leaving.generation);
  assert.equal(model.departed(first.generation).phase, 'leaving');
  assert.equal(model.departed(leaving.generation).phase, 'absent');
  assert.equal(tick(100000).phase, 'absent');
  assert.equal(tick(0, { busy: false }).phase, 'arriving');
});

test('disable, missing readiness, and mode changes revoke visitors without creating real sessions', () => {
  for (const gate of [{ enabled: false }, { ready: false }, { mode: 'demo' }]) {
    const { model, enter, tick } = fixture({ arrivalDelayMs: 0 });
    const first = enter(); model.arrived(first.stopSerial, first.generation);
    const closed = tick(0, gate);
    assert.equal(closed.phase, 'leaving'); assert.equal(closed.stop, null);
    assert.equal(tick(10000).generation, closed.generation);
    assert.equal(model.departed(closed.generation).phase, 'absent');
  }
});

test('hidden time pauses arrival and dwell, then resumes one deadline without a catch-up burst', () => {
  const { model, tick, enter } = fixture({ arrivalDelayMs: 100, dwellMinMs: 100, dwellMaxMs: 100 });
  enter(); tick(40, { hidden: true });
  assert.equal(tick(60000).phase, 'absent');
  assert.equal(tick(60000, { hidden: false }).phase, 'absent');
  assert.equal(tick(59).phase, 'absent');
  const first = tick(1); model.arrived(first.stopSerial, first.generation);
  tick(40, { hidden: true }); tick(60000); tick(60000, { hidden: false });
  assert.equal(tick(59).stopSerial, first.stopSerial);
  const next = tick(1); assert.equal(next.stopSerial, first.stopSerial + 1);
  assert.equal(tick(60000).stopSerial, next.stopSerial);
});

test('real work interrupts a hidden visitor even while decorative timers are paused', () => {
  const { model, tick, enter } = fixture({ arrivalDelayMs: 0 }); const first = enter();
  model.arrived(first.stopSerial, first.generation);
  tick(10, { hidden: true });
  const state = tick(60000, { busy: true });
  assert.equal(state.phase, 'leaving'); assert.equal(state.reason, 'work');
});

test('a natural short visit leaves, waits forty-five seconds, then returns through a fresh generation', () => {
  const { model, tick, enter } = fixture({ arrivalDelayMs: 10, maxVisitMs: 100, returnDelayMs: 45 });
  enter(); const first = tick(10); model.arrived(first.stopSerial, first.generation);
  assert.equal(tick(99).phase, 'visiting');
  const leaving = tick(1); assert.equal(leaving.reason, 'visit-ended');
  model.departed(leaving.generation);
  assert.equal(tick(0).phase, 'absent'); assert.equal(tick(44).phase, 'absent');
  const second = tick(1); assert.equal(second.phase, 'arriving');
  assert.ok(second.generation > leaving.generation);
});

test('real work during a natural departure restores the normal post-work grace', () => {
  const { model, tick, enter } = fixture({ arrivalDelayMs: 10, maxVisitMs: 1, returnDelayMs: 1000 });
  enter(); const first = tick(10); model.arrived(first.stopSerial, first.generation);
  const leaving = tick(1); tick(1, { busy: true }); model.departed(leaving.generation);
  tick(1, { busy: false }); assert.equal(tick(9).phase, 'absent');
  assert.equal(tick(1).phase, 'arriving');
});

test('hidden duration cannot prematurely end a visit; static settings keep a sofa visit calm', () => {
  const { model, tick } = fixture({ arrivalDelayMs: 0, maxVisitMs: 100,
    dwellMinMs: 10, dwellMaxMs: 10, random: () => 0 });
  const first = model.update({ ready: true, reducedMotion: true });
  assert.equal(first.stop.zone, 'sofa'); assert.equal(first.stop.easterEgg, null);
  assert.equal(first.stop.dwellMs, 18); model.arrived(first.stopSerial, first.generation);
  tick(5, { hidden: true }); tick(60000); tick(60000, { hidden: false });
  const next = tick(13); assert.equal(next.phase, 'visiting'); assert.equal(next.stop.zone, 'sofa');
  assert.equal(next.stopSerial, first.stopSerial + 1);
  const low = createVisitor({ arrivalDelayMs: 0, random: () => 0 });
  const quiet = low.update({ ready: true, lowPower: true });
  assert.equal(quiet.stop.easterEgg, null); assert.ok(quiet.stop.dwellMs >= 21000);
});

test('every visitor station and doorway have reachable paths around the room furniture', () => {
  const points = [...STOPS.map(stop => stop.point), { x: 92.5, y: 82 }];
  for (const from of points) for (const to of points) {
    const route = Scene.route(from, to);
    assert.ok(route.length >= 2, JSON.stringify({ from, to }));
    assert.deepEqual(route[0], from); assert.deepEqual(route.at(-1), to);
    for (let index = 1; index < route.length; index++) {
      for (const obstacle of Scene.OBSTACLES) {
        assert.equal(Scene.segmentHitsRect(route[index - 1], route[index], obstacle, 0.79), false);
      }
    }
  }
});

test('all ten dialogue contexts can be reached and normal roaming never repeats a station consecutively', () => {
  let seed = 8181;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const { model, enter, tick } = fixture({ random, arrivalDelayMs: 0, dwellMinMs: 1,
    dwellMaxMs: 1, maxVisitMs: 100000 });
  let state = enter(); const zones = new Set(); let previous = '';
  for (let i = 0; i < 200; i++) {
    assert.notEqual(state.stop.zone, previous);
    previous = state.stop.zone; zones.add(previous);
    model.arrived(state.stopSerial, state.generation); state = tick(1);
  }
  assert.deepEqual([...zones].sort(), ['archive', 'bench', 'board', 'desk', 'door', 'front', 'library', 'plant', 'sofa', 'window']);
});

test('rare easter eggs have at least three ordinary stops between them and all poses exist', () => {
  const { model, enter, tick } = fixture({ random: () => 0, arrivalDelayMs: 0,
    dwellMinMs: 1, dwellMaxMs: 1 });
  let state = enter(); const eggs = [];
  for (let i = 0; i < 12; i++) {
    if (state.stop.easterEgg) eggs.push(i);
    model.arrived(state.stopSerial, state.generation); state = tick(1);
  }
  assert.deepEqual(eggs, [0, 4, 8]);
  for (const filename of [...STOPS.flatMap(stop => stop.poses), ...EASTER_EGGS.map(egg => egg.pose)]) {
    assert.ok(fs.existsSync(path.join(__dirname, '../assets/avatars', filename)), filename);
  }
});

test('state snapshots are defensive, reset rejects callbacks, and invalid clocks/random do not corrupt timing', () => {
  const { model, enter, tick, time } = fixture({ arrivalDelayMs: 0, random: () => NaN });
  const first = enter(); first.stop.point.x = -99; first.stop.pose = 'bad';
  assert.notEqual(model.state().stop.point.x, -99); assert.notEqual(model.state().stop.pose, 'bad');
  model.clear(); assert.equal(model.arrived(first.stopSerial, first.generation).phase, 'absent');
  time(-100); assert.equal(tick(0).phase, 'arriving');
  assert.ok(Number.isFinite(model.state().stop.point.x));
  const invalid = createVisitor({ now: () => NaN, random: () => 10, arrivalDelayMs: 0 });
  assert.equal(invalid.update({ ready: true }).phase, 'arriving');
  assert.ok(invalid.state().stop);
});

test('a full dialogue bag has no repeats and preserves content identity without mutating entries', () => {
  const items = Array.from({ length: 500 }, (_, id) => Object.freeze({ id, category: id < 50 ? 'door' : 'library' }));
  const bag = createShuffleBag(items, { random: () => 0 });
  const drawn = Array.from({ length: 500 }, () => bag.next());
  assert.equal(new Set(drawn).size, 500); assert.equal(bag.remaining(), 0);
  assert.notEqual(bag.next(), drawn[499]); assert.equal(bag.size(), 500);
  assert.equal(items[0].id, 0);
});

test('contextual dialogue exhausts that zone before repeating and does not consume other zones', () => {
  const a = { id: 'a', category: 'door' }, b = { id: 'b', category: 'door' }, c = { id: 'c', category: 'sofa' };
  const bag = createShuffleBag([a, b, c, a], { random: () => 0 });
  const door = item => item.category === 'door';
  assert.equal(bag.next(door), a); assert.equal(bag.next(door), b);
  assert.equal(bag.remaining(item => item.category === 'sofa'), 1);
  assert.equal(bag.next(door), a); assert.equal(bag.next(item => item.category === 'unknown'), null);
  assert.equal(bag.next(item => item.category === 'sofa'), c);
  bag.clear(); assert.equal(bag.remaining(), 3);
  assert.equal(createShuffleBag([]).next(), null);
});
