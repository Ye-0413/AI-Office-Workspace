'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const { normalizeEvent } = require('../lib/provider-events.cjs');

// Run the production Electron entry point with only native surfaces and external
// observers replaced. The actual settings, adapters and lifecycle store run.
async function startMain(t, { now } = {}) {
  const mainFile = path.join(__dirname, '../main.cjs');
  const requireFromMain = createRequire(mainFile);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-live-runtime-'));
  const handlers = new Map(), timers = new Map(), sends = [], observations = {};
  let window, menu, timerId = 0;
  const app = new EventEmitter();
  Object.assign(app, {
    isPackaged: false, setName(name) { this.name = name; },
    requestSingleInstanceLock: () => true, getPath: () => dataDir,
    getVersion: () => 'test', whenReady: () => Promise.resolve(), quit() {},
  });
  class BrowserWindow extends EventEmitter {
    constructor() {
      super(); window = this; this.webContents = new EventEmitter();
      Object.assign(this.webContents, {
        setWindowOpenHandler() {}, send: (channel, snapshot) => sends.push({ channel, snapshot }),
      });
    }
    isDestroyed() { return false; }
    setAlwaysOnTop() {}
    setTitle() {}
    loadFile() { return Promise.resolve(); }
  }
  const ipcMain = new EventEmitter();
  ipcMain.handle = (channel, handler) => handlers.set(channel, handler);
  const observer = name => options => {
    observations[name] = { options, starts: 0, stops: 0, connects: [], disconnects: [] };
    const state = observations[name];
    return {
      start: () => state.starts++, stop: () => state.stops++,
      status: () => ({ running: true }),
      getConnections: () => [{ provider: 'codex', installed: false, watching: false, detail: 'read-only' }],
      connect: async provider => { state.connects.push(provider); return { status: 'ok', provider }; },
      disconnect: async provider => { state.disconnects.push(provider); return { status: 'ok', provider }; },
    };
  };
  const sandbox = {
    __dirname: path.dirname(mainFile), console,
    process: { env: {}, platform: process.platform, arch: process.arch, execPath: process.execPath },
    setInterval(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearInterval: id => timers.delete(id),
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    require(name) {
      if (name === 'electron') return {
        app, BrowserWindow, ipcMain,
        Menu: { buildFromTemplate: value => value, setApplicationMenu: value => { menu = value; } },
        screen: { getAllDisplays: () => [] }, shell: { openPath: async () => '' },
      };
      if (name === './lib/codex-monitor.cjs') return { createCodexMonitor: observer('monitor') };
      if (name === './lib/observer-bridge.cjs') return { createObserverBridge: observer('bridge') };
      if (name === './lib/session-store.cjs' && now) return { createSessionStore: options => requireFromMain(name).createSessionStore({ ...options, now }) };
      if (name === './lib/activity-stats.cjs' && now) return { createActivityStats: options => requireFromMain(name).createActivityStats({ ...options, now }) };
      return requireFromMain(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(mainFile, 'utf8'), sandbox, { filename: mainFile });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(window, 'production startup created its window');
  t.after(() => { app.emit('before-quit'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  return {
    app, window, menu, handlers, timers, sends, observations, ipcMain,
    invoke: (name, ...args) => handlers.get('office:' + name)({ sender: window.webContents }, ...args),
  };
}

test('startup observes live sessions only and exposes no synthetic mode through IPC or the menu', async t => {
  const runtime = await startMain(t);
  let snapshot = runtime.invoke('snapshot');
  assert.equal(snapshot.mode, 'live');
  assert.deepEqual(snapshot.sessions, []);
  assert.equal(snapshot.activityStats.total, 0);
  assert.equal(snapshot.activityStats.timeZone, 'Asia/Hong_Kong');
  assert.equal(Object.hasOwn(snapshot, 'demo'), false);
  assert.equal(runtime.handlers.has('office:mode'), false);
  assert.equal(runtime.handlers.has('office:demo'), false);
  assert.doesNotMatch(JSON.stringify(runtime.menu), /demo|演示|story/i);
  assert.equal(runtime.observations.monitor.starts, 1);
  assert.equal(runtime.observations.bridge.starts, 1);
  for (const timer of [...runtime.timers.values()]) timer.callback();
  snapshot = runtime.invoke('snapshot');
  assert.deepEqual(snapshot.sessions, [], 'refresh/prune timers cannot create office workers');
  assert.deepEqual(runtime.observations.bridge.connects, [], 'startup never installs provider hooks');
  assert.deepEqual(runtime.observations.bridge.disconnects, []);
  assert.throws(() => runtime.handlers.get('office:snapshot')({ sender: {} }), /Unexpected IPC sender/);
  runtime.app.emit('before-quit');
  assert.equal(runtime.timers.size, 0);
  assert.equal(runtime.observations.monitor.stops, 1);
  assert.equal(runtime.observations.bridge.stops, 1);
});

test('hook and read-only monitor events feed the real store while attention remains provider-owned', async t => {
  const runtime = await startMain(t);
  const emit = (observer, raw) => runtime.observations[observer].options.onEvent(normalizeEvent('codex', raw, {
    receivedAt: Date.now(), source: observer === 'bridge' ? 'hook' : 'codex-jsonl',
  }));
  const task = { session_id: 'real-session', turn_id: 'turn-one', cwd: '/projects/live-office' };
  emit('bridge', { ...task, hook_event_name: 'UserPromptSubmit', prompt: 'Repair the live observer' });
  emit('bridge', { ...task, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_use_id: 'approve-test', tool_input: { command: 'npm test' } });
  emit('monitor', { session_id: 'other-session', turn_id: 'other-turn', cwd: '/projects/other', hook_event_name: 'UserPromptSubmit', prompt: 'Inspect another project' });
  runtime.ipcMain.emit('office:preload-ready', { sender: runtime.window.webContents });
  const snapshot = runtime.invoke('snapshot');
  assert.equal(snapshot.mode, 'live');
  assert.equal(snapshot.sessions.length, 2);
  assert.equal(snapshot.activityStats.total, 2);
  assert.equal(snapshot.activityStats.roots, 2);
  assert.equal(snapshot.activityStats.helpers, 0);
  const waiting = snapshot.sessions.find(session => session.sessionId === 'real-session');
  assert.equal(waiting.id, 'codex:real-session');
  assert.equal(waiting.projectPath, task.cwd);
  assert.equal(waiting.title, 'Repair the live observer');
  assert.equal(waiting.activity, 'waiting-user');
  assert.equal(waiting.attention, true);
  assert.equal(waiting.evidence.source, 'hook');
  assert.equal(snapshot.sessions.find(session => session.sessionId === 'other-session').evidence.source, 'codex-jsonl');
  for (const timer of [...runtime.timers.values()].filter(timer => timer.delay >= 2000)) timer.callback();
  assert.equal(runtime.invoke('snapshot').sessions.find(session => session.sessionId === 'real-session').activity, 'waiting-user');
  assert.ok(runtime.sends.some(send => send.channel === 'office:snapshot' && send.snapshot.sessions.length === 2));
  assert.deepEqual(runtime.observations.bridge.connects, []);
});

test('daily activity follows accepted identities rather than repeated turns or rejected observations', async t => {
  const runtime = await startMain(t);
  const emit = raw => runtime.observations.bridge.options.onEvent(normalizeEvent('codex', raw, {receivedAt:Date.now(),source:'hook'}));
  const base={session_id:'daily-root',turn_id:'first',cwd:'/fixture/daily'};
  emit({...base,hook_event_name:'UserPromptSubmit'});
  emit({...base,hook_event_name:'PreToolUse',tool_name:'Bash',tool_use_id:'one',tool_input:{command:'npm test'}});
  emit({...base,hook_event_name:'PreToolUse',tool_name:'Bash',tool_use_id:'one',tool_input:{command:'npm test'}});
  assert.equal(runtime.invoke('snapshot').activityStats.total,1);
  emit({...base,hook_event_name:'SubagentStart',agent_id:'child'});
  const stats=runtime.invoke('snapshot').activityStats;
  assert.equal(stats.total,2);assert.equal(stats.roots,1);assert.equal(stats.helpers,1);
  assert.equal(Object.hasOwn(stats,'agents'),false);
  assert.deepEqual(runtime.observations.bridge.connects,[]);
});

test('a positive rollout record accepted by internal deferred replay reaches daily stats exactly once', async t => {
  let time = Date.now();
  const runtime = await startMain(t, { now: () => time });
  const base = { session_id: 'deferred-daily', turn_id: 'same-turn' };
  const sessionStart = normalizeEvent('codex', { ...base, hook_event_name: 'SessionStart' }, { receivedAt: time, source: 'hook' });
  assert.equal(runtime.observations.bridge.options.onEvent(sessionStart), true);
  assert.equal(runtime.invoke('snapshot').activityStats.total, 0, 'SessionStart alone is not positive work');
  time += 10;
  const toolStart = normalizeEvent('codex', { ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'real-call', tool_input: { command: 'npm test' } }, { receivedAt: time, source: 'codex-jsonl' });
  assert.equal(runtime.observations.monitor.options.onEvent(toolStart), false);
  assert.equal(runtime.invoke('snapshot').activityStats.total, 0, 'queued evidence has not yet been accepted');
  time += 11000;
  [...runtime.timers.values()].find(timer => timer.delay === 5000).callback();
  let snapshot = runtime.invoke('snapshot');
  assert.equal(snapshot.sessions[0].activity, 'testing'); assert.equal(snapshot.sessions[0].activeTools, 1);
  assert.equal(snapshot.activityStats.total, 1); assert.equal(snapshot.activityStats.roots, 1);
  assert.equal(runtime.observations.monitor.options.onEvent(toolStart), false);
  [...runtime.timers.values()].find(timer => timer.delay === 5000).callback();
  snapshot = runtime.invoke('snapshot'); assert.equal(snapshot.activityStats.total, 1);
});

test('the sandbox bridge offers live observation, settings and local actions without mode/story controls', async () => {
  const calls = [], events = new EventEmitter(), domListeners = new Map();
  let exposed;
  const ipcRenderer = Object.assign(events, {
    invoke: async (channel, ...args) => { calls.push([channel, ...args]); return { mode: 'live', sessions: [] }; },
    send: (channel, ...args) => calls.push([channel, ...args]),
  });
  const preloadFile = path.join(__dirname, '../preload.cjs');
  vm.runInNewContext(fs.readFileSync(preloadFile, 'utf8'), {
    require: name => {
      assert.equal(name, 'electron');
      return { ipcRenderer, contextBridge: { exposeInMainWorld(name, api) { assert.equal(name, 'office'); exposed = api; } } };
    },
    window: { addEventListener: (name, listener) => domListeners.set(name, listener) },
  }, { filename: preloadFile });
  assert.ok(Object.isFrozen(exposed));
  assert.deepEqual(Object.keys(exposed).sort(), ['connectProvider', 'disconnectProvider', 'getSettings', 'getSnapshot', 'listDisplays', 'moveToDisplay', 'onSnapshot', 'openSource', 'setSettings'].sort());
  await exposed.getSnapshot();
  assert.deepEqual(calls, [['office:snapshot']]);
  const snapshots = [], unsubscribe = exposed.onSnapshot(value => snapshots.push(value));
  const snapshot = { mode: 'live', sessions: [{ id: 'codex:real-session' }] };
  events.emit('office:snapshot', {}, snapshot);
  unsubscribe(); events.emit('office:snapshot', {}, { sessions: [] });
  assert.deepEqual(snapshots, [snapshot]);
  assert.throws(() => exposed.onSnapshot(null), /Callback required/);
  domListeners.get('DOMContentLoaded')();
  assert.deepEqual(calls.at(-1), ['office:preload-ready']);
});
