'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const Stability = require('../lib/size-stability.js');
const Walking = require('../lib/walking-layout.js');
const Scene = require('../lib/scene-model.js');
test('automatic observations cannot shrink or regrow the selected size', () => {
  const fit = Stability.create();
  for (const count of [12, 4, 8, 1, 16, 0, 1]) {
    fit.observe({ count, uniformScale: .3, targetUniformScale: .9 });
    assert.equal(fit.maximum(), 1);
  }
});
test('only an explicit user request changes the selected size', () => {
  const fit = Stability.create();
  fit.request(1.35);
  fit.observe({ count: 4, uniformScale: .4, targetUniformScale: 1.1 });
  assert.equal(fit.maximum(), 1.35);
  fit.request(.8); assert.equal(fit.maximum(), .8);
  fit.request(.8); assert.equal(fit.maximum(), .8, 'same-size refit cannot change the preference');
});
test('retirees, an empty room and invalid observations preserve the user preference', () => {
  const fit = Stability.create({ requestedScale: .8 });
  for (const scale of [NaN, Infinity, 0, -1, undefined, .35]) fit.observe({ count: 1, uniformScale: scale });
  fit.observe({ count: 0 }); assert.equal(fit.maximum(), .8);
  const context = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib/size-stability.js'), 'utf8'), context);
  assert.equal(context.OfficeSizeStability.create().maximum(), 1);
  assert.equal(context.OfficeSizeStability.bodyRatio({parentId:'root'}), .8);
});
test('the real walking allocator respects a sub-slider ceiling without losing bodies, changing preference or colliding', () => {
  const cast = ['reading', 'planning', 'coding', 'testing'].map((activity, i) => ({ id: 'scale-' + i, provider: 'codex', status: 'active', activity }));
  const page = Walking.layoutWalking(cast, { requestedScale: 1, maximumScale: .4 });
  assert.ok(page.uniformScale <= .4 + 1e-7);
  assert.ok(page.targetUniformScale <= .4 + 1e-7);
  assert.equal(page.requestedScale, 1);
  assert.equal(page.visible.length, 4); assert.equal(page.hidden, 0); assert.equal(page.pages, 1);
  for (const [id, p] of page.seats) {
    assert.ok(Walking.legalPoint(p, { uniformScale: page.uniformScale }));
    for (const [other, q] of page.seats) if (id !== other) assert.equal(Scene.actorsOverlap(p, { uniformScale: page.uniformScale }, q, { uniformScale: page.uniformScale }, page.gap), false);
  }
  const settled = new Map([...page.seats].map(([id, p]) => [id, { x: p.x, y: p.y }]));
  const next = Walking.layoutWalking(cast.slice(0, 2), { requestedScale: 1, maximumScale: .4, previousSeats: page.seats, currentPositions: settled });
  assert.ok(next.uniformScale <= .4 + 1e-7); assert.ok(next.targetUniformScale <= .4 + 1e-7);
});

test('the enlarged presentation keeps the 65.6 percent clone body and reserves visible paint above the canvas', () => {
  const root = { id: 'display-main' }, helper = { id: 'display-child', parentId: root.id };
  const nested = { id: 'display-nested', parentId: helper.id };
  assert.equal(Stability.PRESENTATION_SCALE / 1.5, 1.2);
  assert.equal(Stability.CLONE_FRAME_RATIO, .82);
  assert.ok(Math.abs(Stability.bodyRatio(helper) * Stability.CLONE_FRAME_RATIO - .656) < 1e-12);
  const main = Stability.bodyFootprint(root), child = Stability.bodyFootprint(helper);
  assert.equal(main.top, 144, 'the 80px sprite rises 144px above its real feet at the new base size');
  assert.ok(main.top > 129, 'a transparent layout canvas alone cannot measure the enlarged paint');
  assert.ok(Math.abs((child.left + child.right) / (main.left + main.right) - .656) < 1e-12);
  assert.deepEqual(Stability.bodyFootprint(nested), child, 'nesting never compounds the clone shrink');
  assert.ok(child.bottom > 0, 'the helper frame pivot and held prop overhang remain in the proof');
  for (const [name, value] of [['root', main], ['helper', child]]) {
    for (const edge of ['left', 'right', 'top', 'bottom']) {
      assert.ok(Number.isFinite(value[edge]) && value[edge] > 0);
      assert.ok(Stability.ACTOR_FOOTPRINT[name][edge] >= value[edge] + 6, name + ' fallback covers its paint and motion margin');
    }
  }
  assert.deepEqual(root, { id: 'display-main' });
  assert.deepEqual(helper, { id: 'display-child', parentId: 'display-main' });
});
