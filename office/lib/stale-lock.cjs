'use strict';

// Recover create-exclusive lock files left by a process that died mid-change.
// Only a small regular file owned by this user can be removed, and only when
// its recorded PID is gone, or when it carries no PID and is old.
const fs = require('node:fs');

const PIDLESS_MAX_AGE_MS = 10 * 60 * 1000;
const LIVE_MAX_AGE_MS = 60 * 60 * 1000;

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}

function staleLock(file, { now = Date.now, isAlive = alive } = {}) {
  let stat;
  try { stat = fs.lstatSync(file); } catch { return null; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 4096 || (process.getuid && stat.uid !== process.getuid())) return null;
  let record = {};
  try { const text = fs.readFileSync(file, 'utf8'); if (text.trim()) record = JSON.parse(text); } catch { record = {}; }
  const pid = Number.isSafeInteger(record?.pid) && record.pid > 0 ? record.pid : null;
  const age = now() - stat.mtimeMs;
  if (pid === process.pid) return null;
  if (pid ? !isAlive(pid) || age > LIVE_MAX_AGE_MS : age > PIDLESS_MAX_AGE_MS) return stat;
  return null;
}

// Returns true when a stale lock was removed and the caller may retry once.
function clearStaleLock(file, options) {
  const stat = staleLock(file, options);
  if (!stat) return false;
  try {
    const current = fs.lstatSync(file);
    if (current.ino !== stat.ino || current.dev !== stat.dev) return false;
    fs.unlinkSync(file);
    return true;
  } catch { return false; }
}

// Open a create-exclusive lock, recovering one stale predecessor.
function openLock(file, flags, mode = 0o600, options) {
  try { return fs.openSync(file, flags, mode); }
  catch (error) {
    if (error.code !== 'EEXIST' || !clearStaleLock(file, options)) throw error;
    return fs.openSync(file, flags, mode);
  }
}

module.exports = { staleLock, clearStaleLock, openLock, PIDLESS_MAX_AGE_MS, LIVE_MAX_AGE_MS };
