'use strict';
// Isolated native fixtures only. No actual hooks, configs or providers change.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'office-setup-ui-'));
app.setPath('userData', path.join(scratch, 'profile')); app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-color-profile', 'srgb'); app.commandLine.appendSwitch('force-device-scale-factor', '1');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [], initializations = [], connections = [];
let win, legacyWin, settings = { language: 'zh', idleVisitor: false, reducedMotion: true };
let setupReads = 0, pendingSetup = null, pendingConnection = null, nextError = null, holdSetupRead = false, releaseSetupRead = null;
let setup = { running: false, rows: [], totals: { configured: 0, failed: 0, skipped: 0, pending: 0 } };
let configured = false;
const normalDetail = '已配置 · 等待工具产生事件';
const injection = '<img src=x onerror="window.setupXss=1">';
function state(rows, running = false, error) {
  const totals = { configured: 0, failed: 0, skipped: 0, pending: 0 };
  for (const row of rows) totals[row.status === 'configuring' ? 'pending' : row.status]++;
  return { running, rows, totals, ...(error ? { error } : {}) };
}
function rows(codex, claude, detail = normalDetail) {
  return [{ provider: 'codex', status: codex, installed: codex === 'configured', watching: false, detail },
    { provider: 'claude-code', status: claude, installed: claude === 'configured', watching: false, detail },
    { provider: 'cursor-agent', status: 'skipped', installed: false, watching: false, detail: 'Tool not detected; no configuration was created.' }];
}
function snapshot() {
  return { mode: 'live', sessions: [], setup, usageLog: { available: true }, activityStats: { total: 0, roots: 0, helpers: 0 },
    connections: [{ provider: 'codex', installed: configured, watching: false, detail: normalDetail }, { provider: 'claude-code', installed: false, watching: false, detail: '等待真实活动' }] };
}
function publish(next) { setup = next; if (win && !win.isDestroyed()) win.webContents.send('office:snapshot', snapshot()); }
const guard = setTimeout(() => { console.error('Setup UI fixture timed out.'); app.exit(1); }, 45000);
app.whenReady().then(async () => {
  const handlers = {
    snapshot, settings: () => settings, 'set-settings': patch => (settings = { ...settings, ...patch }), displays: () => [],
    'setup-status': () => { setupReads++; if (holdSetupRead) { const stale = structuredClone(setup); holdSetupRead = false; return new Promise(resolve => { releaseSetupRead = () => resolve(stale); }); } return setup; },
    'setup-initialize': options => {
      initializations.push(options); assert.equal(typeof options.retryFailed, 'boolean');
      if (nextError) { const message = nextError; nextError = null; throw new Error(message); }
      publish(state(rows(options.retryFailed ? 'configured' : 'configuring', options.retryFailed ? 'configuring' : 'pending'), true));
      return new Promise(resolve => { pendingSetup = final => { configured = final.rows.some(row => row.provider === 'codex' && row.status === 'configured'); publish(final); pendingSetup = null; resolve(final); }; });
    },
    connect: provider => { connections.push(provider); return new Promise(resolve => { pendingConnection = () => { pendingConnection = null; resolve({ status: 'ok', installed: true }); }; }); },
    disconnect: provider => { connections.push('remove:' + provider); return { status: 'ok', installed: false }; }
  };
  for (const [name, handler] of Object.entries(handlers)) ipcMain.handle('office:' + name, (_, ...args) => handler(...args));
  ipcMain.on('office:renderer-error', (_, message) => errors.push(message));
  win = new BrowserWindow({ width: 1000, height: 720, useContentSize: true, show: false, webPreferences: { preload: path.join(__dirname, '../preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  await win.loadFile(path.join(__dirname, '../renderer/index.html')); await wait(250);
  const run = source => win.webContents.executeJavaScript(source, true);
  const click = async id => { await run(`document.getElementById(${JSON.stringify(id)}).click()`); await wait(75); };
  const providerButton = provider => `document.querySelector('.provider-icon[data-provider="${provider}"]').closest('.provider-row').querySelector('button')`;
  assert.equal(initializations.length, 0, 'startup must not initialize integrations automatically');
  await click('connections-button'); assert.equal(setupReads, 1); assert.equal(initializations.length, 0, 'opening connections only reads setup status');
  assert.equal(await run(`document.getElementById('setup-initialize').textContent`), '一键初始化');
  await run(`(()=>{const b=document.getElementById('setup-initialize');b.click();b.click();b.dispatchEvent(new Event('click'));})()`); await wait(90);
  assert.equal(initializations.length, 1, 'rapid and synthetic repeated clicks dispatch once'); assert.deepEqual(initializations[0], { retryFailed: false });
  assert.equal(await run(`document.getElementById('setup-initialize').disabled`), true);
  assert.equal(await run(`document.getElementById('setup-initialize').textContent`), '正在初始化…');
  assert.ok(await run(`document.querySelectorAll('.setup-result').length>=2`));
  assert.match(await run(`document.getElementById('setup-result-list').textContent`), /正在配置/);
  assert.equal(await run(`document.getElementById('setup-results').open`), true, 'per-tool progress is visible while setup runs');
  assert.match(await run(`document.getElementById('setup-summary').textContent`), /待处理 2/);
  assert.equal(await run(`[...document.querySelectorAll('#provider-connections button')].every(button=>button.disabled)`), true, 'bulk setup disables individual configuration actions');
  await run(`${providerButton('codex')}.click()`); await wait(30); assert.equal(connections.length, 0);
  publish(state(rows('configured', 'configuring'), true)); await wait(70);
  assert.match(await run(`document.getElementById('setup-result-list').textContent`), /Codex CLI · 已配置/);
  assert.match(await run(`document.getElementById('setup-summary').textContent`), /已配置 1/);
  holdSetupRead = true; await click('connections-button');
  pendingSetup(state(rows('configured', 'failed'))); await wait(100);
  releaseSetupRead(); await wait(80);
  assert.equal(await run(`document.getElementById('setup-initialize').disabled`), false);
  assert.match(await run(`document.getElementById('setup-summary').textContent`), /失败 1/, 'a delayed running status read cannot overwrite a newer completed snapshot');
  assert.equal(await run(`document.getElementById('setup-retry').hidden`), false);
  assert.equal(await run(`document.getElementById('setup-retry').disabled`), false);
  assert.equal(await run(`document.getElementById('setup-results').open`), true);
  assert.match(await run(`document.getElementById('setup-summary').textContent`), /失败 1/);
  assert.equal(await run(`document.getElementById('connection-count').textContent`), '0', 'configured is not evidence of live observation');
  assert.equal(await run(`document.querySelector('.provider-icon[data-provider="codex"]').closest('.provider-row').querySelector('.provider-status').dataset.connected`), 'false');
  assert.match(await run(`document.querySelector('.provider-icon[data-provider="codex"]').closest('.provider-row').querySelector('.provider-status').textContent`), /已配置.*等待/);
  assert.match(await run(`document.getElementById('setup-results').textContent`), /配置完成不等于/);
  await click('setup-retry'); assert.equal(initializations.length, 2); assert.deepEqual(initializations[1], { retryFailed: true });
  assert.equal(await run(`document.getElementById('setup-retry').disabled`), true);
  pendingSetup(state(rows('configured', 'configured'))); await wait(90);
  assert.equal(await run(`document.getElementById('setup-retry').hidden`), true); assert.match(await run(`document.getElementById('setup-summary').textContent`), /已配置 2/);
  await run(`${providerButton('claude-code')}.click()`); await wait(65);
  assert.equal(connections.length, 1);
  assert.equal(await run(`document.getElementById('setup-initialize').disabled`), true, 'an individual configuration action disables bulk setup');
  await click('setup-initialize'); assert.equal(initializations.length, 2, 'individual mutation cannot dispatch a concurrent bulk setup');
  pendingConnection(); await wait(100);
  assert.equal(await run(`document.getElementById('setup-initialize').disabled`), false);
  nextError = 'Fixture setup failed: ' + injection; await click('setup-initialize');
  assert.equal(initializations.length, 3); assert.equal(await run(`document.getElementById('setup-initialize').disabled`), false);
  assert.match(await run(`document.getElementById('setup-summary').textContent`), /Fixture setup failed/);
  assert.equal(await run(`document.getElementById('setup-summary').dataset.error`), 'true');
  assert.equal(await run(`document.getElementById('error-message').hidden`), true, 'setup errors stay in the setup panel');
  assert.equal(await run(`document.querySelectorAll('#setup-assistant img').length`), 0); assert.equal(await run(`window.setupXss`), undefined);
  await click('setup-initialize'); assert.equal(initializations.length, 4);
  const hostileRows = [...rows('configured', 'configured', injection), { provider: injection + 'x'.repeat(450), status: 'configured', detail: injection + 'detail'.repeat(180) }];
  pendingSetup(state(hostileRows)); await wait(100);
  assert.equal(await run(`document.getElementById('setup-summary').dataset.error`), 'false', 'successful retry clears the local error');
  assert.equal(await run(`document.querySelectorAll('#setup-result-list img,#setup-result-list svg').length`), 0);
  assert.equal(await run(`window.setupXss`), undefined); assert.match(await run(`document.getElementById('setup-result-list').textContent`), /<img/);
  for (const size of [[1000, 720], [800, 450]]) {
    win.setContentSize(...size); await wait(75);
    for (const language of ['en', 'zh']) {
      if (settings.language !== language) { await run(`document.getElementById('connections-dialog').close()`); await click('language-button'); await click('connections-button'); }
      assert.equal(await run(`document.getElementById('setup-assistant').getAttribute('aria-label')`), language === 'en' ? 'Set up local tools in one click' : '一键初始化本机工具');
      assert.equal(await run(`document.getElementById('setup-initialize').textContent`), language === 'en' ? 'Initialize tools' : '一键初始化');
      assert.match(await run(`document.getElementById('setup-result-list').textContent`), language === 'en' ? /Configured/ : /已配置/);
      const layout = await run(`(()=>{const d=document.getElementById('connections-dialog'),r=d.getBoundingClientRect(),panel=document.getElementById('setup-assistant');return{inViewport:r.top>=0&&r.left>=0&&r.bottom<=innerHeight&&r.right<=innerWidth,horizontalOverflow:d.scrollWidth>d.clientWidth+1,panelOverflow:panel.scrollWidth>panel.clientWidth+1,scrollable:d.scrollHeight>d.clientHeight,controlsFit:[...panel.querySelectorAll('button')].filter(e=>!e.hidden).every(e=>{const b=e.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right;})};})()`);
      assert.equal(layout.inViewport, true, JSON.stringify({ size, language, layout })); assert.equal(layout.horizontalOverflow, false); assert.equal(layout.panelOverflow, false); assert.equal(layout.controlsFit, true);
      if (size[1] === 450) assert.equal(layout.scrollable, true);
    }
  }
  if (process.env.MINI_OFFICE_PREVIEW_DIR) {
    fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR, { recursive: true });
    await run(`document.getElementById('connections-dialog').scrollTop=0`);
    fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR, 'setup-assistant-800x450.png'), (await win.webContents.capturePage()).toPNG());
  }
  const legacyPreload = path.join(scratch, 'legacy-preload.cjs');
  fs.writeFileSync(legacyPreload, `'use strict';const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('office',{getSnapshot:()=>ipcRenderer.invoke('office:snapshot'),getSettings:()=>ipcRenderer.invoke('office:settings'),setSettings:p=>ipcRenderer.invoke('office:set-settings',p),listDisplays:()=>ipcRenderer.invoke('office:displays'),onSnapshot:()=>()=>{}});window.addEventListener('error',e=>ipcRenderer.send('office:renderer-error',String(e.message)));window.addEventListener('unhandledrejection',e=>ipcRenderer.send('office:renderer-error',String(e.reason?.message||e.reason)));`);
  legacyWin = new BrowserWindow({ width: 800, height: 450, useContentSize: true, show: false, webPreferences: { preload: legacyPreload, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  await legacyWin.loadFile(path.join(__dirname, '../renderer/index.html')); await wait(200);
  const legacy = source => legacyWin.webContents.executeJavaScript(source, true);
  assert.equal(await legacy(`document.getElementById('setup-initialize').disabled`), true);
  assert.match(await legacy(`document.getElementById('setup-summary').textContent`), /最新版应用/);
  const dispatched = initializations.length;
  await legacy(`document.getElementById('connections-button').click();document.getElementById('setup-initialize').click()`); await wait(60);
  assert.equal(initializations.length, dispatched, 'missing APIs cannot initialize or cause global rejections');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks: ['no startup auto-initialization', 'single explicit dispatch under repeat clicks', 'visible progressive per-tool results', 'late status read cannot replace completed setup', 'failed-only retry option', 'configured does not imply watching', 'mutual exclusion with individual configuration', 'localized error recovery', 'text-only XSS-safe results', 'bilingual titles and controls', '800 × 450 scroll layout without horizontal overflow', 'missing API fallback'], initializations: initializations.length, errors }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(guard); legacyWin?.destroy(); win?.destroy(); fs.rmSync(scratch, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
