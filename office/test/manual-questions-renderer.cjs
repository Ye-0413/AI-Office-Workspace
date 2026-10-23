'use strict';
// Explicit clicks against a synthetic bridge only. Never touches real questions.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-manual-questions-'));
app.setPath('userData', path.join(dir, 'profile')); app.disableHardwareAcceleration();
const errors = [], requests = [], returns = [], wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const question = { id: 'opaque-one', provider: 'opencode', sessionId: 'ses-original', toolCallId: 'tool-original', state: 'waiting', canAnswer: true,
  createdAt: Date.now(), expiresAt: Date.now() + 600000,
  questions: [
    { id: '0', header: 'Format', question: '<img src=x onerror="window.questionXss=1"> Choose a format.', options: [{ label: 'Plan', description: 'Readable plan' }, { label: 'Code', description: '<svg onload="window.questionXss=2">' }], multiSelect: false, allowOther: true },
    { id: '1', header: 'Checks', question: 'Which checks?', options: [{ label: 'Unit', description: 'Local checks' }, { label: 'Native', description: 'App checks' }], multiSelect: true, allowOther: true }
  ] };
let win, answerMode = 'awaiting', releaseAnswer = null;
let settings = { language: 'en', reducedMotion: true, idleVisitor: false };
let currentSnapshot = { mode: 'live', sessions: [], connections: [], questions: [], questionStatus: { available: true, providers: ['opencode', 'mimocode'] } };
const preload = path.join(dir, 'preload.cjs');
fs.writeFileSync(preload, `'use strict';const{contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('office',Object.freeze({getSnapshot:()=>ipcRenderer.invoke('manual:snapshot'),getSettings:()=>ipcRenderer.invoke('manual:settings'),setSettings:patch=>ipcRenderer.invoke('manual:settings',patch),listDisplays:()=>Promise.resolve([]),onSnapshot:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('manual:snapshot',listener);return()=>ipcRenderer.removeListener('manual:snapshot',listener);},answerAgentQuestion:payload=>ipcRenderer.invoke('manual:answer',payload),returnQuestionToNative:id=>ipcRenderer.invoke('manual:return',id)}));window.addEventListener('error',event=>ipcRenderer.send('manual:error',String(event.message)));window.addEventListener('unhandledrejection',event=>ipcRenderer.send('manual:error',String(event.reason?.message||event.reason)));`);
app.whenReady().then(async () => {
  ipcMain.handle('manual:snapshot', () => currentSnapshot);
  ipcMain.handle('manual:settings', (_, patch) => (settings = { ...settings, ...patch }));
  ipcMain.handle('manual:answer', async (_, payload) => {
    requests.push(payload);
    if (answerMode === 'delay') await new Promise(resolve => { releaseAnswer = resolve; });
    if (answerMode === 'reject') return { ok: false, error: 'Stale fixture question' };
    return { id: payload.id, state: 'awaiting-delivery' };
  });
  ipcMain.handle('manual:return', (_, id) => { returns.push(id); return { dismissed: true }; });
  ipcMain.on('manual:error', (_, message) => errors.push(message));
  win = new BrowserWindow({ width: 1000, height: 720, useContentSize: true, show: false, webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await win.loadFile(path.join(__dirname, '../renderer/index.html')); await wait(250);
  const run = source => win.webContents.executeJavaScript(source, true);
  const update = async rows => { currentSnapshot = { ...currentSnapshot, questions: rows }; win.webContents.send('manual:snapshot', currentSnapshot); await wait(35); };
  const click = async selector => { await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await wait(30); };
  const fill = async (selector, value) => { await run(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(value)};node.dispatchEvent(new Event('input',{bubbles:true}));})()`); await wait(10); };
  const option = (index, key) => `#manual-question-form input[data-focus-key="${index}:${key}"]`;
  const setLanguage = async language => { if (settings.language !== language) { await click('#language-button'); await wait(30); } assert.equal(settings.language, language); };
  assert.equal(await run(`document.querySelectorAll('#manual-questions-button').length`), 1, 'production app.js creates exactly one controller');
  await run(`document.getElementById('language-button').focus()`);
  await update([question]);
  assert.equal(await run(`document.getElementById('manual-questions-dialog').open`), false, 'arrival never opens a dialog or takes focus');
  assert.equal(await run(`document.activeElement.id`), 'language-button'); assert.deepEqual(requests, []);
  assert.match(await run(`document.getElementById('manual-questions-button').getAttribute('aria-label')`), /1 pending/);
  await run(`document.getElementById('manual-questions-button').focus()`); await click('#manual-questions-button');
  assert.equal(await run(`document.activeElement.id`), 'manual-questions-close');
  assert.match(await run(`document.querySelector('.manual-question-attribution').textContent`), /ses-original.*tool-original/);
  assert.equal(await run(`window.questionXss`), undefined); assert.equal(await run(`document.querySelectorAll('#manual-questions-dialog img,#manual-questions-dialog svg').length`), 0);
  assert.equal(await run(`document.getElementById('manual-question-submit').disabled`), true);
  await click(option(0, 'o:0')); assert.equal(await run(`document.getElementById('manual-question-submit').disabled`), true, 'every question needs an answer');
  await click(option(1, 'o:0')); await click(option(1, 'o:1'));
  assert.equal(await run(`document.getElementById('manual-question-submit').disabled`), false);
  await click(option(0, 'other'));
  assert.equal(await run(`document.getElementById('manual-question-submit').disabled`), true, 'Other requires nonblank custom text');
  await fill('textarea[data-focus-key="0:text"]', '    '); assert.equal(await run(`document.getElementById('manual-question-submit').disabled`), true);
  await fill('textarea[data-focus-key="0:text"]', '  Custom format  ');
  await run(`(()=>{const node=document.querySelector('textarea[data-focus-key="0:text"]');node.focus();node.setSelectionRange(3,6);window.fixtureTextarea=node;})()`);
  await update([{ ...question, observedAt: Date.now() }, { ...question, id: 'opaque-two', provider: 'mimocode', sessionId: 'ses-second' }]);
  assert.equal(await run(`window.fixtureTextarea===document.querySelector('textarea[data-focus-key="0:text"]')`), true, 'ordinary snapshots preserve DOM, draft and caret');
  assert.deepEqual(await run(`(()=>{const n=document.querySelector('textarea[data-focus-key="0:text"]');return[n.value,n.selectionStart,n.selectionEnd,document.activeElement===n]})()`), ['  Custom format  ', 3, 6, true]);
  await setLanguage('zh');
  assert.equal(await run(`document.querySelector('textarea[data-focus-key="0:text"]').value`), '  Custom format  ');
  assert.equal(await run(`document.activeElement.dataset.focusKey`), '0:text');
  assert.equal(await run(`document.querySelector('.manual-question-text').textContent`), question.questions[0].question, 'language switching never translates question content');
  await setLanguage('en');
  await click('#manual-question-list button[data-question-id="opaque-two"]');
  assert.equal(await run(`document.querySelector('textarea[data-focus-key="0:text"]').value`), '', 'a different opaque question ID gets a separate draft');
  await click('#manual-question-list button[data-question-id="opaque-one"]');
  assert.equal(await run(`document.querySelector('textarea[data-focus-key="0:text"]').value`), '  Custom format  ');
  answerMode = 'delay'; await click('#manual-question-submit');
  assert.deepEqual(requests[0], { id: 'opaque-one', answers: { 0: ['Custom format'], 1: ['Unit', 'Native'] } });
  assert.equal(Object.hasOwn(requests[0], 'sessionId'), false, 'only opaque question ID is sent; backend owns session binding');
  assert.equal(await run(`document.getElementById('manual-question-submit').disabled`), true);
  assert.match(await run(`document.getElementById('manual-question-delivery').textContent`), /Submitting/);
  await update([question]); await click('#manual-question-submit'); assert.equal(requests.length, 1, 'stale waiting snapshots cannot resend an in-flight answer');
  releaseAnswer(); await wait(50);
  assert.match(await run(`document.getElementById('manual-question-delivery').textContent`), /waiting.*confirm receipt/);
  await update([{ ...question, state: 'unconfirmed', canAnswer: false }]);
  assert.match(await run(`document.getElementById('manual-question-delivery').textContent`), /not confirmed/);
  await update([question]); await click('#manual-question-submit'); assert.equal(requests.length, 1, 'unconfirmed answers stay locked even after a stale waiting snapshot');
  await click('#manual-question-native'); assert.deepEqual(returns, ['opaque-one']);
  assert.match(await run(`document.getElementById('manual-questions-feedback').textContent`), /Returned to the original tool/);
  const third = { ...question, id: 'opaque-three' };
  await update([third]); await click(option(0, 'o:0')); await click(option(1, 'o:0'));
  answerMode = 'delay'; await click('#manual-question-submit');
  await update([]); releaseAnswer(); await wait(40);
  assert.match(await run(`document.getElementById('manual-questions-feedback').textContent`), /Question resolved/);
  assert.doesNotMatch(await run(`document.getElementById('manual-questions-dialog').textContent`), /delivered|received successfully/);
  await update([third]);
  assert.equal(await run(`document.querySelectorAll('#manual-question-list button').length`), 0, 'a resolved opaque ID cannot reappear from a stale snapshot');
  const fourth = { ...question, id: 'opaque-four' };
  await update([fourth]); await click(option(0, 'o:1')); await click(option(1, 'o:0')); answerMode = 'reject'; await click('#manual-question-submit');
  assert.match(await run(`document.getElementById('manual-question-delivery').textContent`), /not confirmed/);
  const sent = requests.length; await click('#manual-question-submit'); assert.equal(requests.length, sent);
  await update([{ ...question, id: 'opaque-expired', expiresAt: Date.now() - 1000 }]);
  assert.equal(await run(`document.getElementById('manual-question-submit').disabled`), true); assert.match(await run(`document.getElementById('manual-question-delivery').textContent`), /expired/);
  await update([{ ...question, id: 'opaque-codex', provider: 'codex' }]);
  assert.equal(await run(`document.querySelector('#manual-question-form input').disabled`), true, 'Codex questions remain read-only even with a permissive fixture flag');
  await update([{ ...question, id: 'opaque-binding' }]); await click(option(0, 'o:0'));
  await update([{ ...question, id: 'opaque-binding', sessionId: 'ses-changed' }]);
  assert.equal(await run(`document.querySelectorAll('#manual-question-form input:checked').length`), 0, 'a changed session binding never inherits the previous draft');
  for (const size of [[1000, 720], [800, 450]]) {
    win.setContentSize(...size); await wait(80);
    for (const language of ['en', 'zh']) {
      await setLanguage(language);
      const geometry = await run(`(()=>{const d=document.getElementById('manual-questions-dialog'),r=d.getBoundingClientRect();return{inside:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,noOverflow:d.scrollWidth<=d.clientWidth+1,controls:[...d.querySelectorAll('button,input,textarea')].filter(n=>n.offsetParent&&!n.hidden).every(n=>{const b=n.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right;})}})()`);
      for (const [key, value] of Object.entries(geometry)) assert.equal(value, true, JSON.stringify({ size, language, key, geometry }));
    }
  }
  await setLanguage('en');
  await click('#manual-questions-close'); assert.equal(await run(`document.activeElement.id`), 'manual-questions-button', 'close restores the opening keyboard target');
  await click('#manual-questions-button'); await win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' }); await win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' }); await wait(20);
  assert.equal(await run(`document.getElementById('manual-questions-dialog').contains(document.activeElement)`), true, 'native modal tab focus remains inside the dialog');
  await win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); await win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' }); await wait(20);
  assert.equal(await run(`document.getElementById('manual-questions-dialog').open`), false);
  await run(`window.dispatchEvent(new Event('beforeunload'))`);
  assert.equal(await run(`document.getElementById('manual-questions-button')`), null); assert.equal(await run(`document.getElementById('manual-questions-dialog')`), null);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, answers: requests.length, checks: ['production controller snapshot/language/disposal wiring', 'manual-only answers', 'opaque session binding', 'single/multi/custom full validation', 'snapshot and language draft/caret preservation', 'serialized answer submission and stale snapshot lock', 'awaiting/unconfirmed/resolved races', 'native fallback', 'Codex read-only and expiration', 'safe text rendering', 'bilingual responsive modal', 'keyboard focus restoration and tab containment'], errors }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { win?.destroy(); fs.rmSync(dir, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
