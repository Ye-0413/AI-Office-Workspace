'use strict';

const path = require('node:path');
const SUPPORTED = new Set(['codex', 'claude-code', 'cursor']);
const MARKER = '--mini-office-observer-v1';

// Recognize only the exact command grammar emitted by buildObserverCommand.
// This is a bounded string parser, never a shell evaluator or a path executor.
function isObserverCommandTemplate(command, { provider, events, marker = MARKER } = {}) {
  if (!SUPPORTED.has(provider) || !Array.isArray(events) || marker !== MARKER || typeof command !== 'string' || command.length > 32768 || /[\u0000-\u001f\u007f]/.test(command)) return false;
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
  if (!literal('MINI_OFFICE_DATA_DIR=')) return false;
  const dataDir = quoted();
  if (!literal(' ELECTRON_RUN_AS_NODE=1 ')) return false;
  const runtime = quoted();
  if (!literal(' ')) return false;
  const script = quoted();
  if (!literal(' --provider ')) return false;
  const actualProvider = quoted();
  if (!literal(' --event ')) return false;
  const event = quoted();
  if (!literal(' ' + MARKER) || position !== command.length || actualProvider !== provider || !events.includes(event)) return false;
  const absolute = value => typeof value === 'string' && value.length > 0 && value.length <= 8192 && path.isAbsolute(value) && !value.split(path.sep).includes('..');
  return [dataDir, runtime, script].every(absolute) && path.basename(script) === 'observe.cjs' && path.basename(path.dirname(script)) === 'hooks';
}
module.exports = { isObserverCommandTemplate };
