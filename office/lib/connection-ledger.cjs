'use strict';

// Per-provider evidence times that survive restarts: when the first and the
// most recent accepted event arrived, and when the last test event passed.
// Times only; no session, task or path data is kept.
const fs = require('node:fs');
const path = require('node:path');

const PROVIDER = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FIELDS = ['firstEventAt', 'lastEventAt', 'testPassedAt'];

function createConnectionLedger({ file, now = Date.now, flushMs = 30000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Error('Connection ledger needs an absolute file');
  let rows = {}, timer = null;
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [provider, row] of Object.entries(value?.providers || {})) {
      if (!PROVIDER.test(provider) || !row || typeof row !== 'object') continue;
      const clean = {};
      for (const field of FIELDS) if (Number.isFinite(row[field]) && row[field] > 0) clean[field] = row[field];
      rows[provider] = clean;
    }
  } catch { rows = {}; }

  function flush() {
    if (timer) { clearTimer(timer); timer = null; }
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      const temp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(temp, `${JSON.stringify({ version: 1, providers: rows })}\n`, { mode: 0o600 });
      fs.renameSync(temp, file);
      return true;
    } catch { return false; }
  }
  function schedule() { if (!timer) { timer = setTimer(flush, flushMs); timer?.unref?.(); } }
  function mark(provider, field, at = now()) {
    if (!PROVIDER.test(provider || '') || !Number.isFinite(at)) return;
    const row = rows[provider] ||= {};
    if (field === 'lastEventAt') {
      const first = !row.firstEventAt;
      row.firstEventAt ||= at;
      if (row.lastEventAt && at <= row.lastEventAt) return;
      row.lastEventAt = at;
      if (first) flush(); else schedule();
    } else { row[field] = at; flush(); }
  }
  return {
    recordEvent: (provider, at) => mark(provider, 'lastEventAt', at),
    recordTest: (provider, at) => mark(provider, 'testPassedAt', at),
    get: provider => ({ ...(rows[provider] || {}) }),
    flush,
  };
}

module.exports = { createConnectionLedger };
