'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { explain } = require('../lib/state-explanation.js');
const { createSessionStore } = require('../lib/session-store.cjs');

test('explanations come from reducer evidence in both languages', () => {
  let clock = 1_000_000;
  const store = createSessionStore({ now: () => clock });
  const base = { provider: 'claude-code', sessionId: 's', turnId: 'p1', evidence: { source: 'hook', rawEvent: 'x' } };
  store.ingest({ ...base, eventId: 'a', event: 'turn-start', at: clock, evidence: { source: 'hook', rawEvent: 'UserPromptSubmit' } });
  store.ingest({ ...base, eventId: 'b', event: 'tool-start', at: clock, toolCallId: 'c', toolName: 'Bash', evidence: { source: 'hook', rawEvent: 'PreToolUse' } });
  store.ingest({ ...base, eventId: 'd', event: 'turn-end', at: clock, evidence: { source: 'hook', rawEvent: 'Stop' } });
  store.ingest({ ...base, eventId: 'd', event: 'turn-end', at: clock - 100000 });
  clock += 12000;
  const session = store.snapshot()[0];
  const en = explain(session, { language: 'en', now: clock });
  assert.deepEqual(en, [
    'Last accepted: Stop (12s ago)',
    'Stop received, still waiting for: 1 call without a result',
    'Ignored 1 event: repeated delivery ×1',
  ]);
  const zh = explain(session, { language: 'zh', now: clock });
  assert.equal(zh[1], '已收到停止，但仍在等待：1 个调用未返回');
});

test('a quiet session explains signal loss without claiming the task ended', () => {
  const lines = explain({ disconnected: true, lastEventAt: 0, events: [], diagnostics: {} }, { language: 'en', now: 1 });
  assert.match(lines[0], /may still be running/);
});

test('nothing unusual means no extra lines beyond the last event', () => {
  assert.deepEqual(explain({ lastEventAt: 0, events: [], diagnostics: { rejected: {} } }, { now: 0 }), []);
  assert.deepEqual(explain(null), []);
});
