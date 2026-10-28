'use strict';

// Electron fixture: real hook -> spool -> bridge -> store -> sandboxed renderer.
// An optional appRoot (including app.asar) verifies the packaged implementation.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const appRoot = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { createObserverBridge, buildObserverCommand } = require(path.join(appRoot, 'lib/observer-bridge.cjs'));
const { createSessionStore } = require(path.join(appRoot, 'lib/session-store.cjs'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-office-cursor-native-'));
const dataDir = path.join(scratch, 'data'), homeDir = path.join(scratch, 'home');
fs.mkdirSync(homeDir); app.setPath('userData', path.join(scratch, 'profile'));
app.disableHardwareAcceleration();
const store = createSessionStore(), accepted = [], errors = [];
const options = { dataDir, homeDir, appRoot, electronPath: process.execPath, env: { PATH: '' } };
const bridge = createObserverBridge({ ...options, onEvent: event => store.ingest(event) });
store.onAccepted(event => accepted.push(event));
const settings = { language: 'en', idleVisitor: false, reducedMotion: process.env.MINI_OFFICE_CURSOR_MOTION !== '1',
  agentScale: Number(process.env.MINI_OFFICE_CURSOR_SCALE) || 0.8 };
const snapshot = () => ({ mode: 'live', now: Date.now(), sessions: store.snapshot(), connections: [], monitor: { running: true }, version: 'fixture' });
let win;
function publish() { win.webContents.send('office:snapshot', snapshot()); }
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (!await check()) { assert.ok(Date.now() < deadline, 'Cursor fixture timed out'); await wait(50); }
}
async function hook(event, conversation_id, extra = {}) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-c', buildObserverCommand(options, 'cursor', event)], {
      env: { ...process.env, HOME: homeDir }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => stdout += chunk);
    child.stderr.on('data', chunk => stderr += chunk);
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify({ conversation_id, generation_id: 'native-generation',
      tool_use_id: 'native-call', tool_name: 'Read', workspace_roots: [scratch], ...extra }));
  });
  assert.deepEqual(result, { code: 0, stdout: '{}\n', stderr: '' });
}
app.whenReady().then(async () => {
  for (const [name, handler] of Object.entries({ snapshot, settings: () => settings })) ipcMain.handle('office:' + name, handler);
  ipcMain.on('office:preload-ready', publish);
  ipcMain.on('office:renderer-error', (_event, message) => errors.push(message));
  win = new BrowserWindow({ width: 1280, height: 720, show: false, webPreferences: {
    preload: path.join(appRoot, 'preload.cjs'), contextIsolation: true, nodeIntegration: false,
    sandbox: true, webSecurity: true, backgroundThrottling: false,
  } });
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => {
    errors.push('Unexpected network request'); callback({ cancel: true });
  });
  bridge.start();
  await win.loadFile(path.join(appRoot, 'renderer/index.html'));
  await hook('postToolUse', 'desktop-chat');
  await hook('postToolUse', 'cli-chat', { tool_name: 'Write' });
  await until(() => store.snapshot().length === 2);
  const expected = ['cursor:cli-chat', 'cursor:desktop-chat'];
  let rendered;
  await until(async () => {
    publish();
    rendered = await win.webContents.executeJavaScript(`({ids:[...document.querySelectorAll('.actor')].filter(n=>getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.9&&n.dataset.walking!=='true').map(n=>n.dataset.sessionId).sort(),scales:[...document.querySelectorAll('.actor')].map(n=>{const m=new DOMMatrixReadOnly(getComputedStyle(n).transform);return Math.hypot(m.m11,m.m12)}),overflow:document.getElementById('office').dataset.overflowCount,quiet:document.getElementById('office').dataset.quiet,node:typeof require})`);
    return JSON.stringify(rendered.ids) === JSON.stringify(expected) && rendered.quiet === 'false';
  });
  assert.ok(rendered.scales.every(scale => Math.abs(scale - settings.agentScale) < 0.00001));
  assert.equal(Number(rendered.overflow || 0), 0);
  assert.ok(store.snapshot().every(session => session.activeTools === 0 && session.status === 'active'));
  assert.ok(accepted.every(event => event.event === 'tool-end'));
  assert.equal(rendered.node, 'undefined');
  for (const id of ['desktop-chat', 'cli-chat']) await hook('stop', id, { status: 'completed' });
  await until(() => store.snapshot().every(session => session.status === 'idle'));
  await hook('beforeSubmitPrompt', 'cli-chat', { generation_id: 'next-native-generation' });
  await hook('preToolUse', 'cli-chat', { generation_id: 'next-native-generation' });
  await until(() => store.snapshot().some(session => session.id === 'cursor:cli-chat' && session.activeTools === 1));
  await hook('postToolUse', 'cli-chat', { generation_id: 'next-native-generation' });
  await hook('stop', 'cli-chat', { generation_id: 'next-native-generation', status: 'completed' });
  await until(() => store.snapshot().every(session => session.status === 'idle' && session.activeTools === 0));
  await until(async () => {
    publish();
    return win.webContents.executeJavaScript(`document.querySelectorAll('.actor').length===0&&document.getElementById('office').dataset.quiet==='true'`);
  }, 45000);
  assert.deepEqual(errors, []);
  assert.equal(fs.existsSync(path.join(homeDir, '.cursor')), false, 'fixture must not install hooks');
  console.log(JSON.stringify({ ok: true, synthetic: true, packaged: appRoot.endsWith('.asar'), actors: rendered.ids,
    passiveResponse: {}, liveStartObserved: true, scale: settings.agentScale, pendingTools: 0, explicitStopSettles: true, allBodiesDeparted: true, rendererErrors: errors }));
  cleanup(); app.exit(0);
}).catch(error => { console.error(error); cleanup(); app.exit(1); });
function cleanup() { bridge.stop(); if (win && !win.isDestroyed()) win.destroy(); fs.rmSync(scratch, { recursive: true, force: true }); }
