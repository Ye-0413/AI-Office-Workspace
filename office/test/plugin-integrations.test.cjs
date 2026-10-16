'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { inspectPlugin, mutatePlugin } = require('../lib/plugin-integrations.cjs');
const jsonc = require('../lib/plugin-jsonc.cjs');
const { createObserver } = require('../hooks/passive-plugins/runtime.cjs');
const { normalizeEvent } = require('../lib/provider-events.cjs');
const { createSessionStore } = require('../lib/session-store.cjs');
function fixture(t, provider, extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-office-passive-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const homeDir = path.join(root, 'home'), dataDir = path.join(root, 'data'); fs.mkdirSync(homeDir);
  const options = { provider, homeDir, dataDir, appRoot: path.resolve(__dirname, '..'), electronPath: process.execPath, env: { PATH: '' }, ...extra };
  function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); }
  return { root, options, write, homeDir, dataDir };
}
test('JSONC surgical registration keeps comments and unrelated values and rejects duplicate keys', () => {
  const source = '{\n // user comment\n "plugin": ["user-plugin", /* keep */], "theme": "paper",\n}\n';
  const installed = jsonc.updateArray(source, 'plugin', '/owned/plugin', true);
  assert.deepEqual(jsonc.parse(installed).value.plugin, ['user-plugin', '/owned/plugin']);
  assert.ok(installed.includes('// user comment')); assert.ok(installed.includes('/* keep */'));
  const removed = jsonc.updateArray(installed, 'plugin', '/owned/plugin', false);
  assert.deepEqual(jsonc.parse(removed).value.plugin, ['user-plugin']); assert.ok(removed.includes('/* keep */'));
  assert.throws(() => jsonc.parse('{"plugin":[], "plugin":[]}'), /Duplicate/);
  assert.throws(() => jsonc.parse('{"nested":{"x":1,"x":2}}'), /Duplicate/);
});
for (const provider of ['pi', 'omp', 'opencode', 'mimocode', 'openclaw', 'deepseek-harness']) test(`${provider}: explicit install/reconnect/uninstall preserves foreign integrations and source-only inspection`, async t => {
  const f = fixture(t, provider, provider === 'opencode' ? { hostMajor: 2 } : provider === 'omp' ? { env: { PATH: '', OMP_PROFILE: 'work' } } : {});
  let config;
  if (provider === 'opencode' || provider === 'mimocode') { config = path.join(f.homeDir, '.config', provider, `${provider}.jsonc`); f.write(config, `{// preserved comment\n "${provider === 'opencode' ? 'plugins' : 'plugin'}": ["foreign-plugin"], "theme":"paper"\n}`); }
  if (provider === 'openclaw') { config = path.join(f.homeDir, '.openclaw', 'openclaw.json'); f.write(config, { models: { untouched: true }, plugins: { allow: ['foreign'], entries: { foreign: { enabled: true } }, load: { paths: ['/foreign/plugin'] } } }); }
  if (provider === 'deepseek-harness') for (const profile of ['web', 'desktop']) f.write(path.join(f.homeDir, '.dsh', 'profiles', profile, 'package.json'), { dependencies: { foreign: '^1' }, dsh: { profile: { bundles: ['foreign'] } } });
  const before = config && fs.readFileSync(config, 'utf8');
  const untouched = inspectPlugin(f.options); assert.equal(untouched.installed, false); assert.equal(fs.existsSync(f.dataDir), false);
  assert.equal(config && fs.readFileSync(config, 'utf8'), before);
  const result = await mutatePlugin(f.options, true); assert.equal(result.status, 'ok', result.message); assert.equal(inspectPlugin(f.options).installed, true);
  assert.equal((await mutatePlugin(f.options, true)).status, 'ok');
  if (config) { const value = jsonc.parse(fs.readFileSync(config, 'utf8')).value; assert.equal(provider === 'openclaw' ? value.models.untouched : value.theme, provider === 'openclaw' ? true : 'paper'); if (provider !== 'openclaw') assert.ok(fs.readFileSync(config, 'utf8').includes('// preserved comment')); }
  const target = inspectPlugin(f.options).targetPaths[0];
  if (provider === 'pi' || provider === 'omp') {
    const callbacks = new Map(), mod = await import(pathToFileURL(path.join(target, 'index.ts')).href);
    mod.default({ on(name, callback) { callbacks.set(name, callback); } });
    // No stable session id => silent callback, no observer child process.
    assert.equal(callbacks.get('tool_call')({ toolName: 'bash', input: 'PRIVATE' }, {}), undefined);
    if (provider === 'omp') assert.equal(callbacks.get('session_stop')({}, {}), undefined);
  }
  const removed = await mutatePlugin(f.options, false); assert.equal(removed.status, 'ok', removed.message); assert.equal(inspectPlugin(f.options).installed, false);
  assert.equal(fs.existsSync(target), false);
  if (config) {
    const value = jsonc.parse(fs.readFileSync(config, 'utf8')).value;
    if (provider === 'openclaw') { assert.deepEqual(value.plugins.allow, ['foreign']); assert.deepEqual(value.plugins.load.paths, ['/foreign/plugin']); assert.equal(value.plugins.entries.foreign.enabled, true); }
    else assert.deepEqual(value[provider === 'opencode' ? 'plugins' : 'plugin'], ['foreign-plugin']);
  }
});
test('changed or foreign plugin target is preserved on both reconnect and uninstall', async t => {
  const f = fixture(t, 'pi'); assert.equal((await mutatePlugin(f.options, true)).status, 'ok');
  const target = inspectPlugin(f.options).targetPaths[0], entry = path.join(target, 'index.ts'); fs.appendFileSync(entry, '\n// external change');
  const changed = fs.readFileSync(entry, 'utf8');
  assert.equal((await mutatePlugin(f.options, true)).status, 'error'); assert.equal((await mutatePlugin(f.options, false)).status, 'error');
  assert.equal(fs.readFileSync(entry, 'utf8'), changed);
});
test('symlink and malformed/duplicate host configs are preserved without writing plugin generations', async t => {
  const f = fixture(t, 'mimocode'), dir = path.join(f.homeDir, '.config', 'mimocode'), config = path.join(dir, 'mimocode.jsonc');
  f.write(config, '{"plugin":[],"plugin":["foreign"]}');
  assert.equal((await mutatePlugin(f.options, true)).status, 'error'); assert.equal(fs.existsSync(path.join(dir, 'ai-mini-office')), false);
  fs.unlinkSync(config); const outside = path.join(f.root, 'outside'); f.write(outside, '{}'); fs.symlinkSync(outside, config);
  assert.equal((await mutatePlugin(f.options, true)).status, 'error'); assert.equal(fs.readFileSync(outside, 'utf8'), '{}');
});
test('OpenCode explicit version query chooses v1 without adding a v2 key', async t => {
  const f = fixture(t, 'opencode'), bin = path.join(f.root, 'bin'); f.write(path.join(bin, 'opencode'), 'fake version command'); f.options.env.PATH = bin;
  let probes = 0; f.options.execFileSync = (file, args) => { probes++; assert.equal(file, path.join(bin, 'opencode')); assert.deepEqual(args, ['--version']); return 'opencode v1.18.15'; };
  inspectPlugin(f.options); assert.equal(probes, 0);
  const result = await mutatePlugin(f.options, true); assert.equal(result.status, 'ok', result.message); assert.equal(probes, 1);
  const value = jsonc.parse(fs.readFileSync(path.join(f.homeDir, '.config', 'opencode', 'opencode.json'), 'utf8')).value;
  assert.ok(Array.isArray(value.plugin)); assert.equal(value.plugins, undefined);
});
test('OpenCode explicit reconnect detects a v2 upgrade and sweeps only owned paths from all global candidates', async t => {
  const f = fixture(t, 'opencode'), bin = path.join(f.root, 'bin'), dir = path.join(f.homeDir, '.config', 'opencode');
  f.write(path.join(bin, 'opencode'), 'fake version command'); f.options.env.PATH = bin;
  let version = 'opencode v1.18.15'; f.options.execFileSync = () => version;
  f.write(path.join(dir, 'opencode.json'), { plugin: ['foreign-one'] });
  assert.equal((await mutatePlugin(f.options, true)).status, 'ok');
  const target = inspectPlugin(f.options).targetPaths[0];
  f.write(path.join(dir, 'config.json'), { plugin: ['foreign-low', target] });
  f.write(path.join(dir, 'opencode.jsonc'), `{// keep highest-priority comment\n"plugin":["foreign-high",${JSON.stringify(target)}]}`);
  version = 'opencode v2.0.26';
  const upgraded = await mutatePlugin(f.options, true); assert.equal(upgraded.status, 'ok', upgraded.message);
  for (const file of ['config.json', 'opencode.json', 'opencode.jsonc']) {
    const value = jsonc.parse(fs.readFileSync(path.join(dir, file), 'utf8')).value;
    assert.ok(!value.plugin.includes(target)); assert.ok(value.plugin[0].startsWith('foreign-'));
  }
  const high = jsonc.parse(fs.readFileSync(path.join(dir, 'opencode.jsonc'), 'utf8')).value;
  assert.deepEqual(high.plugins, [target]); assert.ok(fs.readFileSync(path.join(dir, 'opencode.jsonc'), 'utf8').includes('// keep highest-priority comment'));
  assert.ok(fs.readFileSync(path.join(target, 'index.mjs'), 'utf8').includes("id: 'ai-mini-office'"));
  assert.equal((await mutatePlugin(f.options, false)).status, 'ok');
  assert.deepEqual(jsonc.parse(fs.readFileSync(path.join(dir, 'opencode.jsonc'), 'utf8')).value.plugins, []);
});
test('OpenCode v1/v2 adapters keep actual session, child and tool ids, deduplicate tools, and drop private contents', () => {
  const events = [], observer = createObserver('opencode', event => events.push(event));
  observer.opencode({ type: 'session.created', properties: { info: { id: 'child', parentID: 'root', directory: '/project', title: 'PRIVATE TITLE' } } });
  const tool = { type: 'message.part.updated', properties: { part: { type: 'tool', sessionID: 'child', callID: 'tool-call', id: 'part-1', tool: 'read', state: { status: 'running', input: 'PRIVATE INPUT' } } } };
  observer.opencode(tool); observer.opencode(tool);
  observer.opencode({ type: 'message.updated', properties: { info: { id: 'message-id', sessionID: 'child', content: 'PRIVATE MESSAGE' } } });
  observer.opencode({ type: 'session.tool.success', durable: { aggregateID: 'child' }, data: { id: 'tool-call', tool: 'read', output: 'PRIVATE OUTPUT' }, location: { directory: '/project' } }, undefined, true);
  assert.equal(events.length, 3); assert.equal(events[1].session_id, 'child'); assert.equal(events[1].tool_use_id, 'tool-call'); assert.equal(events[1].parent_thread_id, 'root'); assert.equal(events[2].hook_event_name, 'PostToolUse');
  assert.ok(!JSON.stringify(events).includes('PRIVATE'));
});
test('OMP continuation never completes a task or returns a policy result', () => {
  const events = [], observer = createObserver('omp', event => events.push(event)), ctx = { sessionManager: { getSessionId: () => 'one' }, cwd: '/project' };
  assert.equal(observer.pi('tool_call', { toolName: 'bash', toolCallId: 'tool', input: 'PRIVATE' }, ctx), undefined);
  assert.equal(observer.pi('session_stop', {}, ctx), undefined); assert.equal(events.length, 1);
  assert.equal(observer.pi('agent_end', { willContinue: true }, ctx), undefined); assert.equal(events.length, 1);
  observer.pi('session_stop', {}, ctx); observer.pi('agent_end', { willContinue: false }, ctx);
  assert.equal(events.at(-1).hook_event_name, 'Stop'); assert.ok(!JSON.stringify(events).includes('PRIVATE'));
});
test('DSH and OpenClaw observe exact native fields without content, approval hooks, or inferred whole-task completion', () => {
  const events = [], dsh = createObserver('deepseek-harness', event => events.push(event)), claw = createObserver('openclaw', event => events.push(event));
  const session = { id: 'dsh-task', header: { cwd: '/project' } };
  assert.equal(dsh.dsh('session/event', session, { type: 'tool/result', data: { message: { toolCallId: 'call-1', content: [{ isError: true, text: 'PRIVATE' }] } } }), undefined);
  assert.equal(events[0].tool_use_id, 'call-1'); assert.equal(events[0].hook_event_name, 'PostToolUseFailure');
  dsh.dsh('session/event', session, { type: 'tool/result', data: { message: { toolCallId: 'call-2', isError: 'true', content: [{ isError: 'false' }] } } });
  assert.equal(events[1].hook_event_name, 'PostToolUse');
  claw.openclaw('model_call_ended', { sessionId: 'claw-task', outcome: 'ok' }); assert.equal(events.length, 2);
  claw.openclaw('session_end', { sessionId: 'claw-task', reason: 'reset' }); assert.equal(events.length, 2);
  claw.openclaw('session_end', { sessionId: 'claw-task', reason: 'shutdown' }); assert.equal(events.at(-1).hook_event_name, 'SessionEnd');
  assert.ok(!JSON.stringify(events).includes('PRIVATE'));
});
test('real plugin activity without call IDs reaches the store without phantom tools or clearing identified work/waits', () => {
  let now = 1000; const normalized = [], store = createSessionStore({ now: () => now });
  const observer = createObserver('deepseek-harness', raw => { const event = normalizeEvent('deepseek-harness', raw, { receivedAt: now++, source: 'hook' }); assert.ok(event); normalized.push(event); store.ingest(event); });
  const session = { id: 'native-session', header: { cwd: '/project' } };
  observer.dsh('session/event', session, { type: 'turn/start' });
  observer.dsh('session/event', session, { type: 'tool/call', data: { name: 'read', arguments: { private: 'PRIVATE' } } });
  assert.equal(normalized.at(-1).event, 'activity'); assert.equal(normalized.at(-1).activity, 'reading');
  assert.equal(store.snapshot()[0].activeTools, 0); assert.equal(normalized.at(-1).toolCallId, undefined);
  observer.dsh('session/event', session, { type: 'tool/result', data: { message: { content: [{ text: 'PRIVATE' }] } } });
  assert.equal(normalized.at(-1).event, 'activity'); assert.equal(normalized.at(-1).activity, 'unknown'); assert.equal(normalized.at(-1).outcome, 'unknown');
  observer.dsh('session/event', session, { type: 'turn/end', data: { reason: 'stop' } });
  assert.equal(store.snapshot()[0].status, 'idle'); assert.equal(store.snapshot()[0].activeTools, 0);
  observer.dsh('session/event', session, { type: 'turn/start' });
  observer.dsh('session/event', session, { type: 'tool/call', data: { name: 'read', callId: 'real-call' } });
  observer.dsh('session/event', session, { type: 'tool/result', data: { message: {} } });
  assert.equal(store.snapshot()[0].activeTools, 1); assert.equal(store.snapshot()[0].activity, 'reading');
  observer.dsh('session/event', session, { type: 'tool/result', data: { message: { isError: true } } });
  assert.equal(normalized.at(-1).event, 'activity'); assert.equal(normalized.at(-1).activity, 'error'); assert.equal(normalized.at(-1).outcome, 'failure');
  assert.equal(store.snapshot()[0].activeTools, 1); assert.equal(store.snapshot()[0].activity, 'error');
  store.ingest({ provider: 'deepseek-harness', sessionId: 'native-session', event: 'waiting-user', activity: 'waiting-user', toolCallId: 'human-wait', at: now++, evidence: { source: 'hook', rawEvent: 'PermissionRequest' } });
  observer.dsh('session/event', session, { type: 'tool/call', data: { name: 'read' } });
  assert.equal(store.snapshot()[0].status, 'waiting'); assert.equal(store.snapshot()[0].activity, 'waiting-user'); assert.equal(store.snapshot()[0].activeTools, 2);
  assert.ok(!JSON.stringify(normalized).includes('PRIVATE'));
});
