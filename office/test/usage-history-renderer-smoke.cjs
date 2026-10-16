'use strict';
// Synthetic, isolated native UI fixtures. No provider requests or real usage data.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Persona = require('../lib/agent-persona.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-usage-ui-'));
app.setPath('userData', path.join(dir, 'profile')); app.disableHardwareAcceleration();
const errors = [], queries = [], eventQueries = [], actions = [];
const now = Date.now(), wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const hostileId = '<img src=x onerror="window.usageXss=1">';
const items = Array.from({ length: 27 }, (_, index) => ({
  id: index === 0 ? hostileId : 'history-fixture-' + index,
  provider: ['codex', 'claude-code', 'cursor'][index % 3], parentId: index % 4 === 1 ? 'fixture-parent' : null,
  projectName: index === 0 ? '<svg onload="window.usageXss=2">' : 'Example project ' + index,
  firstSeenAt: now - 3600000, lastSeenAt: now - index * 60000,
  events: 34, turns: 2, toolCalls: 7, failures: 1, activeMs: 72000, waitingMs: 12000,
  activityMs: {}, status: 'completed', activity: 'idle',
  title: 'PRIVATE TITLE MUST NOT APPEAR', prompt: 'PRIVATE PROMPT MUST NOT APPEAR', content: 'PRIVATE CONTENT MUST NOT APPEAR'
}));
let win, settings = { language: 'zh', sceneTime: 'auto', idleVisitor: false, reducedMotion: true };
let failHistory = false, failEvents = false, empty = false, exportMode = 'canceled', delayed = false, statusAvailable = true;
function filtered(query) {
  return empty ? [] : items.filter(item => (!query.provider || item.provider === query.provider)
    && (query.role === 'root' ? !item.parentId : query.role === 'helper' ? Boolean(item.parentId) : true));
}
function totals(rows) {
  return { agents: rows.length, roots: rows.filter(item => !item.parentId).length, helpers: rows.filter(item => item.parentId).length,
    ...Object.fromEntries(['events', 'turns', 'toolCalls', 'failures', 'activeMs', 'waitingMs'].map(key => [key, rows.reduce((sum, item) => sum + item[key], 0)])) };
}
const preload = path.join(dir, 'fixture-preload.cjs');
fs.writeFileSync(preload, `'use strict';const {contextBridge,ipcRenderer}=require('electron');const api={};
for(const name of ['getSnapshot','getSettings','setSettings','listDisplays','getUsageHistory','getUsageEvents','getUsageStatus','exportUsageHistory','openUsageFolder'])api[name]=(...args)=>ipcRenderer.invoke('usage-fixture:'+name,...args);
api.onSnapshot=callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('usage-fixture:snapshot',listener);return()=>ipcRenderer.removeListener('usage-fixture:snapshot',listener);};contextBridge.exposeInMainWorld('office',Object.freeze(api));
window.addEventListener('error',event=>ipcRenderer.send('usage-fixture:error',String(event.message)));
window.addEventListener('unhandledrejection',event=>ipcRenderer.send('usage-fixture:error',String(event.reason?.message||event.reason)));`);

app.whenReady().then(async () => {
  const handlers = {
    getSnapshot: () => ({ mode: 'live', sessions: [], connections: [], activityStats: { total: 0, roots: 0, helpers: 0 } }),
    getSettings: () => settings, setSettings: patch => (settings = { ...settings, ...patch }), listDisplays: () => [],
    getUsageStatus: () => ({ available: statusAvailable, path: '/fixture/logs/usage.sqlite', agents: items.length, events: 918, timeZone: 'Asia/Hong_Kong', ...(statusAvailable ? {} : { error: 'Fixture storage unavailable' }) }),
    getUsageHistory: async query => {
      queries.push(query); if (failHistory) return { ok: false, error: 'Fixture history error' };
      const rows = filtered(query); if (delayed) await wait(query.provider === 'codex' ? 250 : 20);
      return { ok: true, scope: 'observed', timeZone: 'Asia/Hong_Kong', total: rows.length, items: rows.slice(query.offset, query.offset + query.limit), totals: totals(rows) };
    },
    getUsageEvents: async query => {
      eventQueries.push(query); if (failEvents) throw new Error('Fixture event error');
      if (delayed) await wait(query.id === hostileId ? 220 : 20);
      return { ok: true, scope: 'observed', total: 25, items: Array.from({ length: Math.min(query.limit, 25 - query.offset) }, (_, index) => ({
        id: 'event-' + (index + query.offset), actorId: query.id, at: now - (index + query.offset) * 1000,
        observedAt: now, event: index % 2 ? 'tool-end' : 'tool-start', activity: 'coding', status: 'active',
        toolName: 'fixture_tool_' + query.id + '_'.repeat(600), outcome: 'success', source: 'hook',
        content: 'PRIVATE EVENT CONTENT MUST NOT APPEAR', prompt: 'PRIVATE EVENT PROMPT MUST NOT APPEAR'
      })) };
    },
    exportUsageHistory: query => { actions.push({ type: 'export', query }); if (exportMode === 'error') throw new Error('Fixture export error'); return exportMode === 'canceled' ? { canceled: true } : { exported: true, rows: filtered(query).length, path: '/fixture/export.csv' }; },
    openUsageFolder: () => { actions.push({ type: 'folder' }); return { opened: true }; }
  };
  for (const [name, handler] of Object.entries(handlers)) ipcMain.handle('usage-fixture:' + name, (_, ...args) => handler(...args));
  ipcMain.on('usage-fixture:error', (_, message) => errors.push(message));
  win = new BrowserWindow({ width: 1000, height: 720, useContentSize: true, show: false, webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  await win.loadFile(path.join(__dirname, '../renderer/index.html')); await wait(250);
  const run = source => win.webContents.executeJavaScript(source, true);
  const click = async id => { await run(`document.getElementById(${JSON.stringify(id)}).click()`); await wait(90); };
  const choose = async (id, value) => { await run(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(90); };
  await click('usage-history-button');
  assert.equal(await run(`document.getElementById('usage-history-dialog').open`), true);
  assert.equal(await run(`document.activeElement.id`), 'usage-range');
  assert.equal(await run(`document.querySelectorAll('.usage-agent-row').length`), 12);
  assert.equal(queries.at(-1).limit, 12);
  const todayParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const today = ['year', 'month', 'day'].map(key => todayParts.find(part => part.type === key).value).join('-');
  assert.equal(queries.at(-1).to, today, 'defaults use the Hong Kong calendar');
  assert.equal(new Date(queries.at(-1).to) - new Date(queries.at(-1).from), 6 * 86400000);
  assert.equal(await run(`document.querySelector('.usage-agent-heading strong').textContent`), Persona.forSession(items[0]).aliasZh);
  assert.equal(await run(`document.querySelector('.usage-agent-id').textContent`), hostileId);
  assert.equal(await run(`window.usageXss`), undefined);
  assert.equal(await run(`document.getElementById('usage-history-dialog').textContent.includes('PRIVATE')`), false);
  assert.equal(await run(`document.querySelectorAll('#usage-history-list img,#usage-history-list svg').length`), 0);
  assert.equal(await run(`document.querySelectorAll('.actor').length`), 0, 'historical records cannot create room actors');
  await click('usage-next'); assert.equal(queries.at(-1).offset, 12);
  await click('usage-next'); assert.equal(queries.at(-1).offset, 24);
  assert.equal(await run(`document.querySelectorAll('.usage-agent-row').length`), 3);
  assert.equal(await run(`document.getElementById('usage-next').disabled`), true);
  await click('usage-prev'); assert.equal(queries.at(-1).offset, 12);
  await choose('usage-provider', 'codex'); await choose('usage-role', 'helper');
  assert.equal(queries.at(-1).provider, 'codex'); assert.equal(queries.at(-1).role, 'helper'); assert.equal(queries.at(-1).offset, 0);
  assert.equal(await run(`[...document.querySelectorAll('.usage-agent-row')].every(row=>row.textContent.includes('分身'))`), true);
  await choose('usage-provider', ''); await choose('usage-role', 'all'); await choose('usage-range', 'all');
  assert.equal(Object.hasOwn(queries.at(-1), 'from'), false); assert.equal(Object.hasOwn(queries.at(-1), 'to'), false);
  await choose('usage-range', '30');
  assert.equal(new Date(queries.at(-1).to) - new Date(queries.at(-1).from), 29 * 86400000);
  await choose('usage-range', 'custom');
  await choose('usage-from', '2026-10-20'); await choose('usage-to', '2026-10-19');
  assert.match(await run(`document.getElementById('usage-feedback').textContent`), /开始日期/);
  await choose('usage-range', 'all');
  await run(`document.querySelector('.usage-agent-row').click()`); await wait(90);
  assert.equal(eventQueries.at(-1).id, hostileId); assert.equal(eventQueries.at(-1).limit, 20);
  assert.equal(await run(`document.querySelectorAll('.usage-event').length`), 20);
  assert.equal(await run(`document.querySelector('.usage-event-detail').title.length>500`), true);
  assert.equal(await run(`document.querySelector('.usage-event-detail').scrollWidth>document.querySelector('.usage-event-detail').clientWidth`), true);
  assert.equal(await run(`document.getElementById('usage-history-dialog').textContent.includes('PRIVATE')`), false);
  await click('usage-event-next'); assert.equal(eventQueries.at(-1).offset, 20);
  assert.equal(await run(`document.querySelectorAll('.usage-event').length`), 5);
  await click('usage-event-prev'); assert.equal(eventQueries.at(-1).offset, 0);
  failEvents = true; await click('usage-event-next');
  assert.match(await run(`document.getElementById('usage-timeline-feedback').textContent`), /Fixture event error/); failEvents = false;
  await click('usage-timeline-close'); assert.equal(await run(`document.getElementById('usage-timeline-section').hidden`), true);
  await click('usage-export'); assert.match(await run(`document.getElementById('usage-feedback').textContent`), /取消/);
  assert.equal(Object.hasOwn(actions.at(-1).query, 'offset'), false, 'CSV uses the whole selected range');
  exportMode = 'exported'; await click('usage-export'); assert.match(await run(`document.getElementById('usage-feedback').textContent`), /27/);
  exportMode = 'error'; await click('usage-export'); assert.match(await run(`document.getElementById('usage-feedback').textContent`), /Fixture export error/);
  await click('usage-open-folder'); assert.equal(actions.at(-1).type, 'folder');
  delayed = true;
  await run(`(()=>{const p=document.getElementById('usage-provider');p.value='codex';p.dispatchEvent(new Event('change'));p.value='claude-code';p.dispatchEvent(new Event('change'));})()`);
  await wait(320);
  assert.equal(await run(`[...document.querySelectorAll('.usage-provider-badge')].every(e=>e.textContent==='Claude Code')`), true, 'late filter responses cannot overwrite newer results');
  await choose('usage-provider', '');
  await run(`(()=>{const rows=document.querySelectorAll('.usage-agent-row');rows[0].click();rows[1].click();})()`); await wait(280);
  assert.match(await run(`document.getElementById('usage-selected-name').textContent`), /history-fixture-1/);
  assert.equal(await run(`[...document.querySelectorAll('.usage-event-detail')].every(e=>e.textContent.includes('history-fixture-1'))`), true, 'late timelines cannot overwrite a newly selected agent');
  delayed = false;
  await click('usage-history-close'); await click('language-button'); await click('usage-history-button');
  assert.equal(await run(`document.getElementById('usage-history-title').textContent`), 'Usage history');
  assert.equal(await run(`document.querySelector('.usage-agent-heading strong').textContent`), Persona.forSession(items[0]).aliasEn);
  assert.match(await run(`document.getElementById('usage-history-scope').textContent`), /not tokens or cost/);
  assert.match(await run(`document.querySelector('.usage-agent-last').textContent`), /Last observed/);
  empty = true; await click('usage-refresh');
  assert.match(await run(`document.getElementById('usage-history-list').textContent`), /No agents/);
  assert.equal(await run(`document.getElementById('usage-next').disabled`), true); empty = false;
  failHistory = true; await click('usage-refresh');
  assert.match(await run(`document.getElementById('usage-feedback').textContent`), /Fixture history error/);
  assert.equal(await run(`document.getElementById('error-message').hidden`), true, 'usage failures stay inside their panel'); failHistory = false;
  statusAvailable = false; await click('usage-refresh');
  assert.equal(await run(`document.getElementById('usage-history-button').dataset.error`), 'true');
  assert.match(await run(`document.getElementById('usage-history-button').getAttribute('aria-label')`), /could not be saved/);
  statusAvailable = true; await click('usage-refresh');
  assert.equal(await run(`document.getElementById('usage-history-button').dataset.error`), 'false');
  win.webContents.send('usage-fixture:snapshot',{mode:'live',sessions:[],connections:[],usageLog:{available:false,error:'Live write failure'}}); await wait(90);
  assert.match(await run(`document.getElementById('usage-storage-state').textContent`),/unavailable/,'open panel reflects a live write failure without refresh');
  assert.match(await run(`document.getElementById('usage-feedback').textContent`),/Live write failure/);
  assert.equal(await run(`document.getElementById('usage-export').disabled`),true);
  win.webContents.send('usage-fixture:snapshot',{mode:'live',sessions:[],connections:[],usageLog:{available:true}}); await wait(90);
  assert.equal(await run(`document.getElementById('usage-feedback').textContent`),'');
  assert.match(await run(`document.getElementById('usage-storage-state').textContent`),/Saved persistently/);
  for (const size of [[1000, 720], [800, 450]]) {
    win.setContentSize(...size); await wait(100);
    for (const language of ['en', 'zh']) {
      if (settings.language !== language) { await click('usage-history-close'); await click('language-button'); await click('usage-history-button'); }
      await run(`document.querySelector('.usage-agent-row').click()`); await wait(70);
      const layout = await run(`(()=>{const d=document.getElementById('usage-history-dialog'),r=d.getBoundingClientRect();return{inViewport:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,horizontalOverflow:d.scrollWidth>d.clientWidth+1,scrollable:d.scrollHeight>d.clientHeight,bodyOverflow:document.body.scrollWidth>innerWidth||document.body.scrollHeight>innerHeight,allControlsFit:[...d.querySelectorAll('button,input,select')].filter(e=>!e.hidden&&e.offsetParent).every(e=>{const b=e.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right;})};})()`);
      assert.equal(layout.inViewport, true, JSON.stringify({ size, language, layout })); assert.equal(layout.horizontalOverflow, false); assert.equal(layout.bodyOverflow, false); assert.equal(layout.allControlsFit, true);
      if (size[1] === 450) assert.equal(layout.scrollable, true);
    }
  }
  if (process.env.MINI_OFFICE_PREVIEW_DIR) {
    fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR, { recursive: true });
    await run(`document.getElementById('usage-history-dialog').scrollTop=0`);
    fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR, 'usage-history-800x450.png'), (await win.webContents.capturePage()).toPNG());
  }
  await click('usage-history-close');
  await run(`(()=>{const old=document.getElementById('usage-history-button');old.replaceWith(old.cloneNode(true));window.fixtureMissingUsage=OfficeUsageHistory.create({bridge:{},getLanguage:()=> 'en'});document.getElementById('usage-history-button').click();})()`); await wait(90);
  assert.match(await run(`document.getElementById('usage-feedback').textContent`), /unavailable/);
  await run(`window.fixtureMissingUsage.dispose()`);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, agents: items.length, checks: ['Hong Kong date filters', 'provider and relationship filters', 'history and event pagination', 'locale-specific stable nicknames', 'no prompts or content', 'text-only XSS-safe rendering', 'history never reappears as live actors', 'full-range CSV and cancel/error states', 'local error recovery', 'out-of-order response guard', 'persistent-log warning and recovery', '800 × 450 bilingual scroll layout', 'missing API fallback'], errors }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { win?.destroy(); fs.rmSync(dir, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
