'use strict';

const path = require('node:path');
const HOOK_LEASE_MS = 10000;
const DEFERRED_PER_ACTOR = 32;
const DEFERRED_GLOBAL = 1024;

// The store owns lifecycle, not animation timers. No timeout ever means success.
function createSessionStore({ now = Date.now, staleMs = 120000, maxSessions = 100 } = {}) {
  const sessions = new Map();
  const listeners = new Set();
  const seen = new Map();
  const deferred = new Map();
  const deferredReplay = Symbol('observed-fallback-record');
  let drainingDeferred = false;
  const maxSeen = Math.max(512, maxSessions * 40);
  const terminal = new Set(['turn-end', 'interrupted', 'session-end', 'subagent-end']);
  const boundedAdd = (set, value, limit = 32) => {
    if (!value) return;
    set.add(value);
    while (set.size > limit) set.delete(set.values().next().value);
  };
  const emit = () => { for (const listener of listeners) { try { listener(snapshot()); } catch {} } };
  const actorId = event => `${event.provider}:${encodeURIComponent(event.sessionId)}${event.subagentId ? `:${encodeURIComponent(event.subagentId)}` : ''}`;
  const isFallback = event => /jsonl|rollout/.test(event.evidence?.source || '');
  const isHook = event => /hook|upstream/.test(event.evidence?.source || '') && !isFallback(event);
  const activeChildren = id => [...sessions.values()].some(s => s.parentId === id && !s.closed && (s.tools.size || (!s.pendingEnd && ['active', 'waiting'].includes(s.status))));

  function retainPendingState(s) {
    if (s.closed) return;
    if (s.waits.size) {
      s.status = 'waiting'; s.activity = 'waiting-user'; s.attention = true;
    } else if (s.pendingEnd && (s.tools.size || s.externalPending || activeChildren(s.id))) {
      s.status = 'active'; s.activity = 'waiting-tool'; s.attention = false;
    }
  }

  function removeDeferred(key) {
    const entry = deferred.get(key);
    if (!entry) return;
    sessions.get(entry.actorId)?.deferredKeys.delete(key);
    deferred.delete(key);
  }
  function discardDeferred(s, callId) {
    for (const key of [...s.deferredKeys]) {
      const entry = deferred.get(key);
      if (!callId || entry?.event.toolCallId === callId) removeDeferred(key);
    }
  }
  function deferFallback(s, event, at) {
    if (!event.turnId || event.turnId !== s.turnId || s.closed || s.closedTurns.has(event.turnId)) return;
    if (at < s.turnStartedAt) return;
    const callId = event.toolCallId;
    if (['tool-start', 'tool-end', 'waiting-user'].includes(event.event)) {
      if (!callId || s.completedTools.has(callId)) return;
      const pending = s.tools.get(callId);
      const queuedStart = [...s.deferredKeys].map(key => deferred.get(key)?.event).find(e => e?.toolCallId === callId && ['tool-start', 'waiting-user'].includes(e.event));
      if (event.event === 'tool-end' && (!pending && !queuedStart || at < (pending?.startedAt ?? queuedStart?.at ?? Infinity))) return;
      if (event.event !== 'tool-end' && pending) return;
    } else if (!['turn-end', 'interrupted'].includes(event.event)) return;
    const key = `${s.id}\u0000${event.turnId}\u0000${event.event}\u0000${callId || ''}`;
    if (deferred.has(key)) return;
    while (s.deferredKeys.size >= DEFERRED_PER_ACTOR) removeDeferred(s.deferredKeys.values().next().value);
    const retained = { ...event, at, evidence: { ...event.evidence } };
    deferred.set(key, { actorId: s.id, event: retained }); s.deferredKeys.add(key);
    while (deferred.size > DEFERRED_GLOBAL) removeDeferred(deferred.keys().next().value);
  }

  function settle(s, at) {
    const explicitClose = s.pendingEnd === 'session-end' || s.pendingEnd === 'subagent-end';
    if (!s.pendingEnd || s.tools.size || s.waits.size || s.externalPending || (!explicitClose && activeChildren(s.id))) return;
    const event = s.pendingEnd;
    const completedAt = Math.max(at, s.pendingEndAt || 0);
    s.pendingEnd = null;
    s.pendingEndAt = 0;
    s.status = event === 'session-end' || event === 'subagent-end' ? 'closed' : 'idle';
    s.closed = s.status === 'closed';
    s.activity = 'idle';
    s.attention = false;
    if (event === 'turn-end') s.turnCompletedAt = completedAt;
    boundedAdd(s.closedTurns, s.turnId);
    s.turnOpen = false;
    discardDeferred(s);
  }

  function ingest(event, replayToken) {
    if (!event || typeof event !== 'object' || !event.provider || !event.sessionId || !event.event) return false;
    const id = actorId(event);
    const atValue = typeof event.at === 'string' ? Date.parse(event.at) : Number(event.at);
    const at = Number.isFinite(atValue) ? atValue : now();
    const key = event.eventId ? `${id}:${event.eventId}` : null;
    if (key && seen.has(key)) return false;
    let s = sessions.get(id);
    const metadata = event.event === 'metadata';
    // SessionEnd is a native lifecycle fact about the session, not a result
    // belonging to a particular turn. Its carried turn/timestamp may be old
    // when the client tears down an idle thread. Rollout fallback never owns
    // this boundary and must not synthesize it.
    const nativeSessionEnd = event.event === 'session-end' && !isFallback(event);
    // A helper's explicit teardown may follow its own Stop. Accept that native
    // boundary past the completed-turn fence, while a delayed older helper
    // turn must never close the same identity after it starts new work.
    const nativeSubagentEnd = event.event === 'subagent-end' && !isFallback(event)
      && Boolean(event.turnId && s?.turnId && event.turnId === s.turnId);
    const starts = event.event === 'turn-start' || event.event === 'session-start' || event.event === 'subagent-start';
    if (!s) {
      // A dangling result/Stop cannot conjure a completed session on app launch.
      if (event.event === 'tool-end' || terminal.has(event.event)) return false;
      s = {
        id, provider: event.provider, sessionId: event.sessionId,
        ...(event.subagentId ? { subagentId: event.subagentId } : {}),
        ...(event.parentId ? { parentId: event.parentId } : {}),
        title: event.title || event.provider, projectPath: event.projectPath || '',
        activity: metadata ? 'idle' : (event.activity || 'planning'), status: metadata ? 'idle' : 'active',
        lastEventAt: at, toolName: '', summary: '', evidence: event.evidence || {},
        attention: false, closed: false, tools: new Map(), completedTools: new Set(),
        closedTurns: new Set(), events: [], turnId: null, turnStartedAt: 0, turnOpen: false,
        hookAt: 0, hookReceivedAt: null, hookTurnId: null, pendingEnd: null, pendingEndAt: 0, externalPending: false,
        deferredKeys: new Set(), waits: new Map(),
      };
      sessions.set(id, s);
    }
    // Explicit new boundaries alone can reopen an ended session or turn.
    const pendingTool = event.toolCallId && s.tools.get(event.toolCallId);
    const correlatedFallbackResult = isFallback(event) && event.event === 'tool-end'
      && event.turnId && event.turnId === s.turnId && pendingTool && at >= pendingTool.startedAt;
    const supplementalResult = correlatedFallbackResult && at < s.lastEventAt;
    if (s.closed && !starts && !metadata && !nativeSessionEnd) return false;
    if (event.turnId && s.closedTurns.has(event.turnId) && !metadata && !nativeSessionEnd && !nativeSubagentEnd) return false;
    if (!metadata && !nativeSessionEnd && event.turnId && s.turnId && event.turnId !== s.turnId && event.event !== 'turn-start') return false;
    if (event.event === 'turn-start' && event.turnId !== s.turnId && at < s.turnStartedAt) return false;
    if (!metadata && !nativeSessionEnd && !nativeSubagentEnd && !correlatedFallbackResult && at < s.lastEventAt - 2000) return false;
    // Official hooks have a bounded primary lease, not permanent ownership:
    // if a hook disappears, a fresh real rollout record may repair that turn.
    // Expiration itself changes no activity and never implies completion.
    if (isFallback(event) && s.hookReceivedAt !== null && !metadata) {
      const sameOrUnknownTurn = !event.turnId || !s.hookTurnId || event.turnId === s.hookTurnId;
      const leaseActive = now() - s.hookReceivedAt <= HOOK_LEASE_MS;
      if (sameOrUnknownTurn && leaseActive) {
        if (replayToken !== deferredReplay) deferFallback(s, event, at);
        return false;
      }
      if (at < s.hookAt && !correlatedFallbackResult) return false;
    }
    if (isHook(event) && event.event === 'tool-end' && event.toolCallId) discardDeferred(s, event.toolCallId);
    if (event.event === 'tool-end' && (!event.toolCallId || !s.tools.has(event.toolCallId))) return false;
    if (event.event === 'tool-start' && event.toolCallId && s.completedTools.has(event.toolCallId)) return false;
    if (event.event === 'tool-end') discardDeferred(s, event.toolCallId);
    if (key) {
      seen.set(key, at);
      while (seen.size > maxSeen) seen.delete(seen.keys().next().value);
    }
    if (!supplementalResult) {
      if (event.title) s.title = String(event.title).slice(0, 100);
      if (event.projectPath) s.projectPath = String(event.projectPath).slice(0, 2048);
      if (event.parentId) s.parentId = event.parentId;
    }
    if (metadata) {
      const elicitationResolved = event.evidence?.rawEvent === 'ElicitationResult'
        && [...s.waits.values()].some(wait => wait.rawEvent === 'Elicitation' && (!event.toolCallId || event.toolCallId === wait.callId));
      if (elicitationResolved) {
        for (const [key, wait] of s.waits) if (wait.rawEvent === 'Elicitation' && (!event.toolCallId || event.toolCallId === wait.callId)) {
          s.waits.delete(key);
          if (wait.callId && s.tools.get(wait.callId)?.activity === 'waiting-user') s.tools.delete(wait.callId);
        }
        s.status = 'active'; s.activity = [...s.tools.values()].at(-1)?.activity || 'planning';
        s.attention = false; s.lastEventAt = Math.max(s.lastEventAt, at);
        s.summary = '已收到你的输入，等待后续活动';
      }
      s.evidence = event.evidence || s.evidence;
      // A real model-progress record is activity evidence; quota/title writes
      // are not. Preserve the current station while refreshing its heartbeat.
      if (isFallback(event) && s.status === 'active' && /^(?:event_msg:agent_(?:message|reasoning|reasoning_raw_content)|response_item:(?:reasoning|agent_message))$/.test(event.evidence?.rawEvent || '')) {
        s.lastEventAt = Math.max(s.lastEventAt, at);
      }
      settle(s, at); retainPendingState(s);
      prune(false); emit(); return true;
    }
    if (isHook(event)) { s.hookAt = Math.max(s.hookAt, at); s.hookReceivedAt = now(); s.hookTurnId = event.turnId || s.turnId; }
    if (event.event === 'turn-start' || (!s.turnId && event.turnId && !terminal.has(event.event))) {
      if (s.turnId && s.turnId !== event.turnId) boundedAdd(s.closedTurns, s.turnId);
      if (s.turnId !== event.turnId || !s.turnOpen) {
        discardDeferred(s);
        s.tools.clear(); s.completedTools.clear(); s.waits.clear(); s.pendingEnd = null; s.pendingEndAt = 0; s.externalPending = false;
        s.turnStartedAt = at;
      }
      s.turnId = event.turnId || null; s.turnOpen = true;
      delete s.turnCompletedAt;
    }
    s.lastEventAt = Math.max(s.lastEventAt, at);
    if (!supplementalResult) {
      s.evidence = event.evidence || s.evidence;
      s.summary = String(event.summary || '').slice(0, 240);
    }
    s.closed = false;
    const callId = event.toolCallId;
    if (event.event === 'tool-start') {
      if (callId && s.completedTools.has(callId)) return false;
      const queuedStart = [...s.deferredKeys].map(key => deferred.get(key)?.event).find(e => e?.toolCallId === callId && ['tool-start', 'waiting-user'].includes(e.event));
      const startedAt = Math.min(at, pendingTool?.startedAt ?? Infinity, queuedStart?.at ?? Infinity);
      s.tools.set(callId || event.eventId || `anonymous:${at}`, { name: event.toolName || '', activity: event.activity || 'coding', startedAt });
      s.status = 'active'; s.attention = false;
      s.activity = event.activity || 'coding'; s.toolName = event.toolName || '';
    } else if (event.event === 'tool-end') {
      // Results are correlated; an unrelated result never decrements work.
      if (!callId || !s.tools.has(callId)) return false;
      s.tools.delete(callId); boundedAdd(s.completedTools, callId, 128);
      const matchingWait = s.waits.get(`call:${callId}`);
      if (matchingWait && at >= matchingWait.at) s.waits.delete(`call:${callId}`);
      const remaining = [...s.tools.values()].at(-1);
      if (!supplementalResult) {
        const waiting = [...s.tools.values()].some(tool => tool.activity === 'waiting-user');
        s.activity = waiting ? 'waiting-user' : remaining?.activity || (event.outcome === 'failure' ? 'error' : 'planning');
        s.toolName = remaining?.name || event.toolName || '';
        s.status = waiting ? 'waiting' : 'active'; s.attention = waiting;
      }
    } else if (event.event === 'activity') {
      // Some native protocols expose activity but no call ID. Present the fact
      // without inventing a pending tool, resolving a wait, or cancelling Stop.
      if (!s.waits.size) {
        const remaining=[...s.tools.values()].at(-1);
        const knownWork=event.outcome && event.outcome!=='failure' && remaining;
        s.status='active';
        s.activity=knownWork ? remaining.activity : event.activity || 'unknown';
        s.toolName=knownWork ? remaining.name : event.toolName || '';
        s.attention=s.activity==='error';
      }
    } else if (event.event === 'waiting-user') {
      s.status = 'waiting'; s.activity = 'waiting-user'; s.attention = true;
      s.toolName = event.toolName || '';
      // request_user_input is an active correlated call, not a completion.
      if (callId) s.tools.set(callId, { name: event.toolName || 'request_user_input', activity: 'waiting-user', startedAt: pendingTool?.startedAt ?? at });
      s.waits.set(callId ? `call:${callId}` : `kind:${event.evidence?.rawEvent || 'waiting-user'}`,
        { callId, rawEvent: event.evidence?.rawEvent || '', at });
    } else if (terminal.has(event.event)) {
      s.pendingEnd = event.event;
      s.pendingEndAt = at;
      s.status = 'active'; s.attention = false;
      s.externalPending = event.event === 'turn-end' && event.activity === 'waiting-tool';
      if (s.externalPending || s.tools.size || activeChildren(s.id)) s.activity = 'waiting-tool';
      if (event.event === 'session-end' || event.event === 'subagent-end' || event.event === 'interrupted') {
        // Explicit teardown/abort invalidates tools, unlike ordinary Stop.
        s.tools.clear();
        s.waits.clear();
        s.toolName = '';
        delete s.turnCompletedAt;
        discardDeferred(s);
      }
      if (nativeSessionEnd) boundedAdd(s.closedTurns, event.turnId);
      settle(s, at);
    } else {
      s.status = event.event === 'session-start' && !s.tools.size ? 'idle' : 'active'; s.activity = event.activity || 'planning';
      s.attention = event.event === 'error'; s.pendingEnd = null;
      if (starts) s.turnOpen = event.event !== 'session-start';
    }
    // Stop can arrive before a concurrently running child/tool completes.
    settle(s, at);
    retainPendingState(s);
    if (s.parentId) {
      const parent = sessions.get(s.parentId);
      if (parent) { settle(parent, at); retainPendingState(parent); }
    }
    s.events.push({ eventId: event.eventId, event: event.event, at, activity: s.activity,
      ...(event.toolCallId ? { toolCallId: event.toolCallId } : {}),
      // Keep the observed operation separate from the reducer's *current*
      // activity. A fast edit can start and finish between two UI snapshots.
      observedActivity: event.event === 'tool-end' ? pendingTool?.activity || 'unknown' : event.activity || 'unknown',
      summary: s.summary, toolName: event.toolName || '', outcome: event.outcome,
      evidence: event.evidence || {} });
    s.events = s.events.slice(-12);
    prune(false); emit();
    return true;
  }

  function snapshot() {
    const time = now();
    return [...sessions.values()].map(s => {
      const childActive = activeChildren(s.id);
      const childHeartbeat = childActive ? Math.max(0, ...[...sessions.values()].filter(child => child.parentId === s.id && !child.closed && ['active', 'waiting'].includes(child.status)).map(child => child.lastEventAt)) : 0;
      const ownStale = staleMs > 0 && time - s.lastEventAt > staleMs;
      const disconnected = !s.closed && staleMs > 0 && time - Math.max(s.lastEventAt, childHeartbeat) > staleMs;
      return {
        id: s.id, provider: s.provider, sessionId: s.sessionId,
        ...(s.subagentId ? { subagentId: s.subagentId } : {}), ...(s.parentId ? { parentId: s.parentId } : {}),
        ...(s.turnId ? { turnId: s.turnId } : {}), title: s.title,
        projectPath: s.projectPath,
        projectName: s.projectPath ? path.basename(s.projectPath.replace(/\\/g, '/')) || s.projectPath : '未分组',
        activity: disconnected ? 'unknown' : !s.closed && childActive && ownStale ? 'waiting-tool' : s.activity,
        status: disconnected ? 'stale' : childActive && s.status === 'idle' ? 'active' : s.status,
        lastEventAt: s.lastEventAt, toolName: s.toolName, summary: s.summary,
        evidence: { ...s.evidence }, activeTools: s.tools.size,
        attention: s.attention, disconnected, closed: s.closed,
        ...(s.turnCompletedAt ? { turnCompletedAt: s.turnCompletedAt } : {}),
        events: s.events.map(e => ({ ...e, evidence: { ...e.evidence } })),
      };
    }).sort((a, b) => b.lastEventAt - a.lastEventAt || a.id.localeCompare(b.id));
  }
  function prune(notify = true) {
    let changed = false;
    if (sessions.size > maxSessions) {
      const candidates = [...sessions.values()].sort((a, b) => Number(b.closed) - Number(a.closed) || a.lastEventAt - b.lastEventAt);
      while (sessions.size > maxSessions && candidates.length) {
        const retired = candidates.shift(); discardDeferred(retired); sessions.delete(retired.id); changed = true;
      }
    }
    if (notify && !drainingDeferred) {
      drainingDeferred = true;
      try {
        const records = [...deferred.entries()].sort((a, b) => a[1].event.at - b[1].event.at);
        for (const [key, entry] of records) {
          if (!deferred.has(key)) continue;
          const s = sessions.get(entry.actorId);
          if (!s || s.closed || s.turnId !== entry.event.turnId || s.closedTurns.has(entry.event.turnId)) { removeDeferred(key); continue; }
          if (s.hookReceivedAt !== null && now() - s.hookReceivedAt <= HOOK_LEASE_MS) continue;
          removeDeferred(key);
          // Replay the observed fact with its original event ID, timestamp and
          // rollout evidence. Merely reaching this timer creates no event.
          changed = ingest(entry.event, deferredReplay) || changed;
        }
      } finally { drainingDeferred = false; }
    }
    if (notify && (changed || [...sessions.values()].some(s => !s.closed && staleMs > 0 && now() - s.lastEventAt > staleMs))) emit();
    return changed;
  }
  return { ingest, snapshot, prune, clear() { sessions.clear(); seen.clear(); deferred.clear(); emit(); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
}

module.exports = { createSessionStore };
