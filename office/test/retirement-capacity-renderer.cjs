'use strict';
// Real production renderer, isolated observations and profile; no provider writes.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'office-retirement-capacity-'));
app.setPath('userData', profile); app.disableHardwareAcceleration();
let win;
let settings = { language: 'en', agentScale: 1.35, agentAppearance: 'mixed', roomDesign: 'halloween', idleVisitor: false, reducedMotion: false, lowPower: false };
let snapshot = { mode: 'live', now: Date.now(), sessions: [], connections: [] };
const errors = [], pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = code => win.webContents.executeJavaScript(code, true);
const task = (id, activity) => ({ id: 'codex:capacity-' + id, sessionId: 'capacity-' + id, provider: 'codex', status: 'active', activity, activeTools: 1, lastEventAt: Date.now(), events: [] });
function send(sessions) { snapshot = { ...snapshot, sessions, now: Date.now() }; win.webContents.send('office:snapshot', snapshot); }
const report = `({office:{...document.getElementById('office').dataset},error:document.getElementById('error-message').textContent,rows:[...document.querySelectorAll('.actor[data-session-id]')].map(node=>({id:node.dataset.sessionId,data:{...node.dataset},visible:getComputedStyle(node).visibility!=='hidden',state:node.querySelector('.actor-state').textContent})),walks:exitWalks})`;
async function until(code, label, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    assert.deepEqual(errors, []);
    if (await run(code)) return;
    await pause(50);
  }
  throw Error(label + ': ' + JSON.stringify(await run(report)));
}
const settled = ids => `(()=>{const expected=${JSON.stringify(ids)},nodes=[...document.querySelectorAll('.actor[data-session-id]')];return nodes.length===expected.length&&expected.every(id=>nodes.some(n=>n.dataset.sessionId===id))&&nodes.every(n=>n.dataset.walking!=='true'&&n.dataset.traffic==='arrived'&&getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.99)&&document.getElementById('office').dataset.entranceQueue==='0'&&document.getElementById('office').dataset.overflowCount==='0'})()`;
const guard = setTimeout(() => { console.error('Retirement capacity renderer timed out'); app.exit(1); }, 100000);
app.whenReady().then(async () => {
  for (const [name, action] of Object.entries({ snapshot: () => snapshot, settings: () => settings, 'set-settings': patch => (settings = { ...settings, ...patch }), displays: () => [] })) ipcMain.handle('office:' + name, (_, ...args) => action(...args));
  ipcMain.on('office:renderer-error', (_, error) => errors.push(error));
  win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: true, focusable: false, webPreferences: { preload: path.join(__dirname, '../preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  await run(`window.exitWalks=[];window.actorNodes=new Map();document.getElementById('office').addEventListener('office:actor-arrival',event=>actorNodes.set(event.detail.actorId,event.detail.actor.node));window.sampleRetirement=true;(function sample(){if(!sampleRetirement)return;for(const node of document.querySelectorAll('.actor[data-session-id]'))if(node.dataset.walking==='true'&&['Session ended','Ended'].includes(node.querySelector('.actor-state').textContent))exitWalks.push(node.dataset.sessionId);requestAnimationFrame(sample)})();void 0`);
  await until(`document.getElementById('office').dataset.roomDesign==='halloween'`, 'the actual Halloween floor is committed before admission');
  const old = [task('old-left', 'coding'), task('old-right', 'planning')];
  send(old); await until(settled(old.map(s => s.id)), 'initial two roots settle at 135%');
  const active = [task('live-one', 'planning'), task('live-two', 'running'), task('live-three', 'unknown')];
  const closed = old.map(s => ({ ...s, closed: true, status: 'closed', activity: 'idle', activeTools: 0, lastEventAt: Date.now() }));
  send(closed.concat(active));
  await until(settled(active.map(s => s.id)), 'closed roots leave and all three active roots enter at the selected size');
  const result = await run(report);
  assert.equal(Number(result.office.fitScale), 1.35);
  assert.equal(settings.agentScale, 1.35);
  assert.ok(old.every(s => result.walks.includes(s.id)), 'both closed roots visibly walk out instead of being removed at their work station');
  assert.ok(active.every(s => snapshot.sessions.find(row => row.id === s.id).status === 'active'));
  const returning = active[0], other = active.slice(1);
  const closedReturning = { ...returning, closed: true, status: 'closed', activity: 'idle', activeTools: 0, lastEventAt: Date.now() };
  const actor = id => `document.querySelector('.actor[data-session-id="${id}"]')`;
  send([closedReturning, ...other]);
  await until(`${actor(returning.id)}?.dataset.standby==='true'`, 'a completed main remains on the floor in standby');
  const replacement = task('replacement', 'coding');
  send([closedReturning, ...other, replacement]);
  await until(`${actor(returning.id)}?.dataset.walking==='true'`, 'a main begins a real retirement walk');
  const resumed = { ...returning, lastEventAt: Date.now(), turnId: 'resumed-real-turn' };
  send([resumed, ...other, replacement]);
  await until(settled([...active, replacement].map(s => s.id)), 'fresh work interrupts an exit without replacing its identity');
  assert.equal(await run(`${actor(returning.id)}===actorNodes.get(${JSON.stringify(returning.id)})`), true);

  send([closedReturning, ...other, replacement]);
  await until(`${actor(returning.id)}?.dataset.standby==='true'`, 'the completed main returns to standby');
  const next = task('late-arrival', 'reading');
  send([closedReturning, ...other, replacement, next]);
  await until(`${actor(returning.id)}?.dataset.walking==='true'`, 'the remaining main starts to leave');
  const child = { ...task('late-helper', 'coding'), parentId: resumed.id };
  send([{ ...closedReturning, lastEventAt: Date.now() }, child, next]);
  await until(settled([resumed.id, child.id, next.id]), 'a late real helper retains its ended parent as an anchor');
  assert.equal(snapshot.sessions.find(s => s.id === resumed.id).closed, true, 'visual ancestry does not reopen the native parent');
  assert.equal(await run(`${actor(resumed.id)}===actorNodes.get(${JSON.stringify(resumed.id)})`), true);
  send([{ ...closedReturning, lastEventAt: Date.now() }, { ...child, closed: true, status: 'closed', activity: 'idle', activeTools: 0, lastEventAt: Date.now() }, next]);
  await until(settled([next.id]), 'the last helper returns and its yielded ancestor leaves');
  await run('sampleRetirement=false;void 0');
  console.log(JSON.stringify({ ok: true, room: 'halloween', scale: 1.35, closedRoots: old.length, activeRoots: active.length, overflow: result.office.overflowCount, resumedIdentity: true, lateChildAnchor: true, errors }));
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(guard); win?.destroy(); fs.rmSync(profile, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
