'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(value + 'T00:00:00Z'))
    || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) throw new TypeError('Invalid usage date');
  return value;
}
function filters(input = {}, detail = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid usage filters');
  const result = {};
  for (const key of ['from', 'to']) if (input[key] !== undefined && input[key] !== '') result[key] = date(input[key]);
  if (result.from && result.to && result.from > result.to) throw new TypeError('Invalid usage date range');
  if (detail) {
    if (typeof input.id !== 'string' || !input.id || input.id.length > 8192 || /[\u0000-\u001f\u007f]/.test(input.id)) throw new TypeError('Invalid usage identity');
    result.id = input.id;
  } else {
    if (input.provider !== undefined && input.provider !== '' && input.provider !== 'all') {
      if (typeof input.provider !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(input.provider)) throw new TypeError('Invalid usage provider');
      result.provider = input.provider;
    }
    if (input.role !== undefined && input.role !== '' && input.role !== 'all') {
      if (!['root', 'helper'].includes(input.role)) throw new TypeError('Invalid usage role');
      result.role = input.role;
    }
  }
  for (const [key, max] of [['offset', Number.MAX_SAFE_INTEGER], ['limit', 200]]) {
    if (input[key] !== undefined) {
      if (!Number.isSafeInteger(input[key]) || input[key] < (key === 'limit' ? 1 : 0) || input[key] > max) throw new TypeError('Invalid usage pagination');
      result[key] = input[key];
    }
  }
  return result;
}
function csvCell(value) {
  let text = String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
  // Quoting alone does not stop spreadsheet formula evaluation.
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
const columns = Object.freeze(['actor_id', 'parent_id', 'provider', 'project', 'first_seen_hk', 'last_seen_hk',
  'observed_active_seconds', 'observed_waiting_seconds', 'turns', 'tool_calls', 'failures', 'events', 'last_status', 'last_activity']);
const hkTime = value => Number.isFinite(value) ? new Date(value + 8 * 3600000).toISOString().replace('T', ' ').slice(0, 19) + ' +08:00' : '';
function csvRow(item) {
  return [item.id, item.parentId, item.provider, item.projectName, hkTime(item.firstSeenAt), hkTime(item.lastSeenAt),
    Math.round((item.activeMs || 0) / 1000), Math.round((item.waitingMs || 0) / 1000), item.turns || 0,
    item.toolCalls || 0, item.failures || 0, item.events || 0, item.status, item.activity].map(csvCell).join(',') + '\r\n';
}
function safeDestination(file) {
  try { const entry = fs.lstatSync(file); if (entry.isSymbolicLink() || !entry.isFile()) throw new Error('Unsafe usage export destination'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

// Native surfaces are supplied by main; tests use temporary local destinations.
function createUsageApi({ log, chooseExport, openFolder, now = Date.now } = {}) {
  if (!log) throw new TypeError('Usage log required');
  let exporting = false;
  return Object.freeze({
    history: input => log.query(filters(input)),
    events: input => log.events(filters(input, true)),
    status: () => log.status(),
    async openFolder() {
      const status = log.status();
      if (!status.available) throw new Error('Usage history is unavailable');
      const error = await openFolder(path.dirname(status.path));
      if (error) throw new Error('Could not open usage history folder');
      return { opened: true };
    },
    async export(input) {
      const selected = filters(input);
      delete selected.offset; delete selected.limit;
      if (exporting) throw new Error('A usage export is already open');
      if (!log.status().available) throw new Error('Usage history is unavailable');
      exporting = true;
      let temporary;
      try {
        const choice = await chooseExport('agent-usage-' + hkTime(now()).slice(0, 10) + '.csv');
        if (choice?.canceled || !choice?.filePath) return { canceled: true };
        const file = path.resolve(choice.filePath);
        safeDestination(file);
        temporary = path.join(path.dirname(file), '.agent-usage-' + randomUUID() + '.tmp');
        const fd = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0), 0o600);
        let rows = 0;
        try {
          fs.writeFileSync(fd, '\ufeff' + columns.map(csvCell).join(',') + '\r\n');
          // Synchronous pages form one main-process snapshot: observer callbacks
          // cannot interleave and move rows between pages during the export.
          for (let offset = 0; ; offset += 200) {
            const result = log.query({ ...selected, offset, limit: 200 });
            if (result.ok === false) throw new Error('Could not read usage history');
            for (const item of result.items) { fs.writeFileSync(fd, csvRow(item)); rows++; }
            if (offset + result.items.length >= result.total) break;
            if (!result.items.length) throw new Error('Usage export pagination failed');
          }
          fs.fsyncSync(fd);
        } finally { fs.closeSync(fd); }
        safeDestination(file);
        fs.renameSync(temporary, file); temporary = null;
        return { exported: true, rows, path: file };
      } finally {
        exporting = false;
        if (temporary) try { fs.unlinkSync(temporary); } catch {}
      }
    },
  });
}

module.exports = { createUsageApi, filters, csvCell };
