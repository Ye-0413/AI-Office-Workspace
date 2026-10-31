'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const Standby = require('../renderer/standby-animation.js');
const Creature = require('../renderer/creature-performance.js');
function fixture(material = 'folio') {
  const animations = [], mediaListeners = new Set(), visibilityListeners = new Set();
  const media = { matches: false, addEventListener: (_, fn) => mediaListeners.add(fn), removeEventListener: (_, fn) => mediaListeners.delete(fn) };
  const document = { hidden: false, defaultView: { matchMedia: () => media, getComputedStyle: () => ({ getPropertyValue: () => 'cubic-bezier(.77,0,.175,1)' }) }, addEventListener: (_, fn) => visibilityListeners.add(fn), removeEventListener: (_, fn) => visibilityListeners.delete(fn), createElementNS: () => element() };
  function element() {
    const node = { dataset: {}, ownerDocument: document, attrs: {}, parentNode: null, children: [], querySelector: selector => node.nodes?.[selector] || null,
      setAttribute: (name, value) => { node.attrs[name] = value; }, remove: () => { if (node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node), 1); node.parentNode = null; },
      append(child) { child.parentNode = node; node.children.push(child); },
      animate(keyframes, options) {
        let resolve, reject;
        const animation = { target: node, keyframes, options, currentTime: 0, playState: 'running', finished: new Promise((a, b) => { resolve = a; reject = b; }), cancel() { this.playState = 'idle'; reject(); }, pause() { this.playState = 'paused'; }, play() { this.playState = 'running'; }, finish() { this.currentTime = options.duration; this.playState = 'finished'; resolve(); } };
        animations.push(animation); return animation;
      }
    };
    Object.defineProperty(node, 'innerHTML', { set() { node.nodes = { '.standby-sleep': element(), '.standby-toy': element() }; } });
    return node;
  }
  const rig = element(), shell = element(), body = element(), actorNode = element();
  actorNode.dataset = { sessionId: 'observed:unique-' + material, bodyDesign: material };
  actorNode.style = { transform: 'translate3d(500px,400px,0) scale(1.35)' };
  body.nodes = { '.cp-shell': shell, '.creature-rig': rig };
  const controller = Standby.create({ actorNode, body });
  return { controller, animations, actorNode, body, rig, shell, media, document, mediaListeners, visibilityListeners };
}
test('each material gets quiet standby gestures without replacing an observed actor or moving its feet', () => {
  const gestures = new Set();
  for (const material of Standby.MATERIALS) {
    const h = fixture(material), transform = h.actorNode.style.transform;
    h.controller.update({ standby: true });
    assert.equal(h.controller.state.active, true); assert.equal(h.animations.length, 3);
    gestures.add(JSON.stringify(h.animations[0].keyframes));
    const owners = h.animations.slice(); h.animations.forEach(a => { a.currentTime = 1234; });
    h.controller.update({ standby: true, hidden: false });
    assert.deepEqual(h.animations, owners); assert.ok(owners.every(a => a.currentTime === 1234));
    assert.equal(h.actorNode.style.transform, transform); assert.equal(h.rig.children.length, 1);
    h.controller.destroy(); assert.equal(h.rig.children.length, 0);
  }
  assert.ok(gestures.size >= 4, 'paper, ink, clay, yarn and light retain material-specific gestures');
});
test('hidden time preserves exact native animation clocks and resumes the same owners', () => {
  const h = fixture(); h.controller.update({ standby: true });
  const owners = h.animations.slice(); owners.forEach((a, i) => { a.currentTime = 900 + i * 123; });
  h.controller.update({ standby: true, hidden: true });
  assert.ok(owners.every(a => a.playState === 'paused'));
  assert.deepEqual(owners.map(a => a.currentTime), [900, 1023, 1146]);
  h.controller.update({ standby: true, hidden: false });
  assert.ok(owners.every(a => a.playState === 'running')); assert.deepEqual(h.animations, owners);
  h.controller.destroy();
});
test('dozing and idle play change only at complete native loop boundaries, including a hidden boundary', async () => {
  const h = fixture(), flush = () => Promise.resolve(); h.controller.update({ standby: true });
  let cycles = h.controller.state.cycles;
  h.controller.update({ standby: true, hidden: true });
  h.animations[0].finish(); await flush();
  assert.equal(h.controller.state.cycles, cycles, 'offscreen time cannot advance standby');
  h.controller.update({ standby: true }); assert.equal(h.controller.state.cycles, ++cycles);
  const phases = new Set([h.controller.state.phase]);
  for (let i = 0; i < 3; i++) {
    h.animations.at(-3).finish(); await flush();
    assert.equal(h.controller.state.cycles, ++cycles); phases.add(h.controller.state.phase);
  }
  assert.deepEqual([...phases].sort(), ['doze', 'play']); h.controller.destroy();
});
test('reduced motion, low power and media preferences show a static doze while fresh work cancels immediately', () => {
  for (const quiet of [{ reducedMotion: true }, { lowPower: true }]) {
    const h = fixture(); h.controller.update({ standby: true, ...quiet });
    assert.equal(h.controller.state.phase, 'static'); assert.equal(h.controller.state.animations, 0);
    h.controller.update({ standby: true }); assert.equal(h.controller.state.animations, 3);
    h.controller.update({ standby: false }); assert.equal(h.controller.state.active, false);
    assert.ok(h.animations.every(a => a.playState === 'idle')); assert.equal(h.rig.children.length, 0);
    h.controller.destroy(); assert.equal(h.mediaListeners.size + h.visibilityListeners.size, 0);
  }
  const h = fixture(); h.controller.update({ standby: true }); h.media.matches = true;
  for (const listener of h.mediaListeners) listener();
  assert.equal(h.controller.state.phase, 'static'); assert.equal(h.controller.state.animations, 0); h.controller.destroy();
});
test('walking, departure, stale evidence or attention cannot carry a standby mechanism into real activity', () => {
  for (const stop of [{ walking: true }, { departing: true }, { stale: true }, { attention: true }]) {
    const h = fixture(); h.controller.update({ standby: true }); h.controller.update({ standby: true, ...stop });
    assert.equal(h.controller.state.active, false); assert.equal(h.rig.children.length, 0);
    assert.ok(h.animations.every(a => a.playState === 'idle')); h.controller.destroy();
  }
});
test('standby chooses a resting painted pose without rewriting the observed completed session', () => {
  const session = { status: 'closed', closed: true, activity: 'idle', turnCompletedAt: 1000 }, before = JSON.stringify(session);
  assert.equal(Creature.poseFor(session, { standby: true }), 'resting');
  assert.equal(Creature.sourcePoseFor(session, { standby: true }, 'folio'), 3);
  assert.equal(Creature.poseFor(session, { standby: true, standbyPhase: 'play' }), 'idle');
  assert.equal(Creature.poseFor(session, { standby: true, walking: true }), 'idle');
  assert.equal(JSON.stringify(session), before);
});
