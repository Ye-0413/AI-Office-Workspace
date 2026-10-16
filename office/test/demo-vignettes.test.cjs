'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { VIGNETTES, getVignette, eventsForFrame } = require('../lib/demo-vignettes.cjs');
const { createSessionStore } = require('../lib/session-store.cjs');

function replay(vignette, observer = () => {}) {
  let now = 1000;
  const store = createSessionStore({ now: () => now, staleMs: 3600000 });
  for (let index = 0; index < vignette.frames.length; index += 1) {
    now += 1000;
    const events = eventsForFrame(vignette.id, index, { receivedAt: now });
    for (const event of events) {
      assert.equal(store.ingest(event), true, vignette.id + ': rejected ' + JSON.stringify(event));
      observer(event, store.snapshot(), index);
    }
  }
  return store.snapshot();
}

test('three authored bilingual vignettes keep their definitions immutable and actors independent', () => {
  assert.equal(VIGNETTES.length, 3);
  assert.equal(new Set(VIGNETTES.map(vignette => vignette.id)).size, 3);
  assert.equal(getVignette('missing'), null);
  for (const vignette of VIGNETTES) {
    assert.equal(getVignette(vignette.id), vignette);
    assert.equal(vignette.synthetic, true);
    assert.equal(new Set(vignette.cast.map(actor => actor.id)).size, vignette.cast.length);
    assert.deepEqual(new Set(vignette.cast.map(actor => actor.provider)), new Set(['codex', 'cursor', 'claude-code']));
    assert.match(vignette.titleZh, /[\u4e00-\u9fff]/);
    assert.match(vignette.titleEn, /[a-z]/i);
    for (const actor of vignette.cast) {
      assert.ok(actor.titleZh.length >= 8, 'the scenario should describe concrete work');
      assert.match(actor.titleEn, /[a-z]/i);
    }
    assert.ok(vignette.frames.length >= 6);
    assert.ok(Object.isFrozen(vignette.cast[0]));
    assert.ok(Object.isFrozen(vignette.frames[0].events[0]));
    assert.throws(() => { vignette.frames[0].events.push({}); }, TypeError);
  }
});

test('each vignette replays real hook dialects through the production reducer with explicit synthetic evidence', () => {
  const allIds = new Set();
  for (const vignette of VIGNETTES) {
    const final = replay(vignette, event => {
      assert.equal(event.evidence.source, 'demo');
      assert.ok(event.evidence.rawEvent);
      assert.ok(event.projectPath.startsWith('/Demo/'));
      assert.equal('command' in event, false, 'normalized evidence must not retain an executable command');
      assert.equal('tool_input' in event, false);
      assert.equal('tool_response' in event, false);
      assert.equal(allIds.has(event.eventId), false, 'events must stay independent across providers and stories');
      allIds.add(event.eventId);
    });
    assert.equal(final.length, vignette.cast.length);
    assert.ok(final.every(session => session.evidence.source === 'demo'));
    assert.equal(final.filter(session => session.closed).length, 2, 'only the two explicit teardown sequences close');
    const pending = final.find(session => session.provider === 'claude-code');
    assert.equal(pending.activity, 'waiting-user');
    assert.equal(pending.attention, true);
    assert.equal(pending.closed, false, 'a pending question or approval is never silently answered by the story');
  }
});

test('failed checks visibly fail before an explicit repair and retry; returned results alone never imply completion', () => {
  for (const id of ['rainy-afternoon', 'lantern-evening']) {
    let sawFailure = false, sawRepair = false, sawRetry = false, sawIdle = false;
    replay(getVignette(id), (event, sessions) => {
      const current = sessions.find(session => session.id === event.id);
      if (event.outcome === 'failure') {
        sawFailure = true;
        assert.equal(current.activity, 'error');
        assert.equal(current.closed, false);
      } else if (sawFailure && event.event === 'tool-start' && event.activity === 'coding') sawRepair = true;
      else if (sawRepair && event.event === 'tool-start' && ['testing', 'building'].includes(event.activity)) sawRetry = true;
      if (event.event === 'turn-end') {
        assert.equal(current.closed, false, 'Stop is a turn boundary, never an invented session end');
        assert.equal(current.activity, 'idle');
        sawIdle = true;
      }
    });
    assert.ok(sawFailure && sawRepair && sawRetry && sawIdle, id + ' must expose its repair lifecycle');
  }
});

test('a blocked actor remains waiting while the rest of its story advances and closes', () => {
  for (const vignette of VIGNETTES) {
    let pendingId;
    replay(vignette, (event, sessions) => {
      if (event.event === 'waiting-user') pendingId = event.id;
      if (!pendingId) return;
      const pending = sessions.find(session => session.id === pendingId);
      assert.equal(pending.activity, 'waiting-user', vignette.id + ': unrelated work must not release a wait');
      assert.equal(pending.closed, false);
    });
    assert.ok(pendingId, vignette.id + ' supplies a real pending hook signal');
  }
});

test('replay is deterministic, bilingual titles do not change identities, and new runs avoid delivery deduplication', () => {
  for (const vignette of VIGNETTES) {
    const first = eventsForFrame(vignette.id, 0, { receivedAt: 1234 });
    assert.deepEqual(eventsForFrame(vignette.id, 0, { receivedAt: 1234 }), first);
    const english = eventsForFrame(vignette.id, 0, { receivedAt: 1234, language: 'en' });
    assert.deepEqual(english.map(event => event.id), first.map(event => event.id));
    assert.deepEqual(english.map(event => event.turnId), first.map(event => event.turnId));
    assert.notEqual(english[0].title, first[0].title);
    const nextRun = eventsForFrame(vignette.id, 0, { receivedAt: 1234, runId: 'next' });
    assert.deepEqual(nextRun.map(event => event.id), first.map(event => event.id));
    assert.ok(nextRun.every((event, index) => event.eventId !== first[index].eventId && event.turnId !== first[index].turnId));
  }
  assert.throws(() => eventsForFrame('missing', 0), RangeError);
  assert.throws(() => eventsForFrame(VIGNETTES[0].id, -1), RangeError);
  assert.throws(() => eventsForFrame(VIGNETTES[0].id, 1.5), RangeError);
  assert.throws(() => eventsForFrame(VIGNETTES[0].id, 0, { receivedAt: NaN }), TypeError);
  assert.throws(() => eventsForFrame(VIGNETTES[0].id, 0, { runId: 'bad run id' }), TypeError);
});
