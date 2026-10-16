'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { actorKey } = require('./provider-events.cjs');

const TIME_ZONE = 'Asia/Hong_Kong';
const LIMITS = Object.freeze({ days: 14, actors: 8192, bytes: 2 * 1024 * 1024, flushMs: 500 });
const DAY = 86400000, HK_OFFSET = 8 * 3600000;
const POSITIVE = new Set(['turn-start', 'subagent-start', 'tool-start', 'tool-end', 'activity', 'waiting-user', 'turn-end', 'interrupted']);
const dayNumber = at => Math.floor((at + HK_OFFSET) / DAY);
const dateFor = day => new Date(day * DAY).toISOString().slice(0, 10);
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\s\u0000-\u001f\u007f]/.test(value);
const fileDate = name => /^(\d{4}-\d{2}-\d{2})\.json$/.exec(name)?.[1];

function stat(file) { try { return fs.lstatSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; return null; } }
function directory(dir, create) {
  const absolute = path.resolve(dir);
  let current = path.parse(absolute).root;
  for (const piece of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, piece);
    let entry = stat(current);
    if (!entry && create) { fs.mkdirSync(current, { mode: 0o700 }); entry = stat(current); }
    if (!entry) return false;
    // macOS exposes these fixed OS aliases as links, including os.tmpdir().
    const aliases = process.platform === 'darwin' ? { '/var': '/private/var', '/tmp': '/private/tmp', '/etc': '/private/etc' } : {};
    if (entry.isSymbolicLink() && aliases[current] && fs.realpathSync(current) === aliases[current]) continue;
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error('Unsafe activity statistics directory');
  }
  return true;
}

// Call record ONLY after SessionStore accepts a real observed event. No log
// rescans, synthetic sessions, titles or original actor identifiers are stored.
function createActivityStats({ dataDir, now = Date.now } = {}) {
  if (typeof dataDir !== 'string' || !path.isAbsolute(dataDir)) throw new TypeError('Activity statistics require an absolute data directory');
  const dir = path.join(dataDir, 'activity-stats');
  const days = new Map(), dirty = new Set(), blockedFiles = new Set();
  let timer = null, closed = false, cleanup = false, loadError = '', writeError = '', capacityError = '', capacityDate = '';
  const today = () => dayNumber(now());
  const currentDates = () => Array.from({ length: LIMITS.days }, (_, i) => dateFor(today() - i));
  const failure = (action, error) => `Activity statistics ${action} failed${error?.code ? ` (${error.code})` : ''}`;
  function prune() {
    const allowed = new Set(currentDates());
    for (const date of days.keys()) if (!allowed.has(date)) { days.delete(date); dirty.delete(date); cleanup = true; }
    if (capacityDate !== dateFor(today())) { capacityError = ''; capacityDate = ''; }
  }
  function read(file, expectedDate) {
    const entry = stat(file);
    if (!entry || entry.isSymbolicLink() || !entry.isFile() || entry.size > LIMITS.bytes) throw new Error('Unsafe activity statistics file');
    const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    let saved;
    try {
      const opened = fs.fstatSync(fd);
      if (!opened.isFile() || opened.size > LIMITS.bytes || opened.ino !== entry.ino || opened.dev !== entry.dev) throw new Error('Activity statistics file changed');
      saved = JSON.parse(fs.readFileSync(fd, 'utf8'));
    } finally { fs.closeSync(fd); }
    if (saved?.version !== 1 || saved.date !== expectedDate || saved.timeZone !== TIME_ZONE
      || !saved.actors || typeof saved.actors !== 'object' || Array.isArray(saved.actors)) throw new Error('Invalid activity statistics');
    const entries = Object.entries(saved.actors);
    if (entries.length > LIMITS.actors || entries.some(([hash, helper]) => !/^[a-f0-9]{64}$/.test(hash) || ![0, 1].includes(helper))) throw new Error('Invalid activity statistics identities');
    return new Map(entries);
  }
  try {
    if (directory(dir, false)) {
      const allowed = new Set(currentDates());
      for (const name of fs.readdirSync(dir)) {
        const date = fileDate(name);
        if (!date) continue;
        if (!allowed.has(date)) { cleanup = true; continue; }
        try { days.set(date, read(path.join(dir, name), date)); }
        catch (error) { blockedFiles.add(date); loadError = failure('load', error); }
      }
    }
  } catch (error) { loadError = failure('load', error); }

  function schedule() {
    if (timer || closed) return;
    timer = setTimeout(() => { timer = null; flush(); }, LIMITS.flushMs);
    timer.unref?.();
  }
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    prune();
    if (!dirty.size && !cleanup) return !writeError;
    try {
      directory(dir, true);
      for (const date of [...dirty]) {
        if (blockedFiles.has(date)) throw new Error('Existing activity statistics could not be verified');
        const file = path.join(dir, date + '.json'), entry = stat(file);
        if (entry && (entry.isSymbolicLink() || !entry.isFile() || entry.size > LIMITS.bytes)) throw new Error('Unsafe activity statistics destination');
        const content = JSON.stringify({ version: 1, date, timeZone: TIME_ZONE, actors: Object.fromEntries(days.get(date) || []) }) + '\n';
        if (Buffer.byteLength(content) > LIMITS.bytes) throw new Error('Activity statistics file limit reached');
        const temporary = path.join(dir, `.${date}.${randomUUID()}.tmp`);
        try {
          const fd = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0), 0o600);
          try { fs.writeFileSync(fd, content); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
          directory(dir, false);
          const destination = stat(file);
          if (destination && (destination.isSymbolicLink() || !destination.isFile())) throw new Error('Activity statistics destination changed');
          fs.renameSync(temporary, file); dirty.delete(date);
        } finally { if (stat(temporary)) fs.unlinkSync(temporary); }
      }
      if (cleanup) {
        const allowed = new Set(currentDates());
        for (const name of fs.readdirSync(dir)) {
          const date = fileDate(name);
          if (!date || allowed.has(date)) continue;
          const file = path.join(dir, name), entry = stat(file);
          if (entry?.isSymbolicLink() || !entry?.isFile()) throw new Error('Unsafe expired activity statistics file');
          fs.unlinkSync(file);
        }
        cleanup = false;
      }
      writeError = ''; return true;
    } catch (error) { writeError = failure('save', error); return false; }
  }
  function record(event) {
    if (closed || !event || !identifier(event.provider) || !identifier(event.sessionId)
      || event.subagentId !== undefined && !identifier(event.subagentId)) return false;
    const endedSnapshot = event.event === 'metadata' && event.provider === 'codex' && event.evidence?.source === 'codex-jsonl'
      && event.evidence.snapshot === 'ended-turn' && event.evidence.rawEvent === 'rollout:ended-turn-snapshot' && event.evidence.restored === true
      && Number.isFinite(event.turnStartedAt) && Number.isFinite(event.turnEndedAt) && event.turnEndedAt >= event.turnStartedAt;
    if (!POSITIVE.has(event.event) && !endedSnapshot) return false;
    const at = typeof event.at === 'number' ? event.at : typeof event.at === 'string' && event.at.trim() ? Date.parse(event.at) : NaN;
    if (!Number.isFinite(at) || at < 0 || endedSnapshot && event.turnEndedAt !== at) return false;
    const day = dayNumber(at), current = today();
    if (day > current || day < current - LIMITS.days + 1) return false;
    prune();
    const date = dateFor(day), hash = createHash('sha256').update(actorKey(event.provider, event.sessionId, event.subagentId)).digest('hex');
    const helper = event.parentId || event.subagentId ? 1 : 0;
    let entries = days.get(date);
    if (!entries) { entries = new Map(); days.set(date, entries); }
    if (entries.has(hash) && (entries.get(hash) === 1 || !helper)) return false;
    if (!entries.has(hash) && entries.size >= LIMITS.actors) { capacityDate = date; capacityError = 'Activity statistics daily identity limit reached'; return false; }
    entries.set(hash, helper); dirty.add(date); schedule(); return true;
  }
  function snapshot() {
    prune();
    if (cleanup) schedule();
    const date = dateFor(today()), values = [...(days.get(date)?.values() || [])], helpers = values.reduce((sum, helper) => sum + helper, 0);
    const error = [loadError, writeError, capacityError].filter(Boolean).join('; ');
    return { date, timeZone: TIME_ZONE, total: values.length, roots: values.length - helpers, helpers, scope: 'observed', ...(error ? { error } : {}) };
  }
  function close() { const result = flush(); closed = true; return result; }
  if (cleanup) schedule();
  return Object.freeze({ record, snapshot, flush, close });
}

module.exports = { createActivityStats, LIMITS };
