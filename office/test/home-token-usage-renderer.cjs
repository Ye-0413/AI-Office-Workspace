'use strict';
// Synthetic local-log totals only; no real provider requests or private logs.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-home-tokens-'));
app.setPath('userData', path.join(dir, 'profile')); app.disableHardwareAcceleration();
const errors = [], wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const usage = { date: '2026-10-23', timeZone: 'Asia/Hong_Kong', weekFrom: '2026-10-19', weekTo: '2026-10-25', dailyTokens: 12345678, weeklyTokens: 2345000000,
  available: true, importing: false, lastScanAt: Date.parse('2026-10-23T04:30:00Z'), providers: ['codex', 'claude-code'] };
const quota = { available: true, stale: false, observedAt: Date.parse('2026-10-23T04:30:00Z'), windows: [
  { slot: 'primary', usedPercent: 31.5, windowMinutes: 300, resetAt: Date.parse('2026-10-23T09:30:00Z') },
  { slot: 'secondary', usedPercent: 89, windowMinutes: 10080, resetAt: Date.parse('2026-10-30T04:30:00Z') }
] };
let settings = { language: 'en', reducedMotion: true, idleVisitor: false };
let currentSnapshot = { mode: 'live', sessions: [], connections: [], activityStats: { total: 21, roots: 12, helpers: 9 }, tokenUsage: usage, codexQuota: quota };
const preload = path.join(dir, 'preload.cjs');
fs.writeFileSync(preload, `'use strict';const{contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('office',Object.freeze({getSnapshot:()=>ipcRenderer.invoke('home-tokens:snapshot'),getSettings:()=>ipcRenderer.invoke('home-tokens:settings'),setSettings:patch=>ipcRenderer.invoke('home-tokens:settings',patch),listDisplays:()=>Promise.resolve([]),onSnapshot:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('home-tokens:snapshot',listener);return()=>ipcRenderer.removeListener('home-tokens:snapshot',listener);}}));window.addEventListener('error',event=>ipcRenderer.send('home-tokens:error',String(event.message)));window.addEventListener('unhandledrejection',event=>ipcRenderer.send('home-tokens:error',String(event.reason?.message||event.reason)));`);
let win;
app.whenReady().then(async () => {
  ipcMain.handle('home-tokens:snapshot', () => currentSnapshot);
  ipcMain.handle('home-tokens:settings', (_, patch) => (settings = { ...settings, ...patch }));
  ipcMain.on('home-tokens:error', (_, message) => errors.push(message));
  win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: false, webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await win.loadFile(path.join(__dirname, '../renderer/index.html')); await wait(300);
  const run = source => win.webContents.executeJavaScript(source, true);
  const update = async tokenUsage => { currentSnapshot = { ...currentSnapshot, tokenUsage }; win.webContents.send('home-tokens:snapshot', currentSnapshot); await wait(30); };
  const updateQuota = async codexQuota => { currentSnapshot = { ...currentSnapshot, codexQuota }; win.webContents.send('home-tokens:snapshot', currentSnapshot); await wait(30); };
  const setLanguage = async language => { if (settings.language !== language) { await run(`document.getElementById('language-button').click()`); await wait(50); } assert.equal(settings.language, language); };
  assert.equal(await run(`document.getElementById('home-token-daily').textContent`), '12.35M');
  assert.equal(await run(`document.getElementById('home-token-weekly').textContent`), '2.35B');
  assert.match(await run(`document.getElementById('home-token-usage').title`), /12,345,678 tokens/);
  assert.match(await run(`document.getElementById('home-token-usage').title`), /2026-10-19 to 2026-10-25/);
  assert.equal(await run(`document.getElementById('home-codex-quota-primary-value').textContent`), '68.5%');
  assert.equal(await run(`document.getElementById('home-codex-quota-secondary-value').textContent`), '11%');
  assert.match(await run(`document.getElementById('home-codex-quota-accessible').textContent`), /5 hours.*68\.5% remaining.*7 days.*11% remaining/);
  assert.equal(await run(`document.querySelectorAll('.actor').length`), 0, 'token imports cannot create room actors');
  for (const size of [[1280, 720], [1000, 720], [800, 450]]) {
    win.setContentSize(...size); await wait(100);
    for (const language of ['zh', 'en']) {
      await setLanguage(language);
      for (const style of ['pixel', 'painted']) {
        await run(`document.documentElement.dataset.avatarStyle='${style}'`);
      const geometry = await run(`(()=>{const panel=document.getElementById('home-token-usage'),stats=document.getElementById('activity-stats'),clock=document.getElementById('day-clock'),p=panel.getBoundingClientRect(),s=stats.getBoundingClientRect(),c=clock.getBoundingClientRect();return{statsInViewport:s.left>=0&&s.top>=0&&s.right<=innerWidth&&s.bottom<=innerHeight,noClockOverlap:s.right<=c.left,contentFits:[...panel.querySelectorAll('dt,dd')].every(node=>node.scrollWidth<=node.clientWidth),panelInsideLedger:p.left>=s.left&&p.right<=s.right,bodyFits:document.body.scrollWidth<=innerWidth&&document.body.scrollHeight<=innerHeight};})()`);
      for (const [key, value] of Object.entries(geometry)) assert.equal(value, true, JSON.stringify({ size, language, style, key, geometry }));
      await run(`document.getElementById('home-token-usage').focus()`);
      assert.equal(await run(`document.activeElement.id`), 'home-token-usage', 'source and complete counts are reachable by keyboard');
      const quotaGeometry = await run(`(()=>{const panel=document.getElementById('home-codex-quota'),button=document.getElementById('home-codex-quota-toggle'),stats=document.getElementById('activity-stats'),p=panel.getBoundingClientRect(),b=button.getBoundingClientRect(),s=stats.getBoundingClientRect();return{insideLedger:p.left>=s.left&&p.right<=s.right&&p.top>=s.top&&p.bottom<=s.bottom,buttonFits:b.left>=p.left&&b.right<=p.right&&b.bottom<=p.bottom,headingFits:button.querySelector('.codex-quota-heading').scrollWidth<=button.querySelector('.codex-quota-heading').clientWidth,rowsFit:[...button.querySelectorAll('.codex-quota-line')].every(n=>n.scrollWidth<=n.clientWidth)};})()`);
      for (const [key, value] of Object.entries(quotaGeometry)) assert.equal(value, true, JSON.stringify({ size, language, style, key, quotaGeometry }));
      await run(`document.getElementById('home-codex-quota-toggle').focus();document.getElementById('home-codex-quota-toggle').click()`);
      assert.equal(await run(`document.getElementById('home-codex-quota-toggle').getAttribute('aria-expanded')`), 'true');
      const card = await run(`(()=>{const p=document.getElementById('home-codex-quota-details').getBoundingClientRect();return p.left>=0&&p.right<=innerWidth&&p.top>=0&&p.bottom<=innerHeight})()`);
      assert.equal(card, true, JSON.stringify({ size, language, style, card }));
      assert.match(await run(`document.getElementById('home-codex-quota-details').textContent`), language === 'en' ? /68\.5% remaining/ : /剩余 68\.5%/);
      await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
      assert.equal(await run(`document.getElementById('home-codex-quota-details').hidden`), true);
      assert.equal(await run(`document.activeElement.id`), 'home-codex-quota-toggle');
      }
    }
  }
  await updateQuota({ ...quota, stale: true });
  assert.equal(await run(`document.getElementById('home-codex-quota').dataset.state`), 'stale');
  assert.equal(await run(`document.getElementById('home-codex-quota-status').textContent`), 'Stale');
  await updateQuota({ available: false, observedAt: null, stale: false, windows: [] });
  assert.equal(await run(`document.getElementById('home-codex-quota-primary-value').textContent`), '—');
  assert.equal(await run(`document.getElementById('home-codex-quota').dataset.state`), 'unavailable');
  for (const tokens of [1, 999999, 1000000000000, Number.MAX_SAFE_INTEGER]) {
    await update({ ...usage, dailyTokens: tokens, weeklyTokens: tokens });
    const widths = await run(`[...document.querySelectorAll('#home-token-usage dd')].map(node=>({text:node.textContent,scroll:node.scrollWidth,client:node.clientWidth,font:getComputedStyle(node).fontSize}))`);
    assert.equal(widths.every(node => node.scroll <= node.client), true, 'compact totals fit the ledger: ' + JSON.stringify({ tokens, widths }));
  }
  await update({ ...usage, importing: true, error: 'fixture local scan error' });
  assert.equal(await run(`document.getElementById('home-token-usage').dataset.error`), 'true');
  assert.match(await run(`document.getElementById('home-token-state').textContent`), /Import in progress.*Import or read failed/);
  await update({ ...usage, available: false });
  assert.equal(await run(`document.getElementById('home-token-daily').textContent`), '—');
  if (process.env.MINI_OFFICE_PREVIEW_DIR) {
    fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR, { recursive: true });
    await update(usage);
    await updateQuota(quota);
    await run(`document.documentElement.dataset.avatarStyle='pixel'`);
    fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR, 'home-token-usage-800x450.png'), (await win.webContents.capturePage()).toPNG());
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks: ['daily and weekly M/B/T totals', 'exact-count/calendar/source descriptions', 'no live actors from token history', 'bilingual compact ledger and Codex meters in both themes at 1280/1000/800 widths', 'clock clearance', 'keyboard quota details and Escape', 'quota freshness/unavailable states', 'token partial/error/unavailable states'], errors }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { win?.destroy(); fs.rmSync(dir, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
