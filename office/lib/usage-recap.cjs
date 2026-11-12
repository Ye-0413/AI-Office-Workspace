'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { safeDestination } = require('./usage-api.cjs');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_PNG_BYTES = 8 * 1024 * 1024;

function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z'))
    || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) throw new TypeError('Invalid recap date');
  return value;
}
function options(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid recap request');
  if (input.includeProjects !== undefined && typeof input.includeProjects !== 'boolean') throw new TypeError('Invalid recap privacy option');
  return { day: day(input.day), includeProjects: input.includeProjects === true };
}
function png(value) {
  const prefix = 'data:image/png;base64,';
  if (typeof value !== 'string' || !value.startsWith(prefix) || value.length > prefix.length + Math.ceil(MAX_PNG_BYTES / 3) * 4) throw new TypeError('Invalid recap image');
  const bytes = Buffer.from(value.slice(prefix.length), 'base64');
  if (bytes.length < 64 || bytes.length > MAX_PNG_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new TypeError('Invalid recap image');
  return bytes;
}

// Project names leave the log only when the person asks for them; titles,
// prompts and paths never do.
function createUsageRecap({ log, tokens, chooseExport } = {}) {
  if (!log || typeof log.recap !== 'function') throw new TypeError('Usage log required');
  let exporting = false;
  return Object.freeze({
    daily(input) {
      const selected = options(input), result = log.recap(selected.day, { includeProjects: selected.includeProjects });
      let tokenTotal = null;
      try { const usage = tokens?.query?.({ from: selected.day, to: selected.day }); if (usage?.ok) tokenTotal = usage.totals.totalTokens; } catch {}
      return { ...result, tokens: tokenTotal };
    },
    async exportPng(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid recap export');
      const selected = day(input.day), bytes = png(input.png);
      if (exporting) throw new Error('A recap export is already open');
      exporting = true;
      let temporary;
      try {
        const choice = await chooseExport('agent-recap-' + selected + '.png');
        if (choice?.canceled || !choice?.filePath) return { canceled: true };
        const file = path.resolve(choice.filePath);
        safeDestination(file);
        temporary = path.join(path.dirname(file), '.agent-recap-' + randomUUID() + '.tmp');
        const fd = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0), 0o600);
        try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        safeDestination(file);
        fs.renameSync(temporary, file); temporary = null;
        return { exported: true, bytes: bytes.length, path: file };
      } finally {
        exporting = false;
        if (temporary) try { fs.unlinkSync(temporary); } catch {}
      }
    }
  });
}

module.exports = { createUsageRecap, MAX_PNG_BYTES };
