'use strict';
// Production renderer: every real identity is visible, with a saved size ceiling.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'office-fixed-size-'));
app.setPath('userData', profile); app.disableHardwareAcceleration();
let win, settings = { language: 'en', agentScale: .8, idleVisitor: false, reducedMotion: false, lowPower: false };
let snapshot = { mode: 'live', now: Date.now(), sessions: [], connections: [] };
const errors = [], pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = async code => {
  try { return await win.webContents.executeJavaScript(code, true); }
  catch (error) { throw new Error(error.message + '\nRenderer fixture expression: ' + code); }
};
const task = (id, activity, parentId) => ({ id, sessionId: id, provider: 'codex', status: 'active', activity, parentId, lastEventAt: Date.now(), activeTools: 1, events: [], evidence: { source: 'hook' } });
function send(sessions) { snapshot = { ...snapshot, sessions, now: Date.now() }; win.webContents.send('office:snapshot', snapshot); }
async function until(code, label, ms = 35000) { const end = Date.now() + ms; while (Date.now() < end) { if (errors.length) throw Error(errors.join('\n')); if (await run(code)) return; await pause(60); } throw Error(label + ': ' + JSON.stringify(await run(`({error:document.getElementById('error-message').textContent,office:{...document.getElementById('office').dataset},rows:[...document.querySelectorAll('.actor')].map(n=>({id:n.dataset.sessionId,...n.dataset}))})`))); }
const rows = `([...document.querySelectorAll('.actor[data-session-id]')])`;
const settled = `${rows}.length>=2&&${rows}.every(n=>getComputedStyle(n).visibility!=='hidden'&&n.dataset.walking!=='true'&&!['splitting','returning','absorbing'].includes(n.dataset.clonePhase))`;
const guard = setTimeout(() => { console.error('Fixed-size renderer timeout'); app.exit(1); }, 180000);
app.whenReady().then(async () => {
  for (const [name, action] of Object.entries({ snapshot: () => snapshot, settings: () => settings, 'set-settings': patch => (settings = { ...settings, ...patch }), displays: () => [] })) ipcMain.handle('office:' + name, (_, ...args) => action(...args));
  ipcMain.on('office:renderer-error', (_, error) => errors.push(error));
  win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: true, focusable: false, webPreferences: { preload: path.join(__dirname, '../preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  const main = task('main', 'reading'), helper = task('helper', 'planning', main.id);
  send([main, helper]); await until(settled, 'real main and helper must enter');
  await run(`window.originalBodies=new Map(${rows}.map(n=>[n.dataset.sessionId,n]));void 0`);
  const sizes = await run(`${rows}.map(n=>({id:n.dataset.sessionId,outer:Math.hypot(new DOMMatrixReadOnly(getComputedStyle(n).transform).m11,new DOMMatrixReadOnly(getComputedStyle(n).transform).m12),art:Number(getComputedStyle(n.querySelector('.character-body')).getPropertyValue('--avatar-presentation-scale'))}))`);
  assert.equal(sizes.find(n => n.id === main.id).art, 1.5); assert.ok(Math.abs(sizes.find(n => n.id === helper.id).art - 1.2) < 1e-9);
  assert.ok(sizes.every(n => Math.abs(n.outer - .8) < .00001));
  const crowd = [main, helper, ...Array.from({ length: 22 }, (_, i) => task('crowd-' + i, ['reading', 'planning', 'coding', 'testing'][i % 4]))];
  const visible = count => `${rows}.length===${count}&&${rows}.every(n=>getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.99&&n.dataset.walking!=='true'&&!['splitting','returning','absorbing'].includes(n.dataset.clonePhase))`;
  send(crowd); await until(visible(crowd.length), 'every crowded identity must enter', 60000);
  assert.equal(await run(`Number(document.getElementById('office').dataset.overflowCount)`), 0);
  assert.equal(await run(`[...originalBodies].every(([id,node])=>document.querySelector('[data-session-id="'+id+'"]')===node)`), true);
  const fittedScale = await run(`Math.hypot(new DOMMatrixReadOnly(getComputedStyle(${rows}[0]).transform).m11,new DOMMatrixReadOnly(getComputedStyle(${rows}[0]).transform).m12)`);
  assert.ok(fittedScale > 0 && fittedScale < .8); assert.equal(settings.agentScale, .8);
  function boundsAudit() {
    const world = document.getElementById('world').getBoundingClientRect();
    const boxes = [...document.querySelectorAll('.actor')].map(n => {
      const body = n.querySelector('.character-body').getBoundingClientRect(), plate = n.querySelector('.nameplate').getBoundingClientRect();
      return { left: Math.min(body.left, plate.left), right: Math.max(body.right, plate.right), top: Math.min(body.top, plate.top), bottom: Math.max(body.bottom, plate.bottom) };
    });
    return { inside: boxes.every(r => r.left >= world.left - 1 && r.right <= world.right + 1 && r.top >= world.top - 1 && r.bottom <= world.bottom + 1),
      overlaps: boxes.some((a, i) => boxes.slice(i + 1).some(b => a.left < b.right - .5 && a.right > b.left + .5 && a.top < b.bottom - .5 && a.bottom > b.top + .5)) };
  }
  assert.deepEqual(await run('(' + boundsAudit.toString() + ')()'), { inside: true, overlaps: false });
  for (let i = 0; i < 3; i++) { await pause(160); send(crowd.map(s => ({ ...s, lastEventAt: Date.now() }))); }
  assert.equal(settings.agentScale, .8, 'fitting never changes the saved maximum');
  win.setSize(800, 450); await pause(150);
  assert.deepEqual(await run('(' + boundsAudit.toString() + ')()'), { inside: true, overlaps: false });
  await run(`document.getElementById('roster-button').click()`);
  assert.doesNotMatch(await run(`document.getElementById('roster-list').textContent`), /Waiting for space/);
  assert.equal(await run(`document.querySelectorAll('.roster-row').length`), crowd.length);
  await run(`(()=>{document.getElementById('roster-dialog').close();const input=document.getElementById('setting-agentScale');input.value='65';input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(visible(crowd.length), 'minimum ceiling still admits the full cast', 60000);
  assert.equal(settings.agentScale, .65);
  await run(`(()=>{const input=document.getElementById('setting-agentScale');input.value='135';input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(visible(crowd.length), 'maximum ceiling still admits the full cast', 60000);
  assert.equal(settings.agentScale, 1.35);
  await run(`(()=>{const input=document.getElementById('setting-reducedMotion');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const hundred = [main, helper, ...Array.from({ length: 98 }, (_, i) => task('crowd-' + i, ['reading', 'planning', 'coding', 'testing'][i % 4]))];
  send(hundred); await until(visible(hundred.length), 'all one hundred identities must be visible', 60000);
  assert.equal(await run(`Number(document.getElementById('office').dataset.overflowCount)`), 0);
  assert.deepEqual(await run('(' + boundsAudit.toString() + ')()'), { inside: true, overlaps: false });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, maximumPreference: .8, rootArtwork: 1.5, cloneArtwork: 1.2, crowd: crowd.length, hundred: hundred.length, fittedScale, savedMaximum: settings.agentScale }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(guard); win?.destroy(); fs.rmSync(profile, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
