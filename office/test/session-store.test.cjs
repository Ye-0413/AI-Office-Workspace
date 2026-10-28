'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSessionStore } = require('../lib/session-store.cjs');

let serial = 0;
function event(event, extra = {}) {
  return { provider: 'codex', sessionId: 'one', eventId: `e${++serial}`, at: 1000 + serial,
    event, activity: 'planning', summary: event, evidence: { source: 'hook', rawEvent: event, confidence: 'explicit' }, ...extra };
}
test('independent same-provider sessions, correlated concurrent tools, Stop waits for all results', () => {
  const store = createSessionStore({ now: () => 2000 });
  store.ingest(event('turn-start', { turnId: 't1' }));
  store.ingest(event('turn-start', { sessionId: 'two', turnId: 't2' }));
  store.ingest(event('tool-start', { turnId: 't1', toolCallId: 'a', toolName: 'Read', activity: 'reading' }));
  store.ingest(event('tool-start', { turnId: 't1', toolCallId: 'b', toolName: 'Bash', activity: 'testing' }));
  store.ingest(event('turn-end', { turnId: 't1', activity: 'idle' }));
  assert.equal(store.snapshot().find(s => s.sessionId === 'one').activeTools, 2);
  store.ingest(event('tool-end', { turnId: 't1', toolCallId: 'a' }));
  assert.equal(store.snapshot().find(s => s.sessionId === 'one').status, 'active');
  assert.equal(store.ingest(event('tool-end', { turnId: 't1', toolCallId: 'a' })), false);
  store.ingest(event('tool-end', { turnId: 't1', toolCallId: 'b' }));
  const s = store.snapshot().find(s => s.sessionId === 'one');
  assert.equal(s.status, 'idle'); assert.ok(s.turnCompletedAt); assert.equal(s.closed, false);
  assert.equal(store.snapshot().find(s => s.sessionId === 'two').status, 'active');
  store.ingest(event('session-end', { sessionId: 'two', turnId: 't2' }));
  assert.equal(store.snapshot().find(s => s.sessionId === 'two').closed, true);
});
test('new turn fences late terminal/tool events and bounded duplicate IDs', () => {
  const store = createSessionStore({ now: () => 2000 });
  store.ingest(event('turn-start', { turnId: 'old' }));
  store.ingest(event('tool-start', { turnId: 'old', toolCallId: 'a' }));
  store.ingest(event('turn-start', { turnId: 'new' }));
  const fresh = event('tool-start', { turnId: 'new', toolCallId: 'b', activity: 'coding' });
  assert.equal(store.ingest(fresh), true); assert.equal(store.ingest(fresh), false);
  assert.equal(store.ingest(event('turn-end', { turnId: 'old' })), false);
  assert.equal(store.ingest(event('tool-end', { turnId: 'old', toolCallId: 'a' })), false);
  assert.equal(store.snapshot()[0].activity, 'coding'); assert.equal(store.snapshot()[0].activeTools, 1);
});
test('accepted-event subscribers observe facts after acceptance, including deferred replay, and can unsubscribe', () => {
  let time = 100000;
  const store = createSessionStore({ now: () => time }), accepted = [], snapshots = [];
  assert.throws(() => store.onAccepted(null), /Callback/);
  const unsubscribe = store.onAccepted(e => { accepted.push(e); snapshots.push(store.snapshot()); e.evidence.source = 'mutated-listener-copy'; });
  const start = event('session-start', { turnId: 't', at: time });
  assert.equal(store.ingest(start), true); assert.equal(accepted.length, 1);
  assert.equal(store.ingest(start), false); assert.equal(accepted.length, 1);
  time += 10;
  const tool = event('tool-start', { turnId: 't', toolCallId: 'deferred', at: time, activity: 'testing', evidence: { source: 'codex-jsonl' } });
  assert.equal(store.ingest(tool), false); assert.equal(accepted.length, 1);
  time += 11000; store.prune();
  assert.equal(accepted.length, 2); assert.equal(accepted[1].eventId, tool.eventId); assert.equal(accepted[1].at, tool.at);
  assert.equal(snapshots[1][0].activity, 'testing'); assert.equal(store.snapshot()[0].evidence.source, 'codex-jsonl');
  assert.equal(store.ingest(tool), false); store.prune(); assert.equal(accepted.length, 2);
  unsubscribe(); store.ingest(event('metadata', { at: time })); assert.equal(accepted.length, 2);
});
test('a positively newer native rollout turn owns its clock despite a late old-turn heartbeat', () => {
  const store = createSessionStore({ now: () => 200000 });
  const fallback = { source: 'codex-jsonl', rawEvent: 'rollout:sustained-snapshot' };
  store.ingest(event('turn-start', { turnId: 'old', at: 100000, turnStartedAt: 50000, evidence: fallback }));
  store.ingest(event('tool-start', { turnId: 'old', at: 100010, toolCallId: 'old-read', activity: 'reading', evidence: fallback }));
  store.ingest(event('metadata', { turnId: 'old', at: 199000, evidence: { source: 'codex-jsonl', rawEvent: 'event_msg:agent_reasoning' } }));
  assert.equal(store.snapshot()[0].lastEventAt, 199000);
  assert.equal(store.ingest(event('turn-start', { turnId: 'new', at: 150000, turnStartedAt: 120000, evidence: fallback })), true);
  assert.equal(store.ingest(event('tool-start', { turnId: 'new', at: 150010, toolCallId: 'new-edit', activity: 'coding', evidence: fallback })), true);
  const session = store.snapshot()[0];
  assert.equal(session.turnId, 'new'); assert.equal(session.activity, 'coding');
  assert.equal(session.activeTools, 1); assert.equal(session.lastEventAt, 150010);
  assert.equal(store.ingest(event('tool-start', { turnId: 'old', at: 201000, toolCallId: 'late-old-call', evidence: fallback })), false);
  assert.equal(store.ingest(event('turn-start', { turnId: 'old', at: 202000, turnStartedAt: 50000, evidence: fallback })), false);
  assert.equal(store.ingest(event('tool-start', { turnId: 'new', at: 140000, toolCallId: 'stale-same-turn', evidence: fallback })), false);
  assert.equal(store.snapshot()[0].activeTools, 1);
});
test('a trusted ended-turn state snapshot keeps real children active without a completion cue', () => {
  const store = createSessionStore({ now: () => 200000 });
  const fallback = { source: 'codex-jsonl', rawEvent: 'rollout:restored-wait-snapshot' };
  store.ingest(event('turn-start', { turnId: 'old', at: 50000, evidence: fallback }));
  store.ingest(event('waiting-user', { turnId: 'old', at: 70000, toolCallId: 'old-wait', activity: 'waiting-user', evidence: fallback }));
  store.ingest(event('subagent-start', { subagentId: 'child', parentId: 'codex:one', at: 190000, turnId: 'child-turn' }));
  store.ingest(event('tool-start', { subagentId: 'child', parentId: 'codex:one', at: 190010, turnId: 'child-turn', toolCallId: 'child-test', activity: 'testing' }));
  const restored = event('metadata', { turnId: 'new-ended', supersedesTurnId: 'old', at: 160000,
    turnStartedAt: 120000, turnEndedAt: 160000, activity: 'idle',
    evidence: { source: 'codex-jsonl', rawEvent: 'rollout:ended-turn-snapshot', restored: true, snapshot: 'ended-turn' } });
  assert.equal(store.ingest(restored), true); assert.equal(store.ingest(restored), false);
  let parent = store.snapshot().find(s => !s.parentId), child = store.snapshot().find(s => s.parentId);
  assert.equal(parent.turnId, 'new-ended'); assert.equal(parent.activeTools, 0); assert.equal(parent.attention, false);
  assert.equal(parent.status, 'active'); assert.equal(parent.activity, 'waiting-tool'); assert.equal(parent.closed, false);
  assert.equal(parent.turnCompletedAt, undefined); assert.equal(child.activity, 'testing'); assert.equal(child.activeTools, 1);
  store.ingest(event('tool-end', { subagentId: 'child', turnId: 'child-turn', toolCallId: 'child-test', at: 200010 }));
  assert.equal(store.snapshot().find(s => !s.parentId).status, 'active');
  store.ingest(event('turn-end', { subagentId: 'child', turnId: 'child-turn', at: 200020, activity: 'idle' }));
  parent = store.snapshot().find(s => !s.parentId);
  assert.equal(parent.status, 'idle'); assert.equal(parent.activity, 'idle'); assert.equal(parent.turnCompletedAt, undefined);
  assert.equal(store.ingest(event('turn-start', { turnId: 'old', at: 200030, turnStartedAt: 50000, evidence: fallback })), false);
});
test('ended-turn restoration rejects unknown history, invalid chronology and newer Hook ownership', () => {
  const valid = { turnId: 'new-ended', supersedesTurnId: 'old', at: 160000, turnStartedAt: 120000, turnEndedAt: 160000,
    evidence: { source: 'codex-jsonl', rawEvent: 'rollout:ended-turn-snapshot', restored: true, snapshot: 'ended-turn' } };
  const unknown = createSessionStore({ now: () => 200000 });
  assert.equal(unknown.ingest(event('metadata', valid)), false); assert.equal(unknown.snapshot().length, 0);
  for (const invalid of [
    { turnStartedAt: 50000 }, { turnEndedAt: 119999, at: 119999 }, { at: 170000 },
    { supersedesTurnId: 'other' }, { turnId: 'old' },
    { evidence: { ...valid.evidence, source: 'hook' } }, { evidence: { ...valid.evidence, restored: false } },
  ]) {
    const store = createSessionStore({ now: () => 200000 });
    store.ingest(event('turn-start', { turnId: 'old', at: 50000, evidence: { source: 'codex-jsonl' } }));
    store.ingest(event('waiting-user', { turnId: 'old', at: 70000, toolCallId: 'q', activity: 'waiting-user', evidence: { source: 'codex-jsonl' } }));
    assert.equal(store.ingest(event('metadata', { ...valid, ...invalid })), false);
    assert.equal(store.snapshot()[0].attention, true); assert.equal(store.snapshot()[0].turnId, 'old');
  }
  const store = createSessionStore({ now: () => 200000 });
  store.ingest(event('turn-start', { turnId: 'old', at: 50000 }));
  store.ingest(event('tool-start', { turnId: 'old', at: 190000, toolCallId: 'native-progress', activity: 'testing' }));
  assert.equal(store.ingest(event('metadata', valid)), false);
  assert.equal(store.snapshot()[0].activity, 'testing'); assert.equal(store.snapshot()[0].activeTools, 1);
  store.ingest(event('turn-start', { turnId: 'newer-native', at: 195000 }));
  assert.equal(store.ingest(event('metadata', { ...valid, supersedesTurnId: 'newer-native' })), false);
  assert.equal(store.snapshot()[0].turnId, 'newer-native');
});
test('official hooks own their turn over stale JSONL; a newer fallback turn may enter', () => {
  const store = createSessionStore({ now: () => 2000 });
  store.ingest(event('turn-start', { turnId: 't1' }));
  store.ingest(event('tool-start', { turnId: 't1', toolCallId: 'a', activity: 'testing' }));
  assert.equal(store.ingest(event('turn-end', { turnId: 't1', evidence: { source: 'codex-jsonl' } })), false);
  assert.equal(store.snapshot()[0].activity, 'testing');
  assert.equal(store.ingest(event('turn-start', { turnId: 't2', evidence: { source: 'codex-jsonl' } })), true);
  assert.equal(store.snapshot()[0].activeTools, 0);
});
test('child agents keep parent active until their own work ends', () => {
  const store = createSessionStore({ now: () => 2000 });
  store.ingest(event('turn-start', { turnId: 't1' }));
  store.ingest(event('subagent-start', { subagentId: 'child', parentId: 'codex:one' }));
  store.ingest(event('turn-end', { turnId: 't1', activity: 'idle' }));
  assert.equal(store.snapshot().find(s => !s.parentId).status, 'active');
  store.ingest(event('subagent-end', { subagentId: 'child', parentId: 'codex:one', activity: 'idle' }));
  assert.equal(store.snapshot().find(s => !s.parentId).status, 'idle');
});
test('stale is disconnected, not success; tool failure permits recovery; metadata is not heartbeat', () => {
  let time = 2000;
  const store = createSessionStore({ now: () => time, staleMs: 1000 });
  store.ingest(event('turn-start', { at: 2000 }));
  store.ingest(event('tool-start', { at: 2010, toolCallId: 'a', activity: 'testing' }));
  store.ingest(event('tool-end', { at: 2020, toolCallId: 'a', outcome: 'failure' }));
  assert.equal(store.snapshot()[0].status, 'active'); assert.equal(store.snapshot()[0].activity, 'error');
  store.ingest(event('tool-start', { at: 2030, toolCallId: 'b', activity: 'coding' }));
  time = 5000;
  store.ingest(event('metadata', { at: 5000 }));
  assert.equal(store.snapshot()[0].status, 'stale'); assert.equal(store.snapshot()[0].disconnected, true);
  assert.equal(store.snapshot()[0].turnCompletedAt, undefined);
  store.ingest(event('tool-end', { at: 5010, toolCallId: 'b' }));
  assert.equal(store.snapshot()[0].status, 'active');
});
test('background Stop remains waiting-tool and snapshots cannot mutate store', () => {
  const store = createSessionStore({ now: () => 2000 });
  store.ingest(event('turn-start'));
  store.ingest(event('turn-end', { activity: 'waiting-tool' }));
  const s = store.snapshot()[0]; assert.equal(s.status, 'active'); assert.equal(s.activity, 'waiting-tool');
  s.events[0].summary = 'tampered'; assert.notEqual(store.snapshot()[0].events[0].summary, 'tampered');
});
test('history retention preserves unresolved sessions and subscriptions can be removed', () => {
  const store = createSessionStore({ now: () => 2000, maxSessions: 2 }); let calls = 0;
  const unsubscribe = store.onChange(() => calls++);
  store.ingest(event('turn-start', { sessionId: 'a' })); unsubscribe();
  store.ingest(event('turn-start', { sessionId: 'b' }));
  store.ingest(event('turn-start', { sessionId: 'c' }));
  assert.equal(calls, 1); assert.equal(store.snapshot().length, 3, 'three real active identities exceed a two-row history target');
  assert.deepEqual(store.snapshot().map(s => s.sessionId).sort(), ['a', 'b', 'c']);
  store.clear(); assert.equal(store.snapshot().length, 0);
});
test('a fresh child is positive evidence that its quiet parent is still collaborating', () => {
  let time = 1000;
  const store = createSessionStore({ now: () => time, staleMs: 1000 });
  store.ingest(event('turn-start', { at: 1000 }));
  time = 3000;
  store.ingest(event('subagent-start', { at: time, subagentId: 'child', parentId: 'codex:one' }));
  const parent = store.snapshot().find(s => !s.parentId);
  assert.equal(parent.status, 'active'); assert.equal(parent.activity, 'waiting-tool'); assert.equal(parent.disconnected, false);
  time = 5000; assert.equal(store.snapshot().find(s => !s.parentId).disconnected, true);
});
test('SessionStart is an idle open session; ElicitationResult only resolves a matching kind of wait', () => {
  const store = createSessionStore({ now: () => 2000 });
  store.ingest(event('session-start', { activity: 'idle' })); assert.equal(store.snapshot()[0].status, 'idle');
  store.ingest(event('waiting-user', { evidence: { source: 'hook', rawEvent: 'PermissionRequest' } }));
  store.ingest(event('metadata', { evidence: { source: 'hook', rawEvent: 'ElicitationResult' } }));
  assert.equal(store.snapshot()[0].status, 'waiting');
  store.ingest(event('waiting-user', { evidence: { source: 'hook', rawEvent: 'Elicitation' } }));
  store.ingest(event('metadata', { evidence: { source: 'hook', rawEvent: 'ElicitationResult' } }));
  // Resolving the elicitation does not answer the separate permission request.
  assert.equal(store.snapshot()[0].status, 'waiting');
  store.ingest(event('turn-start', { turnId: 'new' }));
  store.ingest(event('waiting-user', { turnId: 'new', evidence: { source: 'hook', rawEvent: 'Elicitation' } }));
  store.ingest(event('metadata', { turnId: 'new', evidence: { source: 'hook', rawEvent: 'ElicitationResult' } }));
  assert.equal(store.snapshot()[0].status, 'active'); assert.equal(store.snapshot()[0].attention, false);
});
test('child waiting without a tool ID keeps Stop open, but explicit SessionEnd closes parent', () => {
  const store = createSessionStore({ now: () => 2000 });
  store.ingest(event('turn-start', { turnId: 't1' }));
  store.ingest(event('waiting-user', { subagentId: 'child', parentId: 'codex:one', activity: 'waiting-user' }));
  store.ingest(event('turn-end', { turnId: 't1', activity: 'idle' }));
  assert.equal(store.snapshot().find(s => !s.parentId).status, 'active');
  store.ingest(event('session-end', { turnId: 't1', activity: 'idle' }));
  assert.equal(store.snapshot().find(s => !s.parentId).status, 'closed');
});
test('native SessionEnd closes after same-turn Stop and ignores stale carried turn/timestamp', () => {
  const store = createSessionStore({ now: () => 20000 });
  store.ingest(event('turn-start', { turnId: 'finished', at: 10000 }));
  store.ingest(event('turn-end', { turnId: 'finished', at: 11000, activity: 'idle' }));
  assert.equal(store.snapshot()[0].status, 'idle'); assert.equal(store.snapshot()[0].turnCompletedAt, 11000);
  assert.equal(store.ingest(event('session-end', { turnId: 'finished', at: 1000, activity: 'idle' })), true);
  const closed = store.snapshot()[0];
  assert.equal(closed.status, 'closed'); assert.equal(closed.closed, true); assert.equal(closed.turnCompletedAt, undefined);
  assert.equal(closed.lastEventAt, 11000);
  assert.equal(store.ingest(event('tool-start', { turnId: 'finished', at: 12000, toolCallId: 'late' })), false);
});
test('native SessionEnd remains authoritative with running tools and children, even carrying an older closed turn', () => {
  const store = createSessionStore({ now: () => 20000 });
  store.ingest(event('turn-start', { turnId: 'old', at: 10000 }));
  store.ingest(event('turn-end', { turnId: 'old', at: 11000, activity: 'idle' }));
  store.ingest(event('turn-start', { turnId: 'new', at: 12000 }));
  store.ingest(event('tool-start', { turnId: 'new', at: 13000, toolCallId: 'busy', activity: 'testing' }));
  store.ingest(event('waiting-user', { subagentId: 'child', parentId: 'codex:one', at: 14000, activity: 'waiting-user' }));
  assert.equal(store.ingest(event('tool-end', { turnId: 'old', at: 15000, toolCallId: 'old-tool' })), false);
  assert.equal(store.ingest(event('session-end', { turnId: 'old', at: 1000, activity: 'idle' })), true);
  let parent = store.snapshot().find(s => !s.parentId);
  assert.equal(parent.status, 'closed'); assert.equal(parent.activeTools, 0); assert.equal(parent.attention, false);
  assert.equal(parent.turnCompletedAt, undefined);
  store.ingest(event('tool-start', { subagentId: 'child', parentId: 'codex:one', at: 16000, toolCallId: 'child-work', activity: 'coding' }));
  parent = store.snapshot().find(s => !s.parentId);
  assert.equal(parent.status, 'closed'); assert.equal(parent.closed, true); assert.equal(parent.activity, 'idle');
  assert.equal(store.ingest(event('tool-end', { turnId: 'new', at: 17000, toolCallId: 'busy' })), false);
  assert.equal(store.ingest(event('turn-end', { turnId: 'new', at: 18000 })), false);
});
test('native helper end closes after its own same-turn Stop and keeps its parent settled', () => {
  const store = createSessionStore({ now: () => 20000 });
  const helper = { subagentId: 'helper', parentId: 'codex:one', turnId: 'child-turn' };
  store.ingest(event('turn-start', { turnId: 'parent-turn', at: 10000 }));
  store.ingest(event('subagent-start', { ...helper, at: 11000 }));
  store.ingest(event('turn-end', { turnId: 'parent-turn', at: 12000, activity: 'idle' }));
  assert.equal(store.snapshot().find(s => !s.parentId).activity, 'waiting-tool');
  store.ingest(event('turn-end', { ...helper, at: 13000, activity: 'idle' }));
  let child = store.snapshot().find(s => s.parentId);
  assert.equal(child.status, 'idle'); assert.equal(child.closed, false);
  assert.equal(store.snapshot().find(s => !s.parentId).status, 'idle');
  assert.equal(store.ingest(event('subagent-end', { ...helper, at: 1000, activity: 'idle' })), true);
  child = store.snapshot().find(s => s.parentId);
  assert.equal(child.closed, true); assert.equal(child.status, 'closed');
  assert.equal(child.turnCompletedAt, undefined); assert.equal(child.lastEventAt, 13000);
  assert.equal(store.snapshot().find(s => !s.parentId).status, 'idle');
  assert.equal(store.ingest(event('tool-start', { ...helper, at: 14000, toolCallId: 'late-old-call' })), false);
});
test('a delayed old helper end cannot close a resumed helper turn or release its waiting parent', () => {
  const store = createSessionStore({ now: () => 20000 });
  const helper = { subagentId: 'helper', parentId: 'codex:one' };
  store.ingest(event('turn-start', { turnId: 'parent-turn', at: 10000 }));
  store.ingest(event('subagent-start', { ...helper, turnId: 'old', at: 11000 }));
  store.ingest(event('turn-end', { ...helper, turnId: 'old', at: 12000, activity: 'idle' }));
  store.ingest(event('turn-start', { ...helper, turnId: 'new', at: 13000 }));
  store.ingest(event('tool-start', { ...helper, turnId: 'new', at: 14000, toolCallId: 'busy', activity: 'testing' }));
  store.ingest(event('turn-end', { turnId: 'parent-turn', at: 15000, activity: 'idle' }));
  assert.equal(store.ingest(event('subagent-end', { ...helper, turnId: 'old', at: 16000, activity: 'idle' })), false);
  let child = store.snapshot().find(s => s.parentId);
  assert.equal(child.closed, false); assert.equal(child.activeTools, 1); assert.equal(child.activity, 'testing');
  assert.equal(store.snapshot().find(s => !s.parentId).activity, 'waiting-tool');
  assert.equal(store.ingest(event('subagent-end', { ...helper, turnId: 'new', at: 17000, activity: 'idle' })), true);
  child = store.snapshot().find(s => s.parentId);
  assert.equal(child.closed, true); assert.equal(child.activeTools, 0);
  assert.equal(store.snapshot().find(s => !s.parentId).status, 'idle');
});
test('rollout fallback cannot promote a helper Stop into an authoritative helper end', () => {
  const store = createSessionStore({ now: () => 30000 });
  const helper = { subagentId: 'helper', parentId: 'codex:one', turnId: 'child-turn' };
  store.ingest(event('subagent-start', { ...helper, at: 10000 }));
  store.ingest(event('turn-end', { ...helper, at: 11000, activity: 'idle' }));
  assert.equal(store.ingest(event('subagent-end', { ...helper, at: 12000, activity: 'idle', evidence: { source: 'codex-jsonl' } })), false);
  assert.equal(store.snapshot()[0].closed, false);
  assert.equal(store.snapshot()[0].status, 'idle');
});
test('an uncorrelated stale helper end cannot use native teardown priority to close new work', () => {
  const store = createSessionStore({ now: () => 20000 });
  const helper = { subagentId: 'helper', parentId: 'codex:one' };
  store.ingest(event('subagent-start', { ...helper, turnId: 'old', at: 10000 }));
  store.ingest(event('turn-end', { ...helper, turnId: 'old', at: 11000, activity: 'idle' }));
  store.ingest(event('turn-start', { ...helper, turnId: 'new', at: 12000 }));
  store.ingest(event('tool-start', { ...helper, turnId: 'new', at: 13000, toolCallId: 'busy', activity: 'testing' }));
  assert.equal(store.ingest(event('subagent-end', { ...helper, at: 1000 })), false);
  assert.equal(store.snapshot()[0].closed, false);
  assert.equal(store.snapshot()[0].activity, 'testing');
  assert.equal(store.snapshot()[0].activeTools, 1);
});
test('interruption is idle cancellation and never receives a success celebration timestamp', () => {
  const store = createSessionStore({ now: () => 2000 });
  store.ingest(event('turn-start', { turnId: 'aborted' }));
  store.ingest(event('tool-start', { turnId: 'aborted', toolCallId: 'busy', activity: 'testing' }));
  store.ingest(event('interrupted', { turnId: 'aborted', outcome: 'cancelled', activity: 'idle' }));
  const s = store.snapshot()[0]; assert.equal(s.status, 'idle'); assert.equal(s.activeTools, 0);
  assert.equal(s.turnCompletedAt, undefined); assert.equal(s.closed, false);
  assert.equal(store.ingest(event('tool-end', { turnId: 'aborted', toolCallId: 'busy' })), false);
});
test('hook primary lease expires without pretending success; fresh correlated fallback repairs lost hook results', () => {
  let time = 10000;
  const store = createSessionStore({ now: () => time });
  const fallback = { source: 'codex-jsonl', rawEvent: 'response_item:function_call_output', confidence: 'rollout-derived' };
  store.ingest(event('turn-start', { turnId: 't1', at: time }));
  store.ingest(event('tool-start', { turnId: 't1', at: time, toolCallId: 'a', activity: 'testing' }));
  time = 20000;
  assert.equal(store.ingest(event('tool-end', { turnId: 't1', at: time, toolCallId: 'a', evidence: fallback })), false);
  time = 20001;
  assert.equal(store.snapshot()[0].activeTools, 1); assert.equal(store.snapshot()[0].turnCompletedAt, undefined);
  assert.equal(store.ingest(event('tool-end', { turnId: 't1', at: 9999, toolCallId: 'a', evidence: fallback })), false);
  assert.equal(store.ingest(event('tool-end', { turnId: 't1', at: time, toolCallId: 'unrelated', evidence: fallback })), false);
  assert.equal(store.ingest(event('tool-end', { turnId: 't1', at: time, toolCallId: 'a', outcome: 'success', evidence: fallback })), true);
  assert.equal(store.snapshot()[0].activeTools, 0); assert.equal(store.snapshot()[0].status, 'active');
  assert.deepEqual(store.snapshot()[0].evidence, fallback);
  time += 1;
  assert.equal(store.ingest(event('turn-end', { turnId: 't1', at: time, activity: 'idle', evidence: { ...fallback, rawEvent: 'event_msg:task_complete' } })), true);
  assert.equal(store.snapshot()[0].status, 'idle'); assert.equal(store.snapshot()[0].turnCompletedAt, time);
  time += 20000;
  assert.equal(store.ingest(event('tool-start', { turnId: 't1', at: time, toolCallId: 'late', evidence: fallback })), false);
  assert.equal(store.ingest(event('turn-end', { turnId: 't1', at: time, evidence: fallback })), false);
});
test('a native result arriving after the hook lease expires waits for its deferred start', () => {
  let time = 100000;
  const store = createSessionStore({ now: () => time }), accepted = [];
  store.onAccepted(e => accepted.push(e));
  store.ingest(event('turn-start', { turnId: 't', at: time }));
  time += 1000;
  const start = event('tool-start', { at: time, turnId: 't', toolCallId: 'native-call',
    activity: 'reading', evidence: { source: 'codex-jsonl', rawEvent: 'response_item:custom_tool_call' } });
  assert.equal(store.ingest(start), false);
  // No prune ran before this result. Previously it was discarded because
  // its queued start had not yet created a pending call in the reducer.
  time += 10001;
  const result = event('tool-end', { at: time, turnId: 't', toolCallId: 'native-call',
    outcome: 'unknown', evidence: { source: 'codex-jsonl', rawEvent: 'response_item:custom_tool_call_output' } });
  assert.equal(store.ingest(result), false);
  assert.equal(store.snapshot()[0].activeTools, 0);
  store.prune();
  assert.deepEqual(accepted.map(e => e.eventId), [accepted[0].eventId, start.eventId, result.eventId]);
  assert.equal(store.snapshot()[0].activeTools, 0, 'replay cannot leave a phantom native call');
  store.ingest(event('turn-end', { at: ++time, turnId: 't', activity: 'idle' }));
  assert.equal(store.snapshot()[0].status, 'idle');
  assert.equal(store.ingest(result), false);
});

test('a later official hook renews primary ownership after fallback recovery', () => {
  let time = 10000;
  const store = createSessionStore({ now: () => time });
  const fallback = { source: 'codex-jsonl', rawEvent: 'response_item:function_call', confidence: 'rollout-derived' };
  store.ingest(event('turn-start', { turnId: 't1', at: time }));
  time += 10001;
  assert.equal(store.ingest(event('tool-start', { turnId: 't1', at: time, toolCallId: 'a', activity: 'reading', evidence: fallback })), true);
  time += 1;
  assert.equal(store.ingest(event('tool-start', { turnId: 't1', at: time, toolCallId: 'a', activity: 'reading' })), true);
  time += 1;
  assert.equal(store.ingest(event('tool-end', { turnId: 't1', at: time, toolCallId: 'a', evidence: fallback })), false);
  assert.equal(store.snapshot()[0].activeTools, 1); assert.equal(store.snapshot()[0].evidence.source, 'hook');
  time += 10000;
  assert.equal(store.ingest(event('tool-end', { turnId: 't1', at: time, toolCallId: 'a', evidence: fallback })), true);
});
test('prune reconciles the only lease-suppressed real result and completion without changing their evidence or time', () => {
  let time = 1000;
  const store = createSessionStore({ now: () => time });
  const source = { source: 'codex-jsonl', rawEvent: 'response_item:function_call_output', confidence: 'rollout-derived' };
  store.ingest(event('turn-start', { turnId: 't1', at: time }));
  store.ingest(event('tool-start', { turnId: 't1', at: time, toolCallId: 'a', activity: 'testing' }));
  time = 2000;
  const result = event('tool-end', { turnId: 't1', at: time, toolCallId: 'a', outcome: 'success', evidence: source });
  assert.equal(store.ingest(result), false);
  const stop = event('turn-end', { turnId: 't1', at: 2100, activity: 'idle', evidence: { ...source, rawEvent: 'event_msg:task_complete' } });
  assert.equal(store.ingest(stop), false);
  time = 11000; store.prune(); assert.equal(store.snapshot()[0].activeTools, 1);
  time = 11001; store.prune();
  const s = store.snapshot()[0]; assert.equal(s.activeTools, 0); assert.equal(s.status, 'idle');
  assert.equal(s.turnCompletedAt, 2100); assert.equal(s.lastEventAt, 2100);
  assert.equal(s.evidence.source, 'codex-jsonl');
  assert.deepEqual(s.events.slice(-2).map(e => [e.eventId, e.at, e.evidence]), [[result.eventId, 2000, source], [stop.eventId, 2100, stop.evidence]]);
  const length = s.events.length; store.prune(); assert.equal(store.snapshot()[0].events.length, length);
});
test('a native result invalidates its deferred duplicate and later native work is not overwritten', () => {
  let time = 1000;
  const store = createSessionStore({ now: () => time });
  const source = { source: 'codex-jsonl', rawEvent: 'response_item:function_call_output', confidence: 'rollout-derived' };
  store.ingest(event('turn-start', { turnId: 't1', at: time }));
  store.ingest(event('tool-start', { turnId: 't1', at: time, toolCallId: 'a', activity: 'testing' }));
  time = 2000;
  const held = event('tool-end', { turnId: 't1', at: time, toolCallId: 'a', evidence: source });
  store.ingest(held);
  store.ingest(event('turn-end', { turnId: 't1', at: 2100, activity: 'idle', evidence: source }));
  time = 3000; store.ingest(event('tool-end', { turnId: 't1', at: time, toolCallId: 'a' }));
  time = 4000; store.ingest(event('tool-start', { turnId: 't1', at: time, toolCallId: 'b', activity: 'coding' }));
  time = 15001; store.prune();
  const s = store.snapshot()[0]; assert.equal(s.activeTools, 1); assert.equal(s.status, 'active');
  assert.equal(s.activity, 'coding'); assert.equal(s.evidence.source, 'hook'); assert.equal(s.turnCompletedAt, undefined);
  assert.ok(!s.events.some(e => e.eventId === held.eventId));
});
test('a new turn discards all old deferred records instead of replaying old results and Stop', () => {
  let time = 1000;
  const store = createSessionStore({ now: () => time });
  const source = { source: 'codex-jsonl', rawEvent: 'response_item:function_call_output', confidence: 'rollout-derived' };
  store.ingest(event('turn-start', { turnId: 'old', at: time }));
  store.ingest(event('tool-start', { turnId: 'old', at: time, toolCallId: 'a' }));
  time = 2000;
  const held = event('tool-end', { turnId: 'old', at: time, toolCallId: 'a', evidence: source });
  store.ingest(held); store.ingest(event('turn-end', { turnId: 'old', at: 2100, activity: 'idle', evidence: source }));
  time = 3000; store.ingest(event('turn-start', { turnId: 'new', at: time }));
  store.ingest(event('tool-start', { turnId: 'new', at: time, toolCallId: 'b', activity: 'building' }));
  time = 15000; store.prune();
  const s = store.snapshot()[0]; assert.equal(s.turnId, 'new'); assert.equal(s.activity, 'building');
  assert.equal(s.activeTools, 1); assert.equal(s.turnCompletedAt, undefined);
  assert.ok(!s.events.some(e => e.eventId === held.eventId));
});
test('an earlier correlated result can settle a later native Stop but cannot replace newer native waiting state', () => {
  let time = 1000;
  const store = createSessionStore({ now: () => time });
  const source = { source: 'codex-jsonl', rawEvent: 'response_item:function_call_output', confidence: 'rollout-derived' };
  store.ingest(event('turn-start', { turnId: 't1', at: time }));
  store.ingest(event('tool-start', { turnId: 't1', at: time, toolCallId: 'a', activity: 'testing' }));
  time = 2000; const held = event('tool-end', { turnId: 't1', at: time, toolCallId: 'a', title: 'Old title', projectPath: '/old/project', evidence: source }); store.ingest(held);
  time = 5000; store.ingest(event('waiting-user', { turnId: 't1', at: time, activity: 'waiting-user', title: 'New title', projectPath: '/new/project', summary: 'Later native question' }));
  time = 15001; store.prune();
  let s = store.snapshot()[0]; assert.equal(s.activeTools, 0); assert.equal(s.status, 'waiting');
  assert.equal(s.activity, 'waiting-user'); assert.equal(s.summary, 'Later native question'); assert.equal(s.attention, true);
  assert.equal(s.title, 'New title'); assert.equal(s.projectPath, '/new/project');
  assert.equal(s.evidence.source, 'hook'); assert.equal(s.events.at(-1).eventId, held.eventId); assert.equal(s.events.at(-1).at, 2000);
  store.clear(); time = 20000;
  store.ingest(event('turn-start', { turnId: 't2', at: time }));
  store.ingest(event('tool-start', { turnId: 't2', at: time, toolCallId: 'b' }));
  time = 21000; store.ingest(event('tool-end', { turnId: 't2', at: time, toolCallId: 'b', evidence: source }));
  time = 24000; store.ingest(event('turn-end', { turnId: 't2', at: time, activity: 'idle' }));
  time = 34001; store.prune(); s = store.snapshot()[0];
  assert.equal(s.activeTools, 0); assert.equal(s.status, 'idle'); assert.equal(s.turnCompletedAt, 24000);
});
test('deferred cache bounds each actor to 32 real records and deduplicates logical tool results', () => {
  let time = 1000;
  const store = createSessionStore({ now: () => time });
  const source = { source: 'codex-jsonl', rawEvent: 'response_item:function_call_output', confidence: 'rollout-derived' };
  store.ingest(event('turn-start', { turnId: 't1', at: time }));
  for (let i = 0; i < 40; i++) store.ingest(event('tool-start', { turnId: 't1', at: time, toolCallId: `call-${i}` }));
  time = 2000;
  for (let i = 0; i < 40; i++) {
    store.ingest(event('tool-end', { turnId: 't1', at: time, toolCallId: `call-${i}`, evidence: source }));
    store.ingest(event('tool-end', { turnId: 't1', at: time, toolCallId: `call-${i}`, evidence: source }));
  }
  time = 12000; store.prune();
  assert.equal(store.snapshot()[0].activeTools, 8); assert.equal(store.snapshot()[0].status, 'active');
  assert.equal(store.snapshot()[0].turnCompletedAt, undefined);
});
test('deferred cache has a 1024-record global ceiling across live actors', () => {
  let time = 1000;
  const store = createSessionStore({ now: () => time });
  const source = { source: 'codex-jsonl', rawEvent: 'response_item:function_call_output', confidence: 'rollout-derived' };
  for (let i = 0; i < 40; i++) {
    store.ingest(event('turn-start', { sessionId: `actor-${i}`, turnId: `turn-${i}`, at: time }));
    for (let j = 0; j < 32; j++) store.ingest(event('tool-start', { sessionId: `actor-${i}`, turnId: `turn-${i}`, at: time, toolCallId: `call-${j}` }));
  }
  time = 2000;
  for (let i = 0; i < 40; i++) for (let j = 0; j < 32; j++) store.ingest(event('tool-end', { sessionId: `actor-${i}`, turnId: `turn-${i}`, at: time, toolCallId: `call-${j}`, evidence: source }));
  time = 12000; store.prune();
  assert.equal(store.snapshot().reduce((sum, s) => sum + s.activeTools, 0), 40 * 32 - 1024);
});
test('unanswered question stays at the front through parallel activity and Stop until its matching result', () => {
  const scene = require('../lib/scene-model.js');
  const store = createSessionStore({ now: () => 2000 });
  const assertWaiting = () => {
    const s = store.snapshot()[0]; assert.equal(s.status, 'waiting'); assert.equal(s.attention, true);
    assert.equal(s.activity, 'waiting-user'); assert.equal(scene.activitySpec(s).zone, 'front');
    assert.equal(s.turnCompletedAt, undefined);
  };
  store.ingest(event('turn-start', { turnId: 't1' }));
  store.ingest(event('waiting-user', { turnId: 't1', toolCallId: 'question', toolName: 'AskUserQuestion', activity: 'waiting-user' }));
  assertWaiting();
  store.ingest(event('tool-start', { turnId: 't1', toolCallId: 'parallel', toolName: 'Read', activity: 'reading' }));
  assertWaiting();
  store.ingest(event('tool-end', { turnId: 't1', toolCallId: 'parallel', outcome: 'success' }));
  assertWaiting();
  store.ingest(event('turn-end', { turnId: 't1', activity: 'idle' }));
  assertWaiting();
  store.ingest(event('tool-end', { turnId: 't1', toolCallId: 'question', outcome: 'success' }));
  const s = store.snapshot()[0]; assert.equal(s.attention, false); assert.equal(s.activeTools, 0); assert.equal(s.status, 'idle');
});
test('an unidentified permission wait is not answered by another tool result and authoritative interruption clears it', () => {
  const store = createSessionStore({ now: () => 2000 });
  store.ingest(event('turn-start', { turnId: 't1' }));
  store.ingest(event('waiting-user', { turnId: 't1', activity: 'waiting-user', evidence: { source: 'hook', rawEvent: 'PermissionRequest' } }));
  store.ingest(event('tool-start', { turnId: 't1', toolCallId: 'parallel', activity: 'testing' }));
  store.ingest(event('tool-end', { turnId: 't1', toolCallId: 'parallel', outcome: 'success' }));
  store.ingest(event('turn-end', { turnId: 't1', activity: 'idle' }));
  assert.equal(store.snapshot()[0].status, 'waiting'); assert.equal(store.snapshot()[0].attention, true);
  store.ingest(event('interrupted', { turnId: 't1', outcome: 'cancelled', activity: 'idle' }));
  assert.equal(store.snapshot()[0].status, 'idle'); assert.equal(store.snapshot()[0].attention, false);
  assert.equal(store.snapshot()[0].turnCompletedAt, undefined);
});
test('own tool return after Stop still waits for a real active child instead of going back to planning', () => {
  const scene = require('../lib/scene-model.js');
  const store = createSessionStore({ now: () => 2000 });
  store.ingest(event('turn-start', { turnId: 't1' }));
  store.ingest(event('tool-start', { turnId: 't1', toolCallId: 'test', activity: 'testing' }));
  store.ingest(event('subagent-start', { subagentId: 'child', parentId: 'codex:one', activity: 'planning' }));
  store.ingest(event('turn-end', { turnId: 't1', activity: 'idle' }));
  store.ingest(event('tool-end', { turnId: 't1', toolCallId: 'test', outcome: 'success' }));
  let parent = store.snapshot().find(s => !s.parentId);
  assert.equal(parent.activity, 'waiting-tool'); assert.equal(parent.status, 'active');
  assert.equal(parent.turnCompletedAt, undefined); assert.equal(scene.activitySpec(parent).zone, 'bench');
  store.ingest(event('subagent-end', { subagentId: 'child', parentId: 'codex:one', activity: 'idle' }));
  parent = store.snapshot().find(s => !s.parentId); assert.equal(parent.status, 'idle'); assert.ok(parent.turnCompletedAt);
});
test('uncorrelated observed activity never creates a phantom tool and a later Stop can settle',()=>{
  const store=createSessionStore({now:()=>2000});
  store.ingest(event('turn-start',{provider:'codewhale',turnId:'t'}));
  store.ingest(event('activity',{provider:'codewhale',turnId:'t',activity:'reading',toolName:'read_file'}));
  let s=store.snapshot()[0];assert.equal(s.activeTools,0);assert.equal(s.activity,'reading');assert.equal(s.toolName,'read_file');
  store.ingest(event('activity',{provider:'codewhale',turnId:'t',activity:'unknown',toolName:'read_file',outcome:'unknown'}));
  s=store.snapshot()[0];assert.equal(s.activeTools,0);assert.equal(s.activity,'unknown');assert.equal(s.turnCompletedAt,undefined);
  store.ingest(event('turn-end',{provider:'codewhale',turnId:'t',activity:'idle'}));s=store.snapshot()[0];assert.equal(s.activeTools,0);assert.equal(s.status,'idle');assert.ok(s.turnCompletedAt);
});
test('uncorrelated activity does not finish tracked tools, resolve input, or erase pending Stop ownership',()=>{
  const store=createSessionStore({now:()=>2000});store.ingest(event('turn-start',{turnId:'t'}));
  store.ingest(event('tool-start',{turnId:'t',toolCallId:'tracked',activity:'testing',toolName:'Bash'}));
  store.ingest(event('activity',{turnId:'t',activity:'unknown',toolName:'untracked',outcome:'unknown'}));
  let s=store.snapshot()[0];assert.equal(s.activeTools,1);assert.equal(s.activity,'testing');assert.equal(s.toolName,'Bash');
  store.ingest(event('waiting-user',{turnId:'t',toolCallId:'question',activity:'waiting-user',toolName:'AskUserQuestion'}));
  store.ingest(event('turn-end',{turnId:'t',activity:'idle'}));
  store.ingest(event('activity',{turnId:'t',activity:'reading',toolName:'read_file'}));
  s=store.snapshot()[0];assert.equal(s.activeTools,2);assert.equal(s.activity,'waiting-user');assert.equal(s.attention,true);assert.equal(s.turnCompletedAt,undefined);
  store.ingest(event('activity',{turnId:'t',activity:'unknown',toolName:'read_file',outcome:'success'}));
  store.ingest(event('tool-end',{turnId:'t',toolCallId:'question',outcome:'success'}));s=store.snapshot()[0];assert.equal(s.activeTools,1);assert.equal(s.activity,'waiting-tool');
  store.ingest(event('tool-end',{turnId:'t',toolCallId:'tracked',outcome:'success'}));s=store.snapshot()[0];assert.equal(s.activeTools,0);assert.equal(s.status,'idle');
});
