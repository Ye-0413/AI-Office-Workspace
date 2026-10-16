'use strict';

// Run with Electron: electron scripts/verify-codex-restart.cjs [appRoot]
// appRoot may be a packaged app.asar. This exercises its real monitor, store,
// preload and sandboxed renderer without reading real Codex data or hooks.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const appRoot = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { createCodexMonitor } = require(path.join(appRoot, 'lib', 'codex-monitor.cjs'));
const { createSessionStore } = require(path.join(appRoot, 'lib', 'session-store.cjs'));
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-office-codex-restart-'));
const codexHome = path.join(fixtureDir, 'codex');
const dataDir = path.join(fixtureDir, 'user-data');
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
app.setPath('userData', dataDir);
app.disableHardwareAcceleration();
// Closing the first isolated window is part of the restart check, not a quit.
app.on('window-all-closed', () => {});

const ids = {
  root: '11111111-1111-4111-8111-111111111111',
  child: '22222222-2222-4222-8222-222222222222',
};
const expectedIds = [`codex:${ids.root}`, `codex:${ids.root}:${ids.child}`].sort();
const errors = [];
const checks = [];
const rendered = [];
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const settings = { rain: false, night: false, reducedMotion: true, lowPower: false,
  sound: false, selectedProject: '', displayId: null, alwaysOnTop: false, language: 'zh' };
let current = null;

function makeFixture() {
  const time = Date.now();
  const oldDate = new Date(time - 35 * 24 * 60 * 60 * 1000);
  const day = [oldDate.getFullYear(), String(oldDate.getMonth() + 1).padStart(2, '0'),
    String(oldDate.getDate()).padStart(2, '0')];
  const dir = path.join(codexHome, 'sessions', ...day.map(String));
  const projectPath = path.join(fixtureDir, 'fixture-project');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(projectPath);
  const row = (type, payload, offset) => JSON.stringify({ timestamp: new Date(time + offset).toISOString(), type, payload });
  const meta = (id, patch = {}) => ({ id, session_id: id, cwd: projectPath,
    timestamp: new Date(time - 1000).toISOString(), source: 'vscode', ...patch });
  const start = (turn, originalTime = time - 500) => ({ type: 'task_started', turn_id: turn, started_at: originalTime / 1000 });
  const rootRows = [row('session_meta', meta(ids.root), -500),
    row('event_msg', start('root-live-turn'), -250),
    row('response_item', { type: 'reasoning', summary: [] }, -200)];
  // The child copies parent history before its declared ordinal boundary.
  // Copied terminal evidence must never overwrite this independent actor.
  const childRows = [row('session_meta', meta(ids.child, { session_id: ids.root,
    parent_thread_id: ids.root, thread_source: 'subagent', subagent_history_start_ordinal: 6,
    source: { subagent: { thread_spawn: { parent_thread_id: ids.root, depth: 1 } } } }), -400),
    row('session_meta', meta(ids.root), -900),
    row('event_msg', start('copied-parent-turn', time - 10000), -850),
    row('response_item', { type: 'function_call', name: 'read_file', call_id: 'copied-call', arguments: '{}' }, -800),
    row('response_item', { type: 'function_call_output', call_id: 'copied-call', output: '{}' }, -750),
    row('event_msg', { type: 'task_complete', turn_id: 'copied-parent-turn' }, -700),
    row('event_msg', start('child-live-turn'), -100),
    row('response_item', { type: 'reasoning', summary: [] }, -50)];
  const stamp = `${day.join('-')}T12-00-00`;
  const files = [path.join(dir, `rollout-${stamp}-${ids.root}.jsonl`),
    path.join(dir, `rollout-${stamp}-${ids.child}.jsonl`)];
  for (let index = 0; index < files.length; index += 1) {
    fs.writeFileSync(files[index], [rootRows, childRows][index].join('\n') + '\n', { mode: 0o600 });
    fs.utimesSync(files[index], time / 1000, time / 1000);
  }
  assert.ok(time - oldDate.getTime() >= 30 * 24 * 60 * 60 * 1000);
  return files.map(file => ({ file, content: fs.readFileSync(file) }));
}

function snapshot() {
  const status = current.monitor.status();
  return { mode: 'live', now: Date.now(), sessions: current.store.snapshot(),
    connections: [], demo: { running: false, tick: 0 },
    monitor: { running: status.running, error: status.error },
    version: require(path.join(appRoot, 'package.json')).version, packaged: appRoot.endsWith('.asar') };
}
function broadcast() {
  if (current?.window && !current.window.isDestroyed() && current.ready) {
    current.window.webContents.send('office:snapshot', snapshot());
  }
}
function bind(name, handler) {
  ipcMain.handle('office:' + name, event => {
    if (!current || event.sender !== current.window.webContents) throw new Error('Unexpected IPC sender');
    return handler();
  });
}
async function closePass() {
  if (!current) return;
  current.monitor.stop();
  current.unsubscribe();
  if (!current.window.isDestroyed()) current.window.destroy();
  current = null;
}

async function runPass(pass) {
  const store = createSessionStore({ staleMs: 180000 });
  const monitor = createCodexMonitor({ codexHome, intervalMs: 100,
    onEvent: event => store.ingest(event) });
  const window = new BrowserWindow({ width: 1280, height: 720, useContentSize: true,
    show: false, webPreferences: { preload: path.join(appRoot, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, backgroundThrottling: false } });
  current = { store, monitor, window, ready: false, unsubscribe: store.onChange(broadcast) };
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('render-process-gone', (_event, details) => errors.push(`pass ${pass}: ${details.reason}`));
  window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => {
    errors.push(`pass ${pass}: unexpected network request`); callback({ cancel: true });
  });
  monitor.start();
  await window.loadFile(path.join(appRoot, 'renderer', 'index.html'));
  const deadline = Date.now() + 6000;
  let scene = null;
  while (Date.now() <= deadline) {
    monitor.poll(); broadcast();
    scene = await window.webContents.executeJavaScript(`({
      ids: [...document.querySelectorAll('.actor')].map(node => node.dataset.sessionId).sort(),
      helpers: document.querySelectorAll('.actor[data-helper="true"]').length,
      quiet: document.getElementById('office').dataset.quiet,
      node: typeof require
    })`);
    if (store.snapshot().length === 2 && scene.ids.length === 2 && scene.helpers === 1 && scene.quiet === 'false') break;
    await wait(100);
  }
  const sessions = store.snapshot();
  assert.deepEqual(sessions.map(session => session.id).sort(), expectedIds, `pass ${pass}: backend actors`);
  assert.equal(sessions.filter(session => session.parentId === expectedIds[0]).length, 1, `pass ${pass}: backend parent`);
  assert.ok(sessions.every(session => session.status === 'active'), `pass ${pass}: current activity`);
  assert.equal(monitor.status().error, null, `pass ${pass}: monitor error`);
  assert.deepEqual(scene.ids, expectedIds, `pass ${pass}: rendered actors`);
  assert.equal(scene.helpers, 1, `pass ${pass}: rendered helper`);
  assert.equal(scene.quiet, 'false', `pass ${pass}: occupied studio`);
  assert.equal(scene.node, 'undefined', `pass ${pass}: sandbox isolation`);
  assert.deepEqual(errors, [], `pass ${pass}: renderer errors`);
  checks.push(`pass ${pass}: old-date filesystem discovery restores root and child in production store`,
    `pass ${pass}: sandboxed renderer displays both IDs and one helper with quiet=false`);
  rendered.push({ pass, backend: sessions.length, actors: scene.ids.length, helpers: scene.helpers, quiet: false });
  await closePass();
}

app.whenReady().then(async () => {
  bind('snapshot', snapshot);
  bind('settings', () => ({ ...settings }));
  ipcMain.on('office:preload-ready', event => {
    if (current && event.sender === current.window.webContents) { current.ready = true; broadcast(); }
  });
  ipcMain.on('office:renderer-error', (event, message) => {
    if (current && event.sender === current.window.webContents) errors.push(String(message).slice(0, 300));
  });
  const files = makeFixture();
  await runPass(1);
  // The fresh monitor/store/window must rediscover unchanged files on disk.
  await runPass(2);
  for (const { file, content } of files) assert.deepEqual(fs.readFileSync(file), content, 'observer changed fixture data');
  checks.push('restart preserves fixture bytes and installs no global hooks');
  console.log(JSON.stringify({ ok: true, synthetic: true, restarts: 2,
    version: require(path.join(appRoot, 'package.json')).version,
    fixtureAgeDays: 35, checks, rendered, rendererErrors: errors }, null, 2));
  await cleanup(); app.exit(0);
}).catch(async error => {
  console.error(JSON.stringify({ ok: false, synthetic: true, restarts: 2,
    error: String(error.message), checks, rendered, rendererErrors: errors }, null, 2));
  await cleanup(); app.exit(1);
});

async function cleanup() {
  await closePass();
  ipcMain.removeHandler('office:snapshot'); ipcMain.removeHandler('office:settings');
  // Only the owned temporary fixture and isolated profile are removed.
  fs.rmSync(fixtureDir, { recursive: true, force: true });
}
