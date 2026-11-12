'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Progression = require('./progression-model.js');
const Persona = require('./agent-persona.js');

// The ledger only remembers when something was first earned. Deleting or
// corrupting it loses those dates, never the unlocks: refresh rebuilds them
// from the usage log, and an earned item stays earned after history pruning.
function createUnlockLedger({ file, log, now = Date.now } = {}) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || typeof log?.lifetime !== 'function') throw new TypeError('Unlock ledger needs an absolute file and a usage log');
  let earned = read(), current = null;

  function read() {
    try {
      const entry = fs.lstatSync(file);
      if (!entry.isFile() || entry.size > 65536) return {};
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (value?.version !== 1 || !value.earned || typeof value.earned !== 'object') return {};
      return Object.fromEntries(Object.entries(value.earned).filter(([key, at]) => /^(keepsake|decoration|growth):[a-z0-9-]+$/.test(key) && Number.isSafeInteger(at) && at > 0));
    } catch { return {}; }
  }
  function write() {
    const temporary = file + '.' + process.pid + '.tmp';
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, earned }), { mode: 0o600 });
      fs.renameSync(temporary, file);
    } catch { try { fs.unlinkSync(temporary); } catch {} }
  }
  function refresh() {
    const lifetime = log.lifetime();
    if (!lifetime?.ok) return current || { ok: false, keepsakes: [], decorations: [], growth: 0, earnedAt: {} };
    const keepsakes = new Set();
    // A companion brings its keepsake once it has finished a real turn.
    for (const actor of lifetime.finishedActors || []) {
      keepsakes.add(Persona.forSession({ provider: actor.provider, id: actor.id }).keepsake);
      if (keepsakes.size === Progression.KEEPSAKES.length) break;
    }
    const result = Progression.evaluate({ ...lifetime, keepsakes: [...keepsakes] }), time = now();
    const keys = [...result.keepsakes.map(id => 'keepsake:' + id), ...result.decorations.map(id => 'decoration:' + id),
      ...Array.from({ length: result.growth }, (_, index) => 'growth:' + (index + 1))];
    let changed = false;
    for (const key of keys) if (!earned[key]) { earned[key] = time; changed = true; }
    if (changed) write();
    const kept = prefix => Object.keys(earned).filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length));
    current = { ...result, ok: true,
      keepsakes: Progression.KEEPSAKES.map(item => item.id).filter(id => kept('keepsake:').includes(id)),
      decorations: Progression.DECORATIONS.map(item => item.id).filter(id => kept('decoration:').includes(id)),
      growth: Math.max(result.growth, ...kept('growth:').map(Number).filter(Number.isSafeInteger)),
      earnedAt: { ...earned } };
    return current;
  }
  return Object.freeze({ refresh, get: () => current || refresh() });
}

module.exports = { createUnlockLedger };
