/* Visual attendance only. A departure never changes the observed session truth. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeAttendance = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const eventTime = value => {
    const at = typeof value === 'number' ? value : Date.parse(value);
    return Number.isFinite(at) ? at : 0;
  };
  const closed = session => session.closed === true || session.status === 'closed';
  const uncertain = session => session.disconnected === true || session.status === 'stale';
  const confirmedIdle = session => !closed(session) && !uncertain(session)
    && session.status === 'idle' && (!session.activity || session.activity === 'idle')
    && !(Number(session.activeTools) > 0) && !session.attention;
  const working = session => !closed(session) && !uncertain(session)
    && (session.status === 'active' || session.status === 'waiting'
      || session.attention === true || Number(session.activeTools) > 0);
  const signature = session => [session.status, session.activity, Boolean(session.attention),
    Number(session.activeTools) || 0, session.turnId || ''].join('|');
  const latestEvent = session => Array.isArray(session.events) ? session.events[session.events.length - 1] : null;

  /**
   * Call update with the full authoritative session snapshot BEFORE filtering
   * by room/page. maxEntries should exceed the source's live-session limit
   * (production source: 100; default attendance memory: 256).
   * entering/leaving are edge-triggered IDs; retired describes this snapshot.
   */
  function createAttendance({ idleMs = 20000, now = Date.now, maxEntries = 256 } = {}) {
    const grace = Number.isFinite(Number(idleMs)) ? Math.max(0, Number(idleMs)) : 20000;
    const capacity = Number.isInteger(maxEntries) && maxEntries > 0 ? maxEntries : 256;
    const clock = () => { const at = Number(now()); return Number.isFinite(at) ? at : 0; };
    let startedAt = clock();
    const entries = new Map();
    let initial = true;
    let sequence = 0;

    function update(sessions) {
      const time = clock();
      const current = new Map();
      for (const session of Array.isArray(sessions) ? sessions : []) {
        if (session && typeof session.id === 'string' && session.id) current.set(session.id, session);
      }
      const protectedParents = new Set();
      const activeParents = new Set();
      // Uncertain helpers do not prove their parent finished. A known active
      // helper additionally proves its parent is participating again.
      for (const session of current.values()) {
        if (closed(session) || confirmedIdle(session)) continue;
        const active = working(session);
        const visited = new Set([session.id]);
        let parentId = session.parentId;
        while (parentId && !visited.has(parentId) && current.has(parentId)) {
          visited.add(parentId); protectedParents.add(parentId);
          if (active) activeParents.add(parentId);
          parentId = current.get(parentId).parentId;
        }
      }

      const present = [], entering = [], leaving = [], retired = [];
      for (const [id, session] of current) {
        const at = eventTime(session.lastEventAt);
        const nextSignature = signature(session);
        const protectedByChild = protectedParents.has(id);
        const activeChild = activeParents.has(id);
        const idle = confirmedIdle(session) && !protectedByChild;
        let entry = entries.get(id);
        if (!entry) {
          const historicalIdle = idle && (initial || at < startedAt);
          entry = { phase: closed(session) || historicalIdle ? 'retired' : 'present',
            reason: closed(session) ? 'closed' : historicalIdle ? 'initial-idle' : '',
            idleSince: idle && !historicalIdle ? time : null,
            lastEventAt: at, signature: nextSignature, protectedByChild,
            seen: ++sequence };
          if (entry.phase === 'present') entering.push(id);
        } else {
          const advanced = at > entry.lastEventAt;
          const changed = at >= entry.lastEventAt && nextSignature !== entry.signature;
          const freshArrival = advanced && latestEvent(session)?.event === 'session-start';
          if (closed(session)) {
            if (entry.phase === 'present') leaving.push(id);
            entry.phase = 'retired'; entry.reason = 'closed'; entry.idleSince = null;
          } else if (entry.phase === 'retired') {
            // Time passing, a stale flag, metadata and repeated idle snapshots
            // cannot resurrect someone who already left.
            const resumed = activeChild || freshArrival
              || (working(session) && (advanced || changed || entry.reason === 'absent'));
            if (resumed) {
              entry.phase = 'present'; entry.reason = ''; entry.idleSince = idle ? time : null;
              entering.push(id);
            }
          } else if (idle) {
            if (entry.idleSince === null) {
              entry.idleSince = entry.protectedByChild ? time : Math.min(time, at || time);
            }
            if (time - entry.idleSince >= grace) {
              entry.phase = 'retired'; entry.reason = 'idle'; leaving.push(id);
            }
          } else {
            entry.idleSince = null;
          }
          entry.lastEventAt = Math.max(entry.lastEventAt, at);
          entry.signature = nextSignature; entry.protectedByChild = protectedByChild;
          entry.seen = ++sequence;
        }
        entries.delete(id); entries.set(id, entry);
        if (entry.phase === 'present') present.push(session);
        else retired.push(id);
      }
      for (const [id, entry] of entries) {
        if (current.has(id) || entry.phase === 'retired') continue;
        // The source removed this row. Animate its visual removal without
        // interpreting that disappearance as successful task completion.
        entry.phase = 'retired'; entry.reason = 'absent'; entry.idleSince = null;
        leaving.push(id);
      }
      if (entries.size > capacity) {
        const eviction = [...entries].sort((a, b) =>
          Number(current.has(a[0])) - Number(current.has(b[0]))
          || Number(a[1].phase === 'present') - Number(b[1].phase === 'present')
          || a[1].seen - b[1].seen);
        while (entries.size > capacity && eviction.length) entries.delete(eviction.shift()[0]);
      }
      initial = false;
      return { present, entering, leaving, retired };
    }

    return { update,
      state(id) { const entry = entries.get(id); return entry ? { ...entry } : null; },
      size() { return entries.size; },
      clear() { entries.clear(); initial = true; startedAt = clock(); },
    };
  }

  return { createAttendance };
});
