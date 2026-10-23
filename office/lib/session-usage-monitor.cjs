'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { createParser, rolloutFileInfo } = require('./session-usage-parsers.cjs');

const LIMITS = Object.freeze({ bytes: 3 * 1024 * 1024, perFile: 1024 * 1024, entries: 256, files: 32, recent: 128, fingerprint: 4096, depth: 10 });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// The walker yields directory entries as well as files so discovery has a hard
// per-pass bound even when the source contains many unrelated records.
function* walk(root, depth = 0) {
  let dir;
  try {
    const item = fs.lstatSync(root);
    if (item.isSymbolicLink() || !item.isDirectory()) return;
    dir = fs.opendirSync(root);
    let entry;
    while ((entry = dir.readSync())) {
      yield null;
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const file = path.join(root, entry.name);
      if (entry.isDirectory() && depth < LIMITS.depth) yield* walk(file, depth + 1);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) yield file;
    }
  } catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  finally { dir?.closeSync(); }
}
function sourceRoots({ homeDir, codexHome, claudeHome }) {
  const codex = codexHome || (path.isAbsolute(process.env.CODEX_HOME || '') ? process.env.CODEX_HOME : path.join(homeDir, '.codex'));
  const claude = claudeHome || (path.isAbsolute(process.env.CLAUDE_CONFIG_DIR || '') ? process.env.CLAUDE_CONFIG_DIR : path.join(homeDir, '.claude'));
  return [{ provider: 'codex', dir: path.join(codex, 'sessions') }, { provider: 'codex', dir: path.join(codex, 'archived_sessions') }, { provider: 'claude-code', dir: path.join(claude, 'projects') }];
}

// Independent historical accounting; deliberately has no onEvent/liveStore
// callback. A token import can never create an actor or credit working time.
function createSessionUsageMonitor({ store, homeDir = os.homedir(), codexHome, claudeHome, now = Date.now, intervalMs = 1000 } = {}) {
  if (!store || typeof store.cursor !== 'function' || typeof store.commit !== 'function') throw new TypeError('Token store required');
  const roots = sourceRoots({ homeDir, codexHome, claudeHome });
  const recent = new Map(), backlog = new Map(), pageFiles = new Map();
  let discovery, timer, running = false, scanning = false, closed = false, pending = null, recentOffset = 0;
  let error = '', lastScanAt = null, bytesRead = 0, malformedLines = 0, oversizedLines = 0, rewrites = 0, passes = 0, completedScans = 0;
  function* discover() { const epoch=completedScans+1;for (const source of roots) for (const file of walk(source.dir)) {
    if(!file){yield null;continue;}
    const found={file,provider:source.provider,epoch};
    if(source.provider==='codex'){
      const info=rolloutFileInfo(file);
      if(info.threadId&&info.pageStamp){const key=source.provider+'\0'+file;store.registerPage?.(key,info.threadId,info.pageStamp,path.basename(file));pageFiles.set(digest(key),file);}
    }
    yield found;
  } }
  function read(fd, offset, length, budget) {
    const size = Math.min(length, budget.remaining);
    if (size <= 0) return Buffer.alloc(0);
    const buffer = Buffer.alloc(size), n = fs.readSync(fd, buffer, 0, size, offset);
    bytesRead += n; budget.remaining -= n; return buffer.subarray(0, n);
  }
  function boundary(fd, offset, budget) {
    const length = Math.min(offset, LIMITS.fingerprint);
    if (!length) return { head: digest(''), tail: digest('') };
    const head = read(fd, 0, length, budget), tail = read(fd, offset - length, length, budget);
    if (head.length !== length || tail.length !== length) throw new Error('Incomplete token boundary read');
    return { head: digest(head), tail: digest(tail) };
  }
  function sync(source, budget) {
    const { file, provider } = source, key = provider + '\0' + file;
    const item = fs.lstatSync(file);
    if (!item.isFile() || item.isSymbolicLink()) return false;
    let cursor = store.cursor(key);
    const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
      const opened = fs.fstatSync(fd);
      if (!opened.isFile() || opened.dev !== item.dev || opened.ino !== item.ino) throw new Error('Session file changed while opening');
      const identity = `${opened.dev}:${opened.ino}`;
      if (cursor && (!Number.isSafeInteger(cursor.offset) || cursor.offset < 0 || !Number.isSafeInteger(cursor.ordinal) || cursor.ordinal < 0)) throw new Error('Invalid token file cursor');
      let rewritten = cursor && (cursor.identity !== identity || cursor.offset > opened.size);
      if (cursor && !rewritten) {
        const actual = boundary(fd, cursor.offset, budget);
        rewritten = cursor.head !== actual.head || cursor.tail !== actual.tail;
      }
      // The ledger is permanent (no rollup pruning), so replay after replacement
      // is safe: native request keys upsert instead of being counted twice.
      if (rewritten) { cursor = null; rewrites++; }
      if (cursor?.offset === opened.size && cursor.mtimeMs === opened.mtimeMs && !cursor.skipping) return false;
      const start = cursor?.offset || 0;
      const context = { fileName: path.basename(file), resolveBaseline(sessionId,pageStamp) {
        // Complete the discovered page index before selecting a dependency.
        // A large unfinished page must never be skipped for an older baseline.
        if(source.epoch>completedScans)return null;
        const previous=store.predecessor?.(sessionId,pageStamp,path.basename(file));
        const previousFile=previous&&pageFiles.get(previous.key);
        if(!previousFile)return null;
        const checkpoint=previous.checkpoint,previousStat=fs.lstatSync(previousFile);
        if(!previousStat.isFile()||previousStat.isSymbolicLink()||`${previousStat.dev}:${previousStat.ino}`!==checkpoint.identity||previousStat.size!==checkpoint.offset||previousStat.mtimeMs!==checkpoint.mtimeMs)return null;
        const previousFd=fs.openSync(previousFile,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
        try{const fingerprint=boundary(previousFd,checkpoint.offset,budget);if(fingerprint.head!==checkpoint.head||fingerprint.tail!==checkpoint.tail)return null;}finally{fs.closeSync(previousFd);}
        return previous.counters;
      } };
      if (provider === 'claude-code' && path.basename(path.dirname(file)) === 'subagents') {
        context.parentSessionId = path.basename(path.dirname(path.dirname(file)));
        context.subagentId = path.basename(file, '.jsonl').replace(/^agent-/, '');
      }
      const parser = createParser(provider, cursor?.state, context);
      const bytes = read(fd, start, Math.min(LIMITS.perFile, opened.size - start), budget);
      let consumed = 0, ordinal = cursor?.ordinal || 0, skipping = !!cursor?.skipping;
      const records = [];
      while (consumed < bytes.length) {
        const end = bytes.indexOf(10, consumed);
        if (end === -1) {
          if (skipping || bytes.length - consumed >= LIMITS.perFile) {
            if (!skipping) oversizedLines++;
            consumed = bytes.length; skipping = true;
          }
          break;
        }
        if (!skipping) {
          let row;
          try { row = JSON.parse(bytes.subarray(consumed, end).toString('utf8')); }
          catch { malformedLines++; }
          if (row) records.push(...parser.parse(row, { offset: start + consumed, ordinal }));
        }
        skipping = false; ordinal++; consumed = end + 1;
      }
      const offset = start + consumed;
      if (offset === opened.size && !skipping && typeof parser.flush === 'function') records.push(...parser.flush());
      const stamp = boundary(fd, offset, budget);
      const checkpoint = { identity, offset, ordinal, skipping, ...stamp, mtimeMs: opened.mtimeMs, finished: offset === opened.size && !skipping, state: parser.snapshot() };
      if (!store.commit(key, checkpoint, records)) throw new Error('Token import transaction failed');
      recent.delete(key); recent.set(key, source);
      while (recent.size > LIMITS.recent) recent.delete(recent.keys().next().value);
      return offset < opened.size && bytes.length > consumed && opened.size - offset >= LIMITS.perFile || offset < opened.size && consumed === bytes.length;
    } finally { fs.closeSync(fd); }
  }
  function scan() {
    if (scanning || closed) return status();
    scanning = true;
    const errors = [], candidates = new Map(), budget = { remaining: LIMITS.bytes };
    const add = source => { if (source) candidates.set(source.provider + '\0' + source.file, source); };
    try {
      // Older unfinished files and recent active files both receive a fair
      // share; a huge historical file cannot starve new live token appends.
      for (const [key, source] of [...backlog].slice(0, 12)) { backlog.delete(key); add(source); }
      const active = [...recent.values()];
      for (let i = 0; i < Math.min(12, active.length); i++) add(active[(recentOffset + i) % active.length]);
      if (active.length) recentOffset = (recentOffset + 12) % active.length;
      discovery ||= discover();
      for (let i = 0; i < LIMITS.entries && candidates.size < LIMITS.files; i++) {
        const next = discovery.next();
        if (next.done) { discovery = null; completedScans++; break; }
        add(next.value);
      }
      for (const [key, source] of candidates) {
        if (budget.remaining < 4 * LIMITS.fingerprint + LIMITS.perFile) { backlog.set(key, source); continue; }
        try { if (sync(source, budget)) backlog.set(key, source); }
        catch (cause) {
          if (cause.code === 'ENOENT') recent.delete(key);
          else { backlog.set(key, source); errors.push(cause.code || 'READ_OR_IMPORT'); }
        }
      }
    } catch (cause) { discovery?.return(); discovery = null; errors.push(cause.code || 'DISCOVERY'); }
    finally { scanning = false; lastScanAt = now(); passes++; }
    error = errors.length ? `Session token scan incomplete (${[...new Set(errors)].map(x => String(x).replace(/[^A-Z0-9_]/g, '')).join(', ')})` : '';
    return status();
  }
  function status() {
    const saved = store.status();
    return { ...saved, running, scanning, lastScanAt, bytesRead, malformedLines, oversizedLines, rewrites, passes, completedScans,
      pendingFiles: backlog.size, providers: ['codex', 'claude-code'], ...(error || saved.error ? { error: error || saved.error } : {}) };
  }
  function refresh() {
    if (pending) return pending;
    pending = Promise.resolve().then(scan).finally(() => { pending = null; });
    return pending;
  }
  function start() { if (running || closed) return; running = true; refresh(); timer = setInterval(() => { refresh(); }, intervalMs); timer.unref?.(); }
  function stop() { if (timer) clearInterval(timer); timer = null; running = false; closed = true; discovery?.return(); discovery = null; recent.clear(); backlog.clear();pageFiles.clear(); }
  return Object.freeze({ start, stop, scan, refresh, status });
}
module.exports = { createSessionUsageMonitor, LIMITS };
