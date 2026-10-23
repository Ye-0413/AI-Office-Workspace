'use strict';
// Production renderer: fixed visual scale, clone art ratio and honest overflow.
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
const guard = setTimeout(() => { console.error('Fixed-size renderer timeout'); app.exit(1); }, 100000);
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
  const crowd = [main, helper, ...Array.from({ length: 22 }, (_, i) => task('overflow-' + i, ['reading', 'planning', 'coding', 'testing'][i % 4]))];
  send(crowd); await until(`Number(document.getElementById('office').dataset.overflowCount)>0`, 'crowd must report waiting identities');
  assert.equal(await run(`[...originalBodies].every(([id,node])=>document.querySelector('[data-session-id="'+id+'"]')===node)`), true);
  await run(`window.sizeTrace={min:Infinity,max:0,frames:0};(function sample(){if(!window.sizeTrace)return;for(const n of ${rows}){const m=new DOMMatrixReadOnly(getComputedStyle(n).transform),s=Math.hypot(m.m11,m.m12);sizeTrace.min=Math.min(sizeTrace.min,s);sizeTrace.max=Math.max(sizeTrace.max,s);}sizeTrace.frames++;if(sizeTrace.frames<40)requestAnimationFrame(sample);})()`);
  for (let i = 0; i < 3; i++) { await pause(160); send(crowd.map(s => ({ ...s, lastEventAt: Date.now() }))); }
  await until('sizeTrace.frames>=40', 'sample actual animation frames');
  const trace = await run('sizeTrace'); assert.ok(Math.abs(trace.min - .8) < .00001 && Math.abs(trace.max - .8) < .00001, JSON.stringify(trace));
  win.setSize(800, 450); await pause(150);
  assert.equal(await run(`${rows}.every(n=>Math.abs(Math.hypot(new DOMMatrixReadOnly(getComputedStyle(n).transform).m11,new DOMMatrixReadOnly(getComputedStyle(n).transform).m12)-.8)<.00001)`), true);
  await run(`document.getElementById('roster-button').click()`); assert.match(await run(`document.getElementById('roster-list').textContent`), /Waiting for space/);
  await run(`[...document.querySelectorAll('.roster-row')].find(row=>row.textContent.includes('Waiting for space')).click()`);
  assert.equal(await run(`document.getElementById('inspect-location').textContent`), 'Waiting for space');
  await run(`(()=>{document.getElementById('close-inspector').click();document.getElementById('roster-dialog').close();const input=document.getElementById('setting-agentScale');input.value='65';input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(`document.getElementById('office').dataset.fitScale==='0.6500'`, 'manual slider sets the exact requested size');
  assert.equal(settings.agentScale, .65);
  await run(`(()=>{const input=document.getElementById('setting-agentScale');input.value='135';input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(`${rows}.some(n=>getComputedStyle(n).visibility!=='hidden'&&Math.abs(Math.hypot(new DOMMatrixReadOnly(getComputedStyle(n).transform).m11,new DOMMatrixReadOnly(getComputedStyle(n).transform).m12)-1.35)<.00001)`, 'maximum slider size must admit a real body through the safe doorway approach');
  assert.equal(settings.agentScale, 1.35); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, fixedScale: .8, rootArtwork: 1.5, cloneArtwork: 1.2, crowd: crowd.length, trace, manualScale: settings.agentScale }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(guard); win?.destroy(); fs.rmSync(profile, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
