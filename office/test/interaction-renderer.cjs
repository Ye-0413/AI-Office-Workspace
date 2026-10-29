'use strict';
// Exercise keyboard navigation and focus against the sandboxed production page.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'office-interaction-'));
app.setPath('userData', profile); app.disableHardwareAcceleration();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let win;
const errors = [], mutations = [], checks = [];
let settings = { language: 'zh', agentAppearance: 'mixed', reducedMotion: true, idleVisitor: false, sceneWeather: 'off' };
const task = (id, patch = {}) => ({ id: 'codex:' + id, sessionId: id, provider: 'codex', title: 'Task ' + id,
  projectPath: '/fixture/' + id, activity: 'planning', status: 'active', lastEventAt: Date.now(), events: [], evidence: { source: 'hook', confidence: 'high' }, ...patch });
const sessions = [task('needle-a', { title: 'needle-a 原始任务', activity: 'waiting-user', projectPath: '/fixture/Project One' }), task('other-b'), task('other-c')];
let snapshot = { mode: 'live', now: Date.now(), connections: [], sessions };
const run = source => win.webContents.executeJavaScript(source, true);
async function until(source, message, ms = 12000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await run(source)) return; await pause(40); }
  throw Error(message);
}
async function publish(next = sessions) { snapshot = { ...snapshot, now: Date.now(), sessions: next }; win.webContents.send('office:snapshot', snapshot); await pause(120); }
async function search(value) { await run(`(()=>{const n=document.getElementById('roster-search');n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('input',{bubbles:true}));})()`); }
async function capture(name) {
  if (!process.env.MINI_OFFICE_PREVIEW_DIR) return;
  await pause(100);
  fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR, name + '.png'), (await win.webContents.capturePage()).toPNG());
}
const keyboard = (key, options = {}) => run(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true,cancelable:true,...${JSON.stringify(options)}}))`);
const guard = setTimeout(() => { console.error('Interaction fixture exceeded 45 seconds'); app.exit(1); }, 45000);
app.whenReady().then(async () => {
  for (const [name, handler] of Object.entries({ snapshot: () => snapshot, settings: () => settings, 'set-settings': patch => (settings = { ...settings, ...patch }), displays: () => [] })) ipcMain.handle('office:' + name, (_, ...args) => handler(...args));
  for (const name of ['open-source', 'connect', 'disconnect', 'setup-initialize', 'answer-question']) ipcMain.handle('office:' + name, () => { mutations.push(name); return { ok: true }; });
  ipcMain.on('office:renderer-error', (_, error) => errors.push(error));
  win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: false,
    webPreferences: { preload: path.join(__dirname, '../preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  await until(`!document.getElementById('roster-button').hidden`, 'Observed agents must expose the roster');
  await keyboard('k', { metaKey: true });
  assert.equal(await run(`document.getElementById('roster-dialog').open`), true);
  assert.equal(await run(`document.activeElement.id`), 'roster-search');
  assert.equal(await run(`document.querySelectorAll('.roster-row').length`), 3);
  await search('PROJECT ONE');
  assert.deepEqual(await run(`[...document.querySelectorAll('.roster-row')].map(n=>n.dataset.sessionId)`), ['codex:needle-a']);
  await search('codex:other-b');
  assert.deepEqual(await run(`[...document.querySelectorAll('.roster-row')].map(n=>n.dataset.sessionId)`), ['codex:other-b']);
  await search('no match');
  assert.equal(await run(`document.getElementById('roster-empty').hidden`), false);
  assert.equal(await run(`document.getElementById('roster-count').textContent`), '0 / 3 位伙伴');
  await run(`document.getElementById('roster-reset').click();document.getElementById('roster-attention').click()`);
  assert.deepEqual(await run(`[...document.querySelectorAll('.roster-row')].map(n=>n.dataset.sessionId)`), ['codex:needle-a']);
  checks.push('Shortcut opens directly into search; case-insensitive project and exact identity searches, attention filter, count and empty state work');

  await run(`document.getElementById('roster-reset').click()`);
  await capture('roster-zh');
  await keyboard('ArrowDown');
  const focused = await run(`document.activeElement.dataset.sessionId`);
  await run(`window.retainedRosterRow=document.activeElement`);
  await publish();
  assert.equal(await run(`document.activeElement===window.retainedRosterRow`), true, 'An unchanged observation must retain the actual focused row');
  await publish(sessions.map(s => ({ ...s, title: s.title + ' updated' })));
  assert.equal(await run(`document.activeElement.dataset.sessionId`), focused, 'A changed observation must preserve focused identity');
  await keyboard('End');
  assert.equal(await run(`document.activeElement===document.getElementById('roster-list').lastElementChild`), true);
  await keyboard('Home');
  assert.equal(await run(`document.activeElement===document.getElementById('roster-list').firstElementChild`), true);
  await run(`document.activeElement.click()`);
  assert.equal(await run(`document.activeElement.id`), 'inspector');
  assert.equal(await run(`document.getElementById('roster-dialog').open`), false);
  assert.ok(await run(`document.querySelector('.actor[data-selected="true"]')!==null`));
  await keyboard('Escape');
  assert.equal(await run(`document.getElementById('inspector').hidden`), true);
  assert.equal(await run(`document.activeElement.id`), 'roster-button');
  checks.push('Heartbeat retains focused row node; changed rows retain identity; arrows, Home and End work; opening and closing details transfers and returns focus');

  await keyboard('k', { ctrlKey: true });
  await search('needle');
  assert.equal(await run(`document.getElementById('roster-dialog').dispatchEvent(new Event('cancel',{cancelable:true}))`), false);
  assert.equal(await run(`document.getElementById('roster-dialog').open`), true);
  assert.equal(await run(`document.getElementById('roster-search').value`), '');
  await run(`document.getElementById('roster-dialog').close();document.getElementById('language-button').click()`);
  await until(`document.documentElement.lang==='en'`, 'English language change must apply');
  await keyboard('k', { ctrlKey: true });
  assert.equal(await run(`document.getElementById('roster-search').placeholder`), 'Search names, tasks, tools or projects…');
  assert.equal(await run(`document.getElementById('roster-attention').textContent`), 'Needs attention');
  assert.equal(await run(`document.getElementById('roster-count').textContent`), '3 of 3 agents');
  await search('not found');
  await capture('roster-empty-en');
  assert.doesNotMatch(await run(`document.getElementById('roster-empty').textContent`), /\p{Script=Han}/u);
  checks.push('Escape clears a search before dismissal; all new controls, feedback and empty state switch to English');
  assert.deepEqual(mutations, [], 'Finding and inspecting must remain passive');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks, mutations, errors }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  clearTimeout(guard); win?.destroy(); fs.rmSync(profile, { recursive: true, force: true }); app.exit(process.exitCode || 0);
});
