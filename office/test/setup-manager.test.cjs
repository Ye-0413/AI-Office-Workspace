'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSetupManager } = require('../lib/setup-manager.cjs');
const { PROVIDER_IDS } = require('../lib/provider-catalog.cjs');
const { createObserverBridge, MARKER } = require('../lib/observer-bridge.cjs');
const catalogFixture = () => PROVIDER_IDS.map(provider => ({ provider, available: false, installed: false, watching: false, detail: 'Not installed' }));
function fixture(patch = {}) {
  const connections = catalogFixture(), calls = [], changes = []; let time = 1000;
  const manager = createSetupManager({ getConnections: () => connections,
    connect: async provider => { calls.push(provider); const row = connections.find(item => item.provider === provider); row.installed = true; return { status: 'ok', provider, installed: true, detail: 'Installed, awaiting real activity' }; },
    onChange: () => changes.push(manager.snapshot()), now: () => time++, ...patch });
  return { manager, calls, changes, connections };
}
test('construction and snapshots do not inspect or configure tools automatically', () => {
  let inspected = 0, configured = 0;
  const manager = createSetupManager({ getConnections: () => { inspected++; return catalogFixture(); }, connect: () => { configured++; } });
  assert.deepEqual(manager.snapshot(), { running: false, runId: null, startedAt: null, finishedAt: null, rows: [], totals: { configured: 0, failed: 0, skipped: 0, pending: 0 } });
  assert.equal(manager.running, false); assert.equal(inspected, 0); assert.equal(configured, 0);
});
test('all 28 tools are represented but only detected or previously installed tools configure', async () => {
  const f = fixture();
  for (const row of f.connections) if (['codex', 'gemini-cli'].includes(row.provider)) row.available = true;
  f.connections.find(row => row.provider === 'hermes').installed = true;
  const pending = f.manager.run(); assert.equal(f.manager.running, true);
  assert.ok(f.manager.snapshot().rows.some(row => row.status === 'configuring'));
  const result = await pending;
  assert.deepEqual(f.calls, ['codex', 'gemini-cli', 'hermes']); assert.equal(result.rows.length, 28);
  assert.deepEqual(result.totals, { configured: 3, failed: 0, skipped: 25, pending: 0 });
  assert.ok(result.rows.filter(row => row.status === 'configured').every(row => !row.watching), 'configured does not imply a real observed event');
  assert.ok(result.finishedAt >= result.startedAt); assert.equal(result.running, false); assert.ok(result.runId);
  assert.ok(f.changes.some(change => change.totals.pending === 3));
});
test('configuration is strictly serial and repeated clicks share the same in-flight promise', async () => {
  const connections = catalogFixture(); connections[0].available = true; connections[1].available = true;
  const waiting = [], calls = []; let active = 0, maximum = 0;
  const manager = createSetupManager({ getConnections: () => connections, connect: provider => {
    calls.push(provider); active++; maximum = Math.max(maximum, active);
    return new Promise(resolve => waiting.push(() => { active--; connections.find(item => item.provider === provider).installed = true; resolve({ status: 'ok', installed: true }); }));
  }});
  const first = manager.run(), second = manager.run({ retryFailed: true });
  assert.equal(first, second); assert.deepEqual(calls, [connections[0].provider]);
  waiting.shift()(); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(calls, [connections[0].provider, connections[1].provider]);
  assert.equal(manager.snapshot().totals.pending, 1); waiting.shift()();
  const result = await first; assert.equal(maximum, 1); assert.equal(result.totals.configured, 2);
});
test('a failed installer does not block later tools and retry re-detects only failed tools', async () => {
  const connections = catalogFixture(), calls = []; let retry = false;
  for (const provider of ['claude-code', 'codex', 'hermes']) connections.find(row => row.provider === provider).available = true;
  const manager = createSetupManager({ getConnections: () => connections, connect: async provider => {
    calls.push(provider);
    if (provider === 'codex' && !retry) return { status: 'error', installed: false, message: 'Config is busy; original remains unchanged' };
    if (provider === 'claude-code' && !retry) throw new Error('Invalid JSON; original preserved');
    connections.find(row => row.provider === provider).installed = true;
    return { status: 'ok', installed: true, detail: provider === 'hermes' ? 'Plugin installed; reload the gateway, real events required' : 'Review native hook trust; real events required' };
  }});
  const first = await manager.run(); assert.equal(first.totals.failed, 2); assert.equal(first.totals.configured, 1);
  assert.match(first.rows.find(row => row.provider === 'codex').detail, /Config is busy/);
  const hermes = first.rows.find(row => row.provider === 'hermes');
  retry = true; connections.find(row => row.provider === 'claude-code').available = false;
  const second = await manager.run({ retryFailed: true });
  assert.deepEqual(calls, ['claude-code', 'codex', 'hermes', 'codex']);
  assert.equal(second.rows.find(row => row.provider === 'claude-code').status, 'skipped');
  assert.deepEqual(second.rows.find(row => row.provider === 'hermes'), hermes);
  assert.equal(second.totals.configured, 2); assert.equal(second.totals.failed, 0); assert.equal(second.totals.skipped, 26);
});
test('catalog aliases normalize once while unknown providers and extra run arguments never reach installers', async () => {
  const calls = [];
  const manager = createSetupManager({ getConnections: () => [
    { provider: 'cursor', available: true }, { provider: 'cursor-agent', installed: true },
    { provider: 'claude', available: true }, { provider: '/tmp/evil', available: true }, { provider: 'unknown', installed: true }
  ], connect: async provider => { calls.push(provider); return { status: 'ok', installed: true }; }});
  for (const options of [null, [], 1, 'all', { provider: 'codex' }, { retryFailed: 'yes' }, { command: 'run' }, Object.create({})]) assert.throws(() => manager.run(options), /Invalid setup options/);
  assert.deepEqual(calls, []);
  const result = await manager.run(); assert.deepEqual(calls, ['claude-code', 'cursor-agent']); assert.equal(result.totals.configured, 2);
  const copy = manager.snapshot(); copy.rows[0].status = 'failed'; copy.totals.failed = 100;
  assert.equal(manager.snapshot().totals.failed, 0);
});
test('refresh and listener errors remain visible without interrupting serial installation', async () => {
  let inspections = 0;
  const connections = catalogFixture(); connections[0].available = true; connections[1].available = true;
  const calls = [];
  const manager = createSetupManager({ getConnections: () => { if (++inspections === 2) throw new Error('Temporary detection failure'); return connections; },
    connect: async provider => { calls.push(provider); return { status: 'ok', installed: true, detail: 'Installed but no real event observed' }; },
    onChange: () => { throw new Error('Renderer unavailable'); } });
  const result = await manager.run(); assert.equal(calls.length, 2); assert.equal(result.totals.configured, 2); assert.match(result.error, /Temporary detection failure/); assert.equal(result.running, false);
  const broken = createSetupManager({ getConnections: () => { throw new Error('Detection unavailable'); }, connect: () => assert.fail('must not install') });
  assert.match((await broken.run()).error, /Detection unavailable/); assert.equal(broken.running, false);
  const invalid = createSetupManager({ getConnections: () => null, connect: () => assert.fail('must not install') });
  assert.match((await invalid.run()).error, /detection is unavailable/);
});
test('invalid success and unavailable clocks are explicit failures; retry without prior failures is harmless', async () => {
  const f = fixture({ connect: async () => ({ status: 'ok', installed: false, detail: 'No registration was installed' }) }); f.connections[0].available = true;
  const failed = await f.manager.run(); assert.equal(failed.totals.failed, 1); assert.match(failed.rows[0].detail, /No registration/);
  const empty = fixture(); assert.deepEqual((await empty.manager.run({ retryFailed: true })).rows, []); assert.deepEqual(empty.calls, []);
  const badClock = fixture({ now: () => { throw new Error('Clock failed'); } });
  const result = await badClock.manager.run(); assert.equal(result.running, false); assert.match(result.error, /Clock failed/); assert.deepEqual(badClock.calls, []);
});
test('real bridge batch in a temporary home preserves backups, sibling hooks, trust and approval policy', async t => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'mini-office-batch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const homeDir = path.join(root, 'home'); fs.mkdirSync(homeDir);
  const appRoot = path.resolve(__dirname, '..');
  const codexDir = path.join(homeDir, '.codex'), claudeDir = path.join(homeDir, '.claude'), cursorDir = path.join(homeDir, '.cursor');
  for (const directory of [codexDir, claudeDir, cursorDir]) fs.mkdirSync(directory);
  const sibling = { hooks: [{ type: 'command', command: 'echo user-hook' }] };
  const beforeCodex = JSON.stringify({ approval_policy: 'untrusted', hooks: { Stop: [sibling] }, user: { keep: true } });
  const beforeClaude = JSON.stringify({ permissions: { defaultMode: 'default', allow: ['Read'], deny: ['Bash'] }, hooks: { Stop: [sibling] } });
  fs.writeFileSync(path.join(codexDir, 'hooks.json'), beforeCodex); fs.writeFileSync(path.join(claudeDir, 'settings.json'), beforeClaude);
  fs.writeFileSync(path.join(cursorDir, 'hooks.json'), '{corrupt original');
  const trust = '[features]\nhooks = false\napproval_policy = "untrusted"\n'; fs.writeFileSync(path.join(codexDir, 'config.toml'), trust);
  const bridge = createObserverBridge({ homeDir, dataDir: path.join(root, 'data'), appRoot, electronPath: process.execPath, env: { PATH: '' } });
  const chosen = new Set(['claude-code', 'codex', 'cursor']);
  const manager = createSetupManager({ getConnections: () => bridge.getConnections().map(row => ({ ...row, available: chosen.has(row.provider), installed: chosen.has(row.provider) && row.installed })), connect: provider => bridge.connect(provider) });
  assert.deepEqual(fs.readdirSync(homeDir).sort(), ['.claude', '.codex', '.cursor']);
  assert.deepEqual(manager.snapshot().rows, []);
  const result = await manager.run(); assert.deepEqual(result.totals, { configured: 2, failed: 1, skipped: 25, pending: 0 });
  const codex = JSON.parse(fs.readFileSync(path.join(codexDir, 'hooks.json'))), claude = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json')));
  assert.deepEqual(codex.hooks.Stop[0], sibling); assert.deepEqual(claude.hooks.Stop[0], sibling);
  assert.deepEqual(codex.user, { keep: true }); assert.equal(codex.approval_policy, 'untrusted');
  assert.deepEqual(claude.permissions, JSON.parse(beforeClaude).permissions);
  assert.equal(fs.readFileSync(path.join(codexDir, 'config.toml'), 'utf8'), trust);
  assert.equal(fs.readFileSync(path.join(cursorDir, 'hooks.json'), 'utf8'), '{corrupt original');
  const backupCodex = fs.readdirSync(codexDir).find(name => name.includes('.mini-office-backup-'));
  const backupClaude = fs.readdirSync(claudeDir).find(name => name.includes('.mini-office-backup-'));
  assert.equal(fs.readFileSync(path.join(codexDir, backupCodex), 'utf8'), beforeCodex);
  assert.equal(fs.readFileSync(path.join(claudeDir, backupClaude), 'utf8'), beforeClaude);
  assert.match(JSON.stringify(codex.hooks), new RegExp(MARKER));
  assert.match(result.rows.find(row => row.provider === 'codex').detail, /审核信任/);
  assert.equal(result.rows.find(row => row.provider === 'codex').watching, false);
  assert.deepEqual(fs.readdirSync(homeDir).sort(), ['.claude', '.codex', '.cursor'], 'missing tools do not gain configuration directories');
});
test('asynchronous broadcast failures are contained and completion snapshots stay detached from later runs', async () => {
  const f = fixture({ onChange: async () => { throw new Error('Async renderer unavailable'); } }); f.connections[0].available = true;
  const first = await f.manager.run(), firstId = first.runId;
  const next = await f.manager.run();
  assert.notEqual(next.runId, firstId); assert.equal(first.running, false); assert.equal(first.runId, firstId);
  await new Promise(resolve => setImmediate(resolve));
});
