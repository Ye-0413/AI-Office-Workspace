'use strict';
// Production floor, native idle animation, isolated local observations only.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'office-adaptive-standby-'));
app.setPath('userData', profile); app.disableHardwareAcceleration();
let win, settings = { language: 'en', agentScale: 1.35, agentAppearance: 'mixed', roomDesign: 'halloween', idleVisitor: false, reducedMotion: false, lowPower: false };
let snapshot = { mode: 'live', now: Date.now(), sessions: [], connections: [] };
const errors = [], pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = code => win.webContents.executeJavaScript(code, true);
const task = (id, activity = 'coding') => ({ id: 'codex:standby-' + id, sessionId: 'standby-' + id, provider: 'codex', status: 'active', activity, activeTools: 1, lastEventAt: Date.now(), events: [] });
const closed = session => ({ ...session, closed: true, status: 'closed', activity: 'idle', activeTools: 0, turnCompletedAt: Date.now(), lastEventAt: Date.now() });
function send(sessions) { snapshot = { ...snapshot, sessions, now: Date.now() }; win.webContents.send('office:snapshot', snapshot); }
const report = `({office:{...document.getElementById('office').dataset},error:document.getElementById('error-message').textContent,summary:document.getElementById('room-summary').textContent,rows:[...document.querySelectorAll('.actor[data-session-id]')].map(node=>({id:node.dataset.sessionId,data:{...node.dataset},state:node.querySelector('.actor-state').textContent,visible:getComputedStyle(node).visibility!=='hidden'}))})`;
async function until(code, label, ms = 40000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { assert.deepEqual(errors, []); if (await run(code)) return; await pause(50); }
  throw Error(label + ': ' + JSON.stringify(await run(report)));
}
const settled = (ids, scale) => `(()=>{const ids=${JSON.stringify(ids)},nodes=[...document.querySelectorAll('.actor[data-session-id]')],office=document.getElementById('office');return nodes.length===ids.length&&ids.every(id=>nodes.some(node=>node.dataset.sessionId===id))&&nodes.every(node=>node.dataset.walking!=='true'&&node.dataset.traffic==='arrived'&&getComputedStyle(node).visibility!=='hidden')&&office.dataset.entranceQueue==='0'&&office.dataset.overflowCount==='0'&&Math.abs(Number(office.dataset.fitScale)-${scale})<.0001})()`;
const guard = setTimeout(() => { console.error('Adaptive standby renderer timed out'); app.exit(1); }, 180000);
app.whenReady().then(async () => {
  for (const [name, action] of Object.entries({ snapshot: () => snapshot, settings: () => settings, 'set-settings': patch => (settings = { ...settings, ...patch }), displays: () => [] })) ipcMain.handle('office:' + name, (_, ...args) => action(...args));
  ipcMain.on('office:renderer-error', (_, error) => errors.push(error));
  win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: true, focusable: false, webPreferences: { preload: path.join(__dirname, '../preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  await until(`document.getElementById('office').dataset.roomDesign==='halloween'`, 'the actual Halloween room is committed');
  const roots = ['coding', 'reading', 'testing', 'planning', 'running'].map((activity, i) => task(String(i), activity));
  send(roots.slice(0, 4)); await until(settled(roots.slice(0, 4).map(s => s.id), 1.35), 'four mains retain the manual size');
  send(roots); await until(settled(roots.map(s => s.id), 1.215), 'the fifth main enters at exactly90% of the manual size');
  for (let i = 0; i < 4; i++) { send(roots.map(s => ({ ...s, title: 'Metadata ' + i, lastEventAt: Date.now() }))); await pause(100); }
  assert.equal(settings.agentScale, 1.35, 'automatic physical sizing never rewrites the manual preference');
  assert.equal(Number((await run(report)).office.fitScale), 1.215, 'metadata cannot compound the90% reduction');

  const resting = roots.slice(0, 2).map(closed), working = roots.slice(2);
  send(resting.concat(working));
  await until(`document.querySelectorAll('.actor[data-standby="true"]').length===2`, 'completed mains switch to standby without leaving');
  await until(settled(roots.map(s => s.id), 1.215), 'standby mains retain their bodies and physical positions');
  // Native loops have enough time to change between dozing and quiet play.
  await pause(7200);
  for (let i = 0; i < 3; i++) { send(resting.concat(working.map(s => ({ ...s, lastEventAt: Date.now() })))); await pause(100); }
  const idle = await run(report);
  assert.equal(idle.rows.filter(row => row.data.standby === 'true').length, 2);
  assert.ok(resting.every(s => snapshot.sessions.find(row => row.id === s.id).closed));
  assert.ok(idle.rows.filter(row => row.data.standby === 'true').every(row => row.state === 'Standby'));
  fs.writeFileSync('/tmp/office-standby.png', (await win.webContents.capturePage()).toPNG());

  const newcomer = task('new-arrival', 'searching');
  send(resting.concat(working, newcomer));
  await until(settled([...working, newcomer].map(s => s.id), 1.35), 'new real work replaces standby mains and restores the manual size');
  assert.equal(settings.agentScale, 1.35);
  const result = await run(report);
  assert.ok(result.rows.every(row => row.data.standby !== 'true'));
  assert.equal(snapshot.sessions.filter(s => s.closed).length, 2, 'visual retirement does not change native closed identities');
  console.log(JSON.stringify({ ok: true, manualScale: 1.35, crowdedScale: 1.215, maximumReduction: .9, standbyHeld: 2, replacementRoots: 4, restoredScale: result.office.fitScale, screenshot: '/tmp/office-standby.png', errors }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(guard); win?.destroy(); fs.rmSync(profile, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
