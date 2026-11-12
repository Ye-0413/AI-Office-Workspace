'use strict';
// Content-free diagnostics: fixed kinds, short reason codes and counters only.
// Messages, titles, prompts, tool input and paths are never written.
const fs = require('node:fs');
const path = require('node:path');

const KINDS = new Set([
  'app-start', 'renderer-gone', 'renderer-reload', 'renderer-recovery-exhausted',
  'renderer-unresponsive', 'renderer-responsive', 'renderer-error', 'load-failed',
  'main-exception', 'main-rejection', 'ingest-rejections', 'collector-drops',
]);
const MAX_BYTES = 256 * 1024;
const CODE = /^[a-z0-9][a-z0-9._:-]{0,63}$/i;

function code(value) {
  const text = String(value ?? '').trim();
  return CODE.test(text) ? text : 'other';
}

// An error is reduced to its class, its system code and the basename:line of
// the first stack frame inside this application.
function errorCode(error) {
  if (!error || typeof error !== 'object') return { name: code(typeof error) };
  const frame = String(error.stack || '').split('\n').slice(1)
    .map(line => line.match(/([\w.-]+\.(?:c?js|mjs)):(\d+)/)).find(Boolean);
  return {
    name: code(error.name || 'Error'),
    ...(error.code ? { code: code(error.code) } : {}),
    ...(frame ? { at: code(frame[1] + ':' + frame[2]) } : {}),
  };
}

function counts(value) {
  if (!value || typeof value !== 'object') return undefined;
  const out = {};
  for (const [key, count] of Object.entries(value).slice(0, 32)) {
    if (Number.isSafeInteger(count) && count >= 0) out[code(key)] = count;
  }
  return Object.keys(out).length ? out : undefined;
}

function createDiagnosticLog({ dir, now = Date.now, maxBytes = MAX_BYTES } = {}) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new TypeError('Diagnostic log directory must be absolute');
  const file = path.join(dir, 'diagnostics.log');
  let failures = 0;
  function rotate(incoming) {
    let size = 0;
    try { size = fs.statSync(file).size; } catch { return; }
    if (size + incoming <= maxBytes) return;
    fs.renameSync(file, file + '.1');
  }
  function write(kind, details = {}) {
    if (!KINDS.has(kind)) throw new TypeError('Unknown diagnostic kind');
    const entry = { at: new Date(now()).toISOString(), kind };
    if (details.reason !== undefined) entry.reason = code(details.reason);
    if (details.error !== undefined) entry.error = errorCode(details.error);
    if (Number.isSafeInteger(details.count)) entry.count = details.count;
    const tally = counts(details.counts);
    if (tally) entry.counts = tally;
    const line = JSON.stringify(entry) + '\n';
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      rotate(Buffer.byteLength(line));
      fs.appendFileSync(file, line, { mode: 0o600 });
      return entry;
    } catch {
      failures++;
      return null;
    }
  }
  function read() {
    try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)); }
    catch { return []; }
  }
  return { write, read, status: () => ({ path: file, failures }) };
}

module.exports = { createDiagnosticLog, errorCode, KINDS, MAX_BYTES };
