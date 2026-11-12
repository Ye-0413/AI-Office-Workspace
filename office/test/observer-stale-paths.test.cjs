'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createObserverBridge } = require('../lib/observer-bridge.cjs');
const { parseObserverCommand, parseObserverArgs, invocationPathState, staleSummary } = require('../lib/observer-command-owner.cjs');

const appRoot = path.resolve(__dirname, '..');

function sandbox(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'mini-office-stale-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const homeDir = path.join(root, 'home'), bin = path.join(root, 'bin');
  fs.mkdirSync(homeDir); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'hermes'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.mkdirSync(path.join(homeDir, '.kiro', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(homeDir, '.kiro', 'agents', 'mine.json'), '{"name":"mine"}\n');
  const base = {
    homeDir, env: { PATH: bin }, appRoot, dataDir: path.join(root, 'data'),
    withNativeLock: (paths, run) => run(), hermesRunCli: async () => ({ status: 0 }),
  };
  return { root, homeDir, base };
}

// Every file under home that still names the old runtime, excluding the
// byte-for-byte backups that repairs deliberately keep.
function mentions(dir, needle) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.name.includes('mini-office-backup')) continue;
    if (entry.isDirectory()) found.push(...mentions(file, needle));
    else if (entry.isFile() && fs.readFileSync(file, 'utf8').includes(needle)) found.push(file);
  }
  return found;
}

const FAMILIES = [
  ['codex', 'native JSON'], ['gemini-cli', 'upstream JSON'], ['copilot-cli', 'upstream bash'], ['zcode', 'upstream process'],
  ['kimi-cli', 'special TOML'], ['codewhale', 'special TOML table'], ['kiro-cli', 'Kiro agent'], ['kirocrew', 'KiroCrew store'],
  ['minimax', 'owned plugin argv'], ['pi', 'passive plugin'], ['hermes', 'Hermes plugin'],
];

for (const [provider, family] of FAMILIES) {
  test(`${family}: a moved app reports stale paths, and Repair replaces them without orphans`, async t => {
    const { root, homeDir, base } = sandbox(t);
    const oldRuntime = path.join(root, 'Old Copy.app', 'Contents', 'MacOS', 'AI Mini Office');
    const old = createObserverBridge({ ...base, electronPath: oldRuntime });
    const first = await old.connect(provider);
    assert.equal(first.status, 'ok', first.message);

    const moved = createObserverBridge({ ...base, electronPath: process.execPath });
    const before = moved.getConnections().find(row => row.provider === provider);
    assert.equal(before.stale, true, `${provider} detects the old path`);
    assert.equal(before.staleReason, 'missing');

    const repaired = await moved.connect(provider);
    assert.equal(repaired.status, 'ok', repaired.message);
    const after = moved.getConnections().find(row => row.provider === provider);
    assert.equal(after.installed, true);
    assert.ok(!after.stale, `${provider} is current after Repair`);
    assert.deepEqual(mentions(homeDir, oldRuntime), [], 'no orphaned hook keeps the old path');

    assert.equal((await moved.disconnect(provider)).status, 'ok');
    assert.deepEqual(mentions(homeDir, process.execPath), [], 'disconnect removes the repaired hooks too');
  });
}

test('a hook from another installed copy is reported as other-copy, not missing', async t => {
  const { root, base } = sandbox(t);
  const old = createObserverBridge({ ...base, dataDir: path.join(root, 'other data'), electronPath: process.execPath });
  assert.equal((await old.connect('kimi-cli')).status, 'ok');
  const current = createObserverBridge({ ...base, electronPath: process.execPath });
  const row = current.getConnections().find(item => item.provider === 'kimi-cli');
  assert.equal(row.stale, true); assert.equal(row.staleReason, 'other-copy');
});

test('an edited Kimi block is still preserved rather than repaired', async t => {
  const { homeDir, base } = sandbox(t);
  const bridge = createObserverBridge({ ...base, electronPath: process.execPath });
  assert.equal((await bridge.connect('kimi-cli')).status, 'ok');
  const file = path.join(homeDir, '.kimi-code', 'config.toml');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('timeout = 2', 'timeout = 9'));
  const result = await bridge.connect('kimi-cli');
  assert.equal(result.status, 'error');
  assert.match(result.message, /changed externally/);
});

test('path state parsing accepts only the observer grammar and summarises states', () => {
  const current = { dataDir: '/d', electronPath: '/r', appRoot: '/app' };
  const command = "MINI_OFFICE_DATA_DIR='/d' ELECTRON_RUN_AS_NODE=1 '/r' '/app/hooks/observe.cjs' --provider 'kimi-cli' --event 'Stop' --mini-office-observer-v1";
  assert.equal(invocationPathState(parseObserverCommand(command), current), 'current');
  assert.equal(invocationPathState(parseObserverCommand(command.replace("'/r'", "'/gone'")), current, () => false), 'missing');
  assert.equal(invocationPathState(parseObserverCommand(command.replace("'/d'", "'/e'")), current, () => true), 'other-copy');
  assert.equal(parseObserverCommand(command + '; rm -rf /'), null);
  assert.equal(parseObserverArgs(['MINI_OFFICE_DATA_DIR=/d', 'ELECTRON_RUN_AS_NODE=1', '/r', '/app/hooks/observe.cjs', '--provider', 'zcode', '--event', 'Stop', '--mini-office-observer-v1']).provider, 'zcode');
  assert.equal(parseObserverArgs(['MINI_OFFICE_DATA_DIR=/d', 'ELECTRON_RUN_AS_NODE=1', '/r', '/app/other.cjs', '--provider', 'zcode', '--event', 'Stop', '--mini-office-observer-v1']), null);
  assert.deepEqual(staleSummary(['current', 'current']), {});
  assert.deepEqual(staleSummary(['current', 'other-copy', 'missing']), { stale: true, staleReason: 'missing', staleCount: 2 });
});
