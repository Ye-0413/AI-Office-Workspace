/* Observed helper history only. No animation, provider actions, timers or storage. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeClones = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const validId = value => typeof value === 'string' && value.length > 0;
  const isClosed = session => session.closed === true || session.status === 'closed';
  const lostSignal = session => session.disconnected === true || session.status === 'stale';
  const isIdle = session => session.status === 'idle' && (!session.activity || session.activity === 'idle')
    && !session.attention && !(Number(session.activeTools) > 0);
  const ACTIVE_ACTIVITIES = new Set(['planning', 'reading', 'searching', 'coding', 'designing',
    'building', 'testing', 'running', 'waiting-tool', 'waiting-user', 'error']);

  function isActive(session) {
    return Boolean(session && !isClosed(session) && !lostSignal(session) && !isIdle(session)
      && (session.attention === true || Number(session.activeTools) > 0 || ACTIVE_ACTIVITIES.has(session.activity)));
  }

  function indexSessions(sessions) {
    const entries = new Map();
    for (const session of Array.isArray(sessions) ? sessions : []) {
      if (session && validId(session.id)) entries.set(session.id, session);
    }
    return entries;
  }

  // Nearest parent first. Keep the final missing parent ID so a renderer may
  // seek a visible ancestor; never substitute a different actor or the door.
  function chainFrom(entries, id) {
    const chain = [], seen = new Set([id]);
    let cursor = entries.get(id);
    while (cursor && validId(cursor.parentId) && !seen.has(cursor.parentId)) {
      chain.push(cursor.parentId); seen.add(cursor.parentId);
      cursor = entries.get(cursor.parentId);
    }
    return chain;
  }

  function parentChain(sessions, id) {
    return chainFrom(indexSessions(sessions), id);
  }

  /**
   * Feed the full authoritative snapshot before room/page/attendance filtering.
   * active: current positive work evidence; idle, stale and absent are excluded.
   * open: no confirmed session/subagent end; absence never becomes completion.
   * total: unique full descendant IDs, including nested and ended helpers.
   * uncertain: open helpers missing now or reporting lost/unknown signal.
   *
   * Retain historical links when a parent leaves the snapshot. An initially
   * missing parent or cycle has no known root until real ancestry resolves it.
   * Counts are rebuilt from identities, so late ancestry cannot double-count.
   *
   * retentionLimit is a soft memory target: only whole confirmed-ended families
   * absent from the snapshot may be evicted. Current/open/unresolved families
   * retain their exact history even above the target. Nothing persists to disk.
   */
  function createLedger({ retentionLimit = 4096 } = {}) {
    const limit = Number.isInteger(retentionLimit) && retentionLimit > 0 ? retentionLimit : 4096;
    const entries = new Map();
    let roots = new Map(), counts = new Map(), lastTime = 0;
    const emptyStats = () => ({ active: 0, total: 0, ended: 0, open: 0, uncertain: 0 });

    function rebuildRoots() {
      roots = new Map();
      for (const entry of entries.values()) {
        if (roots.has(entry.id)) continue;
        const path = [], seen = new Set();
        let cursor = entry, rootId = null;
        while (cursor) {
          if (roots.has(cursor.id)) { rootId = roots.get(cursor.id); break; }
          if (seen.has(cursor.id)) break;
          seen.add(cursor.id); path.push(cursor.id);
          if (!cursor.parentId) { rootId = cursor.id; break; }
          cursor = entries.get(cursor.parentId);
        }
        for (const id of path) roots.set(id, rootId);
      }
    }

    function trimEndedFamilies() {
      if (entries.size <= limit) return;
      const groups = new Map();
      for (const entry of entries.values()) {
        const rootId = roots.get(entry.id);
        if (!rootId) continue;
        if (!groups.has(rootId)) groups.set(rootId, { entries: [], lastSeen: 0, removable: true });
        const group = groups.get(rootId);
        group.entries.push(entry); group.lastSeen = Math.max(group.lastSeen, entry.lastSeen);
        if (!entry.closed || entry.current) group.removable = false;
      }
      for (const group of [...groups.values()].filter(group => group.removable).sort((a, b) => a.lastSeen - b.lastSeen)) {
        if (entries.size <= limit) break;
        for (const entry of group.entries) { entries.delete(entry.id); roots.delete(entry.id); }
      }
    }

    function update(sessions, now = lastTime) {
      const time = Number(now);
      if (Number.isFinite(time)) lastTime = Math.max(lastTime, time);
      for (const entry of entries.values()) { entry.current = false; entry.active = false; }
      for (const session of indexSessions(sessions).values()) {
        let entry = entries.get(session.id);
        if (!entry) {
          entry = { id: session.id, parentId: '', closed: false, current: false, active: false, uncertain: false, lastSeen: lastTime };
          entries.set(entry.id, entry);
        }
        // A later positive parent link may repair an initially orphaned record;
        // incomplete metadata cannot erase a previously observed relationship.
        if (validId(session.parentId)) entry.parentId = session.parentId;
        entry.closed = isClosed(session); entry.current = true;
        entry.active = isActive(session); entry.lastSeen = lastTime;
        entry.uncertain = !entry.closed && (lostSignal(session) || !entry.active && !isIdle(session));
      }
      rebuildRoots(); trimEndedFamilies();
      counts = new Map();
      for (const entry of entries.values()) {
        const rootId = roots.get(entry.id);
        if (!entry.parentId || !rootId || rootId === entry.id) continue;
        if (!counts.has(rootId)) counts.set(rootId, emptyStats());
        const count = counts.get(rootId);
        count.total++;
        if (entry.closed) count.ended++;
        else {
          count.open++;
          if (entry.active) count.active++;
          if (!entry.current || entry.uncertain) count.uncertain++;
        }
      }
      return api;
    }

    const api = Object.freeze({
      update,
      stats: rootId => ({ ...(counts.get(rootId) || emptyStats()) }),
      rootFor: id => roots.get(id) || null,
      parentChain: id => chainFrom(entries, id),
      get size() { return entries.size; },
      get retentionLimit() { return limit; },
    });
    return api;
  }

  return Object.freeze({ createLedger, parentChain, isActive });
});
