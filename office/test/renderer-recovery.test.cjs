'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createRendererRecovery } = require('../lib/renderer-recovery.cjs');

function harness(extra = {}) {
  const contents = new EventEmitter();
  let clock = 0, destroyed = false, crashes = 0;
  const timers = new Map(); let nextTimer = 1;
  contents.isDestroyed = () => destroyed;
  contents.forcefullyCrashRenderer = () => { crashes++; };
  const logs = [], resets = [], exhausted = [], reloads = [];
  const recovery = createRendererRecovery({
    webContents: contents, reload: () => { reloads.push(clock); }, log: (kind, details) => logs.push([kind, details?.reason]),
    onReset: reason => resets.push(reason), onExhausted: reason => exhausted.push(reason), now: () => clock,
    setTimer: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, at: clock + ms }); return id; },
    clearTimer: id => timers.delete(id), ...extra,
  });
  async function advance(ms) {
    clock += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.fn(); }
    await new Promise(resolve => setImmediate(resolve));
  }
  return { contents, recovery, logs, resets, exhausted, reloads, advance, timers, destroy: () => { destroyed = true; }, crashes: () => crashes };
}

test('a crashed renderer is reloaded after a short delay and the state is reset first', async () => {
  const h = harness();
  h.contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 11 });
  assert.deepEqual(h.resets, ['crashed']);
  assert.deepEqual(h.reloads, []);
  await h.advance(1000);
  assert.deepEqual(h.reloads, [1000]);
  assert.deepEqual(h.logs.map(entry => entry[0]), ['renderer-gone', 'renderer-reload']);
});

test('clean exits and destroyed windows never reload', async () => {
  const h = harness();
  h.contents.emit('render-process-gone', {}, { reason: 'clean-exit' });
  h.destroy();
  h.contents.emit('render-process-gone', {}, { reason: 'crashed' });
  await h.advance(5000);
  assert.deepEqual(h.reloads, []);
  assert.deepEqual(h.logs, []);
});

test('repeated crashes inside one minute stop after three reloads, then recover later', async () => {
  const h = harness();
  for (let i = 0; i < 5; i++) { h.contents.emit('render-process-gone', {}, { reason: 'oom' }); await h.advance(2000); }
  assert.equal(h.reloads.length, 3);
  assert.deepEqual(h.exhausted, ['oom']);
  assert.equal(h.logs.filter(entry => entry[0] === 'renderer-recovery-exhausted').length, 1);
  await h.advance(61000);
  h.contents.emit('render-process-gone', {}, { reason: 'crashed' });
  await h.advance(1000);
  assert.equal(h.reloads.length, 4);
});

test('a hang that persists is force-crashed into the reload path; a recovery cancels it', async () => {
  const h = harness();
  h.contents.emit('unresponsive');
  await h.advance(5000);
  h.contents.emit('responsive');
  await h.advance(20000);
  assert.equal(h.crashes(), 0);
  h.contents.emit('unresponsive');
  h.contents.emit('unresponsive');
  await h.advance(15000);
  assert.equal(h.crashes(), 1);
  assert.deepEqual(h.logs.map(entry => entry[0]), ['renderer-unresponsive', 'renderer-responsive', 'renderer-unresponsive']);
});

test('dispose removes listeners and pending timers', async () => {
  const h = harness();
  h.contents.emit('render-process-gone', {}, { reason: 'crashed' });
  h.recovery.dispose();
  await h.advance(5000);
  assert.deepEqual(h.reloads, []);
  assert.equal(h.contents.listenerCount('render-process-gone'), 0);
});
