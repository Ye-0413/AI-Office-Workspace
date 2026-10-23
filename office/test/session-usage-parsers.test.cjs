'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createParser, LIMITS } = require('../lib/session-usage-parsers.cjs');

const AT = Date.parse('2026-10-23T10:00:00Z');
const ROOT = '019d23d4-f1a9-7633-b9c7-758327137240';
const CHILD = '019d23d4-f1a9-7633-b9c7-758327137241';
function row(type, payload, at = AT) { return { type, payload, timestamp: typeof at === 'number' ? new Date(at).toISOString() : at }; }
function meta(extra = {}, at = AT) { return row('session_meta', { id: ROOT, ...extra }, at); }
function tokens(input, output = 10, read = 0, write = 0, reasoning = 0) {
  return { input_tokens: input, output_tokens: output, cached_input_tokens: read, cache_write_input_tokens: write, reasoning_output_tokens: reasoning };
}
function snapshot(total, last, at = AT + 1000, source) {
  return row('event_msg', { type: 'token_count', info: { ...(total ? { total_token_usage: total } : {}), ...(last ? { last_token_usage: last } : {}) },
    ...(source ? { rate_limits: { limit_id: source } } : {}) }, at);
}
function codex(extra = {}, context = {}) { const p = createParser('codex', undefined, context); p.parse(meta(extra)); return p; }
function native(id, usage, at = AT + 1000) { return row('token_usage_record', { response_id: id, usage }, at); }
function claude(id = 'msg-one', usage = { input_tokens: 3, output_tokens: 9, cache_read_input_tokens: 20, cache_creation_input_tokens: 30 }, extra = {}) {
  return { type: 'assistant', sessionId: ROOT, timestamp: new Date(AT + 1000).toISOString(), message: { id, model: 'claude-opus-4-6', role: 'assistant', usage }, ...extra };
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function total(r) { return r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens; }

test('Codex computes cumulative deltas, disjoint cache categories, and reasoning as an output subset', () => {
  const p = codex();
  p.parse(row('turn_context', { model: 'gpt-5.5' }));
  const [first] = p.parse(snapshot(tokens(100, 20, 40, 10, 15)));
  assert.deepEqual([first.inputTokens, first.cacheReadTokens, first.cacheWriteTokens, first.outputTokens, first.reasoningTokens], [50, 40, 10, 20, 15]);
  assert.equal(total(first), 120, 'reasoning is already included in output');
  assert.equal(first.model, 'gpt-5.5');
  const [next] = p.parse(snapshot(tokens(160, 35, 60, 15, 20), null, AT + 2000));
  assert.deepEqual([next.inputTokens, next.cacheReadTokens, next.cacheWriteTokens, next.outputTokens, next.reasoningTokens], [35, 20, 5, 15, 5]);
  assert.equal(p.parse(snapshot(tokens(160, 35, 60, 15, 20), null, AT + 3000)).length, 0);
});

test('Codex prefers exact last usage over divergent cumulative lanes and preserves baseline across model changes', () => {
  const p = codex();
  const a = p.parse(snapshot(tokens(1000), tokens(100, 20, 40), AT + 1000, 'codex'))[0];
  p.parse(row('event_msg', { type: 'thread_settings_applied', thread_settings: { model: 'gpt-5.5' } }));
  const b = p.parse(snapshot(tokens(200), tokens(70, 12, 10), AT + 2000, 'other'))[0];
  const c = p.parse(snapshot(tokens(1100, 30), undefined, AT + 3000, 'codex'))[0];
  assert.equal(a.inputTokens, 60);
  assert.equal(b.inputTokens, 60);
  assert.equal(b.model, 'gpt-5.5');
  assert.equal(c.inputTokens, 100, 'model/lane change must not reset session baseline');
});

test('Codex repeated full snapshots across rate-limit refreshes do not count as new requests', () => {
  const p = codex(), u = tokens(100, 10, 20);
  assert.equal(p.parse(snapshot(u, u, AT + 1000, 'one')).length, 1);
  assert.equal(p.parse(snapshot(u, u, AT + 2000, 'one')).length, 0);
  assert.equal(p.parse(snapshot(u, u, AT + 3000, 'two')).length, 0);
  assert.equal(p.parse(snapshot(tokens(200, 20, 40), u, AT + 4000, 'one')).length, 1);
});

test('Codex old cross-source signature does not swallow a genuine counter reset with exact last usage', () => {
  const p = codex(), small = tokens(50, 5), large = tokens(150, 15), last = tokens(50, 5);
  assert.equal(p.parse(snapshot(small, last, AT + 1000, 'old-lane')).length, 1);
  assert.equal(p.parse(snapshot(large, tokens(100, 10), AT + 2000, 'new-lane')).length, 1);
  const [reset] = p.parse(snapshot(small, last, AT + 3000, 'new-lane'));
  assert.equal(reset.inputTokens, 50);
  assert.equal(reset.outputTokens, 5);
  assert.equal(p.parse(snapshot(large, undefined, AT + 4000)).length, 0, 'total-only regression must not rebill previously observed cumulative usage');
});

test('Codex equal last-only usage may represent distinct requests', () => {
  const p = codex(), u = tokens(100);
  const a = p.parse(snapshot(null, u, AT + 1000))[0];
  const b = p.parse(snapshot(null, u, AT + 2000))[0];
  assert.equal(a.inputTokens, 100); assert.equal(b.inputTokens, 100); assert.notEqual(a.key, b.key);
});

test('Codex empty token objects cannot override valid cumulative delta with zero', () => {
  const p = codex();
  assert.equal(p.parse(snapshot({}, {}, AT + 1000)).length, 0);
  assert.equal(p.parse(snapshot(tokens(150), {}, AT + 2000))[0].inputTokens, 150);
  assert.equal(p.parse(snapshot(tokens(200), { input_tokens: 0 }, AT + 3000)).length, 0, 'explicit zero is authoritative');
});

test('Codex deterministic request keys survive full rescans, file copies, and saved-state restart', () => {
  const fileName = `rollout-2026-10-23T10-00-00-${ROOT}.jsonl`;
  const a = codex({}, { fileName }), b = codex({}, { fileName: `/copy/${fileName}` });
  const event = snapshot(tokens(100), tokens(100));
  const ar = a.parse(event, { offset: 123, ordinal: 3 })[0], br = b.parse(event, { offset: 456, ordinal: 8 })[0];
  assert.equal(ar.key, br.key);
  const restored = createParser('codex', plain(a.snapshot()), { fileName });
  assert.equal(restored.parse(event).length, 0);
  assert.equal(restored.parse(snapshot(tokens(150, 20), null, AT + 2000))[0].inputTokens, 50);
});

test('Codex filename native identity wins over copied metadata and ignores later embedded metadata', () => {
  const p = createParser('codex', undefined, { fileName: `rollout-2026-10-23T10-00-00-${CHILD}.jsonl` });
  p.parse(meta({ id: ROOT, thread_source: 'user', parent_thread_id: ROOT }));
  p.parse(meta({ id: 'copied-parent' }));
  const [r] = p.parse(snapshot(tokens(100), tokens(30)));
  assert.equal(r.sessionId, CHILD); assert.equal(r.parentSessionId, undefined);
});

test('Codex double-UUID rollout keeps leading thread identity across replacement files', () => {
  const p = codex({}, { fileName: `rollout-2026-10-23T10-00-00-${ROOT}_${CHILD}.jsonl` });
  assert.equal(p.parse(snapshot(tokens(100), tokens(100)))[0].sessionId, ROOT);
  assert.equal(p.snapshot().pageStamp, '2026-10-23T10:00:00.000Z');
});

test('Codex total-only continuation imports only the increase from the preceding page', () => {
  const first = codex({}, { fileName: `rollout-2026-10-23T09-00-00-${ROOT}.jsonl` });
  first.parse(snapshot(tokens(100, 20, 30, 10)));
  const baseline = first.snapshot().highWater;
  for (const extra of [{}, { history_mode: 'paginated', history_base: { thread_id: ROOT }, forked_from_id: CHILD }]) {
    const calls = [], p = codex(extra, { fileName: `rollout-2026-10-23T10-00-00-${ROOT}_${CHILD}.jsonl`,
      resolveBaseline(sessionId, pageStamp) { calls.push([sessionId, pageStamp]); return baseline; } });
    const [r] = p.parse(snapshot(tokens(150, 30, 40, 15)));
    assert.deepEqual(calls, [[ROOT, '2026-10-23T10:00:00.000Z']]);
    assert.deepEqual([r.inputTokens, r.cacheReadTokens, r.cacheWriteTokens, r.outputTokens], [35, 10, 5, 10]);
    assert.equal(p.snapshot().highWater.input, 150);
    const restored = createParser('codex', plain(p.snapshot()), { fileName: `rollout-2026-10-23T10-00-00-${ROOT}_${CHILD}.jsonl`, resolveBaseline() { throw new Error('must reuse persisted baseline'); } });
    assert.equal(restored.parse(snapshot(tokens(175, 40, 40, 15), null, AT + 2000))[0].inputTokens, 25);
  }
});

test('Codex missing continuation baseline is explicitly deferred without consuming token state', () => {
  let baseline = null;
  const p = codex({}, { fileName: `rollout-2026-10-23T10-00-00-${ROOT}_${CHILD}.jsonl`, resolveBaseline() { return baseline; } });
  const before = plain(p.snapshot()), event = snapshot(tokens(150));
  assert.throws(() => p.parse(event), { code: 'BASELINE_PENDING' });
  assert.deepEqual(p.snapshot(), before);
  baseline = { input: 100, read: 0, write: 0, output: 0, reasoning: 0 };
  assert.equal(p.parse(event)[0].inputTokens, 50);
});

test('Codex continuation exact-last usage needs no preceding page and input counter reset starts a new epoch', () => {
  const fileName = `rollout-2026-10-23T10-00-00-${ROOT}_${CHILD}.jsonl`;
  const exact = codex({}, { fileName });
  assert.equal(exact.parse(snapshot(tokens(150), tokens(50)))[0].inputTokens, 50);
  const reset = codex({}, { fileName, resolveBaseline() { return { input: 1000, read: 100, write: 0, output: 100, reasoning: 0 }; } });
  assert.equal(reset.parse(snapshot(tokens(50, 5)))[0].inputTokens, 50);
  assert.equal(reset.parse(snapshot(tokens(70, 8), null, AT + 2000))[0].inputTokens, 20);
});

test('Codex exact inherited-history ordinal boundary excludes copied parent counters and preserves delta baseline', () => {
  const p = codex({ id: CHILD, parent_thread_id: ROOT, subagent_history_start_ordinal: 5 });
  assert.equal(p.parse(snapshot(tokens(100), tokens(100)), { ordinal: 2 }).length, 0);
  assert.equal(p.parse(snapshot(tokens(180, 20), tokens(80)), { ordinal: 4 }).length, 0);
  const [r] = p.parse(snapshot(tokens(210, 25)), { ordinal: 5 });
  assert.equal(r.sessionId, CHILD); assert.equal(r.parentSessionId, ROOT);
  assert.equal(r.inputTokens, 30); assert.equal(r.outputTokens, 5);
});

test('Codex native thread marker and original task start can establish ownership without absolute ordinal', () => {
  for (const marker of [row('event_msg', { type: 'task_started', started_at: (AT + 500) / 1000 }), row('turn_context', { thread_id: CHILD, model: 'gpt-5.5' })]) {
    const p = codex({ id: CHILD, parent_thread_id: ROOT, subagent_history_start_ordinal: 5 });
    p.parse(snapshot(tokens(100), tokens(100)));
    p.parse(marker);
    assert.equal(p.parse(snapshot(tokens(130), tokens(30), AT + 2000))[0].inputTokens, 30);
  }
});

test('Codex timestamped fork prefix is skipped and ambiguous first total-only snapshot establishes a baseline', () => {
  const p = codex({ id: CHILD, forked_from_id: ROOT });
  assert.equal(p.parse(snapshot(tokens(100), tokens(100), AT - 1000)).length, 0);
  assert.equal(p.parse(snapshot(tokens(150, 20), undefined, AT + 1000))[0].inputTokens, 50);
  const isolated = codex({ id: CHILD, forked_from_id: ROOT });
  assert.equal(isolated.parse(snapshot(tokens(200), undefined)).length, 0);
  assert.equal(isolated.parse(snapshot(tokens(230, 20), undefined, AT + 2000))[0].inputTokens, 30);
});

test('Codex internal background threads are excluded from user accounting', () => {
  for (const extra of [{ thread_source: 'guardian_review' }, { source: 'internal' }, { thread_source: 'internal' }]) {
    const p = codex(extra); assert.equal(p.parse(snapshot(tokens(100))).length, 0);
  }
});

test('Codex native usage and matching token_count share one response key, including EOF/restart', () => {
  const p = codex(), u = tokens(100, 15, 30);
  assert.deepEqual(p.parse(native('response-one', u)), []);
  assert.deepEqual(p.flush(), [], 'EOF cannot turn ambiguous native timing counters into charges');
  const restored = createParser('codex', plain(p.snapshot()));
  const [matched] = restored.parse(snapshot(tokens(100, 15, 30), tokens(100, 15, 30, 0, 5), AT + 2000));
  assert.equal(matched.inputTokens, 70);
  assert.equal(matched.at, AT + 1000, 'appending a later snapshot cannot move native usage to a different day');
  assert.equal(matched.reasoningTokens, 5, 'optional reasoning breakdown does not imply a separate request');
  assert.deepEqual(restored.flush(), []);
  const fresh = codex(); fresh.parse(native('response-one', u));
  assert.equal(fresh.parse(snapshot(tokens(100, 15, 30), u, AT + 2000))[0].key, matched.key);
});

test('Codex native EOF and next-native boundaries cannot change one-pass accounting', () => {
  for (const between of [[], [native('second-timing', tokens(888), AT + 1500)]]) {
    const full = codex(), incremental = codex(), events = [native('timing-only', tokens(999)), ...between,
      snapshot(tokens(150), tokens(150), AT + 2000)];
    const onePass = events.flatMap(event => full.parse(event));
    const streamed = [];
    let parser = incremental;
    for (const event of events) {
      streamed.push(...parser.parse(event), ...parser.flush());
      parser = createParser('codex', plain(parser.snapshot()));
    }
    assert.deepEqual(streamed, onePass);
    assert.equal(streamed.length, 1); assert.equal(streamed[0].inputTokens, 150);
  }
});

test('Codex zero last snapshot preserves standalone remote compaction usage exactly once', () => {
  const p = codex(), u = tokens(26705, 491);
  p.parse(native('compact', u));
  const [r] = p.parse(snapshot(tokens(26705, 491), tokens(0, 0)));
  assert.equal(r.inputTokens, 26705); assert.equal(r.outputTokens, 491);
  assert.deepEqual(p.flush(), []);
  assert.deepEqual(p.parse(snapshot(tokens(26705, 491), tokens(0, 0), AT + 2000)), []);
});

test('Codex unmatched native timing record is not added to a nonzero request snapshot', () => {
  const p = codex(); p.parse(native('timing-only', tokens(999)));
  const [r] = p.parse(snapshot(tokens(150), tokens(150)));
  assert.equal(r.inputTokens, 150); assert.deepEqual(p.flush(), []);
  assert.deepEqual(p.parse(row('token_usage_record', { usage: tokens(100) })), [], 'missing response identity is not safely resumable');
});

test('Codex last-only snapshots with native response identity retain the same upsert key when retransmitted', () => {
  const p = codex();
  const one = snapshot(null, tokens(100)); one.payload.response_id = 'resp-one';
  const two = snapshot(null, tokens(100), AT + 2000); two.payload.response_id = 'resp-one';
  assert.equal(p.parse(one)[0].key, p.parse(two)[0].key);
});

test('Claude consolidates streaming chunks and preserves already billed partial input/cache usage', () => {
  const p = createParser('claude');
  const [a] = p.parse(claude('msg-one', { input_tokens: 3, output_tokens: 1, cache_read_input_tokens: 5000, cache_creation_input_tokens: 10000 }));
  assert.equal(a.provider, 'claude-code'); assert.equal(a.inputTokens, 3); assert.equal(total(a), 15004);
  const [b] = p.parse(claude('msg-one', { input_tokens: 2, output_tokens: 150, cache_read_input_tokens: 4900, cache_creation_input_tokens: 9000 }));
  assert.equal(a.key, b.key); assert.equal(b.inputTokens, 3); assert.equal(b.outputTokens, 150); assert.equal(b.cacheReadTokens, 5000);
  assert.equal(p.parse(claude('msg-one', { input_tokens: 1, output_tokens: 1 })).length, 0, 'older streaming chunks cannot roll usage back');
  const restored = createParser('claude-code', plain(p.snapshot()));
  assert.deepEqual(restored.parse(claude('msg-one', { output_tokens: 150 })), []);
});

test('Claude stable message identities are scoped by session and survive copies/restart', () => {
  const a = createParser('claude-code'), b = createParser('claude-code');
  const r = a.parse(claude())[0], copy = b.parse(claude())[0];
  assert.equal(r.key, copy.key);
  const other = b.parse(claude('msg-one', undefined, { sessionId: CHILD }))[0];
  assert.notEqual(r.key, other.key);
  const request = a.parse(claude(undefined, { input_tokens: 30 }, { requestId: 'req-one', message: { model: 'claude-opus', usage: { input_tokens: 30 } } }))[0];
  assert.ok(request.key);
});

test('Claude subagents use explicit child identity and retain native parent relationship', () => {
  const p = createParser('claude-code', undefined, { subagentId: 'agent-child', parentSessionId: ROOT });
  const [r] = p.parse(claude()); assert.equal(r.sessionId, 'agent-child'); assert.equal(r.parentSessionId, ROOT);
  const [native] = p.parse(claude('msg-two', undefined, { agentId: 'native-child' })); assert.equal(native.sessionId, 'native-child');
});

test('Claude ignores tool/result/user usage, empty snapshots, and malformed records', () => {
  const p = createParser('claude-code');
  for (const value of [null, 'not-json', [], { ...claude(), type: 'user' }, { ...claude(), type: 'tool' },
    claude('x', undefined, { message: { id: 'x', role: 'tool', usage: { input_tokens: 100 } } }), claude('zero', {}), claude('zero', { input_tokens: 0 })]) assert.deepEqual(p.parse(value), []);
});

test('invalid timestamps cannot create records or disguise invalid counters as token usage', () => {
  for (const at of ['2026-02-30T10:00:00Z', '2026-10-23', 'invalid', null, 253402214400000, '9999-12-31T23:59:59Z']) {
    const p = createParser('claude-code'); assert.deepEqual(p.parse({ ...claude(), timestamp: at }), []);
  }
  const p = codex();
  assert.deepEqual(p.parse(snapshot({ input_tokens: -1, output_tokens: Infinity })), []);
  const [r] = p.parse(snapshot(tokens(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)));
  assert.equal(r.inputTokens, 0); assert.equal(r.cacheReadTokens, LIMITS.eventTokens); assert.equal(r.cacheWriteTokens, 0);
  assert.equal(r.outputTokens, LIMITS.eventTokens); assert.equal(r.reasoningTokens, LIMITS.eventTokens);
  assert.ok(Object.values(r).filter(v => typeof v === 'number').every(Number.isSafeInteger));
});

test('saved state stays bounded and cannot retain prompt, response, tool arguments, or arbitrary saved fields', () => {
  const p = createParser('claude-code');
  for (let i = 0; i < 400; i++) p.parse(claude(`msg-${i}`, { input_tokens: i + 1 }, { message: { id: `msg-${i}`, model: 'claude', content: 'PRIVATE RESPONSE', usage: { input_tokens: i + 1 } }, prompt: 'PRIVATE PROMPT', tool_input: 'PRIVATE TOOL' }));
  const saved = p.snapshot(); assert.equal(saved.messages.length, LIMITS.messages);
  assert.ok(JSON.stringify(saved).length < 256 * 1024); assert.ok(!JSON.stringify(saved).includes('PRIVATE'));
  const c = codex();
  for (let i = 0; i < 30; i++) c.parse(snapshot(tokens(i + 1), tokens(1), AT + 1000 + i, `source-${i}`));
  assert.equal(c.snapshot().sources.length, LIMITS.sources);
  const poisoned = { ...plain(saved), arbitrary: 'PRIVATE', messages: [['x', { provider: 'claude-code', content: 'PRIVATE' }]] };
  assert.ok(!JSON.stringify(createParser('claude-code', poisoned).snapshot()).includes('PRIVATE'));
});

test('unsupported providers fail explicitly', () => { assert.throws(() => createParser('unknown'), /Unsupported/); });
