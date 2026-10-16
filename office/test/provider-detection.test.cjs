'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { enrichConnections } = require('../lib/provider-detection.cjs');
function fixture(t) {
  const homeDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'office-detection-'));
  t.after(() => fs.rmSync(homeDir, { recursive: true, force: true }));
  function write(parts, content = 'fixture', mode = 0o600) { const file = path.join(homeDir, ...parts); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, { mode }); return file; }
  const options = { homeDir, env: { PATH: '' }, platform: 'win32' };
  return { homeDir, write, options, detect: (connections, extra) => enrichConnections(connections, { ...options, ...extra }) };
}
test('Finder-style empty PATH still finds executable CLIs in fixed local bin folders without running them', t => {
  const f = fixture(t), sentinel = path.join(f.homeDir, 'must-not-run');
  f.write(['.local', 'bin', 'codex.exe'], '#!/bin/sh\ntouch ' + sentinel + '\n', 0o700);
  f.write(['bin', 'claude.exe'], '#!/bin/sh\nexit 0\n', 0o700);
  f.write(['bin', 'cursor.exe'], '#!/bin/sh\nexit 0\n', 0o700);
  const input = ['codex', 'claude', 'cursor'].map(provider => ({ provider, available: false, installed: false, watching: false, detail: 'original trust detail' }));
  const result = f.detect(input); assert.ok(result.every(row => row.available));
  assert.deepEqual(result.map(row => row.provider), ['codex', 'claude', 'cursor']);
  assert.ok(result.every(row => row.installed === false && row.watching === false && row.detail === 'original trust detail'));
  assert.ok(input.every(row => row.available === false)); assert.equal(fs.existsSync(sentinel), false);
});
test('PATH and common npm executable symlinks are accepted but nonexecutable files and directories are not', t => {
  const f = fixture(t), directory = path.join(f.homeDir, 'custom-bin'); fs.mkdirSync(directory);
  const target = f.write(['package', 'codex-launcher'], '#!/bin/sh\nexit 0', 0o700); fs.symlinkSync(target, path.join(directory, 'codex.exe'));
  f.write(['.local', 'bin', 'claude.exe'], 'not executable', 0o600); fs.mkdirSync(path.join(directory, 'cursor.exe'));
  const result = f.detect(['codex', 'claude-code', 'cursor-agent'].map(provider => ({ provider, available: false })), { env: { PATH: directory } });
  assert.equal(result[0].available, true); assert.equal(result[1].available, false); assert.equal(result[2].available, false);
});
test('Gemini settings do not prove Antigravity and a shared .gemini directory alone proves neither', t => {
  const f = fixture(t), input = ['gemini-cli', 'antigravity-cli'].map(provider => ({ provider, available: true, installed: false }));
  fs.mkdirSync(path.join(f.homeDir, '.gemini'));
  assert.deepEqual(f.detect(input).map(row => row.available), [false, false]);
  f.write(['.gemini', 'settings.json'], '{}');
  assert.deepEqual(f.detect(input).map(row => row.available), [true, false]);
  assert.equal(fs.existsSync(path.join(f.homeDir, '.gemini', 'config')), false, 'detection never creates Antigravity directories');
  f.write(['.gemini', 'config', 'hooks.json'], '{}'); assert.deepEqual(f.detect(input).map(row => row.available), [true, true]);
});
test('registry-specific gemini and agy executables prove only their own CLI', t => {
  const f = fixture(t), rows = [{ provider: 'gemini-cli', available: false }, { provider: 'antigravity-cli', available: false }];
  const agy = f.write(['bin', 'agy.exe'], 'fixture', 0o700); assert.deepEqual(f.detect(rows).map(row => row.available), [false, true]);
  fs.unlinkSync(agy); f.write(['bin', 'gemini.exe'], 'fixture', 0o700); assert.deepEqual(f.detect(rows).map(row => row.available), [true, false]);
});
test('provider-specific config evidence refuses symlink files, symlink parents and directory lookalikes', t => {
  const f = fixture(t), row = [{ provider: 'antigravity-cli', available: true, installed: true, detail: 'Keep native trust', watching: false }];
  const target = f.write(['foreign', 'hooks.json'], '{}'); const dir = path.join(f.homeDir, '.gemini', 'config'); fs.mkdirSync(dir, { recursive: true }); fs.symlinkSync(target, path.join(dir, 'hooks.json'));
  assert.equal(f.detect(row)[0].available, false); fs.unlinkSync(path.join(dir, 'hooks.json')); fs.rmdirSync(dir); fs.symlinkSync(path.dirname(target), dir);
  assert.equal(f.detect(row)[0].available, false); fs.unlinkSync(dir); fs.mkdirSync(path.join(dir, 'hooks.json'), { recursive: true });
  const result = f.detect(row)[0]; assert.equal(result.available, false); assert.equal(result.installed, true); assert.equal(result.detail, 'Keep native trust');
});
test('existing app proof and all unrelated providers retain their previous state', t => {
  const f = fixture(t), rows = [
    { provider: 'codex', available: true, installed: true, watching: true, detail: 'Codex app detected' },
    { provider: 'hermes', available: true, installed: true, detail: 'Gateway reload instructions' },
    { provider: 'unknown', available: true, installed: false, detail: 'untouched' }
  ];
  const result = f.detect(rows); assert.equal(result[0].available, true); assert.equal(result[0].watching, true); assert.equal(result[0].detail, rows[0].detail);
  assert.deepEqual(result[1], rows[1]); assert.deepEqual(result[2], rows[2]);
});
test('macOS uses Unix executable names with an injected home and performs no startup mutation', t => {
  const f = fixture(t); f.write(['.local', 'bin', 'codex'], 'fixture', 0o700);
  const before = fs.readdirSync(f.homeDir);
  const result = f.detect([{ provider: 'codex', available: false }], { platform: 'darwin' }); assert.equal(result[0].available, true);
  assert.deepEqual(fs.readdirSync(f.homeDir), before);
  assert.throws(() => enrichConnections([], { homeDir: 'relative' }), TypeError);
});
