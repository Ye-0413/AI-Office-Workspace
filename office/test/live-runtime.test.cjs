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
async function startMain(t, { now, dataDir: requestedDataDir } = {}) {
  const mainFile = path.join(__dirname, '../main.cjs');
  const requireFromMain = createRequire(mainFile);
  const dataDir = requestedDataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'office-live-runtime-'));
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
    observations[name] = { options, starts: 0, stops: 0, connects: [], disconnects: [], connections: [{ provider: 'codex', installed: false, watching: false, detail: 'read-only' }] };
    const state = observations[name];
    return {
      start: () => state.starts++, stop: () => state.stops++,
      status: () => ({ running: true }),
      getConnections: () => state.connections,
      connect: async provider => { state.connects.push(provider); if(state.connectImpl)return state.connectImpl(provider); const row=state.connections.find(row=>row.provider===provider);if(row)row.installed=true;return { status: 'ok', provider, installed: true }; },
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
      if (name === './lib/usage-log.cjs' && now) return { createUsageLog: options => requireFromMain(name).createUsageLog({ ...options, now }) };
      return requireFromMain(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(mainFile, 'utf8'), sandbox, { filename: mainFile });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(window, 'production startup created its window');
  t.after(() => { app.emit('before-quit'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  return {
    app, window, menu, handlers, timers, sends, observations, ipcMain, dataDir,
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
  assert.deepEqual(Object.keys(exposed).sort(), ['connectProvider', 'disconnectProvider', 'getSettings', 'getSnapshot', 'listDisplays', 'moveToDisplay', 'onSnapshot', 'openSource', 'setSettings', 'getUsageHistory', 'getUsageEvents', 'getUsageStatus', 'exportUsageHistory', 'openUsageFolder', 'getProviderSetup', 'initializeProviders'].sort());
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
  await exposed.getUsageHistory({role:'helper'});
  assert.deepEqual(calls.at(-1), ['office:usage-history',{role:'helper'}]);
  await exposed.getUsageEvents({id:'codex:real-session'});
  assert.deepEqual(calls.at(-1), ['office:usage-events',{id:'codex:real-session'}]);
});

test('accepted usage persists across main-process restarts without reviving historical actors', async t => {
  let time = Date.parse('2026-10-17T01:00:00Z');
  const runtime = await startMain(t,{now:()=>time});
  const base = {session_id:'persisted-main',turn_id:'turn-1',cwd:'/fixture/persistent'};
  const first = normalizeEvent('codex',{...base,hook_event_name:'UserPromptSubmit',prompt:'SECRET prompt must not enter usage storage'}, {receivedAt:time,source:'hook'});
  assert.equal(runtime.observations.bridge.options.onEvent(first),true);
  time += 1000;
  const helper = normalizeEvent('codex',{...base,hook_event_name:'SubagentStart',agent_id:'persistent-helper'}, {receivedAt:time,source:'hook'});
  assert.equal(runtime.observations.bridge.options.onEvent(helper),true);
  time += 5000;
  [...runtime.timers.values()].find(timer=>timer.delay===5000).callback();
  const history = runtime.invoke('usage-history',{});
  assert.equal(history.ok,true); assert.equal(history.totals.agents,2);
  assert.equal(history.totals.roots,1); assert.equal(history.totals.helpers,1);
  assert.ok(history.totals.activeMs>=5000);
  assert.equal(runtime.invoke('usage-status').available,true);
  assert.equal(runtime.invoke('snapshot').usageLog.available,true);
  assert.doesNotMatch(JSON.stringify(history),/SECRET prompt/);
  for(const name of ['usage-history','usage-events','usage-status','usage-export','usage-open-folder']) {
    assert.throws(()=>runtime.handlers.get('office:'+name)({sender:{}},{}),/Unexpected IPC sender/);
  }
  assert.throws(()=>runtime.invoke('usage-history',{from:'2026-02-30'}),/Invalid usage/);
  const recordedEvents=history.totals.events;
  runtime.app.emit('before-quit');
  time += 86400000;
  const restored=await startMain(t,{now:()=>time,dataDir:runtime.dataDir});
  assert.deepEqual(restored.invoke('snapshot').sessions,[],'history is not a new live observation');
  const saved=restored.invoke('usage-history',{});
  assert.equal(saved.totals.agents,2); assert.equal(saved.totals.events,recordedEvents);
  const duration=saved.totals.activeMs;
  [...restored.timers.values()].find(timer=>timer.delay===5000).callback();
  assert.equal(restored.invoke('usage-history',{}).totals.activeMs,duration,'offline interval is not billed as work');
  restored.observations.bridge.options.onEvent(first);
  restored.observations.bridge.options.onEvent(helper);
  const replayed=restored.invoke('usage-history',{});
  assert.equal(replayed.totals.events,recordedEvents,'repeated rollout facts remain idempotent after restart');
  assert.equal(replayed.totals.activeMs,duration);
  assert.deepEqual(restored.observations.bridge.connects,[]);
});

test('one-click setup shares the real bridge and excludes simultaneous individual configuration', async t => {
  const runtime=await startMain(t),bridge=runtime.observations.bridge;
  assert.equal(runtime.invoke('snapshot').setup.running,false);
  assert.deepEqual(bridge.connects,[],'loading the studio does not initialize user tools');
  bridge.connections=[{provider:'codex',available:true,installed:false,watching:false},{provider:'claude-code',available:true,installed:false,watching:false}];
  let release;
  bridge.connectImpl=()=>new Promise(resolve=>{release=resolve;});
  const single=runtime.invoke('connect','codex');
  assert.throws(()=>runtime.invoke('setup-initialize',{}),/already running/);
  release({status:'ok',installed:true}); await single; delete bridge.connectImpl;
  const batch=runtime.invoke('setup-initialize',{});
  assert.equal(runtime.invoke('setup-status').running,true);
  const blockedDisconnect=runtime.invoke('disconnect','codex'),blockedConnect=runtime.invoke('connect','claude-code');
  await Promise.all([assert.rejects(blockedDisconnect,/already running/),assert.rejects(blockedConnect,/already running/)]);
  const result=await batch;
  assert.equal(result.totals.configured,2);assert.equal(result.totals.failed,0);
  assert.equal(result.running,false);
  assert.equal(bridge.connects[0],'codex');assert.deepEqual(bridge.connects.slice(1).sort(),['claude-code','codex']);
  assert.deepEqual(bridge.disconnects,[]);
  for(const name of ['setup-status','setup-initialize'])assert.throws(()=>runtime.handlers.get('office:'+name)({sender:{}},{}),/Unexpected IPC sender/);
  assert.throws(()=>runtime.invoke('setup-initialize',{command:'arbitrary'}),/Invalid setup options/);
});
