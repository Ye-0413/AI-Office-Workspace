'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../renderer/avatar-performance.js'), 'utf8');
const first = source.indexOf('    let gait = null;');
const end = source.indexOf('    function update(', first);
assert.ok(first >= 0 && end > first);
// Real renderer functions; this fixture checks phase/owner/Animation identity,
// not browser matrix interpolation or visual contact (native covers those).
function fixture() {
  let frozen = 0;
  const motions = [], nodes = [];
  const makeStyle = () => ({ removeProperty() {}, setProperty() {} });
  for (const name of ['ap-upper', 'ap-eyes', 'ap-arm-left', 'ap-arm-right', 'ap-foot-1', 'ap-foot-2', 'ap-foot-3', 'ap-foot-4']) {
    const classes = new Set([name, ...(name.startsWith('ap-arm-') ? ['ap-arm'] : []), ...(name.startsWith('ap-foot-') ? ['ap-foot'] : [])]);
    const node = { style: makeStyle(), classList: { contains: value => classes.has(value) } };
    node.animate = (frames, timing) => {
      let reject;
      const motion = { currentTime: 0, playState: 'running', frames, timing, cancels: 0,
        effect: { setKeyframes(next) { motion.frames = next; }, getKeyframes() { return motion.frames; } },
        finished: new Promise((_, no) => { reject = no; }),
        pause() { this.playState = 'paused'; },
        cancel() { if (this.playState === 'idle') return; this.cancels++; this.playState = 'idle'; reject(Error('cancelled')); }
      };
      motions.push(motion); return motion;
    };
    nodes.push(node);
  }
  class Matrix {
    constructor(value = '') {
      this.a = this.d = 1; this.b = this.c = this.e = this.f = 0;
      if (value.startsWith('matrix(')) {
        [this.a,this.b,this.c,this.d,this.e,this.f] = value.slice(7,-1).split(',').map(Number); return;
      }
      const t = value.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
      if (t) { this.e = Number(t[1]); this.f = Number(t[2]); }
      const r = value.match(/rotate\(([-\d.]+)deg\)/);
      if (r) { const angle = Number(r[1]) * Math.PI / 180; this.a = this.d = Math.cos(angle); this.b = Math.sin(angle); this.c = -this.b; }
    }
  }
  const document = { timeline: { currentTime: 0 } };
  const context = { document, view: { DOMMatrixReadOnly: Matrix }, actorNode: { dataset: {}, querySelector: () => null },
    svg: { querySelectorAll: () => nodes.filter(n => n.classList.contains('ap-foot')) },
    capture: () => nodes.map(node => ({ node, transform: 'matrix(1,0,0,1,2,3)' })),
    stopFade() {}, freezeVisual() { frozen++; }, keepPropSnapshot() {}, stopBridge() {}, fadePresence() {},
    back: { style: makeStyle() }, front: { style: makeStyle() }, layer: { hidden: true, style: {} },
    body: { classList: { add() {} } }, bitmap: { style: {} }, presence: '', destroyed: false
  };
  vm.createContext(context);
  const api = vm.runInContext(source.slice(first,end) + '\n({start:startGait,stop:stopGait,sample:typeof locomotion===\'function\'?locomotion:null})', context);
  api.start(false);
  const loops = motions.filter(m => m.timing.iterations === Infinity);
  const health = { playState: 'running', currentTime: 41 };
  return { api, loops, motions, document, context, health, frozen: () => frozen };
}

test('actual distance drives the same paused stride objects and a stopped route cannot keep stepping', () => {
  const h = fixture(), owner = {};
  assert.equal(typeof h.api.sample, 'function', 'production controller needs a distance-phase entry point');
  assert.equal(h.api.sample({ owner, distanceWorld: 0, speedWorld: 0, scale: .4 }), true);
  assert.ok(h.loops.every(m => m.playState === 'paused'));
  h.document.timeline.currentTime = 200;
  h.api.sample({ owner, distanceWorld: 96, speedWorld: 320, scale: .4 });
  assert.ok(h.loops.every(m => Math.abs(m.currentTime - 300) < 1e-9));
  const before = h.loops.map(m => m.currentTime);
  h.document.timeline.currentTime = 900;
  h.api.sample({ owner, distanceWorld: 96, speedWorld: 0, scale: .4 });
  assert.deepEqual(h.loops.map(m => m.currentTime), before);
  assert.equal(h.frozen(), 1); assert.equal(h.motions.length, 16);
  assert.equal(h.health.playState, 'running'); assert.equal(h.health.currentTime, 41);
});

test('dense .4/.1 fits share a renderable fixed world stride without resetting phase on scale changes', () => {
  const h = fixture(), owner = {}; h.api.sample({ owner, distanceWorld: 0, speedWorld: 320, scale: .4 });
  let last = 0;
  for (let i = 1; i <= 60; i++) {
    h.document.timeline.currentTime = i * 1000 / 60;
    h.api.sample({ owner, distanceWorld: 320 * i / 60, speedWorld: 320, scale: i < 30 ? .4 : .1 });
    const phase = h.loops[0].currentTime;
    assert.ok(phase >= last && phase - last <= 1000 / 60 + 1e-8, 'small fits must not multiply cadence or alias cycles'); last = phase;
  }
  assert.ok(Math.abs(last - 1000) < 1e-7);
});

test('an exact release keeps the final paused pose; stale owner samples/releases cannot steal a new route', () => {
  const h = fixture(), old = {}, current = {};
  h.api.sample({ owner: old, distanceWorld: 0, speedWorld: 0, scale: 1 });
  h.document.timeline.currentTime = 200; h.api.sample({ owner: old, distanceWorld: 60, speedWorld: 200, scale: 1 });
  const phase = h.loops[0].currentTime;
  assert.equal(h.api.sample(null, old), true);
  assert.ok(h.loops.every(m => m.playState === 'paused' && m.currentTime === phase));
  h.api.sample({ owner: current, distanceWorld: 0, speedWorld: 0, scale: 1 });
  h.api.sample({ owner: current, distanceWorld: 20, speedWorld: 100, scale: 1 });
  const currentPhase = h.loops[0].currentTime;
  assert.equal(h.api.sample(null, old), false);
  assert.equal(h.api.sample({ owner: old, distanceWorld: 999, speedWorld: 320, scale: 1 }), false);
  assert.ok(h.loops.every(m => m.currentTime === currentPhase && m.playState === 'paused'));
  h.api.stop(); assert.equal(h.api.sample({ owner: current, distanceWorld: 30, speedWorld: 100, scale: 1 }), false);
});

test('the sampled takeover begins at the actual pose and ends on the current distance trajectory, not an old neutral target', () => {
  const h = fixture(), owner = {};
  h.api.sample({ owner, distanceWorld: 0, speedWorld: 0, scale: 1 });
  for (const loop of h.loops) for (const frame of loop.frames) assert.match(frame.transform, /matrix\(1,0,0,1,2,3\)/);
  h.document.timeline.currentTime = 90; h.api.sample({ owner, distanceWorld: 16, speedWorld: 200, scale: 1 });
  const midway = h.loops[4].frames.map(f => f.transform); assert.ok(new Set(midway).size > 1);
  h.document.timeline.currentTime = 180; h.api.sample({ owner, distanceWorld: 36, speedWorld: 200, scale: 1 });
  assert.ok(h.loops[4].frames.some(f => /-2.5px/.test(f.transform)));
  assert.equal(h.loops[4].currentTime, 112.5);
});

test('unmanaged standalone gait retains the existing clock-driven loop and quiet teardown rejects late distance writes', () => {
  const h = fixture(); assert.ok(h.loops.every(m => m.playState === 'running' && m.startTime === 180));
  h.context.destroyed = true;
  assert.equal(h.api.sample({ owner: {}, distanceWorld: 0, speedWorld: 0, scale: 1 }), false);
  h.context.destroyed = false; h.api.stop();
  assert.ok(h.loops.every(m => m.playState === 'idle'));
  assert.equal(h.api.sample({ owner: {}, distanceWorld: 1, speedWorld: 1, scale: 1 }), false);
});

test('route elapsed time drives deterministic takeover and a replacement clock cannot rewind its completed weight', () => {
  const h = fixture(), first = { currentTime: 0 }, second = { currentTime: 0 };
  h.api.sample({ owner: first, distanceWorld: 0, speedWorld: 0, scale: 1 });
  first.currentTime = 180;
  h.api.sample({ owner: first, distanceWorld: 36, speedWorld: 200, scale: 1 });
  const frames = h.loops[4].frames;
  assert.ok(frames.some(f => /-2.5px/.test(f.transform)), 'no wall clock advance is needed for offline production API sampling');
  h.api.sample({ owner: second, distanceWorld: 0, speedWorld: 0, scale: 1 });
  assert.equal(h.loops[4].frames, frames);
  h.api.sample({ owner: second, distanceWorld: 20, speedWorld: 100, scale: 1, elapsedMs: 100 });
  assert.equal(h.loops[4].currentTime, 175);
  h.api.sample({ owner: second, distanceWorld: 10, speedWorld: 100, scale: 1, elapsedMs: 50 });
  assert.equal(h.loops[4].currentTime, 175, 'out-of-order samples cannot rewind a current owner');
});
