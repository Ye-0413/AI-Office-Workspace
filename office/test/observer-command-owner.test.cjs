'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isObserverCommandTemplate } = require('../lib/observer-command-owner.cjs');
const { createObserverBridge, buildObserverCommand, EVENTS, MARKER } = require('../lib/observer-bridge.cjs');
const options = { dataDir: "/private/tmp/old office's data $HOME", electronPath: "/Applications/Old Office's.app/Contents/MacOS/AI Mini Office", appRoot: "/Applications/Old Office's.app/Contents/Resources/app" };
const command = (provider = 'codex', event = 'Stop', extra = {}) => buildObserverCommand({ ...options, ...extra }, provider, event);
const owned = (value, provider = 'codex') => isObserverCommandTemplate(value, { provider, events: EVENTS[provider] });
test('the exact original command grammar recognizes old paths including escaped apostrophes without executing them', () => {
  for (const provider of ['codex', 'claude-code', 'cursor']) for (const event of EVENTS[provider]) assert.equal(owned(command(provider, event), provider), true);
  assert.equal(owned(command('gemini-cli', 'BeforeAgent'), 'gemini-cli'), false, 'migration is limited to the three existing JSON installers');
});
test('marker decoys, appended shell commands, changed providers/events and incomplete quote templates never qualify', () => {
  const original = command();
  const variants = [
    'echo ' + MARKER, original + '; echo extra', original + ' | cat', original + ' && true', original + ' > /private/tmp/out', original + ' ', ' ' + original,
    original.replace(' ELECTRON_RUN_AS_NODE=1 ', ' ELECTRON_RUN_AS_NODE=0 '), original.replace(' ELECTRON_RUN_AS_NODE=1 ', ' OTHER=1 ELECTRON_RUN_AS_NODE=1 '),
    original.replace("--provider 'codex'", "--provider 'cursor'"), original.replace("--event 'Stop'", "--event 'NotAnEvent'"),
    original.replace(MARKER, MARKER + '-decoy'), original.replace('--event', '--other'), original.replace("' --provider ", "' --extra yes --provider "),
    original.replace('MINI_OFFICE_DATA_DIR=', 'env MINI_OFFICE_DATA_DIR='), original.replace(' --event ', '  --event '), original + '\n',
    command('codex', 'Stop', { dataDir: 'relative' }), command('codex', 'Stop', { electronPath: 'relative-runtime' }),
    original.replace('/hooks/observe.cjs', '/hooks/another.cjs'), original.replace('/hooks/observe.cjs', '/other/observe.cjs'),
    original.replace('/hooks/observe.cjs', '/../hooks/observe.cjs'), original.replace(" --provider 'codex'", ' --provider codex')
  ];
  for (const value of variants) assert.equal(owned(value), false, value);
});
function sandbox(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'mini-office-migrate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const homeDir = path.join(root, 'home'); fs.mkdirSync(homeDir);
  return { root, homeDir, env: { PATH: '' }, dataDir: path.join(root, 'old data'), appRoot: path.join(root, "old app's", 'Resources', 'app'), electronPath: path.join(root, "old app's", 'runtime') };
}
function config(options, provider) { return path.join(options.homeDir, provider === 'codex' ? '.codex' : provider === 'cursor' ? '.cursor' : '.claude', provider === 'claude-code' ? 'settings.json' : 'hooks.json'); }
function entries(value, provider) { return Object.values(value.hooks).flat().flatMap(entry => provider === 'cursor' ? [entry] : entry.hooks || []); }
function appendForeign(file, provider, commands) {
  const value = JSON.parse(fs.readFileSync(file)); const event = provider === 'cursor' ? 'stop' : 'Stop';
  const foreign = commands.map(command => ({ type: 'command', command }));
  value.hooks[event].push(...(provider === 'cursor' ? foreign : [{ hooks: foreign, matcher: 'foreign-group' }]));
  value.extraPolicy = { approval: 'ask', enabled: true }; fs.writeFileSync(file, JSON.stringify(value));
}
test('real bridge migration replaces only exact old templates, keeps foreign decoys and backs up original bytes', async t => {
  for (const provider of ['codex', 'claude-code', 'cursor']) {
    const old = sandbox(t), oldBridge = createObserverBridge(old);
    assert.equal((await oldBridge.connect(provider)).status, 'ok');
    const file = config(old, provider), oldEntries = entries(JSON.parse(fs.readFileSync(file)), provider).filter(entry => owned(entry.command, provider)), oldCommand = oldEntries[0].command;
    const foreign = ['echo my-user-hook', 'echo ' + MARKER, oldCommand + '; echo malicious-extra'];
    appendForeign(file, provider, foreign); const before = fs.readFileSync(file, 'utf8');
    const moved = { ...old, dataDir: path.join(old.root, 'new data'), appRoot: path.join(old.root, 'new app', 'Resources', 'app'), electronPath: path.join(old.root, 'new app', 'runtime') };
    const current = createObserverBridge(moved);
    assert.equal(current.getConnections().find(row => row.provider === provider).installed, true, 'old owned template is discoverable at the new app path');
    const result = await current.connect(provider); assert.equal(result.status, 'ok');
    assert.equal(fs.readFileSync(result.backupPath, 'utf8'), before);
    const after = JSON.parse(fs.readFileSync(file)); assert.deepEqual(after.extraPolicy, { approval: 'ask', enabled: true });
    const all = entries(after, provider).map(entry => entry.command), ours = all.filter(value => owned(value, provider));
    assert.equal(ours.length, oldEntries.length);
    assert.ok(ours.every(value => value.includes(moved.electronPath) && !value.includes("old app")));
    assert.ok(foreign.every(value => all.includes(value)));
    assert.equal((await current.connect(provider)).status, 'unchanged');
    assert.equal((await current.disconnect(provider)).status, 'ok');
    const remaining = entries(JSON.parse(fs.readFileSync(file)), provider).map(entry => entry.command);
    assert.ok(foreign.every(value => remaining.includes(value))); assert.equal(remaining.filter(value => owned(value, provider)).length, 0);
  }
});
test('disconnect from a new path removes old owned templates directly while preserving unrelated commands', async t => {
  const old = sandbox(t), bridge = createObserverBridge(old); await bridge.connect('codex');
  const file = config(old, 'codex'); appendForeign(file, 'codex', ['echo keep-foreign', 'echo ' + MARKER]);
  const moved = createObserverBridge({ ...old, appRoot: path.join(old.root, 'moved', 'app'), electronPath: path.join(old.root, 'moved', 'runtime') });
  assert.equal((await moved.disconnect('codex')).status, 'ok');
  const all = entries(JSON.parse(fs.readFileSync(file)), 'codex').map(entry => entry.command);
  assert.deepEqual(all, ['echo keep-foreign', 'echo ' + MARKER]);
});
