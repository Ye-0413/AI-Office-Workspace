'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSessionStore, ABANDONED_TOOL_MS } = require('../lib/session-store.cjs');

function harness(start = 1_800_000_000_000) {
  let clock = start;
  const store = createSessionStore({ now: () => clock, staleMs: 180000 });
  let serial = 0;
  const hook = (provider, sessionId, event, extra = {}) => ({
    provider, sessionId, event, at: clock, eventId: `${provider}-${event}-${++serial}`,
    activity: event === 'tool-start' || event === 'tool-end' ? 'reading' : 'planning',
    evidence: { source: 'hook', rawEvent: extra.rawEvent || event, confidence: 'explicit' }, ...extra,
  });
  const find = id => store.snapshot().find(s => s.id === id);
  return { store, hook, find, advance: ms => { clock += ms; }, now: () => clock };
}

test('a repeated native delivery refreshes a live heartbeat without re-applying the event', () => {
  const h = harness();
  const result = h.hook('cursor', 'conv', 'tool-end', { rawEvent: 'postToolUse', turnId: 'gen-1', toolCallId: 'read-1', toolName: 'Read', outcome: 'success' });
  assert.equal(h.store.ingest(result), true);
  for (let i = 0; i < 6; i++) {
    h.advance(60000);
    assert.equal(h.store.ingestDetailed({ ...result, at: h.now() }), 'duplicate-heartbeat');
  }
  const session = h.find('cursor:conv');
  assert.equal(session.status, 'active', 'six minutes of real native deliveries keep the session alive');
  assert.equal(session.events.length, 1, 'a heartbeat never adds a second observed event');
  assert.equal(session.diagnostics.heartbeats, 6);
  h.advance(181000);
  assert.equal(h.find('cursor:conv').status, 'stale', 'silence still becomes a lost signal');
});

test('an exact replay that is not newer stays a plain duplicate', () => {
  const h = harness();
  const start = h.hook('claude-code', 's', 'turn-start', { turnId: 'p1' });
  h.store.ingest(start);
  assert.equal(h.store.ingestDetailed(start), 'duplicate');
  assert.equal(h.find('claude-code:s').diagnostics.rejected.duplicate, 1);
});

test('a newer native turn supersedes one whose stop was never delivered', () => {
  const h = harness();
  h.store.ingest(h.hook('claude-code', 's', 'turn-start', { turnId: 'p1' }));
  h.store.ingest(h.hook('claude-code', 's', 'tool-start', { turnId: 'p1', toolCallId: 'old', toolName: 'Read' }));
  h.advance(5000);
  const next = h.hook('claude-code', 's', 'tool-start', { turnId: 'p2', toolCallId: 'new', toolName: 'Edit', activity: 'coding' });
  assert.equal(h.store.ingestDetailed(next), 'accepted');
  const session = h.find('claude-code:s');
  assert.equal(session.turnId, 'p2');
  assert.equal(session.activity, 'coding');
  assert.equal(session.activeTools, 1, 'the abandoned call from the old turn no longer blocks');
  h.advance(1000);
  const late = h.hook('claude-code', 's', 'tool-end', { turnId: 'p1', toolCallId: 'old', toolName: 'Read' });
  assert.equal(h.store.ingestDetailed(late), 'turn-closed', 'late results cannot reopen the superseded turn');
});

test('an older native turn still cannot replace the current one', () => {
  const h = harness();
  h.store.ingest(h.hook('claude-code', 's', 'turn-start', { turnId: 'p2' }));
  const older = h.hook('claude-code', 's', 'tool-start', { turnId: 'p1', toolCallId: 'x', toolName: 'Read', at: h.now() - 10000 });
  assert.equal(h.store.ingestDetailed(older), 'turn-fence');
  assert.equal(h.find('claude-code:s').turnId, 'p2');
});

test('a turn that ends in a failure settles without claiming completion', () => {
  const h = harness();
  h.store.ingest(h.hook('claude-code', 's', 'turn-start', { turnId: 'p1' }));
  h.store.ingest(h.hook('claude-code', 's', 'error', { turnId: 'p1', rawEvent: 'StopFailure', activity: 'error', outcome: 'failure' }));
  const session = h.find('claude-code:s');
  assert.equal(session.status, 'idle');
  assert.equal(session.turnCompletedAt, undefined);
  assert.equal(session.settlementBoundary.event, 'turn-failed');
});

test('a transient API error stays an active attention state', () => {
  const h = harness();
  h.store.ingest(h.hook('opencode', 's', 'turn-start', { turnId: 't' }));
  h.store.ingest(h.hook('opencode', 's', 'error', { turnId: 't', rawEvent: 'ApiError', activity: 'error' }));
  const session = h.find('opencode:s');
  assert.equal(session.status, 'active');
  assert.equal(session.activity, 'error');
});

test('a stop with an unanswered call settles after a bounded wait, never as a success', () => {
  const h = harness();
  h.store.ingest(h.hook('claude-code', 's', 'turn-start', { turnId: 'p1' }));
  h.store.ingest(h.hook('claude-code', 's', 'tool-start', { turnId: 'p1', toolCallId: 'lost', toolName: 'Bash' }));
  h.store.ingest(h.hook('claude-code', 's', 'turn-end', { turnId: 'p1', rawEvent: 'Stop', activity: 'idle' }));
  let session = h.find('claude-code:s');
  assert.equal(session.activity, 'waiting-tool');
  assert.equal(session.diagnostics.blockers.tools, 1);
  h.advance(ABANDONED_TOOL_MS - 1000); h.store.prune();
  assert.equal(h.find('claude-code:s').activity, 'waiting-tool', 'a result may still arrive during the grace');
  h.advance(2000); h.store.prune();
  session = h.find('claude-code:s');
  assert.equal(session.status, 'idle');
  assert.equal(session.diagnostics.abandonedTools, 1);
  assert.equal(session.events.some(e => e.outcome === 'success'), false);
  const late = h.hook('claude-code', 's', 'tool-end', { turnId: 'p1', toolCallId: 'lost', toolName: 'Bash' });
  assert.notEqual(h.store.ingestDetailed(late), 'accepted');
});

test('a stop does not wait for calls that had no identifier to correlate', () => {
  const h = harness();
  h.store.ingest(h.hook('cursor', 'c', 'turn-start', { turnId: 'g1', rawEvent: 'beforeSubmitPrompt' }));
  h.store.ingest(h.hook('cursor', 'c', 'tool-start', { turnId: 'g1', toolName: 'Read', rawEvent: 'preToolUse' }));
  h.store.ingest(h.hook('cursor', 'c', 'turn-end', { turnId: 'g1', rawEvent: 'stop', activity: 'idle' }));
  assert.equal(h.find('cursor:c').status, 'idle');
});

test('a Codex helper that keeps working after its stop reappears', () => {
  const h = harness();
  const helper = extra => ({ subagentId: 'h1', parentId: 'codex:root', turnId: 'T', ...extra });
  h.store.ingest(h.hook('codex', 'root', 'turn-start', { turnId: 'T' }));
  h.store.ingest(h.hook('codex', 'root', 'subagent-start', helper({ rawEvent: 'SubagentStart' })));
  h.store.ingest(h.hook('codex', 'root', 'subagent-end', helper({ rawEvent: 'SubagentStop', activity: 'idle' })));
  assert.equal(h.find('codex:root:h1').closed, true);
  h.advance(3000);
  const sameTurn = h.hook('codex', 'root', 'tool-start', helper({ toolCallId: 'c8', toolName: 'exec_command' }));
  assert.equal(h.store.ingestDetailed(sameTurn), 'session-closed', 'a late call from the closed turn stays rejected');
  const more = h.hook('codex', 'root', 'tool-start', helper({ turnId: 'T2', toolCallId: 'c9', toolName: 'exec_command', activity: 'running' }));
  assert.equal(h.store.ingestDetailed(more), 'accepted');
  const session = h.find('codex:root:h1');
  assert.equal(session.closed, false);
  assert.equal(session.activity, 'running');
});

test('other providers keep the explicit helper close', () => {
  const h = harness();
  const helper = extra => ({ subagentId: 'h1', parentId: 'claude-code:root', turnId: 'T', ...extra });
  h.store.ingest(h.hook('claude-code', 'root', 'turn-start', { turnId: 'T' }));
  h.store.ingest(h.hook('claude-code', 'root', 'subagent-start', helper({})));
  h.store.ingest(h.hook('claude-code', 'root', 'subagent-end', helper({ activity: 'idle' })));
  h.advance(3000);
  assert.equal(h.store.ingestDetailed(h.hook('claude-code', 'root', 'tool-start', helper({ toolCallId: 'x', toolName: 'Read' }))), 'session-closed');
});

test('store-wide rejection counts are available for the diagnostic log', () => {
  const h = harness();
  h.store.ingest(h.hook('claude-code', 's', 'tool-end', { toolCallId: 'none', toolName: 'Read' }));
  h.store.ingest({});
  assert.deepEqual(h.store.rejections(), { 'no-actor': 1, invalid: 1 });
});
