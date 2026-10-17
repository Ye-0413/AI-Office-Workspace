'use strict';
// Real production DOM/WAAPI traffic; isolated observations and userData only.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { installAudit } = require('./support/walking-native-audit.cjs');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'office-walking-fit-'));
app.setPath('userData', profile); app.disableHardwareAcceleration();
let win, stage = 'startup';
let settings = { language: 'zh', agentScale: 1, reducedMotion: false, lowPower: false, idleVisitor: false, sceneVenue: 'workshop', sceneTheme: 'spring', sceneWeather: 'off' };
let snapshot = { mode: 'live', now: Date.now(), connections: [], sessions: [] };
let pushes = 0;
const checks = [], errors = [], pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const task = (index, activity, parentId) => ({
  id: 'codex:crowd-' + String(index).padStart(2, '0'), sessionId: 'crowd-' + index,
  provider: 'codex', parentId, status: 'active', activity,
  activeTools: ['idle', 'unknown'].includes(activity) ? 0 : 1,
  lastEventAt: Date.now(), projectPath: '/fixture/crowd', events: [],
  evidence: { source: 'hook', confidence: 'explicit' }
});
const bounded = (promise, label, ms = 20000) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' timed out')), ms); })]).finally(() => clearTimeout(timer));
};
const run = code => bounded(win.webContents.executeJavaScript(code, true), stage + ': renderer evaluation');
function send(sessions) {
  pushes += 1;
  snapshot = { ...snapshot, sessions, now: Date.now() };
  win.webContents.send('office:snapshot', snapshot);
}

// This observer reads the original actor nodes, their actual transforms, full
// body/nameplate rectangles and the original route Animation's future vertices.
// It neither replaces animation APIs nor advances synthetic animation clocks.


const allSettled = count => `(()=>{const rows=[...document.querySelectorAll('.actor[data-session-id]')];return rows.length===${count}&&rows.every(node=>getComputedStyle(node).visibility!=='hidden'&&Number(getComputedStyle(node).opacity)>.99&&node.dataset.walking!=='true'&&node.dataset.traffic==='arrived'&&!['splitting','returning','absorbing'].includes(node.dataset.clonePhase))&&Number(document.getElementById('office').dataset.entranceQueue)===0})()`;
async function until(predicate, label, ms = 70000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const current = await run('crowdAudit.report()');
    if (current) assert.deepEqual(current.violations, [], stage + ': ' + JSON.stringify(current));
    if (await run(predicate)) return;
    await pause(80);
  }
  throw Error(label + ': ' + JSON.stringify(await run(`({audit:crowdAudit.report(),rows:[...document.querySelectorAll('.actor[data-session-id]')].map(node=>({id:node.dataset.sessionId,traffic:node.dataset.traffic,clone:node.dataset.clonePhase,visibility:getComputedStyle(node).visibility,transform:getComputedStyle(node).transform}))})`)));
}
async function begin(name, sessions, allowedRemoved = []) {
  stage = name; console.log('[walking-crowd]', name);
  await run(`crowdAudit.begin(${JSON.stringify(name)},${JSON.stringify(sessions.map(session => session.id))},${JSON.stringify(allowedRemoved)})`);
}
async function finish({ minimumScale = 0, parallel = false, dock = false, yieldRequired = false } = {}) {
  const report = await run('crowdAudit.finish()');
  checks.push(report);
  assert.deepEqual(report.violations, [], JSON.stringify(report));
  assert.ok(report.frames >= 31, 'at least 31 actual RAF frames: ' + JSON.stringify(report));
  if (minimumScale) assert.ok(report.minScale >= minimumScale - .00001, 'natural body size regressed during actual traffic: ' + JSON.stringify(report));
  if (parallel) { assert.ok(report.maxMoving >= 2 && report.parallelFrames >= 5); assert.ok(report.corridorPairsChecked >= 5, 'actual future route rectangles must be independently checked'); }
  if (dock) assert.ok(report.dockedFrames >= 31, 'the true parent docking lock must be observed over real return frames');
  if (yieldRequired) assert.ok(report.yieldingFrames >= 5 && report.yieldedIds.length > 0, 'the test must contain a real yielding body, not merely an unblocked walk');
  console.log('[walking-crowd] passed', nameFor(report)); return report;
}
function nameFor(report) { return report.name + ' (' + report.frames + ' RAF, max ' + report.maxMoving + ' walking)'; }
async function heartbeat(sessions) { for (let i = 0; i < 5; i += 1) { await pause(180); send(sessions.map(session => ({ ...session, lastEventAt: Date.now() }))); } }
async function readGeometry() {
  return run(`(()=>{const w=document.getElementById('world').getBoundingClientRect(),factor=w.width/1280;return [...document.querySelectorAll('.actor')].map(n=>{const m=new DOMMatrixReadOnly(getComputedStyle(n).transform),scale=Math.hypot(m.m11,m.m12),p=[n.querySelector('.character-body'),n.querySelector('.nameplate')].map(p=>p.getBoundingClientRect()),x=w.left+m.m41*factor,y=w.top+m.m42*factor;const a=crowdActors.get(n.dataset.sessionId);return{id:n.dataset.sessionId,target:a?.target,pendingStation:a?.pendingStation,navigation:a?.navigation,position:{x:m.m41/12.8,y:m.m42/7.2},uniformScale:scale,dataset:{...n.dataset},footprint:{left:Math.ceil((x-Math.min(...p.map(r=>r.left)))/factor/scale)+6,right:Math.ceil((Math.max(...p.map(r=>r.right))-x)/factor/scale)+6,top:Math.ceil((y-Math.min(...p.map(r=>r.top)))/factor/scale)+6,bottom:Math.ceil((Math.max(...p.map(r=>r.bottom))-y)/factor/scale)+6}};});})()`);
}
async function savePreview(name) {
  if (!process.env.MINI_OFFICE_WALKING_FIT_PREVIEW_DIR) return;
  const directory = process.env.MINI_OFFICE_WALKING_FIT_PREVIEW_DIR; fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, name + '-geometry.json'), JSON.stringify({sessions:snapshot.sessions,rows:await readGeometry()},null,2));
  fs.writeFileSync(path.join(directory, name + '.png'), (await bounded(win.webContents.capturePage(), 'preview capture', 4000)).toPNG());
}
const guard = setTimeout(() => { console.error('Walking fit recovery fixture timed out at ' + stage); app.exit(1); }, 240000);
app.whenReady().then(async () => {
  for (const [name, action] of Object.entries({ snapshot: () => snapshot, settings: () => settings, 'set-settings': patch => (settings = { ...settings, ...patch }), displays: () => [] })) ipcMain.handle('office:' + name, (_, ...args) => action(...args));
  ipcMain.on('office:renderer-error', (_, error) => errors.push(error));
  win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: true, focusable: false, webPreferences: { preload: path.join(__dirname, '../preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  win.webContents.on('render-process-gone', (_, details) => errors.push('renderer gone: ' + details.reason));
  await bounded(win.loadFile(path.join(__dirname, '../renderer/index.html')), 'production page load');
  win.webContents.debugger.attach('1.3');
  await bounded(win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }), 'motion media emulation');
  await run('(' + installAudit.toString() + ')()');
  const kinds = ['reading', 'planning', 'coding', 'testing', 'idle', 'unknown'];
  const twelve = Array.from({ length: 12 }, (_, index) => task(index, kinds[index % kinds.length]));
  await begin('twelve original bodies settle at the shared dense fit', twelve);
  send(twelve); await heartbeat(twelve); await until(allSettled(12), 'all twelve real mains must enter');
  await finish({ minimumScale: .4, parallel: true });
  await savePreview('twelve-original-before-departures');
  const keep = new Set([0, 1, 6, 7]), survivors = twelve.filter((_, index) => keep.has(index));
  const removed = twelve.filter((_, index) => !keep.has(index)).map(session => session.id);
  await begin('real twelve-to-four departures restore the proved large fit without another snapshot', survivors, removed);
  send(survivors); const removalPush = pushes;
  const largeFit = `${allSettled(4)}&&[...document.querySelectorAll('.actor')].every(n=>Math.hypot(new DOMMatrixReadOnly(getComputedStyle(n).transform).m11,new DOMMatrixReadOnly(getComputedStyle(n).transform).m12)>=.9)`;
  const fitEndpoint = `${largeFit}&&[...document.querySelectorAll('.actor')].every(node=>node.getAnimations().every(motion=>!(motion instanceof CSSTransition&&motion.transitionProperty==='transform'&&(motion.playState==='running'||motion.pending)))&&Math.abs(new DOMMatrixReadOnly(getComputedStyle(node).transform).m11-new DOMMatrixReadOnly(node.style.transform).m11)<.00001)`;
  async function captureFitTail() {
    await until(fitEndpoint, 'all actual body fit transitions must finish before the largest envelopes are accepted');
    const endpointFrame = await run('crowdAudit.report().frames');
    await until(`crowdAudit.report().frames>=${endpointFrame+31}&&${fitEndpoint}`, 'keep auditing at least thirty-one real frames after the completed fit endpoint');
  }
  await until(largeFit, 'real endpoints and released slots must grow the four retained original bodies', 90000);
  await captureFitTail();
  const released = await finish({ minimumScale: .4 }); assert.ok(released.lastScale >= .9); assert.equal(pushes, removalPush, 'a later observer push must not rescue a missing physical-endpoint refresh');
  await run(`${JSON.stringify(removed)}.forEach(id=>crowdAudit.forget(id))`);
  await savePreview('four-restored-after-real-departures');
  await begin('the four original bodies respect a deliberate sixty-five-percent fit', survivors);
  await run(`(()=>{const control=document.getElementById('setting-agentScale');control.value='65';control.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(`crowdAudit.report().frames>=31&&${allSettled(4)}&&[...document.querySelectorAll('.actor')].every(n=>Math.abs(Math.hypot(new DOMMatrixReadOnly(getComputedStyle(n).transform).m11,new DOMMatrixReadOnly(getComputedStyle(n).transform).m12)-.65)<.00002)`, 'the genuine size setting must physically settle at sixty-five percent');
  await finish();
  await begin('a larger size request completes its actual walks then grows from physical endpoints alone', survivors);
  const resizePush = pushes;
  await run(`(()=>{const control=document.getElementById('setting-agentScale');control.value='135';control.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(largeFit, 'a proved large target must restore after all actual repositioning endpoints', 70000);
  await captureFitTail();
  const grown = await finish(); assert.ok(grown.lastScale >= .9); assert.equal(pushes, resizePush, 'size restoration must not depend on any fresh observer snapshot');
  await savePreview('four-restored-after-size-repositioning');
  assert.deepEqual(errors, []); console.log(JSON.stringify({ok:true,scope:'real-endpoint-and-slot-fit-recovery',checks,pushes,errors}));
}).catch(async error => {
  console.error(error); process.exitCode = 1;
  if (win && !win.isDestroyed()) try {
    const audit = await run('window.crowdAudit?.report()');
    const rows = await readGeometry();    if (process.env.MINI_OFFICE_WALKING_FIT_PREVIEW_DIR) {fs.mkdirSync(process.env.MINI_OFFICE_WALKING_FIT_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.MINI_OFFICE_WALKING_FIT_PREVIEW_DIR, 'failure.json'), JSON.stringify({ stage, error: error.stack, audit, rows, sessions:snapshot.sessions, checks, errors }, null, 2));}
    await savePreview('failure');
  } catch (captureError) { console.error(captureError); }
}).finally(() => { clearTimeout(guard); win?.destroy(); fs.rmSync(profile, { recursive: true, force: true }); app.exit(process.exitCode || 0); });
