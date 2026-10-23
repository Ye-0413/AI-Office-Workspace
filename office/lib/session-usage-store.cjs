'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { filters } = require('./usage-api.cjs');
const TIME_ZONE = 'Asia/Hong_Kong';
const FIELDS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'];
const hash = value => createHash('sha256').update(value).digest('hex');
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 512 && !/[\u0000-\u001f\u007f]/.test(value);
const date = at => new Date(at + 8 * 3600000).toISOString().slice(0, 10);
const empty = () => ({ requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 0 });
function stat(file) { try { return fs.lstatSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; return null; } }
function directory(dir) {
  let current = path.parse(dir).root;
  for (const part of dir.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let item = stat(current);
    if (!item) { fs.mkdirSync(current, { mode: 0o700 }); item = stat(current); }
    const aliases = process.platform === 'darwin' ? { '/var': '/private/var', '/tmp': '/private/tmp' } : {};
    if (item.isSymbolicLink() && aliases[current] && fs.realpathSync(current) === aliases[current]) continue;
    if (item.isSymbolicLink() || !item.isDirectory()) throw new Error('Unsafe token history directory');
  }
  const item = stat(dir);
  if (process.getuid && item.uid !== process.getuid()) throw new Error('Unsafe token history owner');
  fs.chmodSync(dir, 0o700);
  return item;
}
function safeFile(file) {
  const item = stat(file);
  if (!item) return null;
  if (item.isSymbolicLink() || !item.isFile() || item.nlink !== 1 || process.getuid && item.uid !== process.getuid()) throw new Error('Unsafe token history file');
  fs.chmodSync(file, 0o600);
  return item;
}

// Adapted from CC Switch's local session importer: a permanent request ledger
// and cursor move in the same transaction. Paths are hashed, transcripts never
// enter this database, and imported usage never enters the live session reducer.
function createSessionUsageStore({ dataDir } = {}) {
  if (typeof dataDir !== 'string' || !path.isAbsolute(dataDir)) throw new TypeError('Absolute token data directory required');
  const dir = path.join(dataDir, 'usage-history'), file = path.join(dir, 'tokens.sqlite3');
  let db, dirIdentity, fileIdentity, closed = false, error = '', revision = 0, summaryCache;
  const fail = (action, cause) => { error = `Token history ${action} failed${cause?.code ? ' (' + String(cause.code).replace(/[^A-Z0-9_]/g, '') + ')' : ''}`; };
  function check() {
    const d = directory(dir);
    if (d.dev !== dirIdentity.dev || d.ino !== dirIdentity.ino) throw new Error('Token directory changed');
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      const item = safeFile(file + suffix);
      if (!suffix && (!item || item.dev !== fileIdentity.dev || item.ino !== fileIdentity.ino)) throw new Error('Token database changed');
    }
  }
  try {
    dirIdentity = directory(dir);
    for (const suffix of ['', '-wal', '-shm', '-journal']) safeFile(file + suffix);
    if (!stat(file)) fs.closeSync(fs.openSync(file, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600));
    fileIdentity = safeFile(file);
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(file);
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=2000;
      CREATE TABLE IF NOT EXISTS token_requests (
        key TEXT PRIMARY KEY, provider TEXT NOT NULL, session_id TEXT NOT NULL,
        parent_id TEXT NOT NULL, model TEXT NOT NULL, at INTEGER NOT NULL, day TEXT NOT NULL,
        inputTokens INTEGER NOT NULL, outputTokens INTEGER NOT NULL,
        cacheReadTokens INTEGER NOT NULL, cacheWriteTokens INTEGER NOT NULL, reasoningTokens INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS token_days ON token_requests(day,provider);
      CREATE TABLE IF NOT EXISTS token_cursors (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS token_baselines (key TEXT PRIMARY KEY,session_id TEXT NOT NULL,page_stamp TEXT NOT NULL,counters TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS token_baseline_session ON token_baselines(session_id,page_stamp);
      CREATE TABLE IF NOT EXISTS token_source_pages(key TEXT PRIMARY KEY,session_id TEXT NOT NULL,page_stamp TEXT NOT NULL,native_name TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS token_source_page_order ON token_source_pages(session_id,page_stamp);
      PRAGMA user_version=1;`);
    check();
  } catch (cause) { fail('open', cause); try { db?.close(); } catch {} db = null; }
  function ready() { if (!db || closed) throw new Error('Token history unavailable'); check(); }
  function cursor(key) {
    try { ready(); const row = db.prepare('SELECT value FROM token_cursors WHERE key=?').get(hash(key)); return row ? JSON.parse(row.value) : null; }
    catch (cause) { fail('cursor read', cause); throw new Error(error); }
  }
  function commit(key, checkpoint, records) {
    let transaction = false;
    try {
      ready();
      const saved = JSON.stringify(checkpoint);
      if (saved.length > 256 * 1024 || !Array.isArray(records)) throw new TypeError('Invalid token checkpoint');
      for (const r of records) {
        if (!identifier(r.key) || !['codex', 'claude-code', 'gemini-cli', 'pi', 'omp', 'opencode', 'kimi-cli'].includes(r.provider) || !identifier(r.sessionId)
          || r.parentSessionId && !identifier(r.parentSessionId) || !identifier(r.model)
          || !Number.isSafeInteger(r.at) || r.at < 0 || r.at > 253402214399999
          || FIELDS.some(f => !Number.isSafeInteger(r[f]) || r[f] < 0 || r[f] > 1e12)) throw new TypeError('Invalid token record');
      }
      db.exec('BEGIN IMMEDIATE'); transaction = true;
      const statement = db.prepare(`INSERT INTO token_requests VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(key) DO UPDATE SET
        inputTokens=MAX(inputTokens,excluded.inputTokens),outputTokens=MAX(outputTokens,excluded.outputTokens),
        cacheReadTokens=MAX(cacheReadTokens,excluded.cacheReadTokens),cacheWriteTokens=MAX(cacheWriteTokens,excluded.cacheWriteTokens),
        reasoningTokens=MAX(reasoningTokens,excluded.reasoningTokens),
        parent_id=CASE WHEN excluded.parent_id<>'' THEN excluded.parent_id ELSE parent_id END,
        model=CASE WHEN model='unknown' THEN excluded.model ELSE model END`);
      for (const r of records) statement.run(hash(r.provider + '\0' + r.key), r.provider, r.sessionId, r.parentSessionId || '', r.model, r.at, date(r.at), ...FIELDS.map(f => r[f]));
      db.prepare('INSERT INTO token_cursors VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(hash(key), saved);
      const state = checkpoint.state;
      db.prepare('DELETE FROM token_baselines WHERE key=?').run(hash(key));
      if (checkpoint.finished && state?.provider === 'codex' && identifier(state.sessionId) && identifier(state.pageStamp)
        && state.highWater && ['input','read','write','output','reasoning'].every(f => Number.isSafeInteger(state.highWater[f]) && state.highWater[f] >= 0)) {
        db.prepare('INSERT INTO token_baselines VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET session_id=excluded.session_id,page_stamp=excluded.page_stamp,counters=excluded.counters')
          .run(hash(key),state.sessionId,state.pageStamp,JSON.stringify(state.highWater));
      }
      check(); db.exec('COMMIT'); transaction = false; error = ''; return true;
    } catch (cause) { if (transaction) try { db.exec('ROLLBACK'); } catch {} fail('save', cause); return false; }
  }
  function baseline(sessionId, pageStamp) {
    return predecessor(sessionId,pageStamp)?.counters || null;
  }
  function registerPage(key,sessionId,pageStamp,nativeName) {
    ready();if(!identifier(sessionId)||!identifier(pageStamp)||!identifier(nativeName))throw new TypeError('Invalid Codex source page');
    db.prepare('INSERT INTO token_source_pages VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET session_id=excluded.session_id,page_stamp=excluded.page_stamp,native_name=excluded.native_name').run(hash(key),sessionId,pageStamp,nativeName);
  }
  function predecessor(sessionId,pageStamp,nativeName) {
    ready();
    if (!identifier(sessionId) || !identifier(pageStamp)) return null;
    if(nativeName&&db.prepare('SELECT 1 FROM token_source_pages WHERE session_id=? AND page_stamp=? AND native_name<>? LIMIT 1').get(sessionId,pageStamp,nativeName))return null;
    const row=db.prepare(`SELECT p.key,p.native_name,b.counters,c.value FROM token_source_pages p
      LEFT JOIN token_baselines b ON b.key=p.key LEFT JOIN token_cursors c ON c.key=p.key
      WHERE p.session_id=? AND p.page_stamp<? ORDER BY p.page_stamp DESC,p.native_name DESC LIMIT 1`).get(sessionId,pageStamp);
    if(!row?.counters||!row.value)return null;
    const checkpoint=JSON.parse(row.value);if(!checkpoint.finished)return null;
    return{key:row.key,counters:JSON.parse(row.counters),checkpoint};
  }
  const sum = `COUNT(*) requests,COALESCE(SUM(inputTokens),0) inputTokens,COALESCE(SUM(outputTokens),0) outputTokens,
    COALESCE(SUM(cacheReadTokens),0) cacheReadTokens,COALESCE(SUM(cacheWriteTokens),0) cacheWriteTokens,
    COALESCE(SUM(reasoningTokens),0) reasoningTokens`;
  function totals(row) {
    const result = { ...row, totalTokens: row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens };
    if (Object.values(result).some(v => typeof v === 'number' && !Number.isSafeInteger(v))) throw new Error('Token total exceeds safe range');
    return result;
  }
  function query(input = {}) {
    const f = filters(input), where = [], values = [];
    if (f.provider) { where.push('provider=?'); values.push(f.provider === 'claude' ? 'claude-code' : f.provider); }
    for (const [key, op] of [['from', '>='], ['to', '<=']]) if (f[key]) { where.push('day' + op + '?'); values.push(f[key]); }
    if (f.role === 'root') where.push("parent_id=''");
    if (f.role === 'helper') where.push("parent_id<>''");
    const response = { ok: false, scope: 'session-logs', timeZone: TIME_ZONE, totals: empty(), models: [] };
    try {
      ready(); const sql = where.length ? ' WHERE ' + where.join(' AND ') : '';
      response.totals = totals(db.prepare('SELECT ' + sum + ' FROM token_requests' + sql).get(...values));
      response.models = db.prepare('SELECT provider,model,' + sum + ' FROM token_requests' + sql + ' GROUP BY provider,model ORDER BY SUM(inputTokens+outputTokens+cacheReadTokens+cacheWriteTokens) DESC,provider,model LIMIT 100').all(...values).map(totals);
      return { ...response, ok: true };
    } catch (cause) { fail('read', cause); return { ...response, error }; }
  }
  function status() {
    let requests = 0, files = 0;
    try { ready(); requests = db.prepare('SELECT COUNT(*) n FROM token_requests').get().n; files = db.prepare('SELECT COUNT(*) n FROM token_cursors').get().n; }
    catch (cause) { if (!closed) fail('read', cause); }
    return { available: !!db && !closed && !error, requests, files, ...(error ? { error } : {}) };
  }
  function summary(at = Date.now()) {
    const today = date(at), midnight = Date.parse(today+'T00:00:00Z'), weekday = new Date(midnight).getUTCDay();
    const weekFrom = new Date(midnight-((weekday+6)%7)*86400000).toISOString().slice(0,10);
    const weekTo = new Date(Date.parse(weekFrom+'T00:00:00Z')+6*86400000).toISOString().slice(0,10);
    // The main process broadcasts on every real event. Reuse aggregates until
    // a token batch or natural-day boundary actually changes the inputs.
    if (!summaryCache || summaryCache.date !== today || summaryCache.revision !== revision) {
      const daily = query({from:today,to:today}), weekly = query({from:weekFrom,to:weekTo});
      summaryCache = {date:today,weekFrom,weekTo,timeZone:TIME_ZONE,dailyTokens:daily.totals.totalTokens,weeklyTokens:weekly.totals.totalTokens,revision,available:daily.ok&&weekly.ok};
    }
    const {revision:ignored,...result} = summaryCache;
    return {...result,available:result.available&&!error,...(error?{error}:{})};
  }
  function close() { if (closed) return; closed = true; try { db?.close(); } catch (cause) { fail('close', cause); } }
  return Object.freeze({ cursor, commit(key, checkpoint, records) { const result=commit(key,checkpoint,records);if(result&&records.length)revision++;return result; }, baseline, predecessor, registerPage, query, summary, status, close });
}
module.exports = { createSessionUsageStore, TIME_ZONE };
