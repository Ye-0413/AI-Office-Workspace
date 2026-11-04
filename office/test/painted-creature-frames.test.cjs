'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { createHash } = require('node:crypto');
const Frames = require('../renderer/painted-creature-frames.js');
const Manifest = require('../renderer/painted-creature-frame-manifest.js');
const provenance = require('../assets/avatars/workshop-prompts.json').frames.prompts;

test('all five workshop companions cover every observed activity with painted keys', () => {
  assert.deepEqual(Object.keys(Manifest.strips).sort(), ['folio', 'glow', 'ink', 'moss', 'thread']);
  for (const [species, entries] of Object.entries(Manifest.strips)) {
    assert.deepEqual(Object.keys(entries).sort(), Object.keys(Frames.FAMILIES).sort(), species);
    assert.equal(Object.values(entries).reduce((sum, entry) => sum + entry.frames, 0), 44, species);
  }
});

function opacityAt(track, at) {
  const end = track.findIndex(frame => frame.offset >= at);
  if (end <= 0) return Number(track[Math.max(0, end)].opacity);
  const a = track[end - 1], b = track[end];
  return a.opacity + (b.opacity - a.opacity) * (at - a.offset) / (b.offset - a.offset);
}
test('every painted strip has complete local cells and a closed, complementary dissolve', () => {
  for (const [species, activities] of Object.entries(Manifest.strips)) for (const [activity, entry] of Object.entries(activities)) {
    const id = species + '/' + activity;
    const bytes = fs.readFileSync(path.join(__dirname, '../assets/avatars/painted-frames', id + '.png'));
    const record = provenance.find(item => item.species === species && item.activity === activity);
    assert.equal(record?.outputSha256, createHash('sha256').update(bytes).digest('hex'), id + ' provenance');
    assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a', id);
    assert.equal(bytes.readUInt32BE(16), Manifest.cell * entry.frames, id);
    assert.equal(bytes.readUInt32BE(20), Manifest.cell, id);
    assert.equal(entry.registration.length, entry.frames, id);
    assert.ok(entry.duration >= 2400 && entry.duration <= 9000, id);
    assert.equal(entry.sequence.length, entry.beats.length, id);
    assert.equal(entry.beats[0], 0, id);
    entry.beats.forEach((beat, i) => assert.ok(beat >= 0 && beat < 1 && (!i || beat > entry.beats[i - 1]), id));
    entry.sequence.forEach(key => assert.ok(Number.isInteger(key) && key >= 0 && key < entry.frames, id));
    const tracks = Frames.tracks(entry);
    for (let i = 0; i <= 1200; i++) {
      const values = tracks.map(track => opacityAt(track, i / 1200));
      assert.ok(values.filter(value => value > .001).length <= 2, id + ' shows at most two keys');
      // Complementary weights alone do not prove opaque output: source-over
      // still leaks background at a dissolve's midpoint. Native pixel tests
      // cover the compositing of these tracks with the production CSS.
      assert.ok(Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) < .01, id + ' has complementary weights');
    }
    for (const track of tracks) assert.ok(Math.abs(track[0].opacity - track.at(-1).opacity) < .001, id + ' closes its loop');
    const motion = Frames.motion(entry);
    if (motion) assert.equal(motion[0].transform, motion.at(-1).transform, id + ' transform seam');
  }
});

function fixture(species = 'moss', onReady) {
  const animations = [];
  class Element {
    constructor() { this.attrs = new Map(); this.children = []; this.style = { values: new Map(), setProperty(k, v) { this.values.set(k, v); }, getPropertyValue(k) { return this.values.get(k) || ''; } }; }
    setAttribute(k, v) { this.attrs.set(k, String(v)); if (k === 'id') this.id = String(v); }
    getAttribute(k) { return this.attrs.get(k) || null; }
    append(child) { this.children.push(child); }
    remove() { this.removed = true; }
    animate(frames, timing) { const animation = { frames, timing, currentTime: 0, cancelled: false, cancel() { this.cancelled = true; } }; animations.push(animation); return animation; }
  }
  const document = { createElementNS: () => new Element() }, pose = new Element(), shell = new Element(), defs = new Element(), lid = new Element(), lidGroup = new Element(), lidClip = new Element();
  return { document, pose, shell, animations, controller: Frames.create({ document, pose, shell, defs, lid, lidGroup, lidClip, creature: species, onReady }) };
}
test('painted playback retains clocks on metadata, holds K0 quietly, and releases every owner', () => {
  const { controller, animations, shell } = fixture();
  const options = { activity: 'coding', animate: true, phase: -1000, identity: 'codex/full-session' };
  controller.update(options);
  const first = [...controller.reels];
  assert.equal(first.length, 5);
  assert.equal(controller.blink, null, 'painted eyes must not run an invisible atlas blink');
  controller.update({ ...options, phase: -2000 });
  assert.deepEqual(controller.reels, first, 'metadata cannot rewind native time');
  controller.update({ ...options, quiet: true });
  assert.ok(first.every(animation => animation.cancelled));
  assert.equal(controller.reels.length, 0);
  const images = shell.children[0].children;
  assert.equal(images[0].style.getPropertyValue('opacity'), '1');
  assert.ok(images.slice(1).every(image => image.style.getPropertyValue('opacity') === '0'));
  controller.update({ ...options, walking: true });
  assert.equal(controller.painted, null, 'distance gait owns the body in transit');
  controller.update(options);
  controller.destroy(); controller.destroy();
  assert.ok(animations.every(animation => animation.cancelled));
});
test('a freshly mounted quiet fallback still has its state pose and updates without clocks', () => {
  const { controller, pose, animations } = fixture('folio');
  controller.update({ activity: 'reading', quiet: true, painted: false });
  assert.equal(pose.style.getPropertyValue('transform'), Frames.signature('folio', 'reading').frames[0].transform);
  controller.update({ activity: 'error', quiet: true, painted: false });
  assert.equal(pose.style.getPropertyValue('transform'), Frames.signature('folio', 'error').frames[0].transform);
  assert.equal(animations.length, 0);
  controller.destroy();
});
test('only the latest decoded strip may replace the fallback; errors and destruction stay inert', async () => {
  let refreshes = 0;
  const { document, controller } = fixture('moss', () => refreshes++);
  const probes = [];
  document.createElement = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const probe = { naturalWidth: 2048, naturalHeight: 512, decode: () => promise, resolve, reject };
    probes.push(probe); return probe;
  };
  const live = activity => controller.update({ activity, animate: true });
  assert.equal(live('coding').painted, false);
  assert.equal(live('reading').painted, false);
  probes[0].resolve(); await Promise.resolve();
  assert.equal(refreshes, 0, 'stale coding decode cannot take over reading');
  probes[1].resolve(); await Promise.resolve();
  assert.equal(refreshes, 1);
  assert.equal(live('reading').painted, true);
  live('error'); probes[2].reject(Error('missing local file')); await Promise.resolve();
  assert.equal(live('error').painted, false);
  assert.equal(probes.length, 3, 'a missing strip must not trigger a decode loop');
  live('coding'); controller.destroy(); probes[3].resolve(); await Promise.resolve();
  assert.equal(refreshes, 2, 'destroyed actors never schedule a renderer update');
});
