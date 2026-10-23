'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { actorKey, classifyShell } = require('./provider-events.cjs');
const { classifyCodexTool } = require('./codex-tool-activity.cjs');

// Native formats and accounting adapted from CC Switch (MIT), pinned at
// 03707c400dc4bdd16c687e712d818c4629175351: Gemini document/JSONL records,
// Pi normalized usage, Kimi committed projections, OpenCode V1/V2 SQLite.
// Token imports and live observations are deliberately independent outputs.
const LIMITS = Object.freeze({ bytes: 8 * 1024 * 1024, json: 4 * 1024 * 1024,
  chunk: 512 * 1024, entries: 256, files: 24, depth: 10, fingerprint: 4096,
  recent: 96, messages: 128, tools: 64, seen: 1024, trackedFiles: 4096, deferredRows: 64, liveFresh: 5 * 60 * 1000 });
const PROVIDERS = Object.freeze(['gemini-cli', 'pi', 'omp', 'kimi-cli', 'opencode']);
const ACTIVITY_PROVIDERS = Object.freeze(['gemini-cli', 'pi', 'omp']);
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\s\u0000-\u001f\u007f]/.test(value) ? value : null;
const label = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 128) || 'unknown' : 'unknown';
const count = value => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 1e12) : 0;
function at(value) {
  if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  if (typeof value === 'string') {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  }
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isSafeInteger(n) && n >= 0 && n <= 253402214399999 ? n : null;
}
function bounded(map, key, value, max) { map.delete(key); map.set(key, value); while (map.size > max) map.delete(map.keys().next().value); }
function coded(code) { const error = new Error(code); error.code = code; return error; }
function activity(name, input) {
  const simple = { read: 'reading', read_many_files: 'reading', write: 'coding', edit: 'coding', replace: 'coding',
    grep: 'searching', find: 'searching', ls: 'searching', search_file_content: 'searching', google_web_search: 'searching', web_fetch: 'reading' };
  if (Object.hasOwn(simple, name)) return simple[name];
  if (['bash', 'run_shell_command'].includes(name)) return classifyShell(input?.command || input?.cmd).activity;
  return classifyCodexTool(name, input, { classifyShell }).activity;
}
function rejectLinks(file) {
  let current = path.parse(file).root;
  const aliases = process.platform === 'darwin' ? { '/var': '/private/var', '/tmp': '/private/tmp' } : {};
  for (const segment of file.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (fs.lstatSync(current).isSymbolicLink() && !(aliases[current] && fs.realpathSync(current) === aliases[current])) throw coded('UNSAFE_SOURCE');
  }
}
function sourceRoots(homeDir, env) {
  const absolute = (value, fallback) => typeof value === 'string' && path.isAbsolute(value) ? value : fallback;
  const pi = absolute(env.PI_CODING_AGENT_DIR, path.join(homeDir, '.pi', 'agent'));
  const config = typeof env.PI_CONFIG_DIR === 'string' && !env.PI_CONFIG_DIR.includes('..') ? env.PI_CONFIG_DIR : '.omp';
  const ompRoot = path.isAbsolute(config) ? config : path.join(homeDir, config);
  const profile = env.OMP_PROFILE ?? env.PI_PROFILE;
  const active = typeof profile === 'string' && profile !== 'default' && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(profile) && !profile.endsWith('.') ? profile : null;
  const legacy = typeof env.PI_PROFILE === 'string' ? path.join(ompRoot, 'profiles', env.PI_PROFILE, 'agent') : null;
  const override = env.PI_CODING_AGENT_DIR && env.PI_CODING_AGENT_DIR !== legacy ? absolute(env.PI_CODING_AGENT_DIR, null) : null;
  const omp = active ? path.join(ompRoot, 'profiles', active, 'agent') : override || path.join(ompRoot, 'agent');
  return [
    { provider: 'gemini-cli', dir: path.join(homeDir, '.gemini', 'tmp'), kind: 'gemini' },
    { provider: 'pi', dir: path.join(pi, 'sessions'), kind: 'pi' },
    { provider: 'omp', dir: path.join(omp, 'sessions'), kind: 'pi', shared: pi === omp },
    { provider: 'kimi-cli', dir: path.join(homeDir, '.kimi', 'sessions'), kind: 'kimi' },
    { provider: 'opencode', file: path.join(absolute(env.XDG_DATA_HOME, path.join(homeDir, '.local', 'share')), 'opencode', 'opencode.db'), kind: 'sqlite' },
  ];
}
function* walk(source, depth = 0, dir = source.dir) {
  let handle;
  try {
    const item = fs.lstatSync(dir);
    if (!item.isDirectory() || item.isSymbolicLink()) throw coded('UNSAFE_SOURCE');
    handle = fs.opendirSync(dir);
    let entry;
    while ((entry = handle.readSync())) {
      yield null;
      if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory() && depth < LIMITS.depth) yield* walk(source, depth + 1, file);
      else if (entry.isFile()) {
        if (source.kind === 'gemini' && path.basename(dir) === 'chats' && /^session-.*\.jsonl?$/.test(entry.name)) {
          if (entry.name.endsWith('.json') && fs.existsSync(file + 'l')) continue;
          yield { ...source, file };
        } else if (source.kind === 'pi' && entry.name.endsWith('.jsonl')) yield { ...source, file };
        else if (source.kind === 'kimi' && entry.name === 'wire.jsonl' && path.basename(dir) === 'main' && path.basename(path.dirname(dir)) === 'agents') yield { ...source, file };
      }
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  finally { handle?.closeSync(); }
}
function tokenRecord(provider, state, nativeId, timestamp, model, input, output, read = 0, write = 0, reasoning = 0, scoped = true) {
  if (!state.sessionId || !id(nativeId) || timestamp === null) return null;
  const values = { inputTokens: count(input), outputTokens: count(output), cacheReadTokens: count(read), cacheWriteTokens: count(write), reasoningTokens: count(reasoning) };
  values.reasoningTokens = Math.min(values.reasoningTokens, values.outputTokens);
  if (!Object.entries(values).some(([key, value]) => key !== 'reasoningTokens' && value)) return null;
  return { key: `usage:${provider}:${hash([scoped ? state.sessionId : '', nativeId])}`, provider, sessionId: state.sessionId,
    ...(state.parentSessionId ? { parentSessionId: state.parentSessionId } : {}), model: label(model), at: timestamp, ...values };
}
function cleanState(saved, provider) {
  const s = saved?.version === 1 && saved.provider === provider ? saved : {};
  return { version: 1, provider, sessionId: id(s.sessionId), parentSessionId: id(s.parentSessionId), createdAt: at(s.createdAt),
    turnId: id(s.turnId), model: label(s.model) };
}
function parentIdentity(file, source, header) {
  if (id(header.parentSessionId)) return header.parentSessionId;
  if (typeof header.parentSession !== 'string') return null;
  const parent = path.resolve(path.dirname(file), header.parentSession);
  // Native forks also use parentSession. Only a nested subagent layout is
  // evidence for the helper relationship used by the office's role filter.
  const stem = parent.endsWith('.jsonl') ? parent.slice(0, -6) : parent;
  if (!file.startsWith(stem + path.sep) || !parent.startsWith(source.dir + path.sep)) return null;
  let fd;
  try {
    rejectLinks(parent);
    if (fs.lstatSync(parent).isSymbolicLink()) return null;
    fd = fs.openSync(parent, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const bytes = Buffer.alloc(16384), n = fs.readSync(fd, bytes, 0, bytes.length, 0);
    const end = bytes.subarray(0, n).indexOf(10);
    if (end < 0) return null;
    const row = JSON.parse(bytes.subarray(0, end).toString('utf8'));
    return row.type === 'session' ? id(row.id) : null;
  } catch { return null; } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function parseEntry(source, state, row, records, live) {
  if (!object(row)) return;
  const push = value => { if (value) records.push(value); };
  const observe = (entry, extra = {}) => live.push({ provider: source.provider, sessionId: state.sessionId,
    parentSessionId: state.parentSessionId, turnId: state.turnId, ...entry, ...extra });
  if (source.kind === 'gemini') {
    if (id(row.sessionId)) state.sessionId = row.sessionId;
    if (id(row.parentSessionId)) state.parentSessionId = row.parentSessionId;
    if (object(row.$set)) { parseEntry(source, state, row.$set, records, live); return; }
    if (Array.isArray(row.messages)) for (const message of row.messages) parseEntry(source, state, message, records, live);
    if (!state.sessionId || !id(row.id)) return;
    const timestamp = at(row.timestamp);
    if (row.type === 'user') {
      // Skip the native CLI's injected context/commands without retaining it.
      if (typeof row.content === 'string' && (!row.content.trim() || /^[/?]/.test(row.content.trim()) || /^\s*<(?:session_context|hook_context)>/.test(row.content))) return;
      state.turnId = row.id; observe({ event: 'turn-start', activity: 'planning', at: timestamp, nativeId: row.id, rawEvent: 'gemini:user' });
    } else if (row.type === 'gemini') {
      const u = object(row.tokens);
      if (u) {
        const cached = Math.min(count(u.cached), count(u.input)), thoughts = count(u.thoughts);
        push(tokenRecord(source.provider, state, row.id, timestamp, row.model, count(u.input) - cached, Math.min(1e12, count(u.output) + thoughts), cached, 0, thoughts));
      }
      for (const call of Array.isArray(row.toolCalls) ? row.toolCalls.slice(0, LIMITS.tools) : []) {
        if (!id(call.id) || !id(call.name)) continue;
        const stamp = at(call.timestamp) ?? timestamp, status = call.status;
        const classified = activity(call.name, call.args);
        if (['executing', 'scheduled', 'validating', 'awaiting_approval'].includes(status)) observe({ event: status === 'awaiting_approval' ? 'waiting-user' : 'tool-start', activity: status === 'awaiting_approval' ? 'waiting-user' : classified,
          at: stamp, nativeId: row.id, toolCallId: call.id, toolName: label(call.name), rawEvent: `gemini:tool:${status}` });
        else if (['success', 'completed', 'error', 'cancelled', 'canceled'].includes(status)) observe({ event: 'tool-end', activity: classified, at: at(call.endTime) ?? stamp,
          nativeId: row.id, toolCallId: call.id, toolName: label(call.name), outcome: ['success', 'completed'].includes(status) ? 'success' : status === 'error' ? 'failure' : 'cancelled', rawEvent: `gemini:tool:${status}` });
      }
      // A token snapshot or response text does not establish turn completion.
      if (['STOP', 'MAX_TOKENS', 'stop', 'length'].includes(row.finishReason)) observe({ event: 'turn-end', activity: 'idle', at: timestamp, nativeId: row.id, rawEvent: 'gemini:finishReason' });
    }
  } else if (source.kind === 'pi') {
    if (row.type === 'session' && !state.sessionId) {
      state.sessionId = id(row.id); state.createdAt = at(row.timestamp);
      state.parentSessionId = parentIdentity(source.file, source, row);
      return;
    }
    if (!state.sessionId) return;
    const message = object(row.message), timestamp = at(row.timestamp) ?? at(message?.timestamp);
    if (state.createdAt !== null && timestamp !== null && timestamp < state.createdAt) return;
    if (row.type === 'message' && message?.role === 'user' && id(row.id)) {
      state.turnId = row.id; observe({ event: 'turn-start', activity: 'planning', at: timestamp, nativeId: row.id, rawEvent: 'pi:user' });
    } else if (row.type === 'message' && message?.role === 'assistant') {
      state.model = label(message.responseModel || message.model || state.model);
      const u = object(message.usage);
      // Entry identity crosses copied fork files; responseId is not unique
      // across Pi requests. Tool-result projections are not billed again.
      if (u && id(row.id)) push(tokenRecord(source.provider, state, `${row.id}:${timestamp}`, timestamp, state.model, u.input, u.output, u.cacheRead, u.cacheWrite, u.reasoning, false));
      for (const call of Array.isArray(message.content) ? message.content.slice(0, LIMITS.tools) : []) {
        if (call.type !== 'toolCall' || !id(call.id) || !id(call.name)) continue;
        observe({ event: 'tool-start', activity: activity(call.name, call.arguments), at: timestamp,
          nativeId: id(row.id) || call.id, toolCallId: call.id, toolName: label(call.name), rawEvent: 'pi:toolCall' });
      }
      if (['stop', 'length', 'aborted', 'error'].includes(message.stopReason)) observe({ event: ['aborted', 'error'].includes(message.stopReason) ? 'interrupted' : 'turn-end', activity: 'idle', at: timestamp,
        nativeId: id(row.id), rawEvent: `pi:stopReason:${message.stopReason}` });
    } else if (row.type === 'message' && message?.role === 'toolResult' && id(message.toolCallId)) {
      observe({ event: 'tool-end', activity: 'planning', at: timestamp, nativeId: id(row.id) || message.toolCallId,
        toolCallId: message.toolCallId, toolName: label(message.toolName), outcome: message.isError === true ? 'failure' : message.isError === false ? 'success' : 'unknown', rawEvent: 'pi:toolResult' });
    } else if (['compaction', 'branch_summary'].includes(row.type) && object(row.usage) && id(row.id)) {
      const u = row.usage; push(tokenRecord(source.provider, state, `${row.type}:${row.id}:${timestamp}`, timestamp, 'unknown', u.input, u.output, u.cacheRead, u.cacheWrite, u.reasoning, false));
    }
  } else if (source.kind === 'kimi') {
    state.sessionId ||= id(path.basename(path.dirname(path.dirname(path.dirname(source.file)))));
    if (row.type === 'llm.request' && typeof row.model === 'string') state.model = label(row.model);
    if (!['agent.message.appended', 'human.agent.message.appended'].includes(row.type) || row.message?.message?.role !== 'assistant') return;
    const meta = object(row.message?.meta), u = object(meta?.usage), nativeId = id(meta?.messageId);
    if (!u || !nativeId) return;
    const actual = label(meta.model?.model);
    // Kimi forks preserve committed receipts. The native provider namespace
    // plus message ID identifies one charge across all session directories.
    const request = hash([id(meta.model?.provider) || 'unknown', nativeId]);
    push(tokenRecord(source.provider, state, request, at(row.time), actual === 'agent-loop' || actual === 'unknown' ? state.model : actual,
      u.inputOther, u.output, u.inputCacheRead, u.inputCacheCreation, 0, false));
  }
}

function createAdditionalSessionMonitor({ store, homeDir = os.homedir(), env = process.env, now = Date.now, onEvent, intervalMs = 1000 } = {}) {
  if (!store || typeof store.cursor !== 'function' || typeof store.commit !== 'function') throw new TypeError('Token store required');
  const roots = sourceRoots(homeDir, env), recent = new Map(), backlog = new Map(), seen = new Map(), liveSessions = new Map();
  const uniqueFiles = new Map(PROVIDERS.map(provider => [provider, new Set()]));
  const discoveryErrors = new Map(), fileErrors = new Map();
  const sourceStats = new Map(PROVIDERS.map(provider => [provider, { provider, usage: true, activity: ACTIVITY_PROVIDERS.includes(provider), available: false, files: 0, error: '' }]));
  let startedAt = now(), running = false, closed = false, scanning = false, timer, discovery, pending;
  let passes = 0, completedScans = 0, recentOffset = 0, bytesRead = 0, malformedLines = 0, oversizedLines = 0, rewrites = 0, events = 0, lastScanAt = null, error = '';
  function sourceSeen(source) {
    const stats = sourceStats.get(source.provider), files = uniqueFiles.get(source.provider), key = hash(source.file);
    stats.available = true;
    if (files.has(key)) return;
    if (files.size < LIMITS.trackedFiles) files.add(key); else stats.filesCapped = true;
    stats.files = files.size;
  }
  function* discover() {
    for (const root of roots) {
      if (root.shared) continue; // One native directory must not acquire two tool identities.
      try {
        if (root.kind === 'sqlite') { fs.lstatSync(root.file); yield root; }
        else yield* walk(root);
        discoveryErrors.delete(root.provider);
      } catch (cause) {
        if (cause.code === 'ENOENT') discoveryErrors.delete(root.provider);
        else discoveryErrors.set(root.provider, /^[A-Z_]+$/.test(cause.code || '') ? cause.code : 'DISCOVERY');
      }
    }
  }
  function fileErrorKey(source) { return `${source.provider}:${hash(source.file)}`; }
  function warnFile(source, code) { bounded(fileErrors, fileErrorKey(source), { provider: source.provider, code }, LIMITS.recent); }
  function sourceError(provider) { return discoveryErrors.get(provider) || [...fileErrors.values()].find(value => value.provider === provider)?.code || sourceStats.get(provider).error; }
  function publish(descriptor) {
    if (typeof onEvent !== 'function' || !id(descriptor.sessionId) || descriptor.at === null || descriptor.at < Math.max(startedAt, now() - LIMITS.liveFresh) || descriptor.at > now() + 5000) return;
    const identity = actorKey(descriptor.provider, descriptor.sessionId);
    let active = liveSessions.get(identity);
    const key = hash([identity, descriptor.turnId, descriptor.nativeId, descriptor.event, descriptor.toolCallId, descriptor.rawEvent, descriptor.at]);
    if (seen.has(key)) return;
    const starts = descriptor.event === 'turn-start' || descriptor.event === 'tool-start' || descriptor.event === 'waiting-user';
    if (!active && !starts) return;
    if (starts && !active) { active = { tools: new Map(), turnId: descriptor.turnId }; bounded(liveSessions, identity, active, LIMITS.recent); }
    if (descriptor.event === 'turn-start' && active.turnId !== descriptor.turnId) { active.tools.clear(); active.turnId = descriptor.turnId; }
    if (descriptor.turnId && active.turnId && active.turnId !== descriptor.turnId) return;
    if (descriptor.event === 'tool-end' && !active.tools.has(descriptor.toolCallId)) return;
    if (['tool-start', 'waiting-user'].includes(descriptor.event)) {
      if (active.tools.get(descriptor.toolCallId) === descriptor.event) return;
      bounded(active.tools, descriptor.toolCallId, descriptor.event, LIMITS.tools);
    } else if (descriptor.event === 'tool-end') active.tools.delete(descriptor.toolCallId);
    else if (['turn-end', 'interrupted'].includes(descriptor.event)) liveSessions.delete(identity);
    bounded(seen, key, true, LIMITS.seen);
    const event = { id: identity, eventId: `session-log-${key}`, provider: descriptor.provider, sessionId: descriptor.sessionId,
      ...(descriptor.parentSessionId ? { parentId: actorKey(descriptor.provider, descriptor.parentSessionId) } : {}),
      ...(descriptor.turnId ? { turnId: descriptor.turnId } : {}), at: descriptor.at, event: descriptor.event, activity: descriptor.activity,
      title: `${descriptor.provider} session`, summary: descriptor.event === 'tool-start' ? '观察到工具调用' : descriptor.event === 'tool-end' ? '观察到工具结果' : descriptor.event === 'waiting-user' ? '等待你的输入' : descriptor.activity === 'idle' ? '观察到本轮结束' : '观察到新任务活动',
      ...(descriptor.toolCallId ? { toolCallId: descriptor.toolCallId, toolName: descriptor.toolName } : {}),
      ...(descriptor.outcome ? { outcome: descriptor.outcome } : {}), evidence: { source: 'session-jsonl', rawEvent: descriptor.rawEvent, confidence: 'native-session-derived' } };
    try { onEvent(event); events++; } catch { sourceStats.get(descriptor.provider).error = 'EVENT_RECEIVER'; }
  }
  function read(fd, start, length, budget) {
    const allowed = Math.min(length, budget.remaining);
    if (allowed <= 0) return Buffer.alloc(0);
    const bytes = Buffer.alloc(allowed), n = fs.readSync(fd, bytes, 0, allowed, start);
    bytesRead += n; budget.remaining -= n; return bytes.subarray(0, n);
  }
  function fingerprint(fd, offset, budget) {
    const length = Math.min(offset, LIMITS.fingerprint);
    const head = read(fd, 0, length, budget), tail = read(fd, offset - length, length, budget);
    if (head.length !== length || tail.length !== length) throw coded('READ_BUDGET');
    return { head: hash(head), tail: hash(tail) };
  }
  function syncFile(source, budget) {
    rejectLinks(source.file);
    const item = fs.lstatSync(source.file);
    if (!item.isFile() || item.isSymbolicLink()) return false;
    const fd = fs.openSync(source.file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
      const opened = fs.fstatSync(fd);
      if (item.dev !== opened.dev || item.ino !== opened.ino) throw coded('SOURCE_CHANGED');
      sourceSeen(source);
      const identity = `${opened.dev}:${opened.ino}`, key = `additional:${source.provider}\0${source.file}`;
      let cursor = store.cursor(key);
      const json = source.kind === 'gemini' && source.file.endsWith('.json');
      if (cursor && (!Number.isSafeInteger(cursor.offset) || cursor.offset < 0 || !Number.isSafeInteger(cursor.ordinal) || cursor.ordinal < 0)) throw coded('INVALID_CURSOR');
      let rewritten = cursor && (cursor.identity !== identity || cursor.offset > opened.size);
      if (cursor && !rewritten) { const actual = fingerprint(fd, cursor.offset, budget); rewritten = actual.head !== cursor.head || actual.tail !== cursor.tail; }
      if (rewritten) { cursor = null; rewrites++; }
      if (!json && cursor?.offset === opened.size && cursor.mtimeMs === opened.mtimeMs && !cursor.skipping) return false;
      const state = cleanState(cursor?.state, source.provider), records = [], live = [];
      let offset = 0, ordinal = cursor?.ordinal || 0, skipping = !!cursor?.skipping;
      if (json) {
        if (opened.size > LIMITS.json) throw coded('JSON_TOO_LARGE');
        const bytes = read(fd, 0, opened.size, budget);
        if (bytes.length !== opened.size) throw coded('READ_BUDGET');
        let document; try { document = JSON.parse(bytes.toString('utf8')); } catch { throw coded('INCOMPLETE_JSON'); }
        parseEntry(source, state, document, records, live); offset = opened.size; ordinal = 1;
      } else {
        const start = cursor?.offset || 0, bytes = read(fd, start, Math.min(LIMITS.chunk, opened.size - start), budget);
        let consumed = 0;
        while (consumed < bytes.length) {
          const end = bytes.indexOf(10, consumed);
          if (end < 0) { if (skipping || bytes.length - consumed >= LIMITS.chunk) { if (!skipping) oversizedLines++; consumed = bytes.length; skipping = true; } break; }
          if (!skipping) {
            let row; try { row = JSON.parse(bytes.subarray(consumed, end).toString('utf8')); } catch { malformedLines++; }
            if (row) parseEntry(source, state, row, records, live);
          }
          consumed = end + 1; ordinal++; skipping = false;
        }
        offset = start + consumed;
      }
      const stamp = fingerprint(fd, offset, budget), finished = offset === opened.size && !skipping;
      if (!store.commit(key, { identity, offset, ordinal, skipping, ...stamp, mtimeMs: opened.mtimeMs, finished, state }, records)) throw coded('IMPORT_TRANSACTION');
      for (const descriptor of live) publish(descriptor);
      return offset < opened.size && (opened.size - offset >= LIMITS.chunk || skipping);
    } finally { fs.closeSync(fd); }
  }
  function syncOpenCode(source, budget) {
    rejectLinks(source.file);
    const item = fs.lstatSync(source.file);
    if (!item.isFile() || item.isSymbolicLink()) return false;
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(source.file, { readOnly: true });
    try {
      db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000; BEGIN;');
      sourceSeen(source);
      const exists = table => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
      const v2 = exists('session_v2') && exists('session_message'), sessions = v2 ? 'session_v2' : 'session', messages = v2 ? 'session_message' : 'message';
      if (!exists(sessions) || !exists(messages)) throw coded('UNSUPPORTED_SQLITE_SCHEMA');
      const columns = db.prepare(`PRAGMA table_info(${sessions})`).all().map(row => row.name);
      const parent = columns.includes('parent_id') ? 's.parent_id' : 'NULL';
      const key = `additional:opencode\0${source.file}`, cursor = store.cursor(key), identity = `${item.dev}:${item.ino}`;
      const afterId = cursor?.identity === identity ? id(cursor.state?.afterId) || '' : '';
      const saved = cursor?.identity === identity ? cursor.state : {};
      const validHashes = values => Array.isArray(values) ? values.filter(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)).slice(0, LIMITS.deferredRows) : [];
      let deferred = new Set(validHashes(saved?.deferredRows)), overflow = saved?.deferredOverflow === true;
      const cycle = new Set(afterId ? validHashes(saved?.cycleDeferredRows) : []);
      let cycleOverflow = afterId && saved?.cycleDeferredOverflow === true;
      const defer = rowId => {
        const key = hash(rowId);
        if (deferred.size < LIMITS.deferredRows) deferred.add(key); else if (!deferred.has(key)) overflow = true;
        if (cycle.size < LIMITS.deferredRows) cycle.add(key); else if (!cycle.has(key)) cycleOverflow = true;
      };
      const rows = db.prepare(`SELECT m.id,m.session_id,length(CAST(m.data AS BLOB)) size,
        ${v2 ? 'm.type' : 'NULL'} kind,${parent} parent_id FROM ${messages} m JOIN ${sessions} s ON s.id=m.session_id
        WHERE m.id>? ${v2 ? "AND m.type IN ('assistant','compaction')" : ''} ORDER BY m.id LIMIT ?`).all(afterId, LIMITS.messages);
      const records = [], data = db.prepare(`SELECT data FROM ${messages} WHERE id=?`);
      let processed = 0, latestId = afterId;
      for (const row of rows) {
        if (row.size > LIMITS.json) { defer(row.id); processed++; latestId = row.id; continue; }
        if (budget.remaining < row.size) break;
        const serialized = data.get(row.id)?.data;
        budget.remaining -= row.size; bytesRead += row.size; processed++; latestId = row.id;
        deferred.delete(hash(row.id));
        let value; try { value = JSON.parse(serialized); } catch { malformedLines++; continue; }
        if (!object(value) || !v2 && value.role !== 'assistant') continue;
        const completed = row.kind === 'compaction' ? ['completed', 'failed'].includes(value.status) : at(value.time?.completed) !== null;
        const u = object(value.tokens);
        if (!completed || !u) continue;
        const reasoning = count(u.reasoning), state = { sessionId: id(row.session_id), parentSessionId: id(row.parent_id) };
        const record = tokenRecord('opencode', state, id(row.id), at(value.time?.created), value.modelID || (typeof value.model === 'string' ? value.model : value.model?.id),
          u.input, Math.min(1e12, count(u.output) + reasoning), u.cache?.read, u.cache?.write, reasoning);
        if (record) records.push(record);
      }
      const more = rows.length === LIMITS.messages || processed < rows.length;
      // Only a completed traversal can clear warnings for deleted rows. A
      // bounded set plus an overflow bit preserves incomplete status even
      // when many native rows exceed the read limit.
      if (!more) { deferred = cycle; overflow = cycleOverflow; }
      const incomplete = deferred.size > 0 || overflow;
      if (!store.commit(key, { identity, offset: 0, ordinal: 0, finished: !more && !incomplete, state: { version: 1, provider: 'opencode', afterId: more ? latestId : '',
        deferredRows: [...deferred], deferredOverflow: overflow, cycleDeferredRows: more ? [...cycle] : [], cycleDeferredOverflow: more && cycleOverflow } }, records)) throw coded('IMPORT_TRANSACTION');
      if (incomplete) warnFile(source, 'SQLITE_MESSAGE_TOO_LARGE');
      return more || incomplete;
    } finally { db.close(); }
  }
  function scan() {
    if (scanning || closed) return status();
    scanning = true; const budget = { remaining: LIMITS.bytes }, errors = [], candidates = new Map();
    const add = source => { if (source) candidates.set(`${source.provider}\0${source.file}`, source); };
    try {
      for (const [key, source] of [...backlog].slice(0, 8)) { backlog.delete(key); add(source); }
      const active = [...recent.values()];
      for (let i = 0; i < Math.min(8, active.length); i++) add(active[(recentOffset + i) % active.length]);
      if (active.length) recentOffset = (recentOffset + 8) % active.length;
      discovery ||= discover();
      for (let i = 0; i < LIMITS.entries && candidates.size < LIMITS.files; i++) { const next = discovery.next(); if (next.done) { discovery = null; completedScans++; break; } add(next.value); }
      for (const [key, source] of candidates) {
        if (budget.remaining < (source.file.endsWith('.json') ? LIMITS.json : LIMITS.chunk) + 4 * LIMITS.fingerprint) { backlog.set(key, source); continue; }
        try {
          fileErrors.delete(fileErrorKey(source));
          const more = source.kind === 'sqlite' ? syncOpenCode(source, budget) : syncFile(source, budget);
          bounded(recent, key, source, LIMITS.recent);
          if (more) backlog.set(key, source);
        } catch (cause) {
          if (cause.code === 'ENOENT') { recent.delete(key); fileErrors.delete(fileErrorKey(source)); }
          else { const code = /^[A-Z_]+$/.test(cause.code || '') ? cause.code : 'READ_OR_IMPORT'; warnFile(source, code); errors.push(code); backlog.set(key, source); }
        }
      }
    } catch (cause) { discovery?.return(); discovery = null; errors.push(cause.code || 'DISCOVERY'); }
    finally { scanning = false; passes++; lastScanAt = now(); }
    const codes = [...errors, ...PROVIDERS.map(sourceError).filter(Boolean)];
    error = codes.length ? `Additional session scan incomplete (${[...new Set(codes)].join(', ')})` : '';
    return status();
  }
  function status() { return { running, scanning, readOnly: true, source: 'native-session-logs', providers: [...PROVIDERS], activityProviders: [...ACTIVITY_PROVIDERS],
    sources: [...sourceStats.values()].map(value => ({ ...value, error: sourceError(value.provider) || '' })), passes, completedScans, scanInProgress: !!discovery || backlog.size > 0 || completedScans === 0,
    bytesRead, malformedLines, oversizedLines, rewrites, events, lastScanAt, pendingFiles: backlog.size,
    ...(error ? { error } : {}) }; }
  function refresh() { if (pending) return pending; pending = Promise.resolve().then(scan).finally(() => { pending = null; }); return pending; }
  function start() { if (running || closed) return; running = true; refresh(); timer = setInterval(refresh, intervalMs); timer.unref?.(); }
  function stop() { if (timer) clearInterval(timer); timer = null; running = false; closed = true; discovery?.return(); discovery = null; recent.clear(); backlog.clear(); liveSessions.clear(); seen.clear(); }
  return Object.freeze({ start, stop, scan, refresh, status });
}

module.exports = { createAdditionalSessionMonitor, LIMITS, PROVIDERS, ACTIVITY_PROVIDERS };
