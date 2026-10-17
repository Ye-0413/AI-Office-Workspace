'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const Stability = require('../lib/size-stability.js');
const Walking = require('../lib/walking-layout.js');
const Scene = require('../lib/scene-model.js');
test('automatic count, heartbeat and work changes cannot regrow an occupied room', () => {
  const fit = Stability.create();
  assert.equal(fit.maximum(), 1);
  fit.observe({ count: 12, uniformScale: .4, targetUniformScale: .9 });
  for (const count of [4, 4, 8, 1, 2, 1]) {
    fit.observe({ count, uniformScale: .4, targetUniformScale: .9 });
    assert.equal(fit.maximum(), .4);
  }
  fit.observe({ count: 16, uniformScale: .3, targetUniformScale: .4 });
  fit.observe({ count: 1, uniformScale: .3, targetUniformScale: 1 });
  assert.equal(fit.maximum(), .3, 'necessary safe shrink never triggers a later automatic bounce');
});
test('only an explicit user request permits growth through real repositioning endpoints', () => {
  const fit = Stability.create();
  fit.observe({ count: 12, uniformScale: .4, targetUniformScale: .4 });
  fit.request(1.35);
  fit.observe({ count: 4, uniformScale: .4, targetUniformScale: 1.1 });
  assert.equal(fit.maximum(), 1.35, 'temporary safe fit must not cancel the manual target');
  fit.observe({ count: 4, uniformScale: 1.1, targetUniformScale: 1.1 });
  assert.equal(fit.maximum(), 1.1);
  fit.observe({ count: 1, uniformScale: 1.1, targetUniformScale: 1.35 });
  assert.equal(fit.maximum(), 1.1);
  fit.request(1.35);
  assert.equal(fit.maximum(), 1.35, 'refit at the same preference is a real explicit request');
});
test('real remaining retirees keep the fit; an actually empty room resets it', () => {
  const fit = Stability.create({ requestedScale: .8 });
  fit.observe({ count: 10, uniformScale: .35, targetUniformScale: .35 });
  fit.observe({ count: 1, uniformScale: .35, targetUniformScale: .8 });
  assert.equal(fit.maximum(), .35);
  fit.observe({ count: 0 });
  assert.equal(fit.maximum(), .8);
  fit.observe({ count: 1, uniformScale: .8, targetUniformScale: .8 });
  assert.equal(fit.maximum(), .8);
});
test('invalid observations cannot poison a valid fit and browser/CommonJS contracts agree', () => {
  const fit = Stability.create();
  fit.observe({ count: 1, uniformScale: .7, targetUniformScale: .7 });
  for (const scale of [NaN, Infinity, 0, -1, undefined]) fit.observe({ count: 1, uniformScale: scale });
  assert.equal(fit.maximum(), .7);
  const context = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib/size-stability.js'), 'utf8'), context);
  assert.equal(context.OfficeSizeStability.create().maximum(), 1);
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
