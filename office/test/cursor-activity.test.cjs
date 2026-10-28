'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEvent } = require('../lib/provider-events.cjs');
const { createSessionStore } = require('../lib/session-store.cjs');

function fixture() {
  let time = 1000000;
  const store = createSessionStore({ now: () => time, staleMs: 180000 });
  const accepted = [];
  store.onAccepted(event => accepted.push(event));
  function send(hook, extra = {}) {
    time += 10;
    const event = normalizeEvent('cursor', {
      hook_event_name: hook, conversation_id: 'chat', generation_id: 'generation-1',
      tool_name: 'Read', tool_use_id: 'call-1', ...extra,
    }, { receivedAt: time, source: 'hook' });
    return { event, accepted: store.ingest(event) };
  }
  return { store, accepted, send, now: () => time };
}

test('Cursor completion-only hooks reveal real work without manufacturing a tool start', () => {
  const f = fixture();
  const result = f.send('postToolUse');
  assert.equal(result.accepted, true);
  const session = f.store.snapshot()[0];
  assert.equal(session.id, 'cursor:chat');
  assert.equal(session.turnId, 'generation-1');
  assert.equal(session.status, 'active');
  assert.equal(session.activity, 'reading');
  assert.equal(session.activeTools, 0);
  assert.deepEqual(f.accepted.map(event => event.event), ['tool-end']);
  assert.equal(session.events[0].observedActivity, 'reading');
  assert.equal(f.store.ingest(result.event), false);
  // A repeated receipt with a different transport ID is still the same call.
  assert.equal(f.store.ingest({ ...result.event, eventId: 'duplicate-delivery' }), false);
  assert.equal(f.send('preToolUse').accepted, false, 'late starts cannot reopen completed calls');
  assert.equal(f.send('stop', { status: 'completed' }).accepted, true);
  assert.equal(f.store.snapshot()[0].status, 'idle');
  assert.equal(f.send('postToolUse', { tool_use_id: 'late-call' }).accepted, false);
  assert.equal(f.send('postToolUse', { generation_id: 'generation-2', tool_use_id: 'call-2', tool_name: 'Write' }).accepted, true);
  assert.equal(f.store.snapshot()[0].activity, 'coding');
  assert.equal(f.store.snapshot()[0].activeTools, 0);
  assert.equal(f.send('postToolUse', { tool_use_id: 'old-generation' }).accepted, false);
  assert.equal(f.send('stop', { generation_id: 'generation-2', status: 'completed' }).accepted, true);
  assert.equal(f.store.snapshot()[0].status, 'idle');
});

test('Cursor completion observations preserve pending tools, input waits and explicit teardown', () => {
  const f = fixture();
  f.send('beforeSubmitPrompt');
  f.send('preToolUse', { tool_use_id: 'pending' });
  assert.equal(f.send('postToolUse', { tool_use_id: 'unobserved-start', tool_name: 'Write' }).accepted, true);
  assert.equal(f.store.snapshot()[0].activeTools, 1);
  assert.equal(f.store.snapshot()[0].activity, 'reading');
  assert.equal(f.send('postToolUse', { tool_use_id: 'pending' }).accepted, true);
  assert.equal(f.store.snapshot()[0].activeTools, 0);
  const wait = { ...f.send('preCompact').event, eventId: 'input-wait', event: 'waiting-user', activity: 'waiting-user', toolCallId: 'question' };
  f.store.ingest(wait);
  assert.equal(f.send('postToolUseFailure', { tool_use_id: 'failed', tool_name: 'Write' }).accepted, true);
  assert.equal(f.store.snapshot()[0].status, 'waiting');
  assert.equal(f.store.snapshot()[0].activeTools, 1);
  f.send('sessionEnd');
  assert.equal(f.store.snapshot()[0].closed, true);
  assert.equal(f.send('postToolUse', { generation_id: 'generation-2' }).accepted, false);
});

test('only fresh native Cursor results qualify; dangling results from other providers remain rejected', () => {
  const f = fixture();
  const result = normalizeEvent('cursor', { conversation_id: 'other', generation_id: 'generation', hook_event_name: 'postToolUseFailure', tool_name: 'Shell' }, { receivedAt: f.now(), source: 'hook' });
  for (const patch of [
    { at: f.now() - 180001 }, { at: f.now() + 5001 }, { turnId: undefined },
    { provider: 'codex' }, { evidence: { source: 'cursor-jsonl', rawEvent: 'postToolUseFailure' } },
    { evidence: { source: 'hook', rawEvent: 'PostToolUse' } },
  ]) assert.equal(f.store.ingest({ ...result, ...patch }), false);
  assert.equal(f.store.snapshot().length, 0);
  assert.equal(f.store.ingest(result), true);
  assert.equal(f.store.snapshot()[0].activity, 'error');
  assert.equal(f.store.snapshot()[0].activeTools, 0);
  assert.equal(f.accepted[0].outcome, 'failure');
});
