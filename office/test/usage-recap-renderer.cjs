'use strict';
// Synthetic daily recap in the production usage dialog: privacy default, opt-in projects, PNG export.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-recap-ui-'));
app.setPath('userData', path.join(dir, 'profile')); app.disableHardwareAcceleration();
const errors = [], recaps = [], saved = [], wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let win, settings = { language: 'zh', idleVisitor: false, reducedMotion: true };
const guard = setTimeout(() => { console.error('Daily recap fixture timed out'); app.exit(1); }, 60000);
const recap = input => ({ ok: true, scope: 'observed', timeZone: 'Asia/Hong_Kong', day: input.day,
  totals: { agents: 3, roots: 2, helpers: 1, events: 40, turns: 6, toolCalls: 18, failures: 1, activeMs: 5400000, waitingMs: 300000 },
  checks: { passed: 4, failed: 1 }, activities: [{ activity: 'testing', ms: 3000000 }, { activity: 'coding', ms: 2000000 }], providers: [{ provider: 'codex', agents: 3 }],
  tokens: 98765, ...(input.includeProjects ? { projects: [{ name: 'Example project', ms: 5400000 }] } : {}), title: 'PRIVATE TITLE MUST NOT APPEAR' });
const preload = path.join(dir, 'fixture-preload.cjs');
fs.writeFileSync(preload, `'use strict';const {contextBridge,ipcRenderer}=require('electron');const api={};
for(const name of ['getSnapshot','getSettings','setSettings','listDisplays','getUsageHistory','getUsageEvents','getUsageStatus','getTokenUsage','refreshTokenUsage','exportUsageHistory','openUsageFolder','getUsageRecap','exportUsageRecap'])api[name]=(...args)=>ipcRenderer.invoke('recap-fixture:'+name,...args);
api.onSnapshot=()=>()=>{};contextBridge.exposeInMainWorld('office',Object.freeze(api));
window.addEventListener('error',event=>ipcRenderer.send('recap-fixture:error',String(event.message)));
window.addEventListener('unhandledrejection',event=>ipcRenderer.send('recap-fixture:error',String(event.reason?.message||event.reason)));`);
app.whenReady().then(async () => {
  const empty = { agents: 0, roots: 0, helpers: 0, events: 0, turns: 0, toolCalls: 0, failures: 0, activeMs: 0, waitingMs: 0 };
  const handlers = {
    getSnapshot: () => ({ mode: 'live', sessions: [], connections: [] }), getSettings: () => settings, setSettings: patch => (settings = { ...settings, ...patch }), listDisplays: () => [],
    getUsageStatus: () => ({ available: true, path: '/fixture/usage.sqlite', agents: 0, events: 0, timeZone: 'Asia/Hong_Kong' }),
    getUsageHistory: () => ({ ok: true, scope: 'observed', timeZone: 'Asia/Hong_Kong', total: 0, items: [], totals: empty }),
    getUsageEvents: () => ({ ok: true, total: 0, items: [] }),
    getTokenUsage: () => ({ ok: true, scope: 'session-logs', timeZone: 'Asia/Hong_Kong', totals: { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 0 }, models: [], status: { available: true, providers: ['codex'], files: 0, requests: 0 } }),
    refreshTokenUsage: () => ({ available: true }), exportUsageHistory: () => ({ canceled: true }), openUsageFolder: () => ({ opened: true }),
    getUsageRecap: input => { recaps.push(input); return recap(input); },
    exportUsageRecap: input => { saved.push(input); return { exported: true, bytes: input.png.length, path: '/fixture/recap.png' }; }
  };
  for (const [name, handler] of Object.entries(handlers)) ipcMain.handle('recap-fixture:' + name, (_, ...args) => handler(...args));
  ipcMain.on('recap-fixture:error', (_, message) => errors.push(message));
  win = new BrowserWindow({ width: 1000, height: 760, useContentSize: true, show: false, webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  await win.loadFile(path.join(__dirname, '../renderer/index.html')); await wait(250);
  const run = source => win.webContents.executeJavaScript(source, true);
  const until = async (source, label) => { const end = Date.now() + 10000; while (Date.now() < end) { if (await run(source)) return; await wait(50); } throw Error(label); };
  await run(`document.getElementById('usage-history-button').click()`);
  await until(`document.querySelectorAll('.usage-recap-item').length===8`, 'the recap card renders eight metadata rows');
  assert.equal(recaps[0].includeProjects, false, 'project names are off by default');
  assert.match(recaps[0].day, /^\d{4}-\d{2}-\d{2}$/);
  const text = await run(`document.querySelector('.usage-recap-section').textContent`);
  assert.match(text, /每日回顾/); assert.match(text, /通过 4 · 未通过 1/); assert.match(text, /测试 · 编写代码/);
  assert.doesNotMatch(text, /Example project|PRIVATE/);
  await run(`(()=>{const box=document.querySelector('.usage-recap-privacy input');box.checked=true;box.dispatchEvent(new Event('change'));})()`);
  await until(`document.querySelector('.usage-recap-item[data-key="projects"]')?.textContent.includes('Example project')`, 'opting in shows project names');
  assert.equal(recaps.at(-1).includeProjects, true);
  await run(`document.querySelector('.usage-recap-controls .button').click()`);
  await until(`document.querySelector('.usage-recap-section [role="status"]').textContent==='已导出回顾图片。'`, 'export reports success');
  assert.equal(saved.length, 1);
  const bytes = Buffer.from(saved[0].png.replace('data:image/png;base64,', ''), 'base64');
  assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const card = '/tmp/office-daily-recap.png'; fs.writeFileSync(card, bytes);
  const dialog = '/tmp/office-daily-recap-dialog.png'; fs.writeFileSync(dialog, (await win.webContents.capturePage()).toPNG());
  await run(`document.getElementById('language-button').click()`);
  await until(`document.getElementById('usage-recap-title').textContent==='Daily recap'`, 'the card follows the language switch');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks: ['the daily recap shows only metadata, keeps project names off by default, exports a real PNG and follows the language switch'], card, dialog }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(guard); win?.destroy(); fs.rmSync(dir, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
