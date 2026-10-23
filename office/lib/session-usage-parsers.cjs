'use strict';

const path = require('node:path');
const { createHash } = require('node:crypto');

// Mechanisms adapted from CC Switch's session_usage{,_codex}.rs at
// 03707c400dc4bdd16c687e712d818c4629175351 (MIT): native message identity,
// cumulative high-water marks, exact request usage, and full-snapshot dedup.
// Parser state deliberately contains identifiers/counters only, never content.
const LIMITS = Object.freeze({ messages: 256, sources: 16, eventTokens: 0xffffffff });
const MAX_TIMESTAMP = 253402214399999;
const FIELDS = ['input', 'read', 'write', 'output', 'reasoning'];
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
function ident(value) { return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\s\u0000-\u001f\u007f]/.test(value) ? value : null; }
function model(value) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 128) || 'unknown' : 'unknown'; }
function numeric(value) { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null; }
function count(value) { return numeric(value) ?? 0; }
function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function timestamp(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIMESTAMP ? value : null;
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (mo < 1 || mo > 12 || d < 1 || d > days || h > 23 || mi > 59 || s > 59) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) && at >= 0 && at <= MAX_TIMESTAMP ? at : null;
}
function usage(value) {
  const u = object(value);
  if (!u) return null;
  const raw = [u.input_tokens, u.cached_input_tokens ?? u.cache_read_input_tokens,
    u.cache_write_input_tokens ?? u.cache_creation_input_tokens, u.output_tokens,
    u.reasoning_output_tokens ?? object(u.output_tokens_details)?.reasoning_tokens];
  if (!raw.some(v => numeric(v) !== null)) return null;
  return Object.fromEntries(FIELDS.map((field, i) => [field, count(raw[i])]));
}
function cleanCounters(value) {
  const o = object(value);
  return o && FIELDS.every(field => numeric(o[field]) !== null) ? Object.fromEntries(FIELDS.map(field => [field, o[field]])) : null;
}
function nonzero(u) { return !!u && FIELDS.some(field => field !== 'reasoning' && u[field] > 0); }
// Native response records may omit the reasoning breakdown. It is already a
// subset of output, so it cannot decide whether two records cover one charge.
function sameUsage(a, b) { return !!a && !!b && FIELDS.filter(field => field !== 'reasoning').every(field => a[field] === b[field]); }
function maximum(a, b) { return Object.fromEntries(FIELDS.map(field => [field, Math.max(a?.[field] || 0, b[field])])); }
function difference(a, b) { return Object.fromEntries(FIELDS.map(field => [field, Math.max(0, b[field] - (a?.[field] || 0))])); }
function tokenFields(u, inclusive) {
  const input = Math.min(u.input, LIMITS.eventTokens), outputTokens = Math.min(u.output, LIMITS.eventTokens);
  const cacheReadTokens = Math.min(u.read, LIMITS.eventTokens, inclusive ? input : Infinity);
  const cacheWriteTokens = Math.min(u.write, LIMITS.eventTokens, inclusive ? input - cacheReadTokens : Infinity);
  return { inputTokens: inclusive ? input - cacheReadTokens - cacheWriteTokens : input,
    outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens: Math.min(u.reasoning, outputTokens) };
}
function rolloutFileInfo(fileName) {
  const uuid = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
  const base = path.basename(fileName || ''), match = base.match(new RegExp(`^rollout-.+-${uuid}(?:_${uuid})?\\.jsonl$`, 'i'));
  const stamp = base.match(/^rollout-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})(\.\d+)?-/);
  const at = stamp ? timestamp(`${stamp[1]}T${stamp[2]}:${stamp[3]}:${stamp[4]}${stamp[5] || ''}Z`) : null;
  return { threadId: match?.[1]?.toLowerCase() || null, pageId: match?.[2]?.toLowerCase() || null,
    pageStamp: at === null ? null : new Date(at).toISOString() };
}
function parseRow(row) {
  if (object(row)) return row;
  if (typeof row !== 'string') return null;
  try { return object(JSON.parse(row)); } catch { return null; }
}
function record(provider, sessionId, parentSessionId, currentModel, at, key, counters, inclusive) {
  if (!sessionId || at === null || !nonzero(counters)) return null;
  return { key: `usage:${provider}:${digest([sessionId, key])}`, provider, sessionId,
    ...(parentSessionId ? { parentSessionId } : {}), model: currentModel, at, ...tokenFields(counters, inclusive) };
}
function cleanRecord(value, provider) {
  const r = object(value), fields = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'];
  if (!r || r.provider !== provider || !ident(r.sessionId) || !/^usage:[a-z-]+:[a-f0-9]{64}$/.test(r.key || '') || timestamp(r.at) === null || !fields.every(f => numeric(r[f]) !== null)) return null;
  return { key: r.key, provider, sessionId: r.sessionId, ...(ident(r.parentSessionId) ? { parentSessionId: r.parentSessionId } : {}), model: model(r.model), at: r.at,
    ...Object.fromEntries(fields.map(f => [f, Math.min(r[f], LIMITS.eventTokens)])) };
}
function boundedEntries(value, limit, clean) {
  if (!Array.isArray(value)) return [];
  return value.slice(-limit).flatMap(entry => {
    if (!Array.isArray(entry) || !ident(entry[0])) return [];
    const v = clean(entry[1]);
    return v === null ? [] : [[entry[0], v]];
  });
}
function boundedSet(map, key, value, limit) {
  map.delete(key); map.set(key, value);
  while (map.size > limit) map.delete(map.keys().next().value);
}

function createClaudeParser(saved, context) {
  let sessionId = ident(saved.sessionId) || ident(context.sessionId), currentModel = model(saved.model);
  let parentSessionId = ident(context.parentSessionId) || ident(saved.parentSessionId);
  const messages = new Map(boundedEntries(saved.messages, LIMITS.messages, value => cleanRecord(value, 'claude-code')));
  return {
    parse(raw) {
      const row = parseRow(raw);
      if (!row) return [];
      const child = ident(context.subagentId);
      if (child) {
        parentSessionId = ident(context.parentSessionId) || ident(row.sessionId) || parentSessionId;
        sessionId = ident(row.agentId) || child;
      } else sessionId = ident(row.sessionId) || sessionId;
      if (row.type !== 'assistant') return [];
      const message = object(row.message);
      if (!message || message.role && message.role !== 'assistant') return [];
      const messageId = ident(message.id) || ident(row.requestId) || ident(row.request_id);
      const u = usage(message.usage), at = timestamp(row.timestamp);
      if (!sessionId || !messageId || !u || at === null) return [];
      currentModel = model(message.model || currentModel);
      // Claude input_tokens excludes both cache categories; unlike Codex it
      // must not have cache reads subtracted a second time.
      const next = record('claude-code', sessionId, parentSessionId, currentModel, at, messageId, u, false);
      if (!next) return [];
      const previous = messages.get(next.key);
      if (previous) {
        for (const field of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens']) next[field] = Math.max(previous[field], next[field]);
        next.at = Math.min(previous.at, next.at);
        if (next.model === 'unknown') next.model = previous.model;
        if (JSON.stringify(previous) === JSON.stringify(next)) return [];
      }
      boundedSet(messages, next.key, next, LIMITS.messages);
      return [next];
    },
    flush() { return []; },
    snapshot() { return { version: 1, provider: 'claude-code', sessionId, parentSessionId, model: currentModel, messages: [...messages] }; },
  };
}

function createCodexParser(saved, context) {
  const fileInfo = rolloutFileInfo(context.fileName);
  let sessionId = ident(saved.sessionId), parentSessionId = ident(saved.parentSessionId), currentModel = model(saved.model);
  let hasMetadata = saved.hasMetadata === true, internal = saved.internal === true;
  let createdAt = timestamp(saved.createdAt), historyBoundary = numeric(saved.historyBoundary), ownsHistory = saved.ownsHistory !== false;
  let needsBaseline = saved.needsBaseline === true, highWater = cleanCounters(saved.highWater);
  let continuation = saved.continuation === true;
  const pageStamp = fileInfo.pageStamp || (timestamp(saved.pageStamp) !== null ? saved.pageStamp : null);
  let previousSignature = typeof saved.previousSignature === 'string' && /^[a-f0-9]{64}$/.test(saved.previousSignature) ? saved.previousSignature : null;
  const sources = new Map(boundedEntries(saved.sources, LIMITS.sources, value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null));
  const cleanPending = value => {
    const p = object(value), r = p && cleanRecord(p.record, 'codex'), counters = p && cleanCounters(p.usage);
    return r && counters ? { record: r, usage: counters } : null;
  };
  let pending = cleanPending(saved.pending);
  function observe(total, signature, source) {
    if (total) {
      highWater = maximum(highWater, total);
      boundedSet(sources, source, signature, LIMITS.sources);
    }
    previousSignature = signature;
  }
  return {
    parse(raw, position = {}) {
      const row = parseRow(raw);
      if (!row) return [];
      const p = object(row.payload) || {}, at = timestamp(row.timestamp);
      if (row.type === 'session_meta') {
        if (hasMetadata) return [];
        const metaId = ident(p.id) || ident(p.thread_id) || ident(p.threadId);
        sessionId = fileInfo.threadId || metaId;
        if (!sessionId) return [];
        const spawn = object(object(object(p.source)?.subagent)?.thread_spawn);
        const parent = ident(p.parent_thread_id) || ident(p.parent_session_id) || ident(spawn?.parent_thread_id);
        parentSessionId = p.thread_source !== 'user' && parent !== sessionId ? parent : null;
        createdAt = at ?? timestamp(p.timestamp);
        internal = ['internal', 'guardian_review'].includes(p.thread_source) || p.source === 'internal';
        historyBoundary = numeric(p.subagent_history_start_ordinal);
        if (historyBoundary === 0) historyBoundary = null;
        ownsHistory = historyBoundary === null;
        const historyBase = ident(object(p.history_base)?.thread_id);
        // Replacement/paginated files retain the logical thread metadata.
        // A Desktop per-turn file instead has a different metadata ID and is
        // not sufficient evidence of a continuation baseline dependency.
        continuation = !!(fileInfo.pageId && metaId?.toLowerCase() === fileInfo.threadId || historyBase === sessionId);
        needsBaseline = !!(ident(p.forked_from_id) || parent || historyBase);
        hasMetadata = true;
        return [];
      }
      if (!hasMetadata || internal) return [];
      if (!ownsHistory) {
        const startedAt = typeof p.started_at === 'number' && p.started_at < 1e11 ? p.started_at * 1000 : timestamp(p.started_at);
        const ownStart = row.type === 'event_msg' && p.type === 'task_started' && createdAt !== null && startedAt !== null && startedAt >= createdAt;
        if (numeric(position.ordinal) !== null && position.ordinal >= historyBoundary || ident(p.thread_id) === sessionId || ownStart) ownsHistory = true;
      }
      if (row.type === 'turn_context') { if (p.model || object(p.info)?.model) currentModel = model(p.model || p.info.model); return []; }
      if (row.type === 'event_msg' && p.type === 'thread_settings_applied') { if (object(p.thread_settings)?.model) currentModel = model(p.thread_settings.model); return []; }
      if (row.type === 'token_usage_record') {
        if (!ownsHistory || createdAt !== null && at !== null && at < createdAt) return [];
        const u = usage(p.usage), id = ident(p.response_id);
        if (!u || !nonzero(u) || !id) return [];
        if (p.model) currentModel = model(p.model);
        const r = record('codex', sessionId, parentSessionId, currentModel, at, ['response', id], u, true);
        if (!r) return [];
        if (pending?.record.key === r.key) {
          pending.usage = maximum(pending.usage, u);
          const merged = record('codex', sessionId, parentSessionId, currentModel, pending.record.at, ['response', id], pending.usage, true);
          pending.record = merged;
          return [];
        }
        // A native usage record may only be a timing companion with counters
        // different from the authoritative following token_count. EOF and a
        // second native record do not prove that it was a separate charge.
        pending = { record: r, usage: u };
        return [];
      }
      if (row.type !== 'event_msg' || p.type !== 'token_count' || !object(p.info)) return [];
      const info = p.info, total = usage(info.total_token_usage), last = usage(info.last_token_usage);
      if (!total && !last) return [];
      if (info.model || info.model_name || p.model) currentModel = model(info.model || info.model_name || p.model);
      const source = ident(object(p.rate_limits)?.limit_id) || 'default';
      const signature = digest([total, last]);
      const duplicate = !!total && (sources.get(source) === signature || previousSignature === signature);
      const inherited = !ownsHistory || createdAt !== null && at !== null && at < createdAt;
      if (inherited) { observe(total, signature, source); return []; }
      if (continuation && !highWater && total && !last) {
        const baseline = typeof context.resolveBaseline === 'function' && pageStamp
          ? cleanCounters(context.resolveBaseline(sessionId, pageStamp)) : null;
        if (!baseline) {
          const error = new Error('Codex continuation is waiting for its preceding page token baseline');
          error.code = 'BASELINE_PENDING';
          throw error;
        }
        // Follow the reference's explicit reset rule: a smaller input total
        // starts a new counter epoch. Otherwise inherit the preceding page.
        if (total.input >= baseline.input) highWater = baseline;
      }
      let delta = duplicate ? null : last || (total ? difference(highWater, total) : null);
      // An isolated fork/continuation's first total includes unknown inherited
      // usage. Establish a baseline instead of billing its parent's history.
      if (needsBaseline && !continuation && !highWater && !last) delta = null;
      if (total) needsBaseline = false;
      observe(total, signature, source);
      const previousPending = pending;
      pending = null;
      const responseId = ident(info.response_id) || ident(p.response_id);
      const requestId = ident(info.request_id) || ident(p.request_id);
      let key = responseId ? ['response', responseId] : requestId ? ['request', requestId] : ['snapshot', at, total, last];
      if (previousPending) {
        if (last && sameUsage(last, previousPending.usage)) key = ['existing', previousPending.record.key];
        else if (last && !nonzero(last)) return [previousPending.record];
        // A native record with differing nonzero request counters is an
        // ambiguous timing record, not evidence for another charge.
      }
      if (!delta || !nonzero(delta)) return [];
      const r = record('codex', sessionId, parentSessionId, currentModel, at, key, delta, true);
      if (r && previousPending && key[0] === 'existing') { r.key = previousPending.record.key; r.at = previousPending.record.at; }
      return r ? [r] : [];
    },
    // Preserve provisional native evidence for a later append/restart; only
    // a matching request or explicit zero-last snapshot establishes billing.
    flush() { return []; },
    snapshot() { return { version: 1, provider: 'codex', sessionId, parentSessionId, model: currentModel, hasMetadata, internal,
      createdAt, historyBoundary, ownsHistory, needsBaseline, continuation, pageStamp, highWater, previousSignature, sources: [...sources], pending }; },
  };
}

function createParser(provider, savedState, context = {}) {
  const normalized = provider === 'claude' ? 'claude-code' : provider;
  const saved = object(savedState)?.version === 1 && savedState.provider === normalized ? savedState : {};
  if (normalized === 'claude-code') return createClaudeParser(saved, context);
  if (normalized === 'codex') return createCodexParser(saved, context);
  throw new TypeError(`Unsupported session usage provider: ${provider}`);
}

module.exports = { createParser, rolloutFileInfo, LIMITS };
