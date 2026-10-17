'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the real renderer helpers. This models clock/Promise ownership,
// rather than claiming to reproduce browser interpolation or RAF rendering.
const source = fs.readFileSync(path.join(__dirname, '../renderer/avatar-performance.js'), 'utf8');
const helpersStart = source.indexOf('    function releaseBridgeClocks(');
const helpersEnd = source.indexOf('\n    let gait = null;', helpersStart);
const destroyStart = source.indexOf('    function destroy() {', helpersEnd);
const destroyEnd = source.indexOf('    // A single shared media listener', destroyStart);
assert.ok(helpersStart >= 0 && helpersEnd > helpersStart && destroyStart > helpersEnd && destroyEnd > destroyStart,
  'production clock helpers and teardown must be available to this behavioral fixture');
const production = source.slice(helpersStart, helpersEnd) + source.slice(destroyStart, destroyEnd);

function style() {
  const values = new Map();
  return {
    getPropertyValue: name => values.get(name)?.value || '',
    getPropertyPriority: name => values.get(name)?.priority || '',
    setProperty(name, value, priority = '') { values.set(name, { value: String(value), priority }); },
    removeProperty(name) { values.delete(name); }
  };
}

function fixture({ initialState = 'running' } = {}) {
  const motions = [], created = [];
  let css;
  const joint = { style: style() };
  function motion(target, { cssName, state = 'running', duration = Infinity } = {}) {
    let resolve, reject;
    const value = {
      effect: { target }, currentTime: 1200, playState: state, pending: false, plays: 0, pauses: 0,
      finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
      play() { value.plays++; value.playState = 'running'; },
      pause() { value.pauses++; value.playState = 'paused'; },
      cancel() {
        if (value.playState === 'idle') return;
        value.playState = 'idle'; reject(new Error('cancelled'));
      },
      advance(ms) {
        if (value.playState !== 'running') return;
        value.currentTime += ms;
        if (value.currentTime >= duration) { value.currentTime = duration; value.playState = 'finished'; resolve(); }
      }
    };
    if (cssName !== undefined) value.animationName = cssName;
    motions.push(value);
    return value;
  }
  joint.animate = (frames, options) => {
    const value = motion(joint, { duration: options.duration });
    value.currentTime = 0;
    value.frames = frames;
    created.push(value);
    return value;
  };
  css = motion(joint, { cssName: 'authored-work-hand', state: initialState });
  const bitmap = { style: style() };
  const health = motion(bitmap); // Independent WAAPI resource-healing owner.
  const layer = {
    style: style(), dataset: { animate: 'true' }, hidden: false, removed: false,
    getAnimations: () => motions.filter(value => !['idle', 'finished'].includes(value.playState)),
    remove() { this.removed = true; }
  };
  const view = {
    getComputedStyle(node) {
      return {
        transform: node.style.getPropertyValue('transform') || `translate(${css.currentTime / 100}px,0px)`,
        opacity: node.style.getPropertyValue('opacity') || '1'
      };
    }
  };
  const context = vm.createContext({
    layer, view, bitmap, joint, Map, Set, Promise,
    svg: { querySelectorAll: () => [joint] }, transit: { contains: () => false },
    body: { classList: { remove() {} } }, actorNode: { dataset: {} }
  });
  const api = vm.runInContext(`
    let bridgeClockOwner = null, destroyed = false, ghost = null;
    let visual = null, presence = 'active', presenceSerial = 0, frozen = [];
    let systemMotion = null, clockLease = null, last = null;
    const originalBitmapOpacity = '', bridges = new Set(), transients = new Set();
    const fades = new Set(), paused = new Map(), visibleClocks = new Map();
    const joints = () => [joint];
    function stopGait() {}
    ${production}
    ({hold:holdBridgeClocks, finish:finishBridgeClocks, stop:stopBridge,
      freeze:freezeVisual, thaw:thawVisual, quiet:settleInactive, destroy,
      capture, bridge:(frames) => animate(joint, frames)})
  `, context);
  return {
    api, css, health, layer, created,
    advance(ms) { for (const value of motions) value.advance(ms); },
    // Flush finished/catch/finally and the owner completion continuation.
    async flush() { for (let index = 0; index < 6; index++) await Promise.resolve(); }
  };
}

test('a static bridge target retains its CSS phase, then resumes the same original clock at its endpoint', async () => {
  const f = fixture(), owner = f.api.hold(), target = f.api.capture()[0].transform;
  f.api.bridge([{ transform: 'translate(0px,0px)' }, { transform: target }]);
  f.api.finish(owner);
  f.advance(179); await f.flush();
  assert.equal(f.css.currentTime, 1200);
  assert.equal(f.api.capture()[0].transform, target, 'the underlying CSS target cannot advance behind a finite bridge');
  assert.equal(f.css.playState, 'paused');
  f.advance(1); await f.flush();
  assert.equal(f.css.playState, 'running');
  assert.equal(f.css.currentTime, 1200, 'resume starts at the exact phase used by the bridge target');
  assert.equal(f.css.plays, 1);
  assert.ok(f.layer.getAnimations().includes(f.css), 'the original CSSAnimation instance remains installed');
  f.advance(16);
  assert.equal(f.css.currentTime, 1216, 'the original work clock advances after the bridge releases it');
});

test('an independently paused CSS clock remains paused after a completed work bridge', async () => {
  const f = fixture({ initialState: 'paused' }), owner = f.api.hold();
  f.api.bridge([{ opacity: 0 }, { opacity: 1 }]); f.api.finish(owner);
  f.advance(180); await f.flush();
  assert.equal(f.css.playState, 'paused');
  assert.equal(f.css.currentTime, 1200);
  assert.equal(f.css.plays, 0);
});

test('freeze inherits the original running state and an obsolete finished callback cannot release a replacement bridge', async () => {
  const f = fixture(), oldOwner = f.api.hold();
  f.api.bridge([{ transform: 'translate(0px,0px)' }, { transform: 'translate(12px,0px)' }]);
  f.api.finish(oldOwner); f.advance(50);
  f.api.freeze(); f.api.stop();
  assert.equal(f.css.plays, 0, 'walking/frozen ownership prevents the cancelled bridge from resuming CSS');
  f.api.thaw(true);
  assert.equal(f.css.plays, 1, 'thaw remembers running before the bridge, rather than its temporary paused state');
  const nextOwner = f.api.hold();
  f.api.bridge([{ transform: 'translate(1px,0px)' }, { transform: 'translate(12px,0px)' }]);
  f.api.finish(nextOwner);
  await f.flush();
  assert.equal(f.css.playState, 'paused', 'settling the cancelled old bridge cannot release the replacement owner');
  assert.equal(f.css.plays, 1);
  f.advance(180); await f.flush();
  assert.equal(f.css.playState, 'running');
  assert.equal(f.css.plays, 2);
});

test('quiet settlement and real renderer teardown cannot be revived by queued bridge completion', async () => {
  for (const operation of ['quiet', 'destroy']) {
    const f = fixture(), owner = f.api.hold();
    f.api.bridge([{ opacity: 0 }, { opacity: 1 }]); f.api.finish(owner);
    f.api[operation](); await f.flush(); f.advance(500); await f.flush();
    assert.equal(f.css.plays, 0, operation + ' must not play a cancelled clock');
    assert.equal(f.css.playState, 'paused');
    assert.equal(f.css.currentTime, 1200);
    assert.ok(f.created.every(value => value.playState === 'idle'));
    if (operation === 'quiet') assert.equal(f.layer.dataset.animate, 'false');
    else assert.equal(f.layer.removed, true);
  }
});

test('bridge and freeze ownership never pause or resume an independent resource-health WAAPI animation', async () => {
  const f = fixture(), owner = f.api.hold();
  f.api.bridge([{ opacity: 0 }, { opacity: 1 }]); f.api.finish(owner);
  f.api.freeze(); f.api.stop(); f.api.thaw(true); await f.flush();
  assert.equal(f.health.playState, 'running');
  assert.equal(f.health.pauses, 0); assert.equal(f.health.plays, 0);
  f.advance(40);
  assert.equal(f.health.currentTime, 1240);
});

test('the clock owner waits for every finite joint and prop bridge before resuming CSS', async () => {
  const f = fixture(), owner = f.api.hold();
  f.api.bridge([{ transform: 'translate(0px,0px)' }, { transform: 'translate(12px,0px)' }]);
  f.advance(35);
  f.api.bridge([{ opacity: 0 }, { opacity: 1 }]);
  f.api.finish(owner);
  f.advance(145); await f.flush();
  assert.equal(f.created[0].playState, 'finished');
  assert.equal(f.created[1].playState, 'running');
  assert.equal(f.css.playState, 'paused'); assert.equal(f.css.plays, 0);
  f.advance(35); await f.flush();
  assert.equal(f.css.playState, 'running'); assert.equal(f.css.plays, 1);
});
