'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { actorKey } = require('./provider-events.cjs');
const TIME_ZONE = 'Asia/Hong_Kong';
const DAY = 86400000, OFFSET = 8 * 3600000;
const ACTIVITIES = new Set(['reading', 'searching', 'planning', 'coding', 'designing', 'testing', 'building', 'running', 'waiting-tool', 'waiting-user', 'error', 'unknown', 'idle']);
const STATES = new Set(['active', 'waiting', 'idle', 'stale', 'closed']);
const SETTLEMENTS = new Set(['turn-end', 'interrupted', 'session-end', 'subagent-end']);
const EVENTS = new Set(['metadata', 'session-start', 'session-end', 'subagent-start', 'subagent-end', 'turn-start', 'turn-end', 'interrupted', 'tool-start', 'tool-end', 'activity', 'waiting-user', 'error']);
const hash = value => createHash('sha256').update(value).digest('hex');
const text = (value, max = 256) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, max) : '';
const identifier = (value, max = 256) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\s\u0000-\u001f\u007f-\u009f]/.test(value);
const timestamp = value => { const n = typeof value === 'string' ? Date.parse(value) : value; return Number.isFinite(n) && n >= 0 && n <= 253402271999999 ? Math.floor(n) : null; };
const date = at => new Date(Math.floor((at + OFFSET) / DAY) * DAY).toISOString().slice(0, 10);
function stat(file) { try { return fs.lstatSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; return null; } }
function safeDirectory(dir, create) {
  const absolute = path.resolve(dir); let current = path.parse(absolute).root;
  for (const piece of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, piece); let entry = stat(current);
    if (!entry && create) { fs.mkdirSync(current, { mode: 0o700 }); entry = stat(current); }
    if (!entry) throw new Error('Missing usage history directory');
    const aliases = process.platform === 'darwin' ? { '/var': '/private/var', '/tmp': '/private/tmp', '/etc': '/private/etc' } : {};
    if (entry.isSymbolicLink() && aliases[current] && fs.realpathSync(current) === aliases[current]) continue;
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error('Unsafe usage history directory');
  }
  return stat(absolute);
}
function safeFile(file, required = false) {
  const entry = stat(file);
  if (!entry) { if (required) throw new Error('Missing usage history database'); return null; }
  if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1 || process.getuid && entry.uid !== process.getuid()) throw new Error('Unsafe usage history file');
  fs.chmodSync(file, 0o600); return entry;
}
function validateFilters(input = {}, requireId = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Usage filters must be an object');
  const out = { offset: input.offset ?? 0, limit: input.limit ?? 50 };
  if (!Number.isSafeInteger(out.offset) || out.offset < 0 || !Number.isSafeInteger(out.limit) || out.limit < 1 || out.limit > 200) throw new TypeError('Invalid usage pagination');
  for (const key of ['from', 'to']) {
    const value = input[key];
    if (value === undefined || value === null || value === '') { out[key] = null; continue; }
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) throw new TypeError('Invalid usage date');
    out[key] = value;
  }
  if (out.from && out.to && out.from > out.to) throw new TypeError('Invalid usage date range');
  if (requireId) { if (!identifier(input.id, 8192)) throw new TypeError('Usage actor ID required'); out.id = input.id; }
  if (input.provider !== undefined && input.provider !== '' && input.provider !== 'all') { if (!identifier(input.provider) || input.provider.length > 64) throw new TypeError('Invalid usage provider'); out.provider = input.provider; }
  out.role = input.role ?? 'all'; if (!['all', 'root', 'helper'].includes(out.role)) throw new TypeError('Invalid usage role');
  return out;
}

// Only accepted observer metadata enters this local archive. No transcript,
// title, summary, file path, tool arguments or tool output is serialized.
function createUsageLog({ dataDir, now = Date.now, staleMs = 180000 } = {}) {
  if (typeof dataDir !== 'string' || !path.isAbsolute(dataDir) || typeof now !== 'function' || !Number.isFinite(staleMs) || staleMs <= 0) throw new TypeError('Usage log requires an absolute data directory and positive stale timeout');
  const dir = path.join(dataDir, 'usage-history'), file = path.join(dir, 'usage.sqlite3');
  let db = null, directoryIdentity = null, databaseIdentity = null, closed = false, error = '', tracks = new Map(), lastClock = -Infinity;
  const fail = (action, cause) => { error = `Usage history ${action} failed${cause?.code ? ` (${String(cause.code).replace(/[^A-Z0-9_]/g, '')})` : ''}`; return false; };
  function checkFiles() {
    const entry = safeDirectory(dir, false);
    if (!directoryIdentity || entry.dev !== directoryIdentity.dev || entry.ino !== directoryIdentity.ino) throw new Error('Usage history directory changed');
    if (process.getuid && entry.uid !== process.getuid()) throw new Error('Unsafe usage history owner');
    fs.chmodSync(dir, 0o700);
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      const item = safeFile(file + suffix, suffix === '');
      if (suffix === '' && databaseIdentity && (item.ino !== databaseIdentity.ino || item.dev !== databaseIdentity.dev)) throw new Error('Usage history database changed');
    }
  }
  try {
    directoryIdentity = safeDirectory(dir, true);
    if (process.getuid && directoryIdentity.uid !== process.getuid()) throw new Error('Unsafe usage history owner');
    fs.chmodSync(dir, 0o700);
    if (!stat(file)) { const fd = fs.openSync(file, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW || 0), 0o600); fs.closeSync(fd); }
    databaseIdentity = safeFile(file, true);
    checkFiles();
    const { DatabaseSync } = require('node:sqlite'); db = new DatabaseSync(file);
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000;');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version !== 0 && version !== 1) throw new Error('Unsupported usage history schema');
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS actors(id TEXT PRIMARY KEY, provider TEXT NOT NULL, parent_id TEXT NOT NULL DEFAULT '', project_name TEXT NOT NULL DEFAULT '', first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, status TEXT NOT NULL, activity TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES actors(id), at INTEGER NOT NULL, observed_at INTEGER NOT NULL, day TEXT NOT NULL, event TEXT NOT NULL, activity TEXT NOT NULL, status TEXT NOT NULL, tool_name TEXT NOT NULL, outcome TEXT NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL, turn_id TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_actor_date ON events(actor_id, day, at DESC, id);
      CREATE INDEX IF NOT EXISTS events_date ON events(day, actor_id);
      CREATE TABLE IF NOT EXISTS actor_days(actor_id TEXT NOT NULL REFERENCES actors(id), day TEXT NOT NULL, events INTEGER NOT NULL DEFAULT 0, turns INTEGER NOT NULL DEFAULT 0, tool_calls INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0, active_ms INTEGER NOT NULL DEFAULT 0, waiting_ms INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(actor_id,day));
      CREATE INDEX IF NOT EXISTS actor_days_date ON actor_days(day, actor_id);
      CREATE TABLE IF NOT EXISTS activity_days(actor_id TEXT NOT NULL REFERENCES actors(id), day TEXT NOT NULL, activity TEXT NOT NULL, ms INTEGER NOT NULL, PRIMARY KEY(actor_id,day,activity));
      CREATE TABLE IF NOT EXISTS archive_totals(singleton INTEGER PRIMARY KEY CHECK(singleton=1), agents INTEGER NOT NULL, events INTEGER NOT NULL);
      INSERT OR IGNORE INTO archive_totals SELECT 1,(SELECT COUNT(*) FROM actors),(SELECT COUNT(*) FROM events);
      CREATE TABLE IF NOT EXISTS observed_turns(actor_id TEXT PRIMARY KEY REFERENCES actors(id), identity TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS boundaries(actor_id TEXT NOT NULL REFERENCES actors(id), kind TEXT NOT NULL, identity TEXT NOT NULL, PRIMARY KEY(actor_id,kind,identity));
      PRAGMA user_version=1; COMMIT;`);
    checkFiles();
  } catch (cause) { fail('open', cause); try { db?.close(); } catch {} db = null; }
  const emptyTotals = () => ({ agents: 0, roots: 0, helpers: 0, events: 0, turns: 0, toolCalls: 0, failures: 0, activeMs: 0, waitingMs: 0 });
  function transaction(fn) {
    if (!db || closed) return false;
    try {
      checkFiles(); db.exec('BEGIN IMMEDIATE'); const result = fn(); checkFiles(); db.exec('COMMIT'); error = ''; return result;
    } catch (cause) { try { db.exec('ROLLBACK'); } catch {} return fail('save', cause); }
  }
  function addDuration(id, activity, state, start, end, sign = 1) {
    if (end <= start || !['active', 'waiting'].includes(state)) return;
    const waiting = state === 'waiting' || activity === 'waiting-tool' || activity === 'waiting-user';
    while (start < end) {
      const finish = Math.min(end, (Math.floor((start + OFFSET) / DAY) + 1) * DAY - OFFSET), ms = (finish - start) * sign, day = date(start);
      db.prepare('INSERT INTO actor_days(actor_id,day,active_ms,waiting_ms) VALUES(?,?,?,?) ON CONFLICT(actor_id,day) DO UPDATE SET active_ms=active_ms+excluded.active_ms,waiting_ms=waiting_ms+excluded.waiting_ms').run(id, day, waiting ? 0 : ms, waiting ? ms : 0);
      db.prepare('INSERT INTO activity_days(actor_id,day,activity,ms) VALUES(?,?,?,?) ON CONFLICT(actor_id,day,activity) DO UPDATE SET ms=ms+excluded.ms').run(id, day, activity, ms);
      start = finish;
    }
  }
  function clock() { const time = timestamp(now()); if (time === null) throw new TypeError('Invalid usage clock'); return time; }
  function stateOf(s) {
    const value = s.settlementBoundary, marker = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    const at = marker && typeof marker.at === 'number' ? timestamp(marker.at) : null;
    return { status: STATES.has(s.status) ? s.status : 'idle', activity: ACTIVITIES.has(s.activity) ? s.activity : 'unknown', lastEventAt: timestamp(s.lastEventAt),
      settlementBoundary: marker && SETTLEMENTS.has(marker.event) && at !== null ? { event: marker.event, at } : null };
  }
  function advance(sessions, time, boundary = time, boundaryOwner = null) {
    const next = new Map(), credits = new Map(), snapshots = new Map(sessions.filter(s => s && identifier(s.id, 8192)).map(s => [s.id, s]));
    for (const [id, old] of tracks) {
      const snapshot = snapshots.get(id), state = snapshot && stateOf(snapshot), marker = state?.settlementBoundary;
      const newSettlement = marker && (marker.event !== old.settlementBoundary?.event || marker.at !== old.settlementBoundary?.at);
      // Quota/title metadata is accepted history, not a new activity boundary.
      // Preserve real progress heartbeats and ElicitationResult reductions,
      // including a visible wait-to-work change with no timestamp advance.
      const metadataCausal = state && (state.lastEventAt > old.lastEventAt || newSettlement || state.status !== 'stale' &&
        (state.status !== old.status || state.activity !== old.activity && state.activity !== 'waiting-tool'));
      const ownBoundary = boundaryOwner?.id === id && (boundaryOwner.event !== 'metadata' || metadataCausal);
      // Parent identity or idle/stale presentation alone cannot prove a child
      // settled it. Only new, explicit reducer evidence authorizes that cut.
      const parentSettled = boundaryOwner?.parentId === id && newSettlement;
      const causalBoundary = ownBoundary || parentSettled;
      const changed = !state || state.status !== old.status || state.activity !== old.activity || causalBoundary && newSettlement;
      const transitionAt = causalBoundary ? Math.max(boundary, newSettlement ? marker.at : boundary) : time;
      const end = Math.max(old.cursor, Math.min(time, changed ? transitionAt : time, old.lastEventAt + staleMs));
      let meteredStart = old.meteredStart, meteredEnd = old.meteredEnd, meteredActivity = old.meteredActivity, meteredStatus = old.meteredStatus;
      if (changed && transitionAt < old.cursor) {
        // Correct only this process's actual credited lease, including when a
        // later snapshot has masked its work/wait bucket as stale/unknown.
        // No lease is recovered from disk and no offline history is rebuilt.
        addDuration(id, meteredActivity, meteredStatus, Math.max(transitionAt, meteredStart), meteredEnd, -1);
      }
      addDuration(id, old.activity, old.status, old.cursor, end);
      if (changed && causalBoundary) {
        meteredStart = time; meteredEnd = time; meteredActivity = state?.activity; meteredStatus = state?.status;
      } else if (end > old.cursor && ['active', 'waiting'].includes(old.status)) {
        if (meteredEnd < old.cursor || meteredActivity !== old.activity || meteredStatus !== old.status) meteredStart = old.cursor;
        meteredEnd = end; meteredActivity = old.activity; meteredStatus = old.status;
      }
      // Pure snapshot-derived changes keep their last credited bucket alive
      // until a real boundary arrives, even if its presentation is unchanged.
      credits.set(id, { meteredStart, meteredEnd, meteredActivity, meteredStatus });
    }
    for (const [id, snapshot] of snapshots) {
      const archived = db.prepare('SELECT last_seen_at FROM actors WHERE id=?').get(id);
      if (!archived) continue;
      const state = stateOf(snapshot), old = tracks.get(id);
      // Accepted passive metadata can move archive last_seen_at without moving
      // the reducer's work heartbeat. Preserve only an existing process lease
      // with a nonregressing heartbeat; disk history cannot recreate that lease.
      const continuous = old && state.lastEventAt !== null && state.lastEventAt >= old.lastEventAt;
      // Future-dated or regressing evidence cannot open a metered interval.
      if (state.lastEventAt === null || state.lastEventAt > time || old && state.lastEventAt < old.lastEventAt || !continuous && state.lastEventAt < archived.last_seen_at) continue;
      next.set(id, { ...state, cursor: Math.max(time, old?.cursor ?? time), ...(credits.get(id) || { meteredStart: time, meteredEnd: time, meteredActivity: state.activity, meteredStatus: state.status }) });
      db.prepare('UPDATE actors SET parent_id=CASE WHEN ?<>\'\' THEN ? ELSE parent_id END,project_name=CASE WHEN ?<>\'\' THEN ? ELSE project_name END,status=?,activity=? WHERE id=?').run(identifier(snapshot.parentId, 8192) ? snapshot.parentId : '', identifier(snapshot.parentId, 8192) ? snapshot.parentId : '', text(snapshot.projectName, 128), text(snapshot.projectName, 128), state.status, state.activity, id);
    }
    return next;
  }
  function record(event, sessions = []) {
    if (!event || !identifier(event.provider) || event.provider.length > 64 || !identifier(event.sessionId) || event.subagentId !== undefined && !identifier(event.subagentId) || !EVENTS.has(event.event)) return false;
    if (!Array.isArray(sessions)) throw new TypeError('Usage sessions must be an array');
    const at = timestamp(event.at); if (at === null) return false;
    let time; try { time = clock(); } catch (cause) { return fail('clock', cause); }
    const id = actorKey(event.provider, event.sessionId, event.subagentId), snapshot = sessions.find(s => s?.id === id), state = stateOf(snapshot || event);
    const permitted = { actorId: id, at, event: event.event, activity: ACTIVITIES.has(event.activity) ? event.activity : 'unknown', turnId: text(event.turnId), toolCallId: text(event.toolCallId), toolName: text(event.toolName, 128), outcome: ['success', 'failure', 'cancelled', 'interrupted'].includes(event.outcome) ? event.outcome : '', source: text(event.evidence?.source, 96), kind: text(event.evidence?.kind || event.evidence?.rawEvent, 128) };
    const fingerprint = hash(identifier(event.eventId) ? `${id}\u0000${event.eventId}` : JSON.stringify(permitted));
    let next;
    const result = transaction(() => {
      if (db.prepare('SELECT 1 FROM events WHERE id=?').get(fingerprint)) return false;
      const observedParent = snapshot?.parentId || event.parentId;
      const parent = identifier(observedParent, 8192) ? observedParent : event.subagentId ? actorKey(event.provider, event.sessionId) : '';
      const project = text(snapshot?.projectName, 128), day = date(at);
      const exists = !!db.prepare('SELECT 1 FROM actors WHERE id=?').get(id);
      db.prepare('INSERT INTO actors(id,provider,parent_id,project_name,first_seen_at,last_seen_at,status,activity) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET parent_id=CASE WHEN excluded.parent_id<>\'\' THEN excluded.parent_id ELSE actors.parent_id END,project_name=CASE WHEN excluded.project_name<>\'\' THEN excluded.project_name ELSE actors.project_name END,first_seen_at=MIN(first_seen_at,excluded.first_seen_at),last_seen_at=MAX(last_seen_at,excluded.last_seen_at),status=CASE WHEN excluded.last_seen_at>=actors.last_seen_at THEN excluded.status ELSE actors.status END,activity=CASE WHEN excluded.last_seen_at>=actors.last_seen_at THEN excluded.activity ELSE actors.activity END').run(id, event.provider, parent, project, at, at, state.status, state.activity);
      db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(fingerprint, id, at, time, day, event.event, state.activity, state.status, permitted.toolName, permitted.outcome, permitted.source, permitted.kind, permitted.turnId);
      db.prepare('UPDATE archive_totals SET agents=agents+?,events=events+1 WHERE singleton=1').run(Number(!exists));
      let turns = 0, tools = 0;
      const mark = (kind, identity) => Number(db.prepare('INSERT OR IGNORE INTO boundaries VALUES(?,?,?)').run(id, kind, identity).changes);
      if (!['metadata', 'session-start', 'session-end'].includes(event.event) && (permitted.turnId || event.event === 'turn-start')) turns = mark('turn', permitted.turnId || fingerprint);
      // Call IDs are scoped to an observed turn; some native protocols reuse
      // them after Stop. Persist only an opaque fallback generation so a later
      // result/permission wait stays correlated even after app restart.
      if (event.event === 'turn-start') db.prepare('INSERT INTO observed_turns VALUES(?,?) ON CONFLICT(actor_id) DO UPDATE SET identity=excluded.identity').run(id, permitted.turnId || fingerprint);
      const turnKey = permitted.turnId || text(snapshot?.turnId) || db.prepare('SELECT identity FROM observed_turns WHERE actor_id=?').get(id)?.identity || 'unbounded';
      const callKey = permitted.toolCallId ? JSON.stringify([turnKey, permitted.toolCallId]) : fingerprint;
      if (['tool-start', 'tool-end', 'waiting-user'].includes(event.event) && (permitted.toolCallId || event.event === 'tool-start')) tools = mark('tool', callKey);
      const work = !['metadata', 'session-start', 'session-end', 'subagent-end'].includes(event.event);
      const failures = work && (permitted.outcome === 'failure' || event.event === 'error') ? mark('failure', callKey) : 0;
      db.prepare('INSERT INTO actor_days(actor_id,day,events,turns,tool_calls,failures) VALUES(?,?,1,?,?,?) ON CONFLICT(actor_id,day) DO UPDATE SET events=events+1,turns=turns+excluded.turns,tool_calls=tool_calls+excluded.tool_calls,failures=failures+excluded.failures').run(id, day, turns, tools, failures);
      next = advance(sessions, Math.max(time, lastClock), time < lastClock ? lastClock : Math.min(at, time), { id, parentId: identifier(observedParent, 8192) ? observedParent : '', event: event.event });
      return true;
    });
    if (result) { tracks = next; lastClock = Math.max(lastClock, time); }
    return result;
  }
  function reconcile(sessions = []) {
    if (!Array.isArray(sessions)) throw new TypeError('Usage sessions must be an array');
    let time; try { time = Math.max(clock(), lastClock); } catch (cause) { return fail('clock', cause); }
    let next;
    const result = transaction(() => { next = advance(sessions, time); return true; });
    if (result) { tracks = next; lastClock = time; } return result;
  }
  function sqlDates(filters, alias = '') { const clauses = [], values = []; for (const [key, op] of [['from', '>='], ['to', '<=']]) if (filters[key]) { clauses.push(`${alias}day${op}?`); values.push(filters[key]); } return { clause: clauses.length ? clauses.join(' AND ') : '1', values }; }
  function query(filters = {}) {
    const f = validateFilters(filters), response = { ok: false, scope: 'observed', timeZone: TIME_ZONE, from: f.from, to: f.to, total: 0, items: [], totals: emptyTotals() };
    if (!db || closed) return { ...response, error: error || 'Usage history is closed' };
    try {
      checkFiles(); const dates = sqlDates(f, 'd.'), where = ['1'], params = [...dates.values];
      if (f.provider) { where.push('a.provider=?'); params.push(f.provider); }
      if (f.role !== 'all') where.push(f.role === 'helper' ? "a.parent_id<>''" : "a.parent_id=''");
      const grouped = `WITH aggregated AS (SELECT d.actor_id,SUM(d.events) events,SUM(d.turns) turns,SUM(d.tool_calls) tool_calls,SUM(d.failures) failures,SUM(d.active_ms) active_ms,SUM(d.waiting_ms) waiting_ms FROM actor_days d WHERE ${dates.clause} GROUP BY d.actor_id)`;
      const matching = `FROM actors a JOIN aggregated g ON a.id=g.actor_id WHERE ${where.join(' AND ')}`;
      const sum = db.prepare(`${grouped} SELECT COUNT(*) agents,COALESCE(SUM(CASE WHEN a.parent_id='' THEN 1 ELSE 0 END),0) roots,COALESCE(SUM(CASE WHEN a.parent_id<>'' THEN 1 ELSE 0 END),0) helpers,COALESCE(SUM(g.events),0) events,COALESCE(SUM(g.turns),0) turns,COALESCE(SUM(g.tool_calls),0) toolCalls,COALESCE(SUM(g.failures),0) failures,COALESCE(SUM(g.active_ms),0) activeMs,COALESCE(SUM(g.waiting_ms),0) waitingMs ${matching}`).get(...params);
      response.totals = { ...sum }; response.total = sum.agents;
      const rows = db.prepare(`${grouped} SELECT a.*,g.events,g.turns,g.tool_calls,g.failures,g.active_ms,g.waiting_ms ${matching} ORDER BY a.last_seen_at DESC,a.id ASC LIMIT ? OFFSET ?`).all(...params, f.limit, f.offset);
      const activities = sqlDates(f);
      response.items = rows.map(row => ({ id: row.id, provider: row.provider, parentId: row.parent_id || null, projectName: row.project_name, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, events: row.events, turns: row.turns, toolCalls: row.tool_calls, failures: row.failures, activeMs: row.active_ms, waitingMs: row.waiting_ms, activityMs: Object.fromEntries(db.prepare(`SELECT activity,SUM(ms) ms FROM activity_days WHERE actor_id=? AND ${activities.clause} GROUP BY activity`).all(row.id, ...activities.values).map(item => [item.activity, item.ms])), status: row.status, activity: row.activity }));
      return { ...response, ok: !error, ...(error ? { error } : {}) };
    } catch (cause) { fail('read', cause); return { ...response, error }; }
  }
  function events(filters = {}) {
    const f = validateFilters(filters, true), response = { ok: false, scope: 'observed', total: 0, items: [] };
    if (!db || closed) return { ...response, error: error || 'Usage history is closed' };
    try {
      checkFiles(); const dates = sqlDates(f), values = [f.id, ...dates.values], where = `actor_id=? AND ${dates.clause}`;
      response.total = db.prepare(`SELECT COUNT(*) n FROM events WHERE ${where}`).get(...values).n;
      response.items = db.prepare(`SELECT id,actor_id actorId,at,observed_at observedAt,event,activity,status,tool_name toolName,outcome,source,kind FROM events WHERE ${where} ORDER BY at DESC,id ASC LIMIT ? OFFSET ?`).all(...values, f.limit, f.offset).map(row => ({ ...row }));
      return { ...response, ok: !error, ...(error ? { error } : {}) };
    } catch (cause) { fail('read', cause); return { ...response, error }; }
  }
  function status() {
    let agents = 0, events = 0;
    if (db && !closed) { try { checkFiles(); const counts = db.prepare('SELECT agents,events FROM archive_totals WHERE singleton=1').get(); agents = counts.agents; events = counts.events; } catch (cause) { fail('read', cause); } }
    return { available: !!db && !closed && !error, ...(error ? { error } : {}), path: file, agents, events, timeZone: TIME_ZONE };
  }
  function close() {
    if (closed) return !error;
    if (db) {
      let next;
      transaction(() => { const time = Math.max(clock(), lastClock); next = advance([...tracks].map(([id, state]) => ({ id, ...state })), time); return true; });
      if (next) tracks = next;
      try { db.close(); } catch (cause) { fail('close', cause); }
    }
    closed = true; return !error;
  }
  return Object.freeze({ record, reconcile, query, events, status, close });
}
module.exports = { createUsageLog, TIME_ZONE };
