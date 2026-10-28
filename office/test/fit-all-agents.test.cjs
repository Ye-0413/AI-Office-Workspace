'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Walking = require('../lib/walking-layout.js');
const Scene = require('../lib/scene-model.js');
const Size = require('../lib/size-stability.js');
const cast = count => Array.from({ length: count }, (_, i) => ({ id: 'agent-' + String(i).padStart(3, '0'),
  provider: i % 2 ? 'cursor' : 'codex', status: 'active', activity: ['reading', 'planning', 'coding', 'testing'][i % 4],
  ...(i % 3 ? { parentId: 'agent-' + String(i % 3 === 2 ? i - 1 : i - i % 3).padStart(3, '0') } : {}) }));
function audit(page, input, maximum) {
  assert.deepEqual(page.overflowIds, []); assert.equal(page.hidden, 0); assert.equal(page.helperOverflow, 0);
  assert.equal(page.pages, 1); assert.equal(page.visible.length, input.length); assert.equal(page.seats.size, input.length);
  assert.ok(page.uniformScale > 0 && page.uniformScale <= maximum + 1e-7);
  assert.ok(page.targetUniformScale > 0 && page.targetUniformScale <= maximum + 1e-7);
  const byId = new Map(input.map(s => [s.id, s]));
  for (const s of page.visible) assert.equal(s, byId.get(s.id), 'real identity and ancestry are not copied or dropped');
  for (const [id, p] of page.seats) {
    const own = { uniformScale: page.uniformScale, helper: Boolean(byId.get(id).parentId) };
    assert.ok(Walking.legalPoint(p, own));
    for (const [other, q] of page.seats) if (other !== id) assert.equal(Scene.actorsOverlap(p, own, q,
      { uniformScale: page.uniformScale, helper: Boolean(byId.get(other).parentId) }, page.gap), false);
  }
}
for (const count of [0, 1, 2, 8, 24, 100]) test(`${count} observed agents fit on one screen without capacity overflow`, () => {
  const input = cast(count), before = JSON.stringify(input), page = Walking.layoutAllWalking(input, { requestedScale: 1.25 });
  audit(page, input, 1.25); assert.equal(JSON.stringify(input), before);
  if (count >= 8) assert.ok(page.uniformScale < 1.25, 'crowding fits the real cast instead of putting it outside');
});
test('arrivals, heartbeat order and departures retain all identities without changing the saved size ceiling', () => {
  const preference = Size.create({ requestedScale: 1.25 }), input = cast(24);
  const first = Walking.layoutAllWalking(input.slice(0, 2), { requestedScale: preference.maximum() });
  const full = Walking.layoutAllWalking(input, { requestedScale: preference.maximum(), previousSeats: first.seats,
    currentPositions: new Map(first.seats) });
  audit(full, input, 1.25); preference.observe(full); assert.equal(preference.maximum(), 1.25);
  const heartbeat = input.slice().reverse().map(s => ({ ...s, lastEventAt: 2000 }));
  const same = Walking.layoutAllWalking(heartbeat, { requestedScale: preference.maximum(), previousSeats: full.seats,
    currentPositions: new Map(full.seats) });
  audit(same, heartbeat, 1.25); assert.equal(same.seats, full.seats); assert.equal(same.uniformScale, full.uniformScale);
  const remaining = input.slice(0, 2), current = new Map([...same.seats].filter(([id]) => remaining.some(s => s.id === id)));
  const after = Walking.layoutAllWalking(remaining, { requestedScale: preference.maximum(), previousSeats: same.seats,
    currentPositions: current });
  audit(after, remaining, 1.25); assert.equal(preference.maximum(), 1.25);
});
