'use strict';

// Hook-side record of why an observation was dropped. Each line holds a time,
// provider and fixed reason code only; payloads never reach this file.
const fs = require('node:fs');
const path = require('node:path');

const FILE = 'collector-drops.log';
const MAX_BYTES = 256 * 1024;
const REASONS = Object.freeze(['invalid-json', 'invalid-event', 'too-large', 'timeout', 'stdin-error', 'ignored', 'oversize-record', 'rotation-busy', 'spool-unsafe', 'other']);
// 'ignored' is a host event this app deliberately does not map; it is logged
// but is not lost evidence, so it stays out of visible drop totals.
const SILENT = new Set(['ignored']);
const PROVIDER = /^[a-z0-9][a-z0-9-]{0,63}$/;

function recordDrop(eventsDir, provider, reason, now = Date.now) {
  if (!PROVIDER.test(provider || '')) return false;
  const code = REASONS.includes(reason) ? reason : 'other';
  const file = path.join(eventsDir, FILE);
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW || 0), 0o600);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size >= MAX_BYTES || (process.getuid && stat.uid !== process.getuid())) return false;
    fs.writeSync(fd, `${JSON.stringify({ at: Math.trunc(now()), provider, reason: code })}\n`);
    return true;
  } catch { return false; }
  finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
}

// Main-side incremental reader. poll() returns counts that arrived since the
// previous poll; recent() totals visible drops per provider in a window.
function createDropReader({ eventsDir, now = Date.now, windowMs = 24 * 60 * 60 * 1000, maxRecent = 4096 } = {}) {
  const file = path.join(eventsDir, FILE);
  let offset = 0, identity = null, seeded = false, carry = '';
  const recentDrops = [];
  function read() {
    let stat;
    try { stat = fs.lstatSync(file); } catch { return []; }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) return [];
    const id = `${stat.dev}:${stat.ino}`;
    if (id !== identity || stat.size < offset) { identity = id; offset = 0; carry = ''; }
    if (stat.size === offset) return [];
    const length = Math.min(stat.size - offset, MAX_BYTES);
    const buffer = Buffer.alloc(length);
    const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try { fs.readSync(fd, buffer, 0, length, offset); } finally { fs.closeSync(fd); }
    offset += length;
    const lines = (carry + buffer.toString('utf8')).split('\n');
    carry = lines.pop();
    return lines.flatMap(line => {
      try {
        const value = JSON.parse(line);
        return PROVIDER.test(value?.provider || '') && REASONS.includes(value.reason) && Number.isFinite(value.at) ? [value] : [];
      } catch { return []; }
    });
  }
  function poll() {
    const entries = read(), counts = {};
    for (const entry of entries) {
      if (!SILENT.has(entry.reason)) recentDrops.push({ at: entry.at, provider: entry.provider });
      if (!seeded) continue;
      const row = counts[entry.provider] ||= {};
      row[entry.reason] = (row[entry.reason] || 0) + 1;
    }
    seeded = true;
    if (offset >= MAX_BYTES * 0.75) {
      try { fs.renameSync(file, `${file}.1`); identity = null; offset = 0; carry = ''; } catch {}
    }
    if (recentDrops.length > maxRecent) recentDrops.splice(0, recentDrops.length - maxRecent);
    return counts;
  }
  function recent() {
    const since = now() - windowMs, totals = {};
    for (const entry of recentDrops) if (entry.at >= since) totals[entry.provider] = (totals[entry.provider] || 0) + 1;
    return totals;
  }
  return { poll, recent };
}

module.exports = { FILE, REASONS, recordDrop, createDropReader };
