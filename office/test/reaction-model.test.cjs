'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Reactions = require('../lib/reaction-model.js');
const { createSessionStore } = require('../lib/session-store.cjs');

const end = (observedActivity, outcome) => ({ event: 'tool-end', observedActivity, outcome, at: 1 });

test('test and build results celebrate or sulk only on an explicit outcome', () => {
  assert.equal(Reactions.reactionFor(end('testing', 'success')), 'celebrate');
  assert.equal(Reactions.reactionFor(end('building', 'failure')), 'sulk');
  assert.equal(Reactions.reactionFor(end('testing', 'unknown')), null, 'unknown outcomes stay silent');
  assert.equal(Reactions.reactionFor(end('testing', undefined)), null);
  assert.equal(Reactions.reactionFor(end('coding', 'success')), 'tool-success', 'ordinary results keep the small success cue');
  assert.equal(Reactions.reactionFor(end('coding', 'failure')), null, 'an ordinary failed call is not a sulk');
});

test('a failed turn sulks, a long completed turn stretches, a short one does not', () => {
  assert.equal(Reactions.reactionFor({ event: 'error', at: 5 }, { settlementBoundary: { event: 'turn-failed', at: 5 } }), 'sulk');
  assert.equal(Reactions.reactionFor({ event: 'error', at: 5 }, {}), null, 'a transient error is not a failed turn');
  const started = 1000;
  assert.equal(Reactions.reactionFor({ event: 'turn-end', at: started + Reactions.LONG_TURN_MS }, { turnStartedAt: started }), 'stretch');
  assert.equal(Reactions.reactionFor({ event: 'turn-end', at: started + 60000 }, { turnStartedAt: started }), null);
  assert.equal(Reactions.reactionFor({ event: 'turn-end', at: 10 ** 9 }, {}), null, 'no start time, no claim');
});

test('the strongest evidence in one snapshot wins', () => {
  assert.equal(Reactions.pick([end('coding', 'success'), end('testing', 'success')]), 'celebrate');
  assert.equal(Reactions.pick([end('testing', 'success'), end('testing', 'failure')]), 'sulk');
  assert.equal(Reactions.pick([{ event: 'metadata' }]), null);
  assert.equal(Reactions.pick(null), null);
});

test('the snapshot exposes the real turn start used for long-turn reactions', () => {
  let clock = 1000;
  const store = createSessionStore({ now: () => clock });
  const base = { provider: 'codex', sessionId: 's', id: 'codex:s', turnId: 't1', evidence: { source: 'hook', rawEvent: 'x', confidence: 'high' } };
  store.ingest({ ...base, eventId: 'e1', event: 'turn-start', activity: 'planning', at: 1000 });
  clock = 1000 + Reactions.LONG_TURN_MS;
  store.ingest({ ...base, eventId: 'e2', event: 'turn-end', activity: 'idle', at: clock });
  const session = store.snapshot()[0];
  assert.equal(session.turnStartedAt, 1000);
  assert.equal(Reactions.pick(session.events.slice(-1), session), 'stretch');
});
