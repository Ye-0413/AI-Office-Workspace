'use strict';

const nodeFs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { classifyShell, actorKey } = require('./provider-events.cjs');
const { classifyCodexTool } = require('./codex-tool-activity.cjs');

const LIMITS = Object.freeze({ files: 64, candidates: 128, head: 256 * 1024, tail: 256 * 1024,
  perRead: 256 * 1024, perPoll: 3 * 1024 * 1024, fresh: 5 * 60 * 1000, days: 7,
  historyOperations: 256, historyRescanMs: 5000 });
const PROGRESS = new Set(['event_msg:agent_message', 'event_msg:agent_reasoning', 'event_msg:agent_reasoning_raw_content', 'response_item:reasoning', 'response_item:agent_message']);
function text(value, max = 100) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : ''; }
function ident(value) { return typeof value === 'string' && value.length <= 256 && value && !/[\s\u0000-\u001f]/.test(value) ? value : null; }
function timestamp(value) { const n = typeof value === 'number' ? value : Date.parse(value); return Number.isFinite(n) ? n : null; }
// Codex's started_at field uses Unix seconds in current Desktop rollouts.
// Record timestamps retain their existing millisecond/ISO contract.
function startTimestamp(value) {
  const at = timestamp(value);
  return at !== null && typeof value === 'number' && Math.abs(value) < 1e11 ? at * 1000 : at;
}
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
function parseObject(value) {
  if (object(value)) return value;
  if (typeof value !== 'string' || value.length > 65536) return {};
  try { return object(JSON.parse(value)) || {}; } catch { return {}; }
}
function fileThreadId(file) {
  // Same exact thread/optional-turn UUID shape used by the original monitor.
  // Desktop can write a separate rollout per turn; its suffix is never an
  // actor identity. Nonstandard filenames still require explicit metadata.
  const uuid = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
  const match = path.basename(file).match(new RegExp(`^rollout-.+-${uuid}(?:_${uuid})?\\.jsonl$`, 'i'));
  return match?.[1] || null;
}
function outcomeOf(output) {
  const o = parseObject(output);
  // Match native-hook precedence: cancellation is not failure or success.
  if (o.interrupted === true || o.is_interrupt === true) return 'cancelled';
  for (const k of ['exit_code', 'exitCode']) if (Number.isInteger(o[k])) return o[k] === 0 ? 'success' : 'failure';
  return o.isError === true ? 'failure' : 'unknown';
}

/** Read-only bounded observer. It never installs hooks or launches an AI process. */
function createCodexMonitor({ homeDir = os.homedir(), codexHome, onEvent, now = Date.now,
  intervalMs = 1000, fs = nodeFs } = {}) {
  if (typeof onEvent !== 'function') throw new TypeError('onEvent is required');
  const effectiveHome = codexHome || (process.env.CODEX_HOME && path.isAbsolute(process.env.CODEX_HOME) ? process.env.CODEX_HOME : path.join(homeDir, '.codex'));
  const base = path.join(effectiveHome, 'sessions');
  const tracked = new Map();
  const watermarks = new Map();
  const unknownTypes = new Set();
  const historicalFiles = new Map();
  let historyWalker = null, historyNextScanAt = 0;
  let timer = null, running = false, polling = false, startedAt = 0;
  let stats = { scans: 0, files: 0, bytesRead: 0, events: 0, malformedLines: 0, unknownRecords: 0, oversizedLines: 0, error: null, lastScanAt: null };
  let budget = 0;

  function read(file, start, length) {
    const allowed = Math.min(length, LIMITS.perRead, budget);
    if (allowed <= 0) return Buffer.alloc(0);
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(allowed);
      const n = fs.readSync(fd, buf, 0, allowed, start);
      budget -= n; stats.bytesRead += n;
      return buf.subarray(0, n);
    } finally { fs.closeSync(fd); }
  }
  function makeEvent(t, event, activity, at, rawEvent, extras = {}, position = '') {
    const id = actorKey('codex', t.sessionId, t.subagentId);
    const eventId = 'codex-rollout-' + createHash('sha256').update(JSON.stringify([id, t.turnId, event, extras.toolCallId, rawEvent, at, position])).digest('hex').slice(0, 24);
    return { id, eventId, provider: 'codex', sessionId: t.sessionId,
      ...(t.subagentId ? { subagentId: t.subagentId } : {}), ...(t.parentId ? { parentId: t.parentId } : {}),
      ...(t.turnId ? { turnId: t.turnId } : {}), ...(event === 'turn-start' && t.turnAt > 0 ? { turnStartedAt: t.turnAt } : {}),
      ...(t.projectPath ? { projectPath: t.projectPath } : {}),
      title: t.title || (t.subagentId ? 'Codex 协作任务' : 'Codex 任务'),
      at, event, activity, summary: ({ planning: '任务正在推进', coding: '正在修改代码', reading: '正在读取资料', searching: '正在检索', testing: '正在运行测试', building: '正在构建', running: '正在执行工具', 'waiting-tool': '等待工具结果', 'waiting-user': '等待你的输入', idle: '本轮已停下' })[activity] || '观察到任务活动',
      evidence: { source: 'codex-jsonl', rawEvent, confidence: 'rollout-derived' }, ...extras };
  }
  function publish(t, event) {
    const watermark = watermarks.get(event.id);
    const newerTurn = watermark?.turnId && event.turnId && watermark.turnId !== event.turnId
      && watermark.turnAt > 0 && t.turnAt > watermark.turnAt;
    if (watermark?.turnId && event.turnId && watermark.turnId !== event.turnId
      && t.turnAt > 0 && watermark.turnAt > t.turnAt) return;
    if (watermark && !newerTurn && event.at < watermark.at - 1000) return;
    if (watermark?.closedTurn && event.turnId === watermark.closedTurn && event.event !== 'metadata') return;
    if (watermark && !newerTurn && watermark.at > event.at && event.event === 'turn-start') return;
    watermarks.delete(event.id);
    watermarks.set(event.id, { at: newerTurn ? event.at : Math.max(event.at, watermark?.at || 0), closedTurn: ['turn-end', 'interrupted'].includes(event.event) ? event.turnId : watermark?.closedTurn,
      turnId: event.turnId || watermark?.turnId, turnAt: t.turnAt || (event.turnId === watermark?.turnId ? watermark?.turnAt : 0) });
    while (watermarks.size > 256) watermarks.delete(watermarks.keys().next().value);
    try { onEvent(event); stats.events += 1; } catch (error) { stats.error = `Event receiver: ${text(error.message, 160)}`; }
  }
  function metadata(t, payload) {
    // A Desktop fork embeds its parent's session_meta in the copied history.
    // The first metadata record identifies this file for its entire lifetime.
    if (t.hasMetadata) return;
    const spawn = object(payload.source)?.subagent?.thread_spawn;
    const parent = ident(payload.parent_thread_id) || ident(payload.parent_session_id) || ident(object(spawn)?.parent_thread_id);
    const nativeId = fileThreadId(t.file) || ident(payload.id);
    const sid = ident(payload.session_id) || nativeId;
    if (!sid) return;
    // A user-created fork may retain ancestry/source metadata from another
    // thread. Its explicit native role owns classification: a user thread is
    // an independent root, not a helper of the copied source. Legacy metadata
    // without a declared role can still use the original parent/spawn fields.
    const isChild = payload.thread_source !== 'user' && !!parent && nativeId && nativeId !== parent;
    const root = isChild && sid !== nativeId ? sid : parent;
    t.nativeId = nativeId || sid;
    t.sessionId = isChild ? root : nativeId || sid;
    t.subagentId = isChild ? nativeId : null;
    t.parentId = isChild ? actorKey('codex', root, parent !== root ? parent : undefined) : null;
    t.projectPath = typeof payload.cwd === 'string' && path.isAbsolute(payload.cwd) ? text(payload.cwd, 2048) : '';
    t.title = text(payload.agent_nickname || payload.session_title || '', 80);
    // Internal/ambient background records must not appear as a user task.
    t.internal = ['internal', 'guardian_review'].includes(payload.thread_source) || payload.source === 'internal';
    const boundary = payload.subagent_history_start_ordinal;
    t.historyBoundary = isChild && Number.isSafeInteger(boundary) && boundary > 0 ? boundary : null;
    t.ownsHistory = t.historyBoundary === null;
    t.createdAt = timestamp(payload.timestamp);
    t.hasMetadata = true;
  }
  function processLine(t, line, pos, silent) {
    const ordinal = t.ordinal;
    if (t.ordinal !== null) t.ordinal += 1;
    let row;
    try { row = JSON.parse(line); } catch { stats.malformedLines += 1; return; }
    const p = object(row.payload) || {};
    const key = `${row.type}${typeof p.type === 'string' ? ':' + p.type : ''}`;
    const at = timestamp(row.timestamp) ?? (silent ? null : now());
    if (row.type === 'session_meta') { metadata(t, p); return; }
    if (!t.hasMetadata || t.internal || !t.sessionId) return;
    if (!t.ownsHistory) {
      // The fork prefix contains retimed parent starts, tools and completions.
      // Desktop declares its exact record boundary. A bounded tail read cannot
      // know its absolute ordinal, so require an exact native thread marker (or
      // a start whose original start time is after this child was created).
      const ownStart = key === 'event_msg:task_started' && t.createdAt !== null
        && startTimestamp(p.started_at) !== null && startTimestamp(p.started_at) >= t.createdAt;
      if (ordinal !== null && ordinal >= t.historyBoundary || ident(p.thread_id) === t.nativeId || ownStart) t.ownsHistory = true;
      else return;
    }
    if (!silent && at !== null && at < startedAt - 1500) return;
    const ownTurn = ident(p.turn_id);
    const start = key === 'event_msg:task_started' || (key === 'event_msg:user_message' && (t.ended || !t.open));
    const end = key === 'event_msg:task_complete' || key === 'event_msg:turn_aborted';
    if (start) {
      if (at !== null && (at < t.turnAt || at < t.lastAt - 1000)) return;
      if (t.ended && ownTurn && ownTurn === t.turnId) return;
      if (ownTurn !== t.turnId || !t.open) { t.tools.clear(); t.ended = false; t.endedAt = 0; t.turnAt = at || 0; }
      // Repeated start records cannot promote an old open turn past a newer
      // turn in another Desktop rollout by changing its original start time.
      if (!t.turnAt) t.turnAt = at || 0;
      t.turnId = ownTurn; t.open = true; t.activity = 'planning';
    } else if (ownTurn && t.turnId && ownTurn !== t.turnId) return;
    else if (ownTurn && !t.turnId && !t.ended) { t.turnId = ownTurn; }
    if (row.type === 'turn_context') {
      if (typeof p.summary === 'string' && !['auto', 'none'].includes(p.summary.trim())) t.title = text(p.summary, 80);
      return;
    }
    const callId = ident(p.call_id) || ident(p.id);
    let event;
    if (start) event = makeEvent(t, 'turn-start', 'planning', at, key, {}, pos);
    else if (['response_item:function_call', 'response_item:custom_tool_call', 'response_item:web_search_call'].includes(key)) {
      if (t.ended) return;
      const name = text(p.name || (p.type === 'web_search_call' ? 'web_search' : ''), 96);
      if (!name || !callId) return;
      const input = key === 'response_item:custom_tool_call' && typeof p.input === 'string' ? p.input : parseObject(p.arguments || p.input);
      const classified = classifyCodexTool(name, input, { classifyShell });
      const activity = classified.activity;
      event = makeEvent(t, activity === 'waiting-user' ? 'waiting-user' : 'tool-start', activity, at, key,
        { toolCallId: callId, toolName: classified.toolName,
          ...(classified.codeMode ? { evidence: { source: 'codex-jsonl', rawEvent: key, confidence: 'code-mode-derived' } } : {}) }, pos);
      t.tools.set(callId, event); t.open = true; t.activity = activity;
    } else if (['response_item:function_call_output', 'response_item:custom_tool_call_output'].includes(key)) {
      const pending = t.tools.get(callId);
      if (!pending || t.ended) return;
      t.tools.delete(callId);
      t.activity = [...t.tools.values()].at(-1)?.activity || 'planning';
      event = makeEvent(t, 'tool-end', t.activity, at, key,
        { toolCallId: callId, toolName: pending.toolName, outcome: outcomeOf(p.output) }, pos);
    } else if (end) {
      if (t.ended) return;
      // This is Codex's explicit turn terminal, not a generic hook Stop. A
      // bounded reader may have skipped an oversized output line. Close only
      // already-observed calls from this turn with an UNKNOWN result; terminal
      // evidence never proves that a tool/test succeeded. Child actors retain
      // their independent lifecycle and the store's child guard still applies.
      if (!silent && at !== null && at >= startedAt - 1500) {
        for (const pending of t.tools.values()) {
          publish(t, makeEvent(t, 'tool-end', 'unknown', at, key, {
            toolCallId: pending.toolCallId, toolName: pending.toolName,
            outcome: key.endsWith('turn_aborted') ? 'cancelled' : 'unknown',
            summary: '本轮已终止，未完整观察到该工具结果',
            evidence: { source: 'codex-jsonl', rawEvent: key, confidence: 'terminal-derived' },
          }, `${pos}:terminal:${pending.toolCallId}`));
        }
      }
      t.ended = true; t.endedAt = at || 0; t.open = false; t.tools.clear(); t.activity = 'idle';
      event = makeEvent(t, key.endsWith('turn_aborted') ? 'interrupted' : 'turn-end', 'idle', at, key, {}, pos);
    } else if (PROGRESS.has(key)) {
      if (t.ended) return;
      t.open = true; t.activity ||= 'planning';
      event = makeEvent(t, 'metadata', t.activity, at, key, { summary: '观察到模型活动' }, pos);
    } else {
      if (!['event_msg:token_count', 'token_usage_record', 'event_msg:item_completed', 'response_item:message'].includes(key)) {
        stats.unknownRecords += 1;
        unknownTypes.add(text(key, 72));
        while (unknownTypes.size > 16) unknownTypes.delete(unknownTypes.values().next().value);
      }
      return;
    }
    if (at !== null) {
      t.lastAt = Math.max(t.lastAt || 0, at);
      t.lastEvent = event;
    }
    // New writes can contain copied historical records. Timestamp is a second
    // fence in addition to the silent attach snapshot.
    if (!silent && at !== null && at >= startedAt - 1500) publish(t, event);
  }
  function rememberBoundary(t, buf, start) {
    const end = t.offset - start;
    if (end <= 0 || end > buf.length) return;
    const from = Math.max(0, end - 4096), bytes = buf.subarray(from, end);
    t.boundary = { at: start + from, length: bytes.length, hash: createHash('sha256').update(bytes).digest('hex') };
  }
  function processBuffer(t, buf, start, skipFirst, silent) {
    if (start === 0) t.ordinal = 0;
    else if (start !== t.offset || skipFirst) t.ordinal = null;
    const first = skipFirst ? buf.indexOf(10) + 1 : 0;
    if (skipFirst && first === 0) { t.offset = start + buf.length; t.discarding = true; stats.oversizedLines += 1; rememberBoundary(t, buf, start); return; }
    let offset = first;
    for (;;) {
      const end = buf.indexOf(10, offset);
      if (end < 0) break;
      if (end > offset) processLine(t, buf.subarray(offset, end).toString('utf8'), start + offset, silent);
      offset = end + 1;
    }
    t.offset = start + offset;
    t.discarding = false;
    if (offset === first && buf.length >= LIMITS.perRead) {
      // Commit a bounded skip instead of rereading an unlimited partial line.
      t.offset = start + buf.length; t.discarding = true; stats.oversizedLines += 1;
    }
    rememberBoundary(t, buf, start);
  }
  function attach(file, stat) {
    const t = { file, identity: `${stat.dev}:${stat.ino}`, offset: 0, hasMetadata: false,
      sessionId: null, subagentId: null, parentId: null, title: '', projectPath: '',
      turnId: null, turnAt: 0, open: false, ended: false, endedAt: 0, tools: new Map(), activity: null,
      lastAt: 0, lastEvent: null, discarding: false, internal: false,
      nativeId: null, ordinal: 0, historyBoundary: null, ownsHistory: true, createdAt: null };
    const head = read(file, 0, Math.min(stat.size, LIMITS.head));
    const lineEnd = head.indexOf(10);
    if (lineEnd >= 0) {
      try { const row = JSON.parse(head.subarray(0, lineEnd).toString('utf8')); if (row.type === 'session_meta') metadata(t, row.payload || {}); } catch { stats.malformedLines += 1; }
    } else if (head.length >= LIMITS.head) stats.oversizedLines += 1;
    if (!t.hasMetadata) {
      // The writer can be interrupted between bytes of its first metadata
      // line. Keep a bounded incomplete first line on disk for the next poll;
      // consuming its prefix would make this session unidentifiable forever.
      t.offset = lineEnd < 0 && stat.size < LIMITS.head ? 0 : stat.size;
      return t;
    }
    const tailStart = Math.max(0, stat.size - LIMITS.tail);
    // Reuse the head for small files; every physical read is budgeted.
    const tail = tailStart === 0 && head.length === stat.size ? head : read(file, tailStart, stat.size - tailStart);
    processBuffer(t, tail, tailStart, tailStart > 0, true);
    return t;
  }
  function snapshotEvents(t) {
    if (!t.hasMetadata || t.internal || !t.lastEvent || t.lastAt < now() - LIMITS.fresh || t.ended || !t.open) return [];
    const pending = [...t.tools.values()];
    const waiting = pending.filter(event => event.event === 'waiting-user');
    if (waiting.length) {
      // Restore only a genuinely observed, still-unreturned native input call.
      // A newer heartbeat cannot make an old/undated question fresh. No prompt
      // body, new request, approval or outcome is synthesized by attachment.
      const freshWaiting = new Set(waiting.filter(event => Number.isFinite(event.at) && event.at >= now() - LIMITS.fresh));
      if (!freshWaiting.size) return [];
      const tools = pending.filter(event => Number.isFinite(event.at) && (event.event !== 'waiting-user' || freshWaiting.has(event)))
        .sort((a, b) => a.at - b.at);
      const at = Math.min(t.turnAt || Infinity, ...tools.map(event => event.at));
      const evidence = { source: 'codex-jsonl', rawEvent: 'rollout:restored-wait-snapshot', confidence: 'restored-wait', restored: true, snapshot: 'restored-wait' };
      return [makeEvent(t, 'turn-start', 'planning', at, evidence.rawEvent, { summary: '恢复正在进行的任务状态', evidence }, 'restored-wait-snapshot'),
        ...tools.map(event => ({ ...event, eventId: `${event.eventId}-snapshot`,
          evidence: { ...event.evidence, restored: true, snapshot: event.event === 'waiting-user' ? 'restored-wait' : 'sustained-tool',
            ...(event.event === 'waiting-user' ? { confidence: 'restored-wait' } : {}) } }))];
    }
    const at = t.lastAt;
    return [makeEvent(t, 'turn-start', t.activity || 'planning', at, 'rollout:sustained-snapshot', { summary: '恢复正在进行的任务状态' }, 'snapshot'),
      ...pending.map(e => ({ ...e, at, eventId: `${e.eventId}-snapshot` }))];
  }
  function discoverHistory(discovered) {
    if (!historyWalker && now() < historyNextScanAt) return;
    // Creation-date folders are not activity dates: an old chat keeps writing
    // its original rollout. Follow the upstream monitor's bounded, resumable
    // directory walk rather than limiting discovery to recent calendar days.
    // This lane only reads names/stats; content still uses the shared budget.
    historyWalker ||= [{ dir: base, depth: 0, entries: null, index: 0 }];
    let operations = 0;
    while (historyWalker.length && operations < LIMITS.historyOperations) {
      const frame = historyWalker.at(-1);
      if (!frame.entries) {
        operations += 1;
        try {
          frame.entries = fs.readdirSync(frame.dir, { withFileTypes: true })
            .filter(entry => frame.depth === 3
              ? entry.isFile() && /^rollout-.*\.jsonl$/.test(entry.name)
              : entry.isDirectory() && (frame.depth === 0 ? /^\d{4}$/ : /^\d{2}$/).test(entry.name))
            .sort((a, b) => b.name.localeCompare(a.name));
        } catch (error) { frame.entries = []; if (error.code !== 'ENOENT') stats.error ||= 'Read historical session directory failed'; }
      }
      if (frame.index >= frame.entries.length) { historyWalker.pop(); continue; }
      const entry = frame.entries[frame.index];
      if (frame.depth < 3) {
        frame.index += 1;
        historyWalker.push({ dir: path.join(frame.dir, entry.name), depth: frame.depth + 1, entries: null, index: 0 });
        continue;
      }
      // Keep the next file for the following poll when a directory read used
      // the final operation. Large histories cannot starve the recent lane.
      if (operations >= LIMITS.historyOperations) break;
      frame.index += 1; operations += 1;
      const file = path.join(frame.dir, entry.name);
      try {
        const stat = fs.statSync(file);
        if (stat.mtimeMs < now() - LIMITS.fresh) continue;
        discovered.set(file, { file, stat });
        historicalFiles.delete(file); historicalFiles.set(file, true);
        while (historicalFiles.size > LIMITS.candidates) historicalFiles.delete(historicalFiles.keys().next().value);
      } catch {}
    }
    if (!historyWalker.length) { historyWalker = null; historyNextScanAt = now() + LIMITS.historyRescanMs; }
  }
  function discover() {
    const candidates = [];
    const current = new Date(now());
    for (let d = 0; d < LIMITS.days; d += 1) {
      const day = new Date(current); day.setDate(current.getDate() - d);
      const dir = path.join(base, String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0'));
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (error) { if (error.code !== 'ENOENT') stats.error = `Read session directory: ${text(error.message, 160)}`; continue; }
      // Names contain sortable rollout timestamps. Bound stat work as well as
      // content reads even if a busy day has thousands of completed sessions.
      entries.sort((a, b) => b.name.localeCompare(a.name));
      for (const entry of entries.slice(0, LIMITS.candidates * 2)) {
        if (!entry.isFile() || !/^rollout-.*\.jsonl$/.test(entry.name)) continue;
        const file = path.join(dir, entry.name);
        try { const stat = fs.statSync(file); if (stat.mtimeMs >= now() - LIMITS.fresh || tracked.has(file)) candidates.push({ file, stat }); } catch {}
      }
    }
    const discovered = new Map(candidates.map(item => [item.file, item]));
    discoverHistory(discovered);
    // Retain recently discovered exact paths across walker slices, including
    // candidates whose content could not fit in the previous poll's budget.
    for (const file of historicalFiles.keys()) {
      if (discovered.has(file)) continue;
      try {
        const stat = fs.statSync(file);
        if (stat.mtimeMs >= now() - LIMITS.fresh) discovered.set(file, { file, stat });
        else historicalFiles.delete(file);
      } catch { historicalFiles.delete(file); }
    }
    // Attached files remain cheap to follow even when their writes go quiet.
    for (const file of tracked.keys()) {
      if (discovered.has(file)) continue;
      try { discovered.set(file, { file, stat: fs.statSync(file) }); } catch {}
    }
    return [...discovered.values()].sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs).slice(0, LIMITS.candidates);
  }
  function poll() {
    if (!running || polling) return;
    polling = true; budget = LIMITS.perPoll; stats.error = null;
    try {
      const attached = [];
      for (const { file, stat } of discover()) {
        if (budget <= 0) break;
        let t = tracked.get(file);
        const identity = `${stat.dev}:${stat.ino}`;
        let rewritten = false;
        if (t?.boundary && t.identity === identity && stat.size >= t.offset) {
          if (budget < t.boundary.length) continue;
          const bytes = read(file, t.boundary.at, t.boundary.length);
          rewritten = bytes.length !== t.boundary.length || createHash('sha256').update(bytes).digest('hex') !== t.boundary.hash;
        }
        if (!t || t.identity !== identity || stat.size < t.offset || rewritten) {
          const attachCost = Math.min(stat.size, LIMITS.head) + (stat.size > LIMITS.head ? Math.min(stat.size, LIMITS.tail) : 0);
          if (attachCost > budget) continue;
          t = attach(file, stat); tracked.delete(file); tracked.set(file, t); attached.push(t);
        } else if (stat.size > t.offset) {
          const start = t.offset;
          const buf = read(file, start, stat.size - start);
          processBuffer(t, buf, start, t.discarding, false);
        }
      }
      // Merge same-thread Desktop turn rollouts before emitting any startup
      // state. A newer completed file suppresses an older still-open file.
      const latest = new Map();
      for (const t of [...tracked.values()]) {
        if (!t.sessionId) continue;
        const id = actorKey('codex', t.sessionId, t.subagentId);
        const current = latest.get(id);
        const distinctKnownTurns = current && t.turnId && current.turnId && t.turnId !== current.turnId
          && t.turnAt > 0 && current.turnAt > 0 && t.turnAt !== current.turnAt;
        if (!current || (distinctKnownTurns ? t.turnAt > current.turnAt : t.lastAt >= current.lastAt)) latest.set(id, t);
      }
      for (const t of attached) {
        const id = t.sessionId && actorKey('codex', t.sessionId, t.subagentId);
        if (!id || latest.get(id) !== t) continue;
        const watermark = watermarks.get(id);
        const newerTurn = watermark?.turnId && t.turnId && watermark.turnId !== t.turnId
          && watermark.turnAt > 0 && t.turnAt > watermark.turnAt;
        if (watermark && !newerTurn && watermark.at >= t.lastAt) continue;
        if (t.ended) {
          // This repairs an already observed older turn's state; it does not
          // replay a historical completion or create an unknown idle actor.
          if (newerTurn && t.endedAt >= t.turnAt && t.endedAt > 0) {
            publish(t, makeEvent(t, 'metadata', 'idle', t.endedAt, 'rollout:ended-turn-snapshot', {
              turnStartedAt: t.turnAt, turnEndedAt: t.endedAt, supersedesTurnId: watermark.turnId,
              evidence: { source: 'codex-jsonl', rawEvent: 'rollout:ended-turn-snapshot', confidence: 'rollout-derived', restored: true, snapshot: 'ended-turn' },
            }, 'ended-turn-snapshot'));
          }
          watermarks.set(id, { at: t.lastAt, closedTurn: t.turnId, turnId: t.turnId, turnAt: t.turnAt }); continue;
        }
        for (const event of snapshotEvents(t)) publish(t, event);
      }
      while (tracked.size > LIMITS.files) tracked.delete(tracked.keys().next().value);
      stats.files = tracked.size; stats.scans += 1; stats.lastScanAt = now();
    } catch (error) { stats.error = text(error.message, 180); }
    finally { polling = false; }
  }
  return {
    start() { if (running) return; running = true; startedAt = now(); poll(); timer = setInterval(poll, Math.max(100, intervalMs)); timer.unref?.(); },
    stop() { running = false; if (timer) clearInterval(timer); timer = null; tracked.clear(); watermarks.clear(); historicalFiles.clear(); historyWalker = null; historyNextScanAt = 0; stats.files = 0; },
    status() { return { running, source: 'codex-jsonl', readOnly: true, baseDir: base, ...stats, unsupportedTypes: [...unknownTypes], limits: { ...LIMITS } }; },
    poll,
  };
}

module.exports = { createCodexMonitor, LIMITS };
