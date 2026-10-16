'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDemo, isDemoAction } = require('../lib/demo.cjs');
const { VIGNETTES } = require('../lib/demo-vignettes.cjs');

test('the classic five-agent demo stays the default while exposing only safe bilingual story metadata', t => {
  const demo = createDemo();
  t.after(() => demo.stop());
  const view = demo.snapshot();
  assert.equal(view.sessions.length, 5);
  assert.equal(view.demo.storyId, 'classic');
  assert.equal(view.demo.running, false);
  assert.equal(view.demo.tick, 0);
  assert.equal(view.demo.totalFrames, 7);
  assert.equal(view.demo.synthetic, true);
  assert.deepEqual(view.demo.stories.map(story => story.id), ['classic', ...VIGNETTES.map(vignette => vignette.id)]);
  for (const story of view.demo.stories) {
    assert.deepEqual(Object.keys(story).sort(), ['id', 'titleZh', 'titleEn'].sort());
    assert.match(story.titleZh, /[\u4e00-\u9fff]/);
    assert.match(story.titleEn, /[a-z]/i);
    assert.ok(Object.isFrozen(story));
  }
  assert.ok(Object.isFrozen(view.demo.stories));
});

test('each story selection resets only the demo store and keeps its waiting actor unresolved', t => {
  let now = 1000;
  const demo = createDemo({ now: () => now });
  t.after(() => demo.stop());
  for (const vignette of VIGNETTES) {
    const selected = demo.action('story:' + vignette.id);
    assert.equal(selected.demo.storyId, vignette.id);
    assert.equal(selected.demo.titleZh, vignette.titleZh);
    assert.equal(selected.demo.titleEn, vignette.titleEn);
    assert.equal(selected.demo.frameLabelZh, vignette.frames[0].labelZh);
    assert.equal(selected.demo.frameLabelEn, vignette.frames[0].labelEn);
    assert.equal(selected.demo.running, false);
    assert.equal(selected.demo.totalFrames, vignette.frames.length);
    assert.equal(selected.sessions.length, 3);
    assert.ok(selected.sessions.every(session => session.sessionId.startsWith('demo-' + vignette.id + '-')));
    assert.ok(selected.sessions.every(session => session.evidence.source === 'demo'));
    for (let index = 1; index < vignette.frames.length; index += 1) {
      now += 1000;
      const view = demo.action('advance');
      assert.equal(view.demo.tick, index);
      assert.equal(view.demo.frameLabelZh, vignette.frames[index].labelZh);
      assert.equal(view.demo.frameLabelEn, vignette.frames[index].labelEn);
    }
    const end = demo.snapshot();
    assert.equal(end.demo.running, false);
    assert.equal(end.sessions.filter(session => session.closed).length, 2);
    assert.equal(end.sessions.find(session => session.provider === 'claude-code').activity, 'waiting-user');
    const reset = demo.action('reset');
    assert.equal(reset.demo.storyId, vignette.id, 'reset restarts the selected story');
    assert.equal(reset.demo.tick, 0);
    assert.ok(reset.sessions.every(session => !session.closed && !session.attention));
  }
  const classic = demo.action('story:classic');
  assert.equal(classic.demo.storyId, 'classic');
  assert.equal(classic.sessions.length, 5);
  assert.ok(classic.sessions.some(session => session.sessionId === 'demo-login'));
});

test('story selection cancels a running timer and invalid actions cannot change the selected story', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const demo = createDemo({ intervalMs: 100 });
  t.after(() => demo.stop());
  demo.action('story:harbour-morning');
  demo.action('play');
  t.mock.timers.tick(100);
  assert.equal(demo.snapshot().demo.tick, 1);
  demo.action('story:rainy-afternoon');
  t.mock.timers.tick(1000);
  assert.equal(demo.snapshot().demo.tick, 0, 'the previous story cannot advance the new one');
  assert.equal(demo.snapshot().demo.running, false);
  const unchanged = demo.snapshot();
  for (const action of ['story:missing', 'story:__proto__', 'story:../../project', 'story:', 'PLAY', null, {}, ['play']]) {
    assert.equal(isDemoAction(action), false);
    assert.throws(() => demo.action(action), /Unknown demo action/);
    assert.deepEqual(demo.snapshot(), unchanged);
  }
  for (const action of ['play', 'pause', 'reset', 'advance', 'story:classic', ...VIGNETTES.map(vignette => 'story:' + vignette.id)]) assert.equal(isDemoAction(action), true);
});

test('selected stories auto-advance, stop at their final frame, and replay without answering waits', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const demo = createDemo({ intervalMs: 100 });
  t.after(() => demo.stop());
  demo.action('story:lantern-evening');
  demo.action('play');
  for (let index = 1; index < demo.snapshot().demo.totalFrames; index += 1) {
    t.mock.timers.tick(100);
    assert.equal(demo.snapshot().demo.tick, index);
  }
  const end = demo.snapshot();
  assert.equal(end.demo.running, false);
  assert.equal(end.sessions.find(session => session.provider === 'claude-code').activity, 'waiting-user');
  t.mock.timers.tick(1000);
  assert.deepEqual(demo.snapshot(), end, 'a completed story leaves no advancing timer behind');
  const replay = demo.action('play');
  assert.equal(replay.demo.storyId, 'lantern-evening');
  assert.equal(replay.demo.tick, 0);
  assert.equal(replay.demo.running, true);
  assert.ok(replay.sessions.every(session => !session.closed && !session.attention));
  demo.action('pause');
  t.mock.timers.tick(1000);
  assert.equal(demo.snapshot().demo.tick, 0);
  demo.action('play');
  demo.action('advance');
  t.mock.timers.tick(1000);
  assert.equal(demo.snapshot().demo.tick, 1, 'manual advance pauses instead of retaining an old play timer');
  assert.equal(demo.snapshot().demo.running, false);
});
