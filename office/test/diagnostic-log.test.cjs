'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDiagnosticLog, errorCode } = require('../lib/diagnostic-log.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'office-diagnostics-'));

test('entries keep fixed kinds, reason codes and counters but never free text', () => {
  const dir = tmp(), log = createDiagnosticLog({ dir, now: () => Date.UTC(2026, 10, 12) });
  log.write('renderer-gone', { reason: 'crashed', count: 2 });
  log.write('renderer-gone', { reason: 'Fix the login page for /Users/me/secret-project' });
  log.write('ingest-rejections', { counts: { duplicate: 4, 'turn fence with spaces': 1, negative: -1 } });
  const lines = log.read();
  assert.deepEqual(lines[0], { at: '2026-11-12T00:00:00.000Z', kind: 'renderer-gone', reason: 'crashed', count: 2 });
  assert.equal(lines[1].reason, 'other');
  assert.deepEqual(lines[2].counts, { duplicate: 4, other: 1 });
  const raw = fs.readFileSync(path.join(dir, 'diagnostics.log'), 'utf8');
  assert.doesNotMatch(raw, /secret|login|Users/);
  assert.equal(fs.statSync(path.join(dir, 'diagnostics.log')).mode & 0o777, 0o600);
  assert.throws(() => log.write('free-form'), /Unknown diagnostic kind/);
});

test('errors are reduced to name, code and an application frame without the message', () => {
  const error = new Error('cannot read /Users/me/project/prompt.txt');
  error.code = 'ENOENT';
  const reduced = errorCode(error);
  assert.equal(reduced.name, 'Error');
  assert.equal(reduced.code, 'ENOENT');
  assert.match(reduced.at, /^diagnostic-log\.test\.cjs:\d+$/);
  assert.doesNotMatch(JSON.stringify(reduced), /prompt|Users/);
});

test('the log rotates to one bounded backup', () => {
  const dir = tmp(), log = createDiagnosticLog({ dir, maxBytes: 400 });
  for (let i = 0; i < 20; i++) log.write('renderer-error');
  const current = fs.statSync(path.join(dir, 'diagnostics.log')).size;
  assert.ok(current <= 400, String(current));
  assert.ok(fs.existsSync(path.join(dir, 'diagnostics.log.1')));
  assert.equal(fs.readdirSync(dir).length, 2);
});

test('a write failure is counted instead of thrown', () => {
  const dir = tmp(), blocked = path.join(dir, 'file');
  fs.writeFileSync(blocked, '');
  const log = createDiagnosticLog({ dir: blocked });
  assert.equal(log.write('app-start'), null);
  assert.equal(log.status().failures, 1);
});
