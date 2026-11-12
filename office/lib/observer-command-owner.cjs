'use strict';

const fs = require('node:fs');
const path = require('node:path');
const SUPPORTED = new Set(['codex', 'claude-code', 'cursor']);
const MARKER = '--mini-office-observer-v1';
const PROVIDER_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

function absolute(value) { return typeof value === 'string' && value.length > 0 && value.length <= 8192 && path.isAbsolute(value) && !value.split(path.sep).includes('..'); }
function invocation(value) {
  if (!value || !PROVIDER_ID.test(value.provider || '') || typeof value.event !== 'string' || !value.event || value.event.length > 96) return null;
  if (![value.dataDir, value.runtime, value.script].every(absolute) || path.basename(value.script) !== 'observe.cjs' || path.basename(path.dirname(value.script)) !== 'hooks') return null;
  return value;
}

// Recognize only the exact command grammar emitted by buildObserverCommand.
// This is a bounded string parser, never a shell evaluator or a path executor.
function parseObserverCommand(command) {
  if (typeof command !== 'string' || command.length > 32768 || /[\u0000-\u001f\u007f]/.test(command)) return null;
  let position = 0;
  function literal(value) { if (!command.startsWith(value, position)) return false; position += value.length; return true; }
  function quoted() {
    if (command[position++] !== "'") return null;
    let value = '';
    while (position < command.length) {
      const char = command[position++];
      if (char !== "'") { value += char; continue; }
      // buildObserverCommand encodes an apostrophe as close quote, escaped
      // apostrophe, open quote. No other unquoted shell syntax is accepted.
      if (command.slice(position, position + 3) === "\\''") { value += "'"; position += 3; continue; }
      return value;
    }
    return null;
  }
  if (!literal('MINI_OFFICE_DATA_DIR=')) return null;
  const dataDir = quoted();
  if (!literal(' ELECTRON_RUN_AS_NODE=1 ')) return null;
  const runtime = quoted();
  if (!literal(' ')) return null;
  const script = quoted();
  if (!literal(' --provider ')) return null;
  const provider = quoted();
  if (!literal(' --event ')) return null;
  const event = quoted();
  if (!literal(' ' + MARKER) || position !== command.length) return null;
  return invocation({ dataDir, runtime, script, provider, event });
}

// The argv form used by process-shaped hosts (ZCode, MiniMax).
function parseObserverArgs(args) {
  if (!Array.isArray(args) || args.length !== 9 || !args.every(item => typeof item === 'string' && !/[\u0000-\u001f\u007f]/.test(item))) return null;
  const [data, run, runtime, script, providerFlag, provider, eventFlag, event, marker] = args;
  if (!data.startsWith('MINI_OFFICE_DATA_DIR=') || run !== 'ELECTRON_RUN_AS_NODE=1' || providerFlag !== '--provider' || eventFlag !== '--event' || marker !== MARKER) return null;
  return invocation({ dataDir: data.slice('MINI_OFFICE_DATA_DIR='.length), runtime, script, provider, event });
}

function ownedInvocation(parsed, { provider, events } = {}) {
  return Boolean(parsed && parsed.provider === provider && Array.isArray(events) && events.includes(parsed.event));
}

function isObserverCommandTemplate(command, { provider, events, marker = MARKER } = {}) {
  if (!SUPPORTED.has(provider) || marker !== MARKER) return false;
  return ownedInvocation(parseObserverCommand(command), { provider, events });
}

// 'current' when an owned invocation targets this app copy, otherwise why it
// is stale: 'missing' when its runtime or script no longer exists, or
// 'other-copy' when it points at another installed copy or data folder.
function invocationPathState(parsed, { dataDir, electronPath, appRoot } = {}, exists = fs.existsSync) {
  if (!parsed) return null;
  if (parsed.dataDir === dataDir && parsed.runtime === electronPath && parsed.script === path.join(appRoot, 'hooks', 'observe.cjs')) return 'current';
  let present = false;
  try { present = exists(parsed.runtime) && exists(parsed.script); } catch {}
  return present ? 'other-copy' : 'missing';
}

// Plugin folders record the same three paths in observer-config.json bytes.
function configPathState(bytes, current, exists) {
  let value; try { value = JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString('utf8') : bytes); } catch { return null; }
  const parsed = value && [value.dataDir, value.electronPath, value.observer].every(absolute) ? { dataDir: value.dataDir, runtime: value.electronPath, script: value.observer } : null;
  return parsed ? invocationPathState(parsed, current, exists) : null;
}

// Combine per-entry states into one connection summary.
function staleSummary(states) {
  const stale = states.filter(state => state && state !== 'current');
  if (!stale.length) return {};
  return { stale: true, staleReason: stale.includes('missing') ? 'missing' : 'other-copy', staleCount: stale.length };
}

module.exports = { MARKER, isObserverCommandTemplate, parseObserverCommand, parseObserverArgs, ownedInvocation, invocationPathState, configPathState, staleSummary };
